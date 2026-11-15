const crypto = require('node:crypto');
const sharp = require('sharp');
const { query } = require('../../../../../packages/db/src/client.ts');
const { action, error, text, audit, limited } = require('../accounts/security');
const store = require('./store');

function mountWikiRoutes(app, db, { checkRole, moderation, attachAuthors }) {
  const student = checkRole('student');
  const staff = checkRole('admin');
  const body = (c) => c.get('body') || {};
  const folders = () =>
    query(db, 'SELECT * FROM wiki_folders WHERE deleted_at IS NULL ORDER BY position,id').all();
  app.get(
    '/api/wiki',
    action((c) => {
      const all = store.list(db);
      const q = (c.req.query('q') || '').normalize('NFKC').trim().toLowerCase().slice(0, 100);
      const folderId = c.req.query('folder');
      const directory = folders();
      if (folderId) store.folder(db, folderId);
      const filtered = all.filter(
        (e) =>
          (!q || e.search_text.includes(q.replace(/\s+/g, '')) || e.search_text.includes(q)) &&
          (!folderId ||
            e.folder_id === Number(folderId) ||
            directory.some((f) => f.id === e.folder_id && f.parent_id === Number(folderId))),
      );
      const publicItem = ({ markdown, search_text: _search, ...e }) => {
        const at = markdown.toLowerCase().indexOf(q);
        const snippet = markdown.slice(Math.max(0, at - 35), Math.max(0, at - 35) + 180);
        return { ...e, snippet, path: store.folderPath(db, e.folder_id) };
      };
      return c.json({
        folders: directory.map((f) => ({
          ...f,
          count: all.filter(
            (e) =>
              e.folder_id === f.id ||
              directory.some((child) => child.id === e.folder_id && child.parent_id === f.id),
          ).length,
        })),
        entries: filtered.map(publicItem),
        total: all.length,
        recent: [...all]
          .sort((a, b) => b.updated_at - a.updated_at || b.id - a.id)
          .slice(0, 8)
          .map(publicItem),
      });
    }),
  );
  app.get(
    '/api/wiki/random',
    action((c) => {
      const entries = store.list(db);
      if (!entries.length) throw error(404, '暂无公开词条');
      return c.json({ id: entries[crypto.randomInt(entries.length)].id });
    }),
  );
  app.get(
    '/api/wiki/entries/:id',
    action((c) => {
      const entry = store.entry(db, c.req.param('id'));
      const contributors = query(
        db,
        `SELECT DISTINCT u.id AS user_id FROM users u JOIN wiki_revisions r ON r.user_id=u.id WHERE r.entry_id=?`,
      ).all(entry.id);
      attachAuthors(contributors);
      const tree = folders();
      const entries = store.list(db);
      const ordered = [];
      for (const top of tree.filter((f) => !f.parent_id)) {
        ordered.push(...entries.filter((e) => e.folder_id === top.id));
        for (const sub of tree.filter((f) => f.parent_id === top.id))
          ordered.push(...entries.filter((e) => e.folder_id === sub.id));
      }
      const index = ordered.findIndex((e) => e.id === entry.id);
      const neighbor = (e) => (e ? { id: e.id, title: e.title } : null);
      return c.json({
        entry: { ...entry, contributors },
        previous: neighbor(ordered[index - 1]),
        next: neighbor(ordered[index + 1]),
      });
    }),
  );
  app.get(
    '/api/wiki/entries/:id/history',
    action((c) => {
      const entry = store.entry(db, c.req.param('id'));
      const revisions = query(
        db,
        `SELECT id,entry_id,title,user_id,summary,created_at FROM wiki_revisions WHERE entry_id=? AND hidden=0 ORDER BY id DESC`,
      ).all(entry.id);
      attachAuthors(revisions);
      return c.json({ revisions });
    }),
  );
  app.get(
    '/api/wiki/entries/:id/revisions/:revision',
    action((c) => {
      const entry = store.entry(db, c.req.param('id'));
      const row = query(
        db,
        'SELECT * FROM wiki_revisions WHERE entry_id=? AND id=? AND hidden=0',
      ).get(entry.id, Number(c.req.param('revision')) || 0);
      if (!row) throw error(404, '历史版本不存在或已隐藏');
      return c.json({ revision: store.decode(row) });
    }),
  );
  for (const kind of ['wiki_create', 'wiki_edit']) {
    app.post(
      kind === 'wiki_create' ? '/api/wiki/entries' : '/api/wiki/entries/:id/submissions',
      student,
      action((c) => {
        const result = db.$client
          .transaction(() => {
            const user = c.get('user');
            const target = kind === 'wiki_edit' ? store.entry(db, c.req.param('id')) : null;
            if (target?.manual_locked || target?.auto_locked)
              throw error(
                409,
                target.manual_locked
                  ? `词条已手动锁定：${target.lock_reason}`
                  : '词条正在审核，暂时不能编辑',
              );
            const day = require('../menu/schedule').localDay(Date.now());
            const start = Math.floor(Date.parse(day + 'T00:00:00+08:00') / 1000);
            if (
              query(
                db,
                "SELECT count(*) n FROM moderation_requests WHERE user_id=? AND kind IN ('wiki_create','wiki_edit') AND created_at>=? AND created_at<?",
              ).get(user.id, start, start + 86400).n >= 10
            )
              throw error(429, '每天最多提交 10 次 Wiki 申请，请明天再来');
            const payload = store.validate(db, user, body(c), target);
            return moderation.submit(
              user,
              kind,
              payload,
              target ? String(target.id) : store.normalize(payload.title),
            );
          })
          .immediate();
        return c.json(
          { ...result, message: kind === 'wiki_create' ? '词条已提交审核' : '词条修改已提交审核' },
          202,
        );
      }),
    );
  }
  app.post(
    '/api/wiki/images',
    student,
    action(async (c) => {
      limited(db, 'wiki-images:' + c.get('user').id, 30);
      const data = await c.req.parseBody();
      const file = data.image;
      if (
        !file ||
        typeof file === 'string' ||
        !file.size ||
        file.size > 2 * 1024 * 1024 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      )
        throw error(422, '请选择单张不超过 2 MB 的 JPG、PNG 或 WebP 图片');
      let buffer;
      try {
        const original = Buffer.from(await file.arrayBuffer());
        const meta = await sharp(original, { limitInputPixels: 20_000_000 }).metadata();
        if (!['jpeg', 'png', 'webp'].includes(meta.format)) throw new Error('format');
        buffer = await sharp(original, { limitInputPixels: 20_000_000, animated: false })
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp()
          .toBuffer();
      } catch {
        throw error(422, '图片损坏、格式不支持或尺寸过大');
      }
      const id = crypto.randomUUID();
      query(db, 'INSERT INTO wiki_images(id,user_id,data) VALUES(?,?,?)').run(
        id,
        c.get('user').id,
        buffer.toString('base64'),
      );
      return c.json({ id, url: '/api/wiki/images/' + id }, 201);
    }),
  );
  app.get(
    '/api/wiki/images/:id',
    checkRole(),
    action((c) => {
      const id = c.req.param('id');
      const row = query(db, 'SELECT * FROM wiki_images WHERE id=?').get(id);
      if (!row) throw error(404, '图片不存在');
      const published = query(
        db,
        `SELECT r.images FROM wiki_revisions r JOIN wiki_entries e ON e.id=r.entry_id WHERE r.hidden=0 AND e.deleted_at IS NULL`,
      )
        .all()
        .some((r) => JSON.parse(r.images).includes(id));
      const user = c.get('user');
      if (!published && row.user_id !== user.id && !['admin', 'operator'].includes(user.role))
        throw error(404, '图片不存在');
      c.header('Content-Type', 'image/webp');
      c.header('Cache-Control', 'private, no-store');
      return c.body(Buffer.from(row.data, 'base64'));
    }),
  );
  function manage(method, path, handler) {
    app[method](
      path,
      staff,
      action((c) => {
        const result = db.$client
          .transaction(() => {
            const detail = handler(c, body(c));
            audit(db, c.get('user').id, null, 'wiki.' + detail.action, detail);
            return detail;
          })
          .immediate();
        return c.json({ ok: true, ...result });
      }),
    );
  }
  function folderValues(value, id) {
    const name = text(value.name, '文件夹名称', 80);
    const parentId = value.parent_id ? Number(value.parent_id) : null;
    if (parentId) {
      if (parentId === id || store.folder(db, parentId).parent_id)
        throw error(422, '文件夹最多两级，不能循环嵌套');
      if (
        id &&
        query(db, 'SELECT id FROM wiki_folders WHERE parent_id=? AND deleted_at IS NULL').get(id)
      )
        throw error(409, '含子目录的分区不能移入其他分区');
    }
    const position = Number(value.position || 0);
    if (!Number.isSafeInteger(position) || Math.abs(position) > 1000000)
      throw error(422, '排序须为整数');
    return { name, parentId, position };
  }
  manage('post', '/api/admin/wiki/folders', (_c, value) => {
    const { name, parentId, position } = folderValues(value);
    const id = Number(
      query(db, 'INSERT INTO wiki_folders(name,parent_id,position) VALUES(?,?,?)').run(
        name,
        parentId,
        position,
      ).lastInsertRowid,
    );
    return { action: 'folder.created', id };
  });
  manage('put', '/api/admin/wiki/folders/:id', (c, value) => {
    const old = store.folder(db, c.req.param('id'));
    const { name, parentId, position } = folderValues(value, old.id);
    query(db, 'UPDATE wiki_folders SET name=?,parent_id=?,position=? WHERE id=?').run(
      name,
      parentId,
      position,
      old.id,
    );
    return { action: 'folder.updated', id: old.id, before: old, after: value };
  });
  manage('delete', '/api/admin/wiki/folders/:id', (c) => {
    const old = store.folder(db, c.req.param('id'));
    if (
      query(db, 'SELECT id FROM wiki_folders WHERE parent_id=? AND deleted_at IS NULL').get(
        old.id,
      ) ||
      query(db, 'SELECT id FROM wiki_entries WHERE folder_id=? AND deleted_at IS NULL').get(
        old.id,
      ) ||
      query(
        db,
        "SELECT id FROM moderation_requests WHERE kind IN ('wiki_create','wiki_edit') AND status='pending' AND json_extract(payload,'$.folder_id')=?",
      ).get(old.id)
    )
      throw error(409, '文件夹含词条、子目录或待审核申请，不能删除');
    // Soft-deleted entries keep historical folder references; their directory is no longer public.
    query(db, 'UPDATE wiki_folders SET deleted_at=unixepoch() WHERE id=?').run(old.id);
    return { action: 'folder.deleted', id: old.id, before: old };
  });
  manage('put', '/api/admin/wiki/entries/:id', (c, value) => {
    const old = store.entry(db, c.req.param('id'));
    const folderId = store.folder(db, value.folder_id ?? old.folder_id).id;
    const position = Number(value.position ?? old.position);
    if (!Number.isSafeInteger(position) || Math.abs(position) > 1000000)
      throw error(422, '排序须为整数');
    if (value.manual_locked !== undefined && typeof value.manual_locked !== 'boolean')
      throw error(422, '锁定状态无效');
    const locked = value.manual_locked ?? !!old.manual_locked;
    const reason = text(value.lock_reason ?? old.lock_reason, '锁定说明', 500, !locked);
    query(
      db,
      'UPDATE wiki_entries SET folder_id=?,position=?,manual_locked=?,lock_reason=? WHERE id=?',
    ).run(folderId, position, locked ? 1 : 0, locked ? reason : '', old.id);
    return {
      action: 'entry.updated',
      id: old.id,
      before: {
        folder_id: old.folder_id,
        position: old.position,
        manual_locked: old.manual_locked,
        lock_reason: old.lock_reason,
      },
      after: value,
    };
  });
  manage('post', '/api/admin/wiki/entries/:id/rollback', (c, value) => {
    const old = store.entry(db, c.req.param('id'));
    if (old.auto_locked) throw error(409, '请先处理待审核修改，再回滚版本');
    const revision = query(
      db,
      'SELECT * FROM wiki_revisions WHERE id=? AND entry_id=? AND hidden=0',
    ).get(Number(value.revision_id) || 0, old.id);
    if (!revision) throw error(404, '历史公开版本不存在或已隐藏');
    const payload = store.decode(revision);
    store.validate(
      db,
      { id: c.get('user').id },
      {
        ...payload,
        folder_id: old.folder_id,
        summary: `回滚至版本 #${revision.id}`,
        base_revision_id: old.current_revision_id,
      },
      { ...old, images: [...old.images, ...payload.images] },
    );
    const id = store.appendRevision(
      db,
      old.id,
      {
        ...payload,
        summary: `回滚至版本 #${revision.id}`,
        base_revision_id: old.current_revision_id,
      },
      revision.user_id,
      c.get('user').id,
    );
    return {
      action: 'entry.rolled_back',
      id: old.id,
      from: old.current_revision_id,
      source: revision.id,
      revision_id: id,
    };
  });
  manage('post', '/api/admin/wiki/entries/:id/revisions/:revision/hide', (c) => {
    const old = store.entry(db, c.req.param('id'));
    const id = Number(c.req.param('revision')) || 0;
    if (id === old.current_revision_id)
      throw error(409, '不能隐藏当前公开版本，请先回滚或删除词条');
    const row = query(
      db,
      'SELECT id FROM wiki_revisions WHERE id=? AND entry_id=? AND hidden=0',
    ).get(id, old.id);
    if (!row) throw error(404, '版本不存在或已隐藏');
    query(db, 'UPDATE wiki_revisions SET hidden=1 WHERE id=?').run(id);
    return { action: 'revision.hidden', id: old.id, revision_id: id };
  });
  manage('delete', '/api/admin/wiki/entries/:id', (c) => {
    const old = store.entry(db, c.req.param('id'));
    store.invalidate(db, old.id, c.get('user').id);
    query(db, 'UPDATE wiki_entries SET deleted_at=unixepoch() WHERE id=?').run(old.id);
    return { action: 'entry.deleted', id: old.id, title: old.title };
  });
}
module.exports = { mountWikiRoutes };
