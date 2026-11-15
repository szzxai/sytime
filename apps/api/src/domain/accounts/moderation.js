const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { query } = require('../../../../../packages/db/src/client.ts');
const { now, error, text, notify, notifyStaff, audit, revoke, limited } = require('./security');
const shopStore = require('../shops/store');
const { settleNotifications } = require('./notifications');
const dishStore = require('../dishes/store');
const { evaluateAutoTitles } = require('../titles/rules');
const labels = {
  display_id: '展示 ID',
  avatar: '头像',
  nickname: '昵称',
  signature: '个性签名',
  dish_review: '菜品评价',
  shop: '店铺推荐',
  shop_review: '店铺评价',
  appeal: '封禁申诉',
  wiki_create: 'Wiki 新建词条',
  wiki_edit: 'Wiki 修改词条',
};
async function image(file) {
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg'].includes(file.mimetype))
    throw error(422, '请选择 2 MB 以内的 JPG / PNG 图片');
  try {
    const buffer = await sharp(file.buffer, { limitInputPixels: 20_000_000, animated: false })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return 'data:image/png;base64,' + buffer.toString('base64');
  } catch {
    throw error(422, '图片损坏或尺寸过大');
  }
}
function createModeration(db, root) {
  function submit(user, kind, payload, key = kind) {
    if (!labels[kind]) throw error(422, '审核类型无效');
    return db.$client.transaction(() => {
      limited(db, 'submission:' + user.id, 30);
      const account = query(db, 'SELECT role,status FROM users WHERE id=?').get(user.id);
      if (
        !account ||
        (kind === 'appeal' ? account.status !== 'banned' : account.status !== 'active')
      )
        throw error(403, '账号状态不允许此操作');
      if (
        ['dish_review', 'shop', 'shop_review', 'wiki_create', 'wiki_edit'].includes(kind) &&
        !['student', 'admin', 'operator'].includes(account.role)
      )
        throw error(403, '请通过社盟账号登录后参与');
      if (
        query(
          db,
          "SELECT id FROM moderation_requests WHERE user_id=? AND kind=? AND subject_key=? AND status='pending'",
        ).get(user.id, kind, key)
      )
        throw error(409, '已有待审核申请，请先等待审核或撤回');
      if (kind === 'shop') {
        const day = require('../menu/schedule').localDay(Date.now());
        const start = Math.floor(Date.parse(day + 'T00:00:00+08:00') / 1000);
        if (
          query(
            db,
            "SELECT COUNT(*) n FROM moderation_requests WHERE user_id=? AND kind='shop' AND created_at>=? AND created_at<?",
          ).get(user.id, start, start + 86400).n >= 10
        )
          throw error(429, '每天最多推荐 10 家店铺，请明天再来');
      }
      if (kind === 'appeal') {
        const last = query(
          db,
          'SELECT created_at FROM moderation_requests WHERE user_id=? AND kind=? ORDER BY id DESC LIMIT 1',
        ).get(user.id, kind);
        if (last && now() - last.created_at < 600)
          throw Object.assign(error(429, '10 分钟内只能提交一次，请稍后再试'), {
            retry_after: 600 - (now() - last.created_at),
          });
      }
      const info = query(
        db,
        'INSERT INTO moderation_requests(user_id,kind,subject_key,payload) VALUES(?,?,?,?)',
      ).run(user.id, kind, String(key), JSON.stringify(payload));
      const id = Number(info.lastInsertRowid);
      audit(db, user.id, user.id, 'submission.created', { id, kind });
      notify(db, user.id, `${labels[kind]}已提交`, '申请已进入审核队列，通过前不会对外发布。', {
        kind: 'moderation_pending',
        id,
      });
      notifyStaff(db, '有新的' + labels[kind] + '待审核', `申请 #${id}，请前往管理后台处理。`, {
        kind: 'moderation_pending',
        id,
      });
      return { id, status: 'pending', message: '已提交审核，通过后生效' };
    })();
  }
  function review(actor, id, decision, reason) {
    const createdFiles = [];
    try {
      return db.$client
        .transaction(() => {
          const request = query(db, 'SELECT * FROM moderation_requests WHERE id=?').get(id);
          if (!request) throw error(404, '申请不存在');
          if (request.status !== 'pending') throw error(409, '此申请已处理，请刷新列表');
          if (request.user_id === actor.id) throw error(403, '不能审核自己的申请');
          if (!['approve', 'reject'].includes(decision)) throw error(422, '请选择通过或拒绝');
          reason = text(reason ?? '', '处理说明', 500, decision === 'approve');
          const owner = query(db, 'SELECT * FROM users WHERE id=?').get(request.user_id);
          if (!owner) throw error(404, '申请人不存在');
          if (request.kind === 'appeal') require('./security').target(db, actor, owner.id);
          const payload = JSON.parse(request.payload);
          let publishedId = null;
          const publishImage = () => {
            if (!payload.image_data) return payload.image_url || '';
            const filename = crypto.randomUUID() + '.png';
            const dir = path.join(root, 'uploads', 'approved');
            fs.mkdirSync(dir, { recursive: true });
            const filenamePath = path.join(dir, filename);
            fs.writeFileSync(
              filenamePath,
              Buffer.from(payload.image_data.split(',')[1], 'base64'),
              { flag: 'wx' },
            );
            createdFiles.push(filenamePath);
            return '/uploads/approved/' + filename;
          };
          if (decision === 'approve') {
            if (request.kind === 'appeal') {
              if (owner.status !== 'banned' || !owner.allow_appeal)
                throw error(409, '当前账号不可进行申诉解封');
              query(
                db,
                "UPDATE users SET status='active',ban_reason='',ban_image='',allow_appeal=1 WHERE id=?",
              ).run(owner.id);
              revoke(db, owner.id);
            } else {
              if (owner.status !== 'active') throw error(409, '账号已被封禁，请拒绝该申请');
              if (
                ['dish_review', 'shop', 'shop_review', 'wiki_create', 'wiki_edit'].includes(
                  request.kind,
                ) &&
                !['student', 'admin', 'operator'].includes(owner.role)
              )
                throw error(409, '申请人已不具备学生权限，请拒绝该申请');
              switch (request.kind) {
                case 'wiki_create':
                case 'wiki_edit':
                  publishedId = require('../wiki/store').publish(db, request, payload, actor);
                  break;
                case 'display_id':
                  if (
                    query(db, 'SELECT id FROM users WHERE display_id=? AND id<>?').get(
                      payload.value,
                      owner.id,
                    )
                  ) {
                    decision = 'reject';
                    reason = '该展示 ID 已被其他账号使用';
                    break;
                  }
                  query(db, 'UPDATE users SET display_id=? WHERE id=?').run(
                    payload.value,
                    owner.id,
                  );
                  break;
                case 'nickname':
                  if (owner.sso_subject) throw error(409, '学生姓名由社盟同步');
                // falls through
                case 'signature':
                  query(db, `UPDATE users SET ${request.kind}=? WHERE id=?`).run(
                    payload.value,
                    owner.id,
                  );
                  break;
                case 'avatar':
                  query(db, 'UPDATE users SET avatar_url=? WHERE id=?').run(
                    publishImage(),
                    owner.id,
                  );
                  break;
                case 'dish_review': {
                  const dish = dishStore.findDish(db, payload.dish_id);
                  if (!dish) throw error(409, '菜品不存在，请拒绝该申请');
                  publishedId = Number(
                    query(
                      db,
                      'INSERT INTO recipes(dish_id,user_id,username,name,rating,comment,image_url,is_weekly) VALUES(?,?,?,?,?,?,?,0)',
                    ).run(
                      dish.id,
                      owner.id,
                      owner.username,
                      dish.name,
                      payload.rating,
                      payload.comment,
                      publishImage(),
                    ).lastInsertRowid,
                  );
                  evaluateAutoTitles(db, owner.id);
                  break;
                }
                case 'shop':
                  publishedId = shopStore.create(db, payload, owner, shopStore.loadConfig(root)).id;
                  evaluateAutoTitles(db, owner.id);
                  break;
                case 'shop_review':
                  if (!shopStore.get(db, payload.shop_id))
                    throw error(409, '店铺不存在，请拒绝该申请');
                  query(
                    db,
                    `INSERT INTO shop_reviews(shop_id,user_id,rating,content,guests,total_price,image_url) VALUES(?,?,?,?,?,?,?) ON CONFLICT(shop_id,user_id) DO UPDATE SET rating=excluded.rating,content=excluded.content,guests=excluded.guests,total_price=excluded.total_price,image_url=excluded.image_url,updated_at=unixepoch()`,
                  ).run(
                    payload.shop_id,
                    owner.id,
                    payload.rating,
                    payload.content,
                    payload.guests,
                    payload.total_price,
                    publishImage(),
                  );
                  publishedId = payload.shop_id;
                  break;
                default:
                  throw error(422, '不支持的审核类型');
              }
            }
          }
          query(
            db,
            "UPDATE moderation_requests SET status=?,reason=?,reviewer_id=?,reviewed_at=unixepoch(),published_id=? WHERE id=? AND status='pending'",
          ).run(
            decision === 'approve' ? 'approved' : 'rejected',
            reason,
            actor.id,
            publishedId,
            id,
          );
          // Pending images are private; delete base64 bytes after a decision to avoid retaining rejected images.
          delete payload.image_data;
          query(db, 'UPDATE moderation_requests SET payload=? WHERE id=?').run(
            JSON.stringify(payload),
            id,
          );
          audit(
            db,
            actor.id,
            owner.id,
            'submission.' + (decision === 'approve' ? 'approved' : 'rejected'),
            { id, kind: request.kind, reason, published_id: publishedId },
          );
          settleNotifications(db, 'moderation_pending', id);
          notify(
            db,
            owner.id,
            labels[request.kind] + (decision === 'approve' ? '已通过' : '未通过'),
            reason || '审核已通过，内容已生效。',
            { kind: 'moderation_result', id },
          );
          return {
            ok: true,
            status: decision === 'approve' ? 'approved' : 'rejected',
            published_id: publishedId,
          };
        })
        .immediate();
    } catch (e) {
      for (const f of createdFiles) fs.rmSync(f, { force: true });
      throw e;
    }
  }
  return { submit, review };
}
module.exports = { createModeration, labels, image };
