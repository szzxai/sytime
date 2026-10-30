const { query } = require('../../../packages/db/src/client.ts');
const { migrate: migrateShops } = require('./domain/shops/store');

const { migrate: migrateTitles } = require('./domain/titles/store');

const { migrate: migrateCollections } = require('./domain/collections/store');

module.exports = function initialize(db) {
  db.$client.exec('PRAGMA busy_timeout=5000;');
  db.$client.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_id TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  username TEXT UNIQUE,
  nickname TEXT,
  avatar_url TEXT NOT NULL DEFAULT '',
  signature TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  default_page TEXT NOT NULL DEFAULT 'index.html',
  default_floor INTEGER NOT NULL DEFAULT 1,
  recipe_default_view TEXT NOT NULL DEFAULT 'all',
  shop_default_sort TEXT NOT NULL DEFAULT 'campus',
  shop_default_type TEXT NOT NULL DEFAULT '',
  shop_layout TEXT NOT NULL DEFAULT 'stacked',
  shop_layout_mode TEXT NOT NULL DEFAULT 'manual',
  default_collection_shops INTEGER,
  collection_default_public INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  ban_reason TEXT NOT NULL DEFAULT '',
  ban_image TEXT NOT NULL DEFAULT '',
  allow_appeal INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);
  (function migrateLegacyUsers() {
    const row = query(
      db,
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
    ).get();
    if (!row || !/email\s+TEXT\s+NOT\s+NULL/i.test(row.sql)) return;
    db.$client.exec('ALTER TABLE users RENAME TO users_legacy');
    db.$client.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_id TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT,
      username TEXT UNIQUE,
      nickname TEXT,
      avatar_url TEXT NOT NULL DEFAULT '',
      signature TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      default_page TEXT NOT NULL DEFAULT 'index.html',
      default_floor INTEGER NOT NULL DEFAULT 1,
      recipe_default_view TEXT NOT NULL DEFAULT 'all',
      shop_default_sort TEXT NOT NULL DEFAULT 'campus',
      shop_default_type TEXT NOT NULL DEFAULT '',
      shop_layout TEXT NOT NULL DEFAULT 'stacked',
      shop_layout_mode TEXT NOT NULL DEFAULT 'manual',
      default_collection_shops INTEGER,
      collection_default_public INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      ban_reason TEXT NOT NULL DEFAULT '',
      ban_image TEXT NOT NULL DEFAULT '',
      allow_appeal INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
    db.$client.exec(`
    INSERT INTO users (id, email, password_hash, username, nickname, avatar_url, signature, role, created_at)
    SELECT id, email, password_hash, username, nickname, avatar_url, signature, role, created_at FROM users_legacy;
  `);
    db.$client.exec('DROP TABLE users_legacy');
  })();
  (function migrateUserSettings() {
    const cols = query(db, 'PRAGMA table_info(users)')
      .all()
      .map(function (c) {
        return c.name;
      });
    if (cols.indexOf('default_page') === -1) {
      db.$client.exec(
        "ALTER TABLE users ADD COLUMN default_page TEXT NOT NULL DEFAULT 'index.html'",
      );
    }
    if (cols.indexOf('default_floor') === -1) {
      db.$client.exec('ALTER TABLE users ADD COLUMN default_floor INTEGER NOT NULL DEFAULT 1');
    }
    if (cols.indexOf('recipe_default_view') === -1) {
      db.$client.exec(
        "ALTER TABLE users ADD COLUMN recipe_default_view TEXT NOT NULL DEFAULT 'all'",
      );
    }
    if (cols.indexOf('shop_default_sort') === -1) {
      db.$client.exec(
        "ALTER TABLE users ADD COLUMN shop_default_sort TEXT NOT NULL DEFAULT 'campus'",
      );
    }
    if (cols.indexOf('shop_default_type') === -1) {
      db.$client.exec("ALTER TABLE users ADD COLUMN shop_default_type TEXT NOT NULL DEFAULT ''");
    }
    if (cols.indexOf('shop_layout') === -1) {
      db.$client.exec("ALTER TABLE users ADD COLUMN shop_layout TEXT NOT NULL DEFAULT 'stacked'");
    }
    if (cols.indexOf('shop_layout_mode') === -1) {
      db.$client.exec(
        "ALTER TABLE users ADD COLUMN shop_layout_mode TEXT NOT NULL DEFAULT 'manual'",
      );
    }
    if (cols.indexOf('display_id') === -1) {
      db.$client.exec('ALTER TABLE users ADD COLUMN display_id TEXT');
    }
    if (cols.indexOf('status') === -1) {
      db.$client.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    }
    if (cols.indexOf('ban_reason') === -1) {
      db.$client.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''");
    }
    if (cols.indexOf('ban_image') === -1) {
      db.$client.exec("ALTER TABLE users ADD COLUMN ban_image TEXT NOT NULL DEFAULT ''");
    }
    if (cols.indexOf('allow_appeal') === -1) {
      db.$client.exec('ALTER TABLE users ADD COLUMN allow_appeal INTEGER NOT NULL DEFAULT 1');
    }
    // 头衔系统（#10）「连续登录」规则的计数来源
    if (cols.indexOf('last_login_date') === -1) {
      db.$client.exec("ALTER TABLE users ADD COLUMN last_login_date TEXT NOT NULL DEFAULT ''");
    }
    if (cols.indexOf('login_streak') === -1) {
      db.$client.exec('ALTER TABLE users ADD COLUMN login_streak INTEGER NOT NULL DEFAULT 0');
    }
    // 是否展示「权限等级」标签（普通用户等级始终展示，见 apps/web/src/components/ui.tsx 的 RoleTag）
    if (cols.indexOf('show_role') === -1) {
      db.$client.exec('ALTER TABLE users ADD COLUMN show_role INTEGER NOT NULL DEFAULT 1');
    }
    db.$client.exec(
      "UPDATE users SET display_id = CAST(id AS TEXT) WHERE display_id IS NULL OR display_id = ''",
    );
  })();
  db.$client.exec('DROP TABLE IF EXISTS verify_codes;');
  db.$client.exec("UPDATE users SET avatar_url = '' WHERE avatar_url IS NULL;");
  db.$client.exec(`
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0,
  comment TEXT,
  image_url TEXT,
  is_weekly INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_weekly ON recipes(is_weekly);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  publish_date TEXT NOT NULL DEFAULT (date('now'))
);

CREATE INDEX IF NOT EXISTS idx_announcements_date ON announcements(publish_date);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('banner', '欢迎来到校园信息网');
INSERT OR IGNORE INTO settings (key, value) VALUES ('banner_version', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('student_invite_code', '');

CREATE TABLE IF NOT EXISTS student_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  student_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  real_name TEXT NOT NULL,
  extra_info TEXT,
  reject_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_student_applications_user ON student_applications(user_id);

CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS weekly_menu_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  menu_start_date TEXT NOT NULL,
  menu_end_date TEXT NOT NULL,
  filename TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_menu_dates ON weekly_menu_images(menu_start_date, menu_end_date);

CREATE TABLE IF NOT EXISTS ban_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  appeal_reason TEXT NOT NULL,
  appeal_image TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_ban_appeals_status ON ban_appeals(status);
CREATE INDEX IF NOT EXISTS idx_ban_appeals_user ON ban_appeals(user_id);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'pending',
  reply_content TEXT NOT NULL DEFAULT '',
  reply_image TEXT NOT NULL DEFAULT '',
  reply_by TEXT NOT NULL DEFAULT '',
  replied_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  actors TEXT NOT NULL DEFAULT '[]',
  count INTEGER NOT NULL DEFAULT 1,
  target_kind TEXT NOT NULL DEFAULT '',
  target_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  important INTEGER NOT NULL DEFAULT 0,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(user_id, created_at);
`);
  (function migrateInviteCode() {
    const row = query(db, "SELECT value FROM settings WHERE key = 'student_invite_code'").get();
    if (row && row.value) {
      query(db, 'INSERT OR IGNORE INTO invite_codes (code, max_uses) VALUES (?, 0)').run(row.value);
      query(db, "UPDATE settings SET value = '' WHERE key = 'student_invite_code'").run();
    }
  })();
  (function migrateStudentApplications() {
    const cols = query(db, 'PRAGMA table_info(student_applications)')
      .all()
      .map(function (c) {
        return c.name;
      });
    if (cols.indexOf('extra_info') === -1) {
      db.$client.exec('ALTER TABLE student_applications ADD COLUMN extra_info TEXT');
    }
    if (cols.indexOf('reject_reason') === -1) {
      db.$client.exec('ALTER TABLE student_applications ADD COLUMN reject_reason TEXT');
    }
  })();
  (function migrateWeeklyMenuImages() {
    const cols = query(db, 'PRAGMA table_info(weekly_menu_images)')
      .all()
      .map(function (c) {
        return c.name;
      });
    if (cols.indexOf('user_id') === -1) {
      db.$client.exec('ALTER TABLE weekly_menu_images ADD COLUMN user_id INTEGER');
    }
  })();
  // 三元坊必吃榜（#6）：店铺表
  migrateShops(db);
  // 头衔系统（#10）：头衔目录、拥有关系与佩戴状态
  migrateTitles(db);
  // 收藏夹（#23）：collections / collection_items 与默认收藏夹字段
  migrateCollections(db);
  require('./domain/migrations/remove-forum')(db);
};
