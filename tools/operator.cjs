'use strict';
// Server-only provisioning. Never expose operator creation through registration or HTTP.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const { validPassword } = require('../packages/shared/src/index.ts');
async function main() {
  const root = path.resolve(process.env.APP_ROOT || process.cwd());
  const reset = process.argv.includes('--reset-test-accounts');
  const username = (process.env.OPERATOR_USERNAME || 'operator').toLowerCase();
  const password =
    process.env.OPERATOR_PASSWORD ||
    'Campus' + crypto.randomBytes(16).toString('base64url') + '9aA';
  if (
    !/^[a-z][a-z0-9_-]{2,31}$/.test(username) ||
    !validPassword(password) ||
    Buffer.byteLength(password) > 72
  )
    throw new Error('Invalid operator username/password policy');
  if (reset && process.env.NODE_ENV === 'production')
    throw new Error('Test-account reset is disabled in production');
  let backup;
  if (fs.existsSync(path.join(root, 'data.db'))) {
    const directory = path.join(root, '.private', 'account-backups');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    backup = path.join(directory, 'data-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db');
    const original = new Database(path.join(root, 'data.db'), { readonly: true });
    try {
      await original.backup(backup);
      fs.chmodSync(backup, 0o600);
    } finally {
      original.close();
    }
  }
  const { db, menuService } = require('../apps/api/src/app')(root);
  const { query } = require('../packages/db/src/client.ts');
  try {
    db.$client.transaction(() => {
      if (reset) {
        query(db, "UPDATE shops SET created_by=NULL,created_by_name=''").run();
        for (const table of [
          'collection_items',
          'collections',
          'user_titles',
          'user_login_days',
          'shop_likes',
          'shop_reviews',
          'recipes',
          'messages',
          'tickets',
          'student_bindings',
          'moderation_requests',
          'account_sessions',
          'student_applications',
          'ban_appeals',
          'account_audit',
        ])
          if (query(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))
            db.$client.exec(`DELETE FROM ${table}`);
        query(db, 'UPDATE users SET equipped_title_id=NULL').run();
        query(db, 'DELETE FROM titles WHERE owner_user_id IS NOT NULL').run();
        query(db, 'DELETE FROM users').run();
        query(db, 'DELETE FROM auth_limits').run();
      }
      if (query(db, 'SELECT id FROM users WHERE username=? COLLATE NOCASE').get(username))
        throw new Error('Account already exists; refusing to overwrite credentials');
      const id = Number(
        query(
          db,
          "INSERT INTO users(username,nickname,password_hash,role,display_id,recipe_default_view) VALUES (?,'运营者',?,'operator',?,'daily')",
        ).run(
          username,
          bcrypt.hashSync(password, 12),
          'ops_' + crypto.randomBytes(4).toString('hex'),
        ).lastInsertRowid,
      );
      require('../apps/api/src/domain/accounts/security').audit(
        db,
        id,
        id,
        'operator.provisioned',
        { test_accounts_reset: reset },
      );
    })();
    console.log(JSON.stringify({ username, password, role: 'operator', backup }, null, 2));
  } finally {
    await menuService.close();
    db.$client.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
