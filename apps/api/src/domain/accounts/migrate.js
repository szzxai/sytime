const { query } = require('../../../../../packages/db/src/client.ts');
module.exports = function migrateAccounts(db) {
  const columns = query(db, 'PRAGMA table_info(users)')
    .all()
    .map((c) => c.name);
  if (!columns.includes('session_version'))
    db.$client.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
  if (!columns.includes('sso_subject'))
    db.$client.exec('ALTER TABLE users ADD COLUMN sso_subject TEXT');
  if (!columns.includes('sso_issuer'))
    db.$client.exec('ALTER TABLE users ADD COLUMN sso_issuer TEXT');
  db.$client.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_sso_subject ON users(sso_issuer,sso_subject)',
  );
  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS oidc_flows(id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS oidc_flows_expiry ON oidc_flows(expires_at);
    CREATE TABLE IF NOT EXISTS account_migrations (key TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS account_sessions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS account_sessions_user ON account_sessions(user_id);
    CREATE TABLE IF NOT EXISTS moderation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('display_id','avatar','nickname','signature','dish_review','shop','shop_review','appeal','wiki_create','wiki_edit')),
      subject_key TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
      reason TEXT NOT NULL DEFAULT '', reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), reviewed_at INTEGER, published_id INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS moderation_one_pending ON moderation_requests(user_id,kind,subject_key) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS moderation_queue ON moderation_requests(status,kind,created_at,id);
    CREATE INDEX IF NOT EXISTS moderation_owner ON moderation_requests(user_id,created_at,id);
    CREATE TABLE IF NOT EXISTS account_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
  `);
  db.$client.transaction(() => {
    // Remove obsolete identity applications, including private student details and notices.
    db.$client.exec(`
      DELETE FROM messages WHERE target_kind IN ('moderation_pending','moderation_result') AND target_id IN (SELECT id FROM moderation_requests WHERE kind='student');
      DELETE FROM messages WHERE title LIKE '%学生认证%' OR title LIKE '%学生身份%';
      DELETE FROM moderation_requests WHERE kind='student';
      DROP TABLE IF EXISTS student_bindings;
      DROP TABLE IF EXISTS student_applications;
    `);
    const schema = query(db, "SELECT sql FROM sqlite_master WHERE name='moderation_requests'").get()
      .sql;
    if (/['"]student['"]/.test(schema)) {
      const indexes = query(
        db,
        "SELECT sql FROM sqlite_master WHERE tbl_name='moderation_requests' AND type='index' AND sql IS NOT NULL",
      ).all();
      db.$client.exec(
        schema
          .replace('moderation_requests', 'moderation_requests_sso')
          .replace(/'student'\s*,\s*/g, ''),
      );
      db.$client.exec(
        'INSERT INTO moderation_requests_sso SELECT * FROM moderation_requests; DROP TABLE moderation_requests; ALTER TABLE moderation_requests_sso RENAME TO moderation_requests;',
      );
      for (const index of indexes) db.$client.exec(index.sql);
    }
    // Connect existing staff notices using their exact server-generated request numbers.
    if (
      !query(db, "SELECT key FROM account_migrations WHERE key='notification-targets-v2'").get()
    ) {
      query(
        db,
        `UPDATE messages SET target_kind='moderation_pending',target_id=(
        SELECT r.id FROM moderation_requests r WHERE messages.body='申请 #'||r.id||'，请前往管理后台处理。'
      ) WHERE target_kind='' AND EXISTS (
        SELECT 1 FROM moderation_requests r WHERE messages.body='申请 #'||r.id||'，请前往管理后台处理。'
      )`,
      ).run();
      query(
        db,
        `UPDATE messages SET target_kind='ticket_pending',target_id=(
        SELECT t.id FROM tickets t WHERE messages.body IN ('工单 #'||t.id||'，请前往后台查看。','工单 #'||t.id||' 已受理，请等待回复。')
      ) WHERE target_kind='' AND EXISTS (
        SELECT 1 FROM tickets t WHERE messages.body IN ('工单 #'||t.id||'，请前往后台查看。','工单 #'||t.id||' 已受理，请等待回复。')
      )`,
      ).run();
      const labels = require('./moderation').labels;
      for (const request of query(db, 'SELECT * FROM moderation_requests').all()) {
        const pendingMatches = query(
          db,
          'SELECT count(*) n FROM moderation_requests WHERE user_id=? AND kind=? AND created_at=?',
        ).get(request.user_id, request.kind, request.created_at).n;
        if (pendingMatches === 1) {
          query(
            db,
            "UPDATE messages SET target_kind='moderation_pending',target_id=? WHERE target_kind='' AND user_id=? AND title=? AND body=? AND created_at=?",
          ).run(
            request.id,
            request.user_id,
            labels[request.kind] + '已提交',
            '申请已进入审核队列，通过前不会对外发布。',
            request.created_at,
          );
        }
        const title =
          labels[request.kind] +
          (request.status === 'pending'
            ? '已提交'
            : request.status === 'approved'
              ? '已通过'
              : '未通过');
        const timestamp = request.status === 'pending' ? request.created_at : request.reviewed_at;
        if (!['pending', 'approved', 'rejected'].includes(request.status) || !timestamp) continue;
        const matches = query(
          db,
          'SELECT count(*) n FROM moderation_requests WHERE user_id=? AND kind=? AND status=? AND COALESCE(reviewed_at,created_at)=?',
        ).get(request.user_id, request.kind, request.status, timestamp).n;
        if (matches !== 1) continue;
        const body =
          request.status === 'pending'
            ? '申请已进入审核队列，通过前不会对外发布。'
            : request.reason || '审核已通过，内容已生效。';
        query(
          db,
          "UPDATE messages SET target_kind=?,target_id=? WHERE target_kind='' AND user_id=? AND title=? AND body=? AND created_at=?",
        ).run(
          request.status === 'pending' ? 'moderation_pending' : 'moderation_result',
          request.id,
          request.user_id,
          title,
          body,
          timestamp,
        );
      }
      query(
        db,
        "INSERT INTO account_migrations VALUES('notification-targets-v2',unixepoch())",
      ).run();
    }

    if (!query(db, "SELECT key FROM account_migrations WHERE key='accounts-v2'").get()) {
      query(
        db,
        "UPDATE users SET role=CASE role WHEN 'developer' THEN 'operator' WHEN 'super_admin' THEN 'admin' ELSE role END, session_version=session_version+1",
      ).run();
      query(
        db,
        "UPDATE tickets SET visibility=CASE visibility WHEN 'developer' THEN 'operator' WHEN 'super_admin' THEN 'operator' ELSE 'admin' END",
      ).run();
      query(db, "INSERT INTO account_migrations VALUES('accounts-v2',unixepoch())").run();
    }
    // These capabilities no longer exist; never import their grants or old invitations.
    db.$client.exec(
      'DROP TABLE IF EXISTS invite_codes; DROP TABLE IF EXISTS user_permissions; DROP TABLE IF EXISTS weekly_menu_images;',
    );
    query(db, "DELETE FROM settings WHERE key IN ('student_invite_code','menu_ai_config')").run();
  })();
};
