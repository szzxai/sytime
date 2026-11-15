const { query } = require('../../../../../packages/db/src/client.ts');
const { error, text, audit, notify } = require('../accounts/security');
const { settleNotifications } = require('../accounts/notifications');
const { pinyin } = require('pinyin-pro');

function migrate(db) {
  const existing = query(
    db,
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='moderation_requests'",
  ).get();
  if (!existing.sql.includes("'wiki_create'"))
    db.$client
      .transaction(() => {
        const indexes = query(
          db,
          "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='moderation_requests' AND sql IS NOT NULL",
        ).all();
        db.$client.exec(
          existing.sql
            .replace('moderation_requests', 'moderation_requests_wiki')
            .replace("'appeal'", "'appeal','wiki_create','wiki_edit'"),
        );
        db.$client.exec(
          'INSERT INTO moderation_requests_wiki SELECT * FROM moderation_requests; DROP TABLE moderation_requests; ALTER TABLE moderation_requests_wiki RENAME TO moderation_requests;',
        );
        for (const index of indexes) db.$client.exec(index.sql);
      })
      .immediate();
  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS wiki_folders (
      id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES wiki_folders(id),
      name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS wiki_entries (
      id INTEGER PRIMARY KEY, folder_id INTEGER NOT NULL REFERENCES wiki_folders(id),
      position INTEGER NOT NULL DEFAULT 0, current_revision_id INTEGER,
      manual_locked INTEGER NOT NULL DEFAULT 0, lock_reason TEXT NOT NULL DEFAULT '',
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS wiki_revisions (
      id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES wiki_entries(id),
      title TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '[]', markdown TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]', images TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL, user_id INTEGER NOT NULL, reviewer_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), hidden INTEGER NOT NULL DEFAULT 0,
      search_text TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS wiki_revisions_entry ON wiki_revisions(entry_id,id);
    CREATE TABLE IF NOT EXISTS wiki_images (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS wiki_entries_folder ON wiki_entries(folder_id,position,id);
    CREATE UNIQUE INDEX IF NOT EXISTS wiki_pending_edit ON moderation_requests(subject_key)
      WHERE kind='wiki_edit' AND status='pending';
  `);
}
const normalize = (s) => s.normalize('NFKC').trim().toLocaleLowerCase();
function folder(db, id) {
  const row = query(db, 'SELECT * FROM wiki_folders WHERE id=? AND deleted_at IS NULL').get(
    Number(id) || 0,
  );
  if (!row) throw error(422, '归属文件夹不存在，请刷新目录');
  return row;
}
function folderPath(db, id) {
  const row = folder(db, id);
  return row.parent_id ? [folder(db, row.parent_id), row] : [row];
}
function decode(row) {
  return {
    ...row,
    aliases: JSON.parse(row.aliases),
    sources: JSON.parse(row.sources),
    images: JSON.parse(row.images),
  };
}
function entry(db, id) {
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)))
    throw error(404, '词条不存在或已被删除');
  const row = query(
    db,
    `SELECT e.*,r.title,r.aliases,r.markdown,r.sources,r.images,r.summary,
    r.user_id,r.created_at AS updated_at FROM wiki_entries e JOIN wiki_revisions r
    ON r.id=e.current_revision_id WHERE e.id=? AND e.deleted_at IS NULL`,
  ).get(Number(id) || 0);
  if (!row) throw error(404, '词条不存在或已被删除');
  const pending = query(
    db,
    "SELECT id FROM moderation_requests WHERE kind='wiki_edit' AND subject_key=? AND status='pending'",
  ).get(String(row.id));
  return { ...decode(row), auto_locked: !!pending, path: folderPath(db, row.folder_id) };
}
function list(db) {
  return query(
    db,
    `SELECT e.id,e.folder_id,e.position,r.title,r.aliases,r.markdown,r.created_at AS updated_at,r.search_text
    FROM wiki_entries e JOIN wiki_revisions r ON r.id=e.current_revision_id
    WHERE e.deleted_at IS NULL ORDER BY e.position,e.id`,
  )
    .all()
    .map((r) => ({ ...r, aliases: JSON.parse(r.aliases) }));
}
function conflict(db, names, exceptEntry = null, exceptRequest = null) {
  const keys = new Set(names.map(normalize));
  for (const row of list(db)) {
    if (row.id === exceptEntry) continue;
    if ([row.title, ...row.aliases].some((s) => keys.has(normalize(s))))
      throw Object.assign(error(409, `名称与公开词条「${row.title}」的标题或别名冲突`), {
        entry_id: row.id,
      });
  }
  for (const row of query(
    db,
    "SELECT id,payload FROM moderation_requests WHERE kind IN ('wiki_create','wiki_edit') AND status='pending'",
  ).all()) {
    if (row.id === exceptRequest) continue;
    const value = JSON.parse(row.payload);
    if ([value.title, ...(value.aliases || [])].some((s) => keys.has(normalize(s))))
      throw error(409, '名称与待审核 Wiki 申请的标题或别名冲突');
  }
}
function validate(db, user, value, target) {
  const title = text(value.title, '词条标题', 100);
  text(value.markdown, 'Markdown 正文', 100000);
  const markdown = value.markdown;
  const summary = text(value.summary, '编辑摘要', 500, !target);
  if (target && value.base_revision_id !== target.current_revision_id)
    throw error(409, '公开版本已变化，请对照最新内容合并草稿');
  const folder_id = folder(db, value.folder_id).id;
  const array = (value, label, max, length) => {
    if (!Array.isArray(value) || value.length > max) throw error(422, `${label}数量过多或格式无效`);
    return [...new Set(value.map((v) => text(v, label, length)))];
  };
  const aliases = array(value.aliases || [], '别名', 20, 100);
  const sources = array(value.sources || [], '参考来源', 20, 2000);
  if (sources.some((s) => !/^https?:\/\/[^\s]+$/i.test(s)))
    throw error(422, '参考来源须为 HTTP 或 HTTPS 链接');
  const images = array(value.images || [], '配图', Infinity, 80);
  const allowed = new Set(target?.images || []);
  for (const id of images) {
    const image = query(db, 'SELECT user_id FROM wiki_images WHERE id=?').get(id);
    if (!image || (image.user_id !== user.id && !allowed.has(id)))
      throw error(422, '配图不存在或无权使用');
  }
  // Images are served through an authorization-aware endpoint, never from public upload storage.
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) {
    const id = m[1].match(/^\/api\/wiki\/images\/([a-f0-9-]+)$/)?.[1];
    if (!id || !images.includes(id)) throw error(422, '正文图片请通过编辑器拖入、粘贴或上传');
  }
  conflict(db, [title, ...aliases], target?.id);
  return {
    title,
    aliases,
    markdown,
    sources,
    images,
    summary: summary || '创建词条',
    folder_id,
    folder_path: folderPath(db, folder_id)
      .map((f) => f.name)
      .join(' / '),
    ...(target
      ? {
          entry_id: target.id,
          base_revision_id: target.current_revision_id,
          before_markdown: target.markdown,
        }
      : { before_markdown: '' }),
  };
}
function publish(db, request, payload, actor) {
  folder(db, payload.folder_id);
  conflict(db, [payload.title, ...payload.aliases], payload.entry_id || null, request.id);
  let id = payload.entry_id;
  if (request.kind === 'wiki_edit') {
    const target = entry(db, id);
    if (target.manual_locked) throw error(409, '词条已手动锁定，请先解除手动锁定或拒绝申请');
    if (target.current_revision_id !== payload.base_revision_id)
      throw error(409, '公开版本已变化，请拒绝旧申请并重新提交');
  } else {
    id = Number(
      query(db, 'INSERT INTO wiki_entries(folder_id) VALUES(?)').run(payload.folder_id)
        .lastInsertRowid,
    );
  }
  appendRevision(db, id, payload, request.user_id, actor.id);
  query(db, 'UPDATE wiki_entries SET folder_id=? WHERE id=?').run(payload.folder_id, id);
  return id;
}
function appendRevision(db, id, payload, userId, reviewerId) {
  const searchable = [payload.title, ...payload.aliases, payload.markdown].join('\n');
  const searchText = [
    searchable,
    pinyin(searchable, { toneType: 'none', separator: '' }),
    pinyin(searchable, { pattern: 'first', toneType: 'none', separator: '' }),
  ]
    .join('\n')
    .toLowerCase();
  const revisionId = Number(
    query(
      db,
      `INSERT INTO wiki_revisions(entry_id,title,aliases,markdown,sources,images,summary,user_id,reviewer_id,search_text)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      payload.title,
      JSON.stringify(payload.aliases),
      payload.markdown,
      JSON.stringify(payload.sources),
      JSON.stringify(payload.images),
      payload.summary,
      userId,
      reviewerId,
      searchText,
    ).lastInsertRowid,
  );
  query(db, 'UPDATE wiki_entries SET current_revision_id=? WHERE id=?').run(revisionId, id);
  return revisionId;
}
function invalidate(db, id, actorId) {
  for (const request of query(
    db,
    "SELECT * FROM moderation_requests WHERE kind='wiki_edit' AND subject_key=? AND status='pending'",
  ).all(String(id))) {
    query(
      db,
      "UPDATE moderation_requests SET status='rejected',reason='词条已被删除，修改申请已失效',reviewer_id=?,reviewed_at=unixepoch() WHERE id=?",
    ).run(actorId, request.id);
    settleNotifications(db, 'moderation_pending', request.id);
    notify(db, request.user_id, 'Wiki 修改申请已失效', '词条已被删除，修改申请不再生效。', {
      kind: 'moderation_result',
      id: request.id,
    });
    audit(db, actorId, request.user_id, 'submission.invalidated', { id: request.id, entry_id: id });
  }
}
module.exports = {
  migrate,
  folder,
  folderPath,
  entry,
  list,
  decode,
  validate,
  publish,
  appendRevision,
  invalidate,
  normalize,
};
