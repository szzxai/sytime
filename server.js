require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { DatabaseSync } = require("node:sqlite");
const { MenuService } = require("./lib/menu/service");
const { mountMenuRoutes } = require("./lib/menu/routes");
const { migrate: migrateShops } = require("./lib/shops/store");
const { mountShopRoutes } = require("./lib/shops/routes");
const {
  migrate: migrateTitles,
  equippedTitle: equippedTitleOf,
  equippedTitleMap,
  titlesByUserMap,
  ownedTitles
} = require("./lib/titles/store");
const { mountTitleRoutes } = require("./lib/titles/routes");
const { evaluateAutoTitles } = require("./lib/titles/rules");
const { migrate: migrateCollections } = require("./lib/collections/store");
const { mountCollectionRoutes } = require("./lib/collections/routes");
const { localDay, shiftDay } = require("./lib/menu/schedule");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const DB_PATH = path.join(__dirname, "data.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout=5000;");

db.exec(`
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
  default_collection_forum INTEGER,
  default_collection_shops INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  ban_reason TEXT NOT NULL DEFAULT '',
  ban_image TEXT NOT NULL DEFAULT '',
  allow_appeal INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);

(function migrateLegacyUsers() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!row || !/email\s+TEXT\s+NOT\s+NULL/i.test(row.sql)) return;
  db.exec("ALTER TABLE users RENAME TO users_legacy");
  db.exec(`
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
      default_collection_forum INTEGER,
      default_collection_shops INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      ban_reason TEXT NOT NULL DEFAULT '',
      ban_image TEXT NOT NULL DEFAULT '',
      allow_appeal INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`
    INSERT INTO users (id, email, password_hash, username, nickname, avatar_url, signature, role, created_at)
    SELECT id, email, password_hash, username, nickname, avatar_url, signature, role, created_at FROM users_legacy;
  `);
  db.exec("DROP TABLE users_legacy");
})();

(function migrateUserSettings() {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(function (c) { return c.name; });
  if (cols.indexOf("default_page") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN default_page TEXT NOT NULL DEFAULT 'index.html'");
  }
  if (cols.indexOf("default_floor") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN default_floor INTEGER NOT NULL DEFAULT 1");
  }
  if (cols.indexOf("recipe_default_view") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN recipe_default_view TEXT NOT NULL DEFAULT 'all'");
  }
  if (cols.indexOf("shop_default_sort") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN shop_default_sort TEXT NOT NULL DEFAULT 'campus'");
  }
  if (cols.indexOf("shop_default_type") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN shop_default_type TEXT NOT NULL DEFAULT ''");
  }
  if (cols.indexOf("shop_layout") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN shop_layout TEXT NOT NULL DEFAULT 'stacked'");
  }
  if (cols.indexOf("shop_layout_mode") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN shop_layout_mode TEXT NOT NULL DEFAULT 'manual'");
  }
  if (cols.indexOf("display_id") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN display_id TEXT");
  }
  if (cols.indexOf("status") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  }
  if (cols.indexOf("ban_reason") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''");
  }
  if (cols.indexOf("ban_image") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN ban_image TEXT NOT NULL DEFAULT ''");
  }
  if (cols.indexOf("allow_appeal") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN allow_appeal INTEGER NOT NULL DEFAULT 1");
  }
  if (cols.indexOf("pref_comment") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN pref_comment INTEGER NOT NULL DEFAULT 1");
  }
  if (cols.indexOf("pref_reply") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN pref_reply INTEGER NOT NULL DEFAULT 1");
  }
  if (cols.indexOf("pref_like") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN pref_like INTEGER NOT NULL DEFAULT 1");
  }
  // 头衔系统（#10）「连续登录」规则的计数来源
  if (cols.indexOf("last_login_date") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_date TEXT NOT NULL DEFAULT ''");
  }
  if (cols.indexOf("login_streak") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN login_streak INTEGER NOT NULL DEFAULT 0");
  }
  // 是否展示「权限等级」标签（普通用户等级始终展示，见 public/js/ui.js 的 UI.roleTag）
  if (cols.indexOf("show_role") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN show_role INTEGER NOT NULL DEFAULT 1");
  }
  db.exec("UPDATE users SET display_id = CAST(id AS TEXT) WHERE display_id IS NULL OR display_id = ''");
})();

db.exec("DROP TABLE IF EXISTS verify_codes;");
db.exec("UPDATE users SET avatar_url = '' WHERE avatar_url IS NULL;");

db.exec(`
CREATE TABLE IF NOT EXISTS forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('讨论', '提问')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

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

CREATE TABLE IF NOT EXISTS forum_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_forum_category ON forum_posts(category);
CREATE INDEX IF NOT EXISTS idx_forum_replies_post ON forum_replies(post_id);

CREATE TABLE IF NOT EXISTS post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);

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
  const row = db.prepare("SELECT value FROM settings WHERE key = 'student_invite_code'").get();
  if (row && row.value) {
    db.prepare("INSERT OR IGNORE INTO invite_codes (code, max_uses) VALUES (?, 0)").run(row.value);
    db.prepare("UPDATE settings SET value = '' WHERE key = 'student_invite_code'").run();
  }
})();

(function migrateStudentApplications() {
  const cols = db.prepare("PRAGMA table_info(student_applications)").all().map(function (c) { return c.name; });
  if (cols.indexOf("extra_info") === -1) {
    db.exec("ALTER TABLE student_applications ADD COLUMN extra_info TEXT");
  }
  if (cols.indexOf("reject_reason") === -1) {
    db.exec("ALTER TABLE student_applications ADD COLUMN reject_reason TEXT");
  }
})();

(function migrateWeeklyMenuImages() {
  const cols = db.prepare("PRAGMA table_info(weekly_menu_images)").all().map(function (c) { return c.name; });
  if (cols.indexOf("user_id") === -1) {
    db.exec("ALTER TABLE weekly_menu_images ADD COLUMN user_id INTEGER");
  }
})();

// 三元坊必吃榜（#6）：店铺表
migrateShops(db);

// 头衔系统（#10）：头衔目录、拥有关系与佩戴状态
migrateTitles(db);

// 收藏夹（#23）：collections / collection_items 与默认收藏夹字段
migrateCollections(db);

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("only jpg/png images are allowed"));
    }
  }
});

const WEEKLY_DIR = path.join(UPLOAD_DIR, "weekly");
if (!fs.existsSync(WEEKLY_DIR)) {
  fs.mkdirSync(WEEKLY_DIR);
}

const weeklyUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, WEEKLY_DIR);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("only jpg/png images are allowed"));
    }
  }
});

const ROLE_WEIGHTS = { developer: 6, super_admin: 5, admin: 4, student: 3, user: 2, guest: 1 };
const TICKET_VISIBILITIES = ["admin", "super_admin", "developer"];

const BANS_DIR = path.join(UPLOAD_DIR, "bans");
if (!fs.existsSync(BANS_DIR)) {
  fs.mkdirSync(BANS_DIR);
}

const banUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, BANS_DIR);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("only jpg/png images are allowed"));
    }
  }
});

function checkRole(requiredRole) {
  return function (req, res, next) {
    req.user = { id: null, role: "guest", username: null };
    const header = req.headers.authorization || "";
    const token = header.indexOf("Bearer ") === 0 ? header.slice(7) : header;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        let username = payload.username;
        let role = payload.role;
        if (!username && payload.id !== undefined && payload.id !== null) {
          const row = db.prepare("SELECT username, role FROM users WHERE id = ?").get(payload.id);
          if (row) {
            username = row.username;
            if (!role) role = row.role;
          }
        }
        req.user = { id: payload.id, role: role, username: username };
      } catch (err) {
        req.user = { id: null, role: "guest", username: null };
      }
    }
    if (!requiredRole) {
      next();
      return;
    }
    const current = ROLE_WEIGHTS[req.user.role] || ROLE_WEIGHTS.guest;
    const needed = ROLE_WEIGHTS[requiredRole] || ROLE_WEIGHTS.guest;
    if (current < needed) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

function requireLogin(req, res, next) {
  checkRole()(req, res, function () {
    if (!req.user || req.user.id === null || req.user.id === undefined) {
      res.status(401).json({ error: "login required" });
      return;
    }
    next();
  });
}

const PERMISSIONS = {
  banner_edit: "编辑横幅",
  announcement_publish: "发布更新公告",
  student_review: "学生认证审核",
  invite_manage: "邀请码管理",
  weekly_menu_upload: "每周菜谱上传",
  map_popup_edit: "地图弹窗编辑",
  user_manage: "用户管理",
  ban_appeal_review: "申诉处理",
  ticket_manage: "工单管理",
  shop_create: "添加店铺",
  title_manage: "头衔管理"
};

// 添加店铺的最低角色：默认 student，可用环境变量 SHOP_CREATE_MIN_ROLE 调整
const SHOP_CREATE_ROLES = ["user", "student", "admin", "super_admin", "developer"];
const SHOP_CREATE_MIN_ROLE = SHOP_CREATE_ROLES.indexOf(process.env.SHOP_CREATE_MIN_ROLE || "") !== -1
  ? process.env.SHOP_CREATE_MIN_ROLE
  : "student";

const PERMISSION_REQUIRES = {
  banner_edit: "super_admin",
  announcement_publish: "super_admin",
  student_review: "super_admin",
  invite_manage: "super_admin",
  user_manage: "super_admin",
  ban_appeal_review: "super_admin",
  weekly_menu_upload: "admin",
  map_popup_edit: "admin",
  ticket_manage: "admin",
  shop_create: SHOP_CREATE_MIN_ROLE,
  title_manage: "super_admin"
};

function userPermissionList(userId) {
  return db
    .prepare("SELECT permission FROM user_permissions WHERE user_id = ?")
    .all(userId)
    .map(function (row) { return row.permission; });
}

function hasPermission(req, perm) {
  if (!req.user || req.user.id === null || req.user.id === undefined) return false;
  // 角色或封禁状态可能在 JWT 签发后发生变化；权限写操作以数据库当前状态为准。
  const account = db.prepare("SELECT role, status FROM users WHERE id = ?").get(req.user.id);
  if (!account || account.status !== "active") return false;
  const needed = ROLE_WEIGHTS[PERMISSION_REQUIRES[perm]] || 0;
  if ((ROLE_WEIGHTS[account.role] || 0) >= needed) return true;
  const row = db.prepare("SELECT id FROM user_permissions WHERE user_id = ? AND permission = ?").get(req.user.id, perm);
  return !!row;
}

function isVerifiedStudent(req) {
  if (!req.user || req.user.id === null || req.user.id === undefined) return false;
  const account = db.prepare("SELECT role, status FROM users WHERE id = ?").get(req.user.id);
  if (!account || account.status !== "active") return false;
  // 学生及以上角色（student / admin / super_admin / developer）均可点赞和评价。
  return (ROLE_WEIGHTS[account.role] || 0) >= ROLE_WEIGHTS.student;
}

// 后台针对具体账号的写操作一律遵守：不能操作自己，也不能操作权重不低于自己的人。
// 与 PUT /api/admin/users/role、/ban、/permissions 的判定保持一致；返回值区分不存在与无权限。
function checkTarget(actorId, targetId) {
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(targetId);
  if (!target) return "missing";
  const actor = db.prepare("SELECT role, status FROM users WHERE id = ?").get(actorId);
  if (!actor || actor.status !== "active") return "forbidden";
  if (Number(actorId) === Number(targetId)) return "forbidden";
  return (ROLE_WEIGHTS[target.role] || 0) < (ROLE_WEIGHTS[actor.role] || 0) ? "ok" : "forbidden";
}

function requirePermission(perm) {
  return function (req, res, next) {
    checkRole()(req, res, function () {
      if (!req.user || req.user.id === null || req.user.id === undefined) {
        res.status(401).json({ error: "login required" });
        return;
      }
      if (!hasPermission(req, perm)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      next();
    });
  };
}

const MESSAGE_TYPE_FILTERS = { system: ["system"], interact: ["comment", "reply"], like: ["like"] };

function actorInfo(userId) {
  const row = db.prepare("SELECT id, username, nickname, avatar_url FROM users WHERE id = ?").get(userId);
  if (!row) return { id: userId, username: "", nickname: "", avatar_url: "" };
  return { id: row.id, username: row.username, nickname: row.nickname || "", avatar_url: row.avatar_url || "" };
}

// 头衔系统（#10）：论坛帖子与回复只存了 username，统一用户组件还需要昵称、头像、角色与佩戴头衔。
// 佩戴头衔放在 user_title，避免覆盖 forum_posts.title 这类同名字段。
function attachAuthors(rows, key) {
  const column = key || "user_id";
  const ids = [];
  rows.forEach(function (row) {
    const id = row[column];
    if (id !== null && id !== undefined && ids.indexOf(id) === -1) ids.push(id);
  });
  if (!ids.length) return rows;
  const placeholders = ids.map(function () { return "?"; }).join(",");
  const accounts = new Map();
  db.prepare("SELECT id, nickname, avatar_url, role, show_role FROM users WHERE id IN (" + placeholders + ")")
    .all(...ids)
    .forEach(function (account) { accounts.set(account.id, account); });
  const titles = equippedTitleMap(db, ids);
  rows.forEach(function (row) {
    const account = accounts.get(row[column]);
    row.nickname = account ? account.nickname || "" : "";
    row.avatar_url = account ? account.avatar_url || "" : "";
    row.role = account ? account.role : "";
    row.show_role = account && account.show_role !== null && account.show_role !== undefined ? account.show_role : 1;
    row.user_title = titles.get(row[column]) || null;
  });
  return rows;
}

// 连续登录按北京时间自然日累计，用于「夜读星」自动头衔；登录成功后顺带发放已达成的自动头衔。
function recordLogin(userId) {
  const today = localDay(Date.now());
  const row = db.prepare("SELECT last_login_date, login_streak FROM users WHERE id = ?").get(userId);
  if (row) {
    const last = row.last_login_date || "";
    const previous = row.login_streak || 0;
    const streak = last === today ? Math.max(previous, 1) : last === shiftDay(today, -1) ? previous + 1 : 1;
    db.prepare("UPDATE users SET last_login_date = ?, login_streak = ? WHERE id = ?").run(today, streak, userId);
  }
  // 逐日登录历史供「闲者爱上网」按周末统计；同一自然日只记一条
  db.prepare("INSERT OR IGNORE INTO user_login_days (user_id, day) VALUES (?, ?)").run(userId, today);
  return evaluateAutoTitles(db, userId);
}

function notifyComment(post, actorId, content) {
  if (!post || post.user_id === actorId) return;
  const author = db.prepare("SELECT id, pref_comment FROM users WHERE id = ?").get(post.user_id);
  if (!author || !author.pref_comment) return;
  db.prepare("INSERT INTO messages (user_id, type, actors, count, target_kind, target_id, snippet) VALUES (?, 'comment', ?, 1, 'post', ?, ?)")
    .run(post.user_id, JSON.stringify([actorInfo(actorId)]), post.id, String(content).slice(0, 200));
}

function notifyLike(postId, actorId) {
  const post = db.prepare("SELECT id, user_id FROM forum_posts WHERE id = ?").get(postId);
  if (!post || post.user_id === actorId) return;
  const author = db.prepare("SELECT pref_like FROM users WHERE id = ?").get(post.user_id);
  if (!author || !author.pref_like) return;
  const existing = db
    .prepare("SELECT id, actors FROM messages WHERE user_id = ? AND type = 'like' AND target_kind = 'post' AND target_id = ?")
    .get(post.user_id, postId);
  if (existing) {
    let actors = [];
    try { actors = JSON.parse(existing.actors) || []; } catch (e) { actors = []; }
    if (actors.some(function (a) { return a.id === actorId; })) return;
    actors.push(actorInfo(actorId));
    db.prepare("UPDATE messages SET actors = ?, count = ?, read_at = NULL, created_at = ? WHERE id = ?")
      .run(JSON.stringify(actors), actors.length, Math.floor(Date.now() / 1000), existing.id);
  } else {
    db.prepare("INSERT INTO messages (user_id, type, actors, count, target_kind, target_id) VALUES (?, 'like', ?, 1, 'post', ?)")
      .run(post.user_id, JSON.stringify([actorInfo(actorId)]), postId);
  }
}

function removeLikeNotify(postId, actorId) {
  const post = db.prepare("SELECT id, user_id FROM forum_posts WHERE id = ?").get(postId);
  if (!post) return;
  const existing = db
    .prepare("SELECT id, actors FROM messages WHERE user_id = ? AND type = 'like' AND target_kind = 'post' AND target_id = ?")
    .get(post.user_id, postId);
  if (!existing) return;
  let actors = [];
  try { actors = JSON.parse(existing.actors) || []; } catch (e) { actors = []; }
  actors = actors.filter(function (a) { return a.id !== actorId; });
  if (!actors.length) db.prepare("DELETE FROM messages WHERE id = ?").run(existing.id);
  else db.prepare("UPDATE messages SET actors = ?, count = ? WHERE id = ?").run(JSON.stringify(actors), actors.length, existing.id);
}

app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

app.post("/api/register", function (req, res) {
  const body = req.body || {};
  const username = body.username;
  const nickname = body.nickname;
  const password = body.password;
  if (!username || !nickname || !password) {
    res.status(400).json({ error: "username, nickname and password are required" });
    return;
  }
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    res.status(409).json({ error: "username already exists" });
    return;
  }
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const role = Number(count) === 0 ? "developer" : "user";
  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, nickname, password_hash, role, avatar_url) VALUES (?, ?, ?, ?, '')")
    .run(username, nickname, passwordHash, role);
  const newId = Number(info.lastInsertRowid);
  const displayId = String(newId);
  db.prepare("UPDATE users SET display_id = ? WHERE id = ?").run(displayId, newId);
  res.status(201).json({
    id: newId,
    display_id: displayId,
    username: username,
    nickname: nickname,
    role: role
  });
});

app.post("/api/login", function (req, res) {
  const body = req.body || {};
  const username = body.username;
  const password = body.password;
  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: "invalid username or password" });
    return;
  }
  if (user.status === "banned") {
    res.status(403).json({
      error: "banned",
      ban_reason: user.ban_reason || "",
      allow_appeal: Number(user.allow_appeal) === 1 ? 1 : 0
    });
    return;
  }
  const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const grantedTitles = recordLogin(user.id);
  res.json({
    token: token,
    user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role },
    granted_titles: grantedTitles
  });
});

app.get("/api/me", checkRole(), function (req, res) {
  const perms = req.user && req.user.id !== null && req.user.id !== undefined ? userPermissionList(req.user.id) : [];
  res.json({ user: Object.assign({}, req.user, { permissions: perms }) });
});

app.get("/api/admin/ping", checkRole("super_admin"), function (req, res) {
  res.json({ ok: true, user: req.user });
});

app.post("/api/admin/announcements", requirePermission("announcement_publish"), function (req, res) {
  const body = req.body || {};
  const title = body.title;
  const content = body.content;
  if (!title || !content) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }
  const publishDate = body.publish_date || null;
  let info;
  if (publishDate) {
    info = db
      .prepare("INSERT INTO announcements (title, content, publish_date) VALUES (?, ?, ?)")
      .run(title, content, publishDate);
  } else {
    info = db
      .prepare("INSERT INTO announcements (title, content) VALUES (?, ?)")
      .run(title, content);
  }
  const announcement = db.prepare("SELECT * FROM announcements WHERE id = ?").get(Number(info.lastInsertRowid));
  res.status(201).json({ announcement: announcement });
});

app.delete("/api/admin/announcements/:id", requirePermission("announcement_publish"), function (req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const row = db.prepare("SELECT id FROM announcements WHERE id = ?").get(id);
  if (!row) {
    res.status(404).json({ error: "announcement not found" });
    return;
  }
  db.prepare("DELETE FROM announcements WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get("/api/settings/banner", function (req, res) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'banner'").get();
  const ver = db.prepare("SELECT value FROM settings WHERE key = 'banner_version'").get();
  res.json({
    banner: row && row.value ? row.value : "",
    version: ver && ver.value ? Number(ver.value) : 0
  });
});

app.put("/api/admin/settings/banner", requirePermission("banner_edit"), function (req, res) {
  const body = req.body || {};
  let value = null;
  if (body.value !== undefined) value = body.value;
  else if (body.banner !== undefined) value = body.banner;
  if (value === null) {
    res.status(400).json({ error: "value is required" });
    return;
  }
  value = String(value);
  db.prepare("INSERT INTO settings (key, value) VALUES ('banner', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(value);
  db.prepare("INSERT INTO settings (key, value) VALUES ('banner_version', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)").run();
  const ver = db.prepare("SELECT value FROM settings WHERE key = 'banner_version'").get();
  res.json({ banner: value, version: ver && ver.value ? Number(ver.value) : 0 });
});

app.post("/api/student/apply", requireLogin, function (req, res) {
  const body = req.body || {};
  const studentId = body.student_id;
  const className = body.class_name;
  const realName = body.real_name;
  const inviteCode = body.invite_code ? String(body.invite_code) : "";
  const extraInfo = body.extra_info ? String(body.extra_info) : null;
  if (!studentId || !className || !realName) {
    res.status(400).json({ error: "student_id, class_name and real_name are required" });
    return;
  }

  let approved = false;
  if (inviteCode) {
    const invite = db.prepare("SELECT * FROM invite_codes WHERE code = ?").get(inviteCode);
    if (invite && (invite.max_uses <= 0 || invite.used_count < invite.max_uses)) {
      db.prepare("UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?").run(invite.id);
      approved = true;
    }
  }
  if (!approved && inviteCode) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'student_invite_code'").get();
    const expected = row && row.value ? row.value : "";
    if (expected && inviteCode === expected) approved = true;
  }

  if (approved) {
    const info = db.prepare("SELECT role FROM users WHERE id = ?").get(req.user.id);
    const currentWeight = ROLE_WEIGHTS[info ? info.role : "user"] || 0;
    if (currentWeight < ROLE_WEIGHTS.student) {
      db.prepare("UPDATE users SET role = 'student' WHERE id = ?").run(req.user.id);
    }
    res.json({ status: "approved", role: "student" });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const lastApplication = db
    .prepare("SELECT created_at FROM student_applications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(req.user.id);
  if (lastApplication && now - Number(lastApplication.created_at) < 600) {
    res.status(429).json({
      error: "rate_limited",
      message: "10 分钟内只能提交一次，请稍后再试",
      retry_after: 600 - (now - Number(lastApplication.created_at))
    });
    return;
  }

  db.prepare("DELETE FROM student_applications WHERE user_id = ?").run(req.user.id);
  db.prepare("INSERT INTO student_applications (user_id, student_id, class_name, real_name, extra_info, status) VALUES (?, ?, ?, ?, ?, 'pending')")
    .run(req.user.id, studentId, className, realName, extraInfo);
  res.json({ status: "pending" });
});

app.get("/api/admin/settings/invite-code", requirePermission("invite_manage"), function (req, res) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'student_invite_code'").get();
  res.json({ invite_code: row && row.value ? row.value : "" });
});

app.put("/api/admin/settings/invite-code", requirePermission("invite_manage"), function (req, res) {
  const body = req.body || {};
  let value = null;
  if (body.invite_code !== undefined) value = body.invite_code;
  else if (body.value !== undefined) value = body.value;
  if (value === null) {
    res.status(400).json({ error: "invite_code is required" });
    return;
  }
  value = String(value);
  db.prepare("INSERT INTO settings (key, value) VALUES ('student_invite_code', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(value);
  res.json({ invite_code: value });
});

app.get("/api/admin/invite-codes", requirePermission("invite_manage"), function (req, res) {
  const rows = db.prepare("SELECT * FROM invite_codes ORDER BY created_at DESC, id DESC").all();
  res.json({ invite_codes: rows });
});

app.post("/api/admin/invite-codes", requirePermission("invite_manage"), function (req, res) {
  const body = req.body || {};
  const code = body.code === undefined || body.code === null ? "" : String(body.code).trim();
  let maxUses = parseInt(body.max_uses, 10);
  if (isNaN(maxUses) || maxUses < 0) maxUses = 0;
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }
  const exists = db.prepare("SELECT id FROM invite_codes WHERE code = ?").get(code);
  if (exists) {
    res.status(409).json({ error: "code already exists" });
    return;
  }
  const info = db.prepare("INSERT INTO invite_codes (code, max_uses) VALUES (?, ?)").run(code, maxUses);
  const row = db.prepare("SELECT * FROM invite_codes WHERE id = ?").get(Number(info.lastInsertRowid));
  res.status(201).json({ invite_code: row });
});

app.delete("/api/admin/invite-codes/:id", requirePermission("invite_manage"), function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const info = db.prepare("DELETE FROM invite_codes WHERE id = ?").run(id);
  res.json({ deleted: info.changes });
});

app.get("/api/admin/student-applications", requirePermission("student_review"), function (req, res) {
  const rows = db
    .prepare(
      "SELECT a.*, u.username FROM student_applications a LEFT JOIN users u ON u.id = a.user_id WHERE a.status = 'pending' ORDER BY a.created_at DESC, a.id DESC"
    )
    .all();
  res.json({ applications: rows });
});

app.put("/api/admin/student-applications/approve", requirePermission("student_review"), function (req, res) {
  const id = parseInt((req.body || {}).id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const application = db.prepare("SELECT * FROM student_applications WHERE id = ?").get(id);
  if (!application) {
    res.status(404).json({ error: "application not found" });
    return;
  }
  db.prepare("UPDATE student_applications SET status = 'approved' WHERE id = ?").run(id);
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(application.user_id);
  if (user && (ROLE_WEIGHTS[user.role] || 0) < ROLE_WEIGHTS.student) {
    db.prepare("UPDATE users SET role = 'student' WHERE id = ?").run(application.user_id);
  }
  res.json({ ok: true });
});

app.put("/api/admin/student-applications/reject", requirePermission("student_review"), function (req, res) {
  const body = req.body || {};
  const id = parseInt(body.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const application = db.prepare("SELECT * FROM student_applications WHERE id = ?").get(id);
  if (!application) {
    res.status(404).json({ error: "application not found" });
    return;
  }
  const reason = body.reason === undefined || body.reason === null ? "" : String(body.reason);
  db.prepare("UPDATE student_applications SET status = 'rejected', reject_reason = ? WHERE id = ?").run(reason, id);
  res.json({ ok: true });
});

app.get("/api/admin/users", requirePermission("user_manage"), function (req, res) {
  const rows = db
    .prepare("SELECT id, display_id, username, nickname, role, status FROM users ORDER BY id ASC")
    .all();
  const titles = titlesByUserMap(db, rows.map(function (u) { return u.id; }));
  const equipped = equippedTitleMap(db, rows.map(function (u) { return u.id; }));
  const users = rows.map(function (u) {
    return Object.assign({}, u, {
      permissions: userPermissionList(u.id),
      titles: titles.get(u.id) || [],
      title: equipped.get(u.id) || null
    });
  });
  res.json({ users: users });
});

app.get("/api/admin/users/:id", requirePermission("user_manage"), function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  const u = db
    .prepare("SELECT id, display_id, username, nickname, role, status FROM users WHERE id = ?")
    .get(id);
  if (!u) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json({
    user: Object.assign({}, u, {
      permissions: userPermissionList(id),
      titles: titlesByUserMap(db, [id]).get(id) || [],
      title: equippedTitleMap(db, [id]).get(id) || null
    })
  });
});

app.get("/api/admin/permissions", requirePermission("user_manage"), function (req, res) {
  const list = Object.keys(PERMISSIONS).map(function (key) {
    return { key: key, label: PERMISSIONS[key] };
  });
  res.json({ permissions: list });
});

app.put("/api/admin/users/role", requirePermission("user_manage"), function (req, res) {
  const body = req.body || {};
  const userId = parseInt(body.userId, 10);
  const newRole = body.newRole;
  if (isNaN(userId) || !newRole || ROLE_WEIGHTS[newRole] === undefined || newRole === "guest") {
    res.status(400).json({ error: "userId and a valid newRole are required" });
    return;
  }
  const selfWeight = ROLE_WEIGHTS[req.user.role] || 0;
  if (userId === req.user.id) {
    res.status(403).json({ error: "cannot change your own role" });
    return;
  }
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!target) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  const targetWeight = ROLE_WEIGHTS[target.role] || 0;
  if (targetWeight >= selfWeight) {
    res.status(403).json({ error: "cannot modify a user with equal or higher role" });
    return;
  }
  const newWeight = ROLE_WEIGHTS[newRole];
  if (newWeight < ROLE_WEIGHTS.user || newWeight > selfWeight - 1) {
    res.status(403).json({ error: "new role out of allowed range" });
    return;
  }
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(newRole, userId);
  res.json({ ok: true, id: userId, role: newRole });
});

app.put("/api/admin/users/ban", requirePermission("user_manage"), function (req, res) {
  banUpload.single("ban_image")(req, res, function (err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    const body = req.body || {};
    const userId = parseInt(body.userId, 10);
    if (isNaN(userId)) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const selfWeight = ROLE_WEIGHTS[req.user.role] || 0;
    if (userId === req.user.id) {
      res.status(403).json({ error: "cannot ban yourself" });
      return;
    }
    const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
    if (!target) {
      res.status(404).json({ error: "user not found" });
      return;
    }
    if ((ROLE_WEIGHTS[target.role] || 0) >= selfWeight) {
      res.status(403).json({ error: "cannot ban a user with equal or higher role" });
      return;
    }
    const banReason = body.ban_reason === undefined || body.ban_reason === null ? "" : String(body.ban_reason);
    let allowAppeal = 1;
    if (body.allow_appeal !== undefined) {
      allowAppeal = body.allow_appeal === "0" || body.allow_appeal === 0 || body.allow_appeal === false ? 0 : 1;
    }
    const banImage = req.file ? "/uploads/bans/" + req.file.filename : body.ban_image ? String(body.ban_image) : "";
    db.prepare("UPDATE users SET status = 'banned', ban_reason = ?, ban_image = ?, allow_appeal = ? WHERE id = ?")
      .run(banReason, banImage, allowAppeal, userId);
    res.json({ ok: true, id: userId, status: "banned", ban_reason: banReason, ban_image: banImage, allow_appeal: allowAppeal });
  });
});

app.put("/api/admin/users/unban", requirePermission("user_manage"), function (req, res) {
  const userId = parseInt((req.body || {}).userId, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!target) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  db.prepare("UPDATE users SET status = 'active', ban_reason = '', ban_image = '', allow_appeal = 1 WHERE id = ?").run(userId);
  res.json({ ok: true, id: userId, status: "active" });
});

app.put("/api/admin/users/permissions", requirePermission("user_manage"), function (req, res) {
  const body = req.body || {};
  const userId = parseInt(body.userId, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  const selfWeight = ROLE_WEIGHTS[req.user.role] || 0;
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!target) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  if (userId === req.user.id || (ROLE_WEIGHTS[target.role] || 0) >= selfWeight) {
    res.status(403).json({ error: "cannot modify this user" });
    return;
  }
  let perms = body.permissions;
  if (!Array.isArray(perms)) perms = [];
  perms = perms.filter(function (p) { return Object.prototype.hasOwnProperty.call(PERMISSIONS, p); });
  db.prepare("DELETE FROM user_permissions WHERE user_id = ?").run(userId);
  const stmt = db.prepare("INSERT OR IGNORE INTO user_permissions (user_id, permission) VALUES (?, ?)");
  perms.forEach(function (p) { stmt.run(userId, p); });
  res.json({ ok: true, permissions: userPermissionList(userId) });
});

app.post("/api/user/appeal", function (req, res) {
  const body = req.body || {};
  const username = body.username;
  const appealReason = body.appeal_reason;
  const appealImage = body.appeal_image ? String(body.appeal_image) : "";
  if (!username || !appealReason) {
    res.status(400).json({ error: "username and appeal_reason are required" });
    return;
  }
  const user = db.prepare("SELECT id, status FROM users WHERE username = ?").get(username);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  if (user.status !== "banned") {
    res.status(400).json({ error: "user is not banned" });
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  const lastAppeal = db
    .prepare("SELECT created_at FROM ban_appeals WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(user.id);
  if (lastAppeal && now - Number(lastAppeal.created_at) < 600) {
    res.status(429).json({
      error: "rate_limited",
      message: "10 分钟内只能提交一次，请稍后再试",
      retry_after: 600 - (now - Number(lastAppeal.created_at))
    });
    return;
  }

  db.prepare("DELETE FROM ban_appeals WHERE user_id = ?").run(user.id);
  const info = db
    .prepare("INSERT INTO ban_appeals (user_id, appeal_reason, appeal_image, status) VALUES (?, ?, ?, 'pending')")
    .run(user.id, String(appealReason), appealImage);
  res.status(201).json({ id: Number(info.lastInsertRowid), status: "pending" });
});

app.get("/api/admin/ban-appeals", requirePermission("ban_appeal_review"), function (req, res) {
  const rows = db
    .prepare(
      "SELECT a.*, u.username, u.display_id FROM ban_appeals a LEFT JOIN users u ON u.id = a.user_id WHERE a.status = 'pending' ORDER BY a.created_at DESC, a.id DESC"
    )
    .all();
  res.json({ appeals: rows });
});

app.put("/api/admin/ban-appeals/review", requirePermission("ban_appeal_review"), function (req, res) {
  const body = req.body || {};
  const appealId = parseInt(body.appealId, 10);
  const action = body.action;
  if (isNaN(appealId) || (action !== "approve" && action !== "reject")) {
    res.status(400).json({ error: "appealId and action (approve/reject) are required" });
    return;
  }
  const appeal = db.prepare("SELECT * FROM ban_appeals WHERE id = ?").get(appealId);
  if (!appeal) {
    res.status(404).json({ error: "appeal not found" });
    return;
  }
  if (action === "approve") {
    db.prepare("UPDATE ban_appeals SET status = 'approved' WHERE id = ?").run(appealId);
    db.prepare("UPDATE users SET status = 'active', ban_reason = '', ban_image = '', allow_appeal = 1 WHERE id = ?").run(appeal.user_id);
    res.json({ ok: true, status: "approved" });
    return;
  }
  db.prepare("UPDATE ban_appeals SET status = 'rejected' WHERE id = ?").run(appealId);
  res.json({ ok: true, status: "rejected" });
});

app.post("/api/tickets", requireLogin, function (req, res) {
  const body = req.body || {};
  const title = body.title === undefined || body.title === null ? "" : String(body.title).trim();
  const content = body.content === undefined || body.content === null ? "" : String(body.content).trim();
  let visibility = body.visibility;
  if (TICKET_VISIBILITIES.indexOf(visibility) === -1) visibility = "admin";
  if (!title || !content) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }
  const info = db
    .prepare("INSERT INTO tickets (user_id, username, title, content, visibility, status) VALUES (?, ?, ?, ?, ?, 'pending')")
    .run(req.user.id, req.user.username || "", title, content, visibility);
  res.status(201).json({ ticket: { id: Number(info.lastInsertRowid), status: "pending" } });
});

app.get("/api/tickets/mine", requireLogin, function (req, res) {
  const rows = db
    .prepare(
      "SELECT id, title, content, visibility, status, reply_content, reply_image, reply_by, replied_at, created_at FROM tickets WHERE user_id = ? ORDER BY created_at DESC, id DESC"
    )
    .all(req.user.id);
  res.json({ tickets: rows });
});

app.get("/api/admin/tickets", requirePermission("ticket_manage"), function (req, res) {
  const reviewerWeight = ROLE_WEIGHTS[req.user.role] || 0;
  const allowed = TICKET_VISIBILITIES.filter(function (v) {
    return (ROLE_WEIGHTS[v] || 0) <= reviewerWeight;
  });
  const rows = db
    .prepare("SELECT * FROM tickets ORDER BY (status = 'pending') DESC, created_at DESC, id DESC")
    .all();
  const visible = rows.filter(function (t) {
    return allowed.indexOf(t.visibility) !== -1;
  });
  res.json({ tickets: visible });
});

app.put("/api/admin/tickets/reply", requirePermission("ticket_manage"), function (req, res) {
  const body = req.body || {};
  const id = parseInt(body.id, 10);
  const reply = body.reply === undefined || body.reply === null ? "" : String(body.reply).trim();
  const replyImage = body.reply_image ? String(body.reply_image) : "";
  if (isNaN(id) || !reply) {
    res.status(400).json({ error: "id and reply are required" });
    return;
  }
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!ticket) {
    res.status(404).json({ error: "ticket not found" });
    return;
  }
  const reviewerWeight = ROLE_WEIGHTS[req.user.role] || 0;
  if ((ROLE_WEIGHTS[ticket.visibility] || 0) > reviewerWeight) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  db.prepare(
    "UPDATE tickets SET status = 'resolved', reply_content = ?, reply_image = ?, reply_by = ?, replied_at = ? WHERE id = ?"
  ).run(reply, replyImage, req.user.username || "", Math.floor(Date.now() / 1000), id);
  res.json({ ok: true, id: id, status: "resolved" });
});

app.get("/api/admin/pending-counts", requireLogin, function (req, res) {
  const counts = { student_review: 0, ban_appeal_review: 0, ticket_manage: 0 };
  if (hasPermission(req, "student_review")) {
    counts.student_review = Number(
      db.prepare("SELECT COUNT(*) AS n FROM student_applications WHERE status = 'pending'").get().n
    );
  }
  if (hasPermission(req, "ban_appeal_review")) {
    counts.ban_appeal_review = Number(
      db.prepare("SELECT COUNT(*) AS n FROM ban_appeals WHERE status = 'pending'").get().n
    );
  }
  if (hasPermission(req, "ticket_manage")) {
    const reviewerWeight = ROLE_WEIGHTS[req.user.role] || 0;
    const allowed = TICKET_VISIBILITIES.filter(function (v) {
      return (ROLE_WEIGHTS[v] || 0) <= reviewerWeight;
    });
    const rows = db.prepare("SELECT visibility FROM tickets WHERE status = 'pending'").all();
    counts.ticket_manage = rows.filter(function (t) {
      return allowed.indexOf(t.visibility) !== -1;
    }).length;
  }
  res.json({ counts: counts });
});

app.get("/api/user/profile", requireLogin, function (req, res) {
  const user = db
    .prepare("SELECT id, display_id, username, nickname, avatar_url, signature, role, default_page, default_floor, recipe_default_view, shop_default_sort, shop_default_type, shop_layout, shop_layout_mode, default_collection_forum, default_collection_shops, show_role, status FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json({
    user: Object.assign({}, user, {
      permissions: userPermissionList(req.user.id),
      title: equippedTitleOf(db, req.user.id)
    })
  });
});

// 公开的用户主页（#21）：他人资料只读；是否展示权限等级由该用户的 show_role 决定（前端 UI.roleTag 处理）
app.get("/api/users/:id/profile", function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  const user = db
    .prepare("SELECT id, display_id, username, nickname, avatar_url, signature, role, show_role, status FROM users WHERE id = ?")
    .get(id);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json({ user: Object.assign({}, user, { title: equippedTitleOf(db, id) }) });
});

// 公开（#21）：某用户已拥有的头衔（只读，不含自动头衔进度）
app.get("/api/users/:id/titles", function (req, res) {
  const id = parseInt(req.params.id, 10);
  const exists = !isNaN(id) && db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!exists) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  const titles = ownedTitles(db, id).map(function (t) {
    return {
      id: t.id,
      name: t.name,
      hue: t.hue,
      description: t.description,
      source: t.source,
      equipped: t.equipped
    };
  });
  res.json({ titles: titles });
});

app.put("/api/user/settings", requireLogin, function (req, res) {
  const body = req.body || {};
  const current = db
    .prepare("SELECT default_page, default_floor, recipe_default_view, shop_default_sort, shop_default_type, shop_layout, shop_layout_mode, show_role FROM users WHERE id = ?")
    .get(req.user.id);
  if (!current) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  const allowedPages = ["index.html", "map.html", "forum.html", "recipe.html"];
  let defaultPage = current.default_page;
  if (body.default_page !== undefined) {
    defaultPage = allowedPages.indexOf(body.default_page) === -1 ? "index.html" : body.default_page;
  }
  let defaultFloor = current.default_floor;
  if (body.default_floor !== undefined) {
    const floor = parseInt(body.default_floor, 10);
    defaultFloor = isNaN(floor) || floor < 1 || floor > 4 ? 1 : floor;
  }
  let recipeView = current.recipe_default_view;
  if (body.recipe_default_view !== undefined) {
    recipeView = ["all", "reviews", "weekly"].indexOf(body.recipe_default_view) === -1 ? "all" : body.recipe_default_view;
  }
  const allowedShopSorts = ["campus", "az", "metro", "likes", "reviews", "rating", "new"];
  let shopSort = current.shop_default_sort;
  if (body.shop_default_sort !== undefined) {
    shopSort = allowedShopSorts.indexOf(body.shop_default_sort) === -1 ? "campus" : body.shop_default_sort;
  }
  let shopType = current.shop_default_type;
  if (body.shop_default_type !== undefined) {
    shopType = typeof body.shop_default_type === "string" ? body.shop_default_type.trim().slice(0, 20) : "";
  }
  let shopLayout = current.shop_layout;
  if (body.shop_layout !== undefined) {
    shopLayout = body.shop_layout === "split" ? "split" : "stacked";
  }
  let shopLayoutMode = current.shop_layout_mode;
  if (body.shop_layout_mode !== undefined) {
    shopLayoutMode = body.shop_layout_mode === "auto" ? "auto" : "manual";
  }
  let showRole = current.show_role;
  if (body.show_role !== undefined) {
    showRole = body.show_role === 0 || body.show_role === false || body.show_role === "0" ? 0 : 1;
  }
  db.prepare("UPDATE users SET default_page = ?, default_floor = ?, recipe_default_view = ?, shop_default_sort = ?, shop_default_type = ?, shop_layout = ?, shop_layout_mode = ?, show_role = ? WHERE id = ?")
    .run(defaultPage, defaultFloor, recipeView, shopSort, shopType, shopLayout, shopLayoutMode, showRole, req.user.id);
  res.json({ default_page: defaultPage, default_floor: defaultFloor, recipe_default_view: recipeView, shop_default_sort: shopSort, shop_default_type: shopType, shop_layout: shopLayout, shop_layout_mode: shopLayoutMode, show_role: showRole });
});

app.post("/api/user/avatar", requireLogin, function (req, res) {
  upload.single("avatar")(req, res, function (err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "avatar image is required" });
      return;
    }
    const avatarUrl = "/uploads/" + req.file.filename;
    db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, req.user.id);
    res.json({ avatar_url: avatarUrl });
  });
});

app.put("/api/user/nickname", requireLogin, function (req, res) {
  const body = req.body || {};
  const nickname = body.nickname;
  if (!nickname) {
    res.status(400).json({ error: "nickname is required" });
    return;
  }
  db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(nickname, req.user.id);
  res.json({ id: req.user.id, username: req.user.username, nickname: nickname });
});

app.put("/api/user/signature", requireLogin, function (req, res) {
  const body = req.body || {};
  const signature = body.signature === undefined || body.signature === null ? "" : String(body.signature);
  db.prepare("UPDATE users SET signature = ? WHERE id = ?").run(signature, req.user.id);
  res.json({ id: req.user.id, signature: signature });
});

app.put("/api/user/password", requireLogin, function (req, res) {
  const body = req.body || {};
  const oldPassword = body.oldPassword || body.old_password;
  const newPassword = body.newPassword || body.new_password;
  if (!oldPassword || !newPassword) {
    res.status(400).json({ error: "oldPassword and newPassword are required" });
    return;
  }
  const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!user || !user.password_hash || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    res.status(400).json({ error: "old password is incorrect" });
    return;
  }
  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, req.user.id);
  res.json({ ok: true });
});

app.get("/api/forum/posts", checkRole(), function (req, res) {
  const category = req.query.category;
  const base =
    "SELECT p.*, (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id) AS reply_count, (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count FROM forum_posts p";
  let rows;
  if (category) {
    rows = db.prepare(base + " WHERE p.category = ? ORDER BY p.created_at DESC, p.id DESC").all(category);
  } else {
    rows = db.prepare(base + " ORDER BY p.created_at DESC, p.id DESC").all();
  }
  const likedSet = {};
  if (req.user && req.user.id !== null && req.user.id !== undefined) {
    const liked = db.prepare("SELECT post_id FROM post_likes WHERE user_id = ?").all(req.user.id);
    liked.forEach(function (row) { likedSet[row.post_id] = true; });
  }
  attachAuthors(rows);
  const posts = rows.map(function (p) {
    return Object.assign({}, p, { is_liked: likedSet[p.id] === true });
  });
  res.json({ posts: posts });
});

app.get("/api/forum/posts/:id", checkRole(), function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid post id" });
    return;
  }
  const post = db
    .prepare(
      "SELECT p.*, (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count FROM forum_posts p WHERE p.id = ?"
    )
    .get(id);
  if (!post) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  let isLiked = false;
  if (req.user && req.user.id !== null && req.user.id !== undefined) {
    const row = db.prepare("SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?").get(id, req.user.id);
    isLiked = !!row;
  }
  attachAuthors([post]);
  res.json({ post: Object.assign({}, post, { is_liked: isLiked }) });
});

app.post("/api/forum/posts", requireLogin, function (req, res) {
  const body = req.body || {};
  const category = body.category;
  const title = body.title;
  const content = body.content;
  if (category !== "讨论" && category !== "提问") {
    res.status(400).json({ error: "category must be 讨论 or 提问" });
    return;
  }
  if (!title || !content) {
    res.status(400).json({ error: "title and content are required" });
    return;
  }
  const info = db
    .prepare("INSERT INTO forum_posts (user_id, username, category, title, content) VALUES (?, ?, ?, ?, ?)")
    .run(req.user.id, req.user.username, category, title, content);
  const post = db.prepare("SELECT * FROM forum_posts WHERE id = ?").get(Number(info.lastInsertRowid));
  res.status(201).json({ post: post });
});

app.delete("/api/forum/posts/:id", requireLogin, function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid post id" });
    return;
  }
  const post = db.prepare("SELECT * FROM forum_posts WHERE id = ?").get(id);
  if (!post) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  const isOwner = post.user_id === req.user.id;
  const isAdmin = (ROLE_WEIGHTS[req.user.role] || 0) >= ROLE_WEIGHTS.admin;
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  db.prepare("DELETE FROM forum_replies WHERE post_id = ?").run(id);
  db.prepare("DELETE FROM post_likes WHERE post_id = ?").run(id);
  db.prepare("DELETE FROM collection_items WHERE item_type = 'forum_post' AND item_id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE target_kind = 'post' AND target_id = ?").run(id);
  db.prepare("DELETE FROM forum_posts WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.post("/api/forum/posts/:id/like", requireLogin, function (req, res) {
  const postId = parseInt(req.params.id, 10);
  if (isNaN(postId)) {
    res.status(400).json({ error: "invalid post id" });
    return;
  }
  const post = db.prepare("SELECT id, user_id FROM forum_posts WHERE id = ?").get(postId);
  if (!post) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  const existing = db.prepare("SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?").get(postId, req.user.id);
  if (existing) {
    res.status(400).json({ error: "已点赞" });
    return;
  }
  db.prepare("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)").run(postId, req.user.id);
  notifyLike(postId, req.user.id);
  evaluateAutoTitles(db, post.user_id);
  const count = db.prepare("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?").get(postId).n;
  res.json({ ok: true, liked: true, like_count: Number(count) });
});

app.delete("/api/forum/posts/:id/like", requireLogin, function (req, res) {
  const postId = parseInt(req.params.id, 10);
  if (isNaN(postId)) {
    res.status(400).json({ error: "invalid post id" });
    return;
  }
  const post = db.prepare("SELECT id FROM forum_posts WHERE id = ?").get(postId);
  if (!post) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  db.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(postId, req.user.id);
  removeLikeNotify(postId, req.user.id);
  const count = db.prepare("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?").get(postId).n;
  res.json({ ok: true, liked: false, like_count: Number(count) });
});

app.get("/api/forum/posts/:id/replies", function (req, res) {
  const postId = parseInt(req.params.id, 10);
  if (isNaN(postId)) {
    res.status(400).json({ error: "invalid post id" });
    return;
  }
  const post = db.prepare("SELECT id FROM forum_posts WHERE id = ?").get(postId);
  if (!post) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  const replies = db
    .prepare("SELECT * FROM forum_replies WHERE post_id = ? ORDER BY created_at ASC, id ASC")
    .all(postId);
  attachAuthors(replies);
  res.json({ replies: replies });
});

app.post("/api/forum/posts/:id/replies", requireLogin, function (req, res) {
  const postId = parseInt(req.params.id, 10);
  if (isNaN(postId)) {
    res.status(400).json({ error: "invalid post id" });
    return;
  }
  const post = db.prepare("SELECT id, user_id FROM forum_posts WHERE id = ?").get(postId);
  if (!post) {
    res.status(404).json({ error: "post not found" });
    return;
  }
  const content = (req.body || {}).content;
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const info = db
    .prepare("INSERT INTO forum_replies (post_id, user_id, username, content) VALUES (?, ?, ?, ?)")
    .run(postId, req.user.id, req.user.username, content);
  notifyComment(post, req.user.id, content);
  // 帖子达到「评论 5 条以上」可能让作者获得「论坛催化剂」
  evaluateAutoTitles(db, post.user_id);
  const reply = db.prepare("SELECT * FROM forum_replies WHERE id = ?").get(Number(info.lastInsertRowid));
  attachAuthors([reply]);
  res.status(201).json({ reply: reply });
});

app.get("/api/recipes", function (req, res) {
  const rows = db
    .prepare("SELECT r.*, u.role AS role, u.show_role AS show_role FROM recipes r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.name COLLATE NOCASE ASC, r.id ASC")
    .all();
  res.json({ recipes: rows });
});

app.get("/api/recipes/weekly", function (req, res) {
  const rows = db
    .prepare("SELECT r.*, u.role AS role, u.show_role AS show_role FROM recipes r LEFT JOIN users u ON u.id = r.user_id WHERE r.is_weekly = 1 ORDER BY r.name COLLATE NOCASE ASC, r.id ASC")
    .all();
  res.json({ recipes: rows });
});

app.post("/api/recipes", requireLogin, function (req, res) {
  upload.single("image")(req, res, function (err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    const body = req.body || {};
    const name = body.name;
    const rating = parseInt(body.rating, 10);
    const comment = body.comment || null;
    const isWeekly = body.is_weekly === "1" || body.is_weekly === "true" || body.is_weekly === true ? 1 : 0;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (isNaN(rating) || rating < 0 || rating > 5) {
      res.status(400).json({ error: "rating must be between 0 and 5" });
      return;
    }
    const imageUrl = req.file ? "/uploads/" + req.file.filename : null;
    const info = db
      .prepare("INSERT INTO recipes (user_id, username, name, rating, comment, image_url, is_weekly) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(req.user.id, req.user.username, name, rating, comment, imageUrl, isWeekly);
    evaluateAutoTitles(db, req.user.id);
    const recipe = db.prepare("SELECT * FROM recipes WHERE id = ?").get(Number(info.lastInsertRowid));
    res.status(201).json({ recipe: recipe });
  });
});

app.get("/api/announcements", function (req, res) {
  const rows = db
    .prepare("SELECT * FROM announcements ORDER BY publish_date DESC, id DESC")
    .all();
  res.json({ announcements: rows });
});

app.get("/api/weekly-menu", function (req, res) {
  const rows = db
    .prepare("SELECT w.*, u.username AS uploader FROM weekly_menu_images w LEFT JOIN users u ON u.id = w.user_id ORDER BY w.menu_start_date DESC, w.id DESC")
    .all();
  res.json({
    images: rows.map(function (r) {
      return {
        id: r.id,
        user_id: r.user_id,
        username: r.uploader,
        menu_start_date: r.menu_start_date,
        menu_end_date: r.menu_end_date,
        filename: r.filename,
        uploaded_at: r.uploaded_at,
        url: "/uploads/weekly/" + r.filename
      };
    })
  });
});

app.post("/api/admin/weekly-menu/upload", requirePermission("weekly_menu_upload"), function (req, res) {
  weeklyUpload.single("image")(req, res, function (err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    const body = req.body || {};
    const startDate = body.menu_start_date || body.menu_date || "";
    const endDate = body.menu_end_date || body.menu_date || "";
    if (!startDate || !endDate) {
      res.status(400).json({ error: "menu_start_date and menu_end_date are required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "image is required" });
      return;
    }
    const info = db
      .prepare("INSERT INTO weekly_menu_images (user_id, menu_start_date, menu_end_date, filename) VALUES (?, ?, ?, ?)")
      .run(req.user.id, startDate, endDate, req.file.filename);
    const row = db.prepare("SELECT * FROM weekly_menu_images WHERE id = ?").get(Number(info.lastInsertRowid));
    res.status(201).json({
      image: {
        id: row.id,
        user_id: row.user_id,
        menu_start_date: row.menu_start_date,
        menu_end_date: row.menu_end_date,
        filename: row.filename,
        uploaded_at: row.uploaded_at,
        url: "/uploads/weekly/" + row.filename
      }
    });
  });
});

app.delete("/api/admin/weekly-menu/:id", requireLogin, function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const row = db.prepare("SELECT * FROM weekly_menu_images WHERE id = ?").get(id);
  if (!row) {
    res.status(404).json({ error: "image not found" });
    return;
  }
  const isOwner = row.user_id !== null && row.user_id === req.user.id;
  const isSuperAdmin = (ROLE_WEIGHTS[req.user.role] || 0) >= ROLE_WEIGHTS.super_admin;
  if (!isOwner && !isSuperAdmin) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  db.prepare("DELETE FROM weekly_menu_images WHERE id = ?").run(id);
  fs.unlink(path.join(WEEKLY_DIR, row.filename), function () {});
  res.json({ ok: true });
});

app.get("/api/map-data", function (req, res) {
  const file = path.join(__dirname, "data.json");
  fs.readFile(file, "utf8", function (err, text) {
    if (err) {
      res.status(500).json({ error: "data.json not found" });
      return;
    }
    res.type("application/json").send(text);
  });
});

app.put("/api/admin/map-popup", requirePermission("map_popup_edit"), function (req, res) {
  const body = req.body || {};
  const name = body.name;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const popup = body.popup === undefined || body.popup === null ? "" : String(body.popup);
  const file = path.join(__dirname, "data.json");
  fs.readFile(file, "utf8", function (err, text) {
    if (err) {
      res.status(500).json({ error: "data.json not found" });
      return;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      res.status(500).json({ error: "data.json is invalid" });
      return;
    }
    let updated = 0;
    (data.features || []).forEach(function (f) {
      if (f.name === name) {
        f.popup = popup;
        updated += 1;
      }
    });
    if (updated === 0) {
      res.status(404).json({ error: "feature not found" });
      return;
    }
    fs.writeFile(file, JSON.stringify(data, null, 2), "utf8", function (writeErr) {
      if (writeErr) {
        res.status(500).json({ error: "failed to write data.json" });
        return;
      }
      res.json({ ok: true, name: name, popup: popup, updated: updated });
    });
  });
});

app.get("/api/messages/unread-count", requireLogin, function (req, res) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND read_at IS NULL").get(req.user.id);
  res.json({ count: Number(row.n) });
});

app.put("/api/messages/read-all", requireLogin, function (req, res) {
  const info = db.prepare("UPDATE messages SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(Math.floor(Date.now() / 1000), req.user.id);
  res.json({ ok: true, changed: info.changes });
});

app.put("/api/messages/:id/read", requireLogin, function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid message id" });
    return;
  }
  const info = db.prepare("UPDATE messages SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL")
    .run(Math.floor(Date.now() / 1000), id, req.user.id);
  res.json({ ok: true, changed: info.changes });
});

app.get("/api/messages", requireLogin, function (req, res) {
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.page_size, 10) || 20));
  const type = req.query.type;
  const unreadOnly = req.query.unread === "1" || req.query.unread === "true";
  const before = parseInt(req.query.before, 10);
  const clauses = ["m.user_id = ?"];
  const params = [req.user.id];
  const typeList = type && MESSAGE_TYPE_FILTERS[type] ? MESSAGE_TYPE_FILTERS[type] : type && ["system", "comment", "reply", "like"].indexOf(type) !== -1 ? [type] : null;
  if (typeList) {
    clauses.push("m.type IN (" + typeList.map(function () { return "?"; }).join(",") + ")");
    typeList.forEach(function (t) { params.push(t); });
  }
  if (unreadOnly) clauses.push("m.read_at IS NULL");
  if (!isNaN(before)) {
    clauses.push("m.id < ?");
    params.push(before);
  }
  const sql =
    "SELECT m.*, p.title AS target_title FROM messages m LEFT JOIN forum_posts p ON (m.target_kind = 'post' AND p.id = m.target_id) WHERE " +
    clauses.join(" AND ") +
    " ORDER BY m.created_at DESC, m.id DESC LIMIT ?";
  params.push(pageSize + 1);
  const rows = db.prepare(sql).all(...params);
  const hasMore = rows.length > pageSize;
  const messages = rows.slice(0, pageSize).map(function (m) {
    let actors = [];
    try { actors = JSON.parse(m.actors) || []; } catch (e) { actors = []; }
    const target = m.target_kind === "post" && m.target_id
      ? { kind: "post", id: m.target_id, url: "post.html?id=" + m.target_id, title: m.target_title || "", snippet: m.snippet || "" }
      : null;
    return {
      id: m.id,
      type: m.type,
      actors: actors,
      count: m.count,
      target: target,
      title: m.title || null,
      body: m.body || null,
      important: !!m.important,
      read: m.read_at !== null && m.read_at !== undefined,
      created_at: m.created_at
    };
  });
  const counts = { all: 0, system: 0, comment: 0, reply: 0, like: 0 };
  db.prepare("SELECT type, COUNT(*) AS n FROM messages WHERE user_id = ? AND read_at IS NULL GROUP BY type").all(req.user.id).forEach(function (c) {
    if (counts[c.type] !== undefined) counts[c.type] = Number(c.n);
    counts.all += Number(c.n);
  });
  res.json({ messages: messages, has_more: hasMore, counts: counts });
});

app.get("/api/user/preferences", requireLogin, function (req, res) {
  const u = db.prepare("SELECT pref_comment, pref_reply, pref_like FROM users WHERE id = ?").get(req.user.id);
  res.json({ comment: !!(u && u.pref_comment), reply: !!(u && u.pref_reply), like: !!(u && u.pref_like) });
});

app.put("/api/user/preferences", requireLogin, function (req, res) {
  const body = req.body || {};
  const u = db.prepare("SELECT pref_comment, pref_reply, pref_like FROM users WHERE id = ?").get(req.user.id);
  function pick(key, current) {
    return Object.prototype.hasOwnProperty.call(body, key) ? (body[key] ? 1 : 0) : current;
  }
  const comment = pick("comment", u ? u.pref_comment : 1);
  const reply = pick("reply", u ? u.pref_reply : 1);
  const like = pick("like", u ? u.pref_like : 1);
  db.prepare("UPDATE users SET pref_comment = ?, pref_reply = ?, pref_like = ? WHERE id = ?").run(comment, reply, like, req.user.id);
  res.json({ comment: !!comment, reply: !!reply, like: !!like });
});

app.post("/api/admin/notifications", requirePermission("announcement_publish"), function (req, res) {
  const body = req.body || {};
  const title = body.title === undefined || body.title === null ? "" : String(body.title).trim();
  const text = body.body === undefined || body.body === null ? "" : String(body.body).trim();
  const important = body.important ? 1 : 0;
  if (!title || !text) {
    res.status(400).json({ error: "title and body are required" });
    return;
  }
  const recipients = db.prepare("SELECT id FROM users").all();
  const stmt = db.prepare("INSERT INTO messages (user_id, type, title, body, important) VALUES (?, 'system', ?, ?, ?)");
  recipients.forEach(function (u) { stmt.run(u.id, title, text, important); });
  res.status(201).json({ ok: true, recipients: recipients.length });
});

const menuService = new MenuService(db, __dirname);
mountMenuRoutes(app, db, menuService, checkRole());
mountShopRoutes(app, db, {
  root: __dirname,
  authenticate: checkRole(),
  requirePermission: requirePermission,
  hasPermission: hasPermission,
  isVerifiedStudent: isVerifiedStudent,
  createMinRole: SHOP_CREATE_MIN_ROLE,
  mapKey: process.env.AMAP_JS_KEY || "",
  mapSecurityCode: process.env.AMAP_SECURITY_CODE || "",
  mapServiceKey: process.env.AMAP_SERVICE_KEY || "",
  // 新增店铺后立刻评估「累计推荐」自动头衔
  onCreated: function (userId) { evaluateAutoTitles(db, userId); }
});

// 头衔系统（#10）
mountTitleRoutes(app, db, {
  authenticate: checkRole(),
  requirePermission: requirePermission,
  checkTarget: checkTarget
});

// 收藏夹（#23）
mountCollectionRoutes(app, db, {
  requireLogin: requireLogin,
  authenticate: checkRole(),
  attachAuthors: attachAuthors
});
app.use("/api", function (req, res) {
  res.status(404).json({ error: "not found" });
});

app.use(function (req, res, next) {
  if (req.method === "GET" && !req.path.startsWith("/uploads/") && !path.extname(req.path)) {
    res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
    return;
  }
  next();
});

app.use(function (err, req, res, next) {
  if (req.path.startsWith("/api/admin/menu-sync")) {
    const status = err.type === "entity.parse.failed" ? 400 : err.type === "entity.too.large" ? 413 : 500;
    // Body-parser errors can contain the complete request body (including Key).
    console.error("[menu-sync] request rejected", status);
    res.status(status).json({ error: status === 400 ? "菜单设置 JSON 格式无效" : status === 413 ? "菜单请求超过大小限制" : "菜单请求执行失败，请重试" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "server error" });
});

const httpServer = app.listen(PORT, function () {
  console.log("Campus map running at http://localhost:" + PORT);
  menuService.start();
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await menuService.close();
  httpServer.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
