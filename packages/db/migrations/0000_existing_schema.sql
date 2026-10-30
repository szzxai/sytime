-- Adopt existing installations without replacing rows or identifiers.
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
, last_login_date TEXT NOT NULL DEFAULT '', login_streak INTEGER NOT NULL DEFAULT 0, show_role INTEGER NOT NULL DEFAULT 1, equipped_title_id INTEGER);
--> statement-breakpoint
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
, dish_id INTEGER REFERENCES dishes(id));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE (user_id, permission)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  publish_date TEXT NOT NULL DEFAULT (date('now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS weekly_menu_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  menu_start_date TEXT NOT NULL,
  menu_end_date TEXT NOT NULL,
  filename TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ban_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  appeal_reason TEXT NOT NULL,
  appeal_image TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      location_note TEXT NOT NULL DEFAULT '',
      dianping_url TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      north_gate_distance_m INTEGER NOT NULL,
      north_gate_walk_min INTEGER NOT NULL,
      east_gate_distance_m INTEGER NOT NULL,
      east_gate_walk_min INTEGER NOT NULL,
      campus_distance_m INTEGER NOT NULL DEFAULT 0,
      campus_walk_min INTEGER NOT NULL DEFAULT 0,
      metro_station TEXT NOT NULL DEFAULT '',
      metro_exit TEXT NOT NULL DEFAULT '',
      metro_distance_m INTEGER NOT NULL,
      metro_walk_min INTEGER NOT NULL,
      created_by INTEGER,
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shop_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(shop_id, user_id)
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shop_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      content TEXT NOT NULL DEFAULT '',
      guests INTEGER,
      total_price REAL,
      image_url TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(shop_id, user_id)
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS titles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      hue TEXT NOT NULL DEFAULT 'stone',
      source TEXT NOT NULL DEFAULT 'grant',
      rule TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      owner_user_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_titles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title_id INTEGER NOT NULL,
      granted_by INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(user_id, title_id)
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_login_days (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL CHECK (section IN ('shops')),
      name TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS collection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('shop')),
      item_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(collection_id, item_type, item_id)
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
      initial TEXT NOT NULL, pinyin TEXT NOT NULL, pinyin_initials TEXT NOT NULL, sort_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS menu_sources (
      id TEXT PRIMARY KEY, article_id INTEGER UNIQUE, title TEXT NOT NULL, url TEXT NOT NULL,
      published_date TEXT, content_hash TEXT, updated_at INTEGER, checked_at INTEGER,
      records_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT ''
    , kind TEXT NOT NULL DEFAULT 'school', publication_origin TEXT NOT NULL DEFAULT 'automatic', revision INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS menu_records (
      source_id TEXT NOT NULL REFERENCES menu_sources(id), record_key TEXT NOT NULL,
      dish_id INTEGER NOT NULL REFERENCES dishes(id), date TEXT, weekday TEXT, time_json TEXT NOT NULL,
      place TEXT, group_name TEXT, price REAL, spicy INTEGER,
      PRIMARY KEY (source_id, record_key)
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS menu_sync_jobs (
      id TEXT PRIMARY KEY, trigger TEXT NOT NULL, auto_day TEXT UNIQUE, status TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'queued', created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER,
      config_revision INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0, processed INTEGER NOT NULL DEFAULT 0,
      succeeded INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
      cancel_requested INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT ''
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS menu_job_items (
      job_id TEXT NOT NULL REFERENCES menu_sync_jobs(id), source_id TEXT NOT NULL,
      article_id INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'fetch', records_count INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '', artifact_path TEXT, PRIMARY KEY (job_id, source_id)
    );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS menu_sync_lease (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS menu_sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS menu_import_audit (
    id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES menu_sources(id),actor_id INTEGER NOT NULL,
    job_id TEXT,created_at INTEGER NOT NULL,records_count INTEGER NOT NULL,records_json TEXT NOT NULL,revision INTEGER NOT NULL
  );
