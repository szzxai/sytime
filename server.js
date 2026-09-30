require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const DB_PATH = path.join(__dirname, "data.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
})();

(function migrateWeeklyMenuImages() {
  const cols = db.prepare("PRAGMA table_info(weekly_menu_images)").all().map(function (c) { return c.name; });
  if (cols.indexOf("user_id") === -1) {
    db.exec("ALTER TABLE weekly_menu_images ADD COLUMN user_id INTEGER");
  }
})();

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

app.use(cors());
app.use(express.json());
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
  res.status(201).json({
    id: Number(info.lastInsertRowid),
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
  const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({
    token: token,
    user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role }
  });
});

app.get("/api/me", checkRole(), function (req, res) {
  res.json({ user: req.user });
});

app.get("/api/admin/ping", checkRole("super_admin"), function (req, res) {
  res.json({ ok: true, user: req.user });
});

app.post("/api/admin/announcements", checkRole("super_admin"), function (req, res) {
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

app.get("/api/settings/banner", function (req, res) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'banner'").get();
  const ver = db.prepare("SELECT value FROM settings WHERE key = 'banner_version'").get();
  res.json({
    banner: row && row.value ? row.value : "",
    version: ver && ver.value ? Number(ver.value) : 0
  });
});

app.put("/api/admin/settings/banner", checkRole("super_admin"), function (req, res) {
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

  db.prepare("INSERT INTO student_applications (user_id, student_id, class_name, real_name, extra_info, status) VALUES (?, ?, ?, ?, ?, 'pending')")
    .run(req.user.id, studentId, className, realName, extraInfo);
  res.json({ status: "pending" });
});

app.get("/api/admin/settings/invite-code", checkRole("super_admin"), function (req, res) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'student_invite_code'").get();
  res.json({ invite_code: row && row.value ? row.value : "" });
});

app.put("/api/admin/settings/invite-code", checkRole("super_admin"), function (req, res) {
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

app.get("/api/admin/invite-codes", checkRole("super_admin"), function (req, res) {
  const rows = db.prepare("SELECT * FROM invite_codes ORDER BY created_at DESC, id DESC").all();
  res.json({ invite_codes: rows });
});

app.post("/api/admin/invite-codes", checkRole("super_admin"), function (req, res) {
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

app.delete("/api/admin/invite-codes/:id", checkRole("super_admin"), function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const info = db.prepare("DELETE FROM invite_codes WHERE id = ?").run(id);
  res.json({ deleted: info.changes });
});

app.get("/api/admin/student-applications", checkRole("super_admin"), function (req, res) {
  const rows = db
    .prepare(
      "SELECT a.*, u.username FROM student_applications a LEFT JOIN users u ON u.id = a.user_id WHERE a.status = 'pending' ORDER BY a.created_at DESC, a.id DESC"
    )
    .all();
  res.json({ applications: rows });
});

app.put("/api/admin/student-applications/approve", checkRole("super_admin"), function (req, res) {
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

app.get("/api/user/profile", requireLogin, function (req, res) {
  const user = db
    .prepare("SELECT id, username, nickname, avatar_url, signature, role, default_page, default_floor, recipe_default_view FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  res.json({ user: user });
});

app.put("/api/user/settings", requireLogin, function (req, res) {
  const body = req.body || {};
  const allowedPages = ["index.html", "map.html", "forum.html", "recipe.html"];
  let defaultPage = body.default_page;
  if (allowedPages.indexOf(defaultPage) === -1) defaultPage = "index.html";
  let defaultFloor = parseInt(body.default_floor, 10);
  if (isNaN(defaultFloor) || defaultFloor < 1 || defaultFloor > 4) defaultFloor = 1;
  let recipeView = body.recipe_default_view;
  if (recipeView !== "weekly") recipeView = "all";
  db.prepare("UPDATE users SET default_page = ?, default_floor = ?, recipe_default_view = ? WHERE id = ?")
    .run(defaultPage, defaultFloor, recipeView, req.user.id);
  res.json({ default_page: defaultPage, default_floor: defaultFloor, recipe_default_view: recipeView });
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

app.get("/api/forum/posts", function (req, res) {
  const category = req.query.category;
  const base =
    "SELECT p.*, (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id) AS reply_count FROM forum_posts p";
  let rows;
  if (category) {
    rows = db.prepare(base + " WHERE p.category = ? ORDER BY p.created_at DESC, p.id DESC").all(category);
  } else {
    rows = db.prepare(base + " ORDER BY p.created_at DESC, p.id DESC").all();
  }
  res.json({ posts: rows });
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
  db.prepare("DELETE FROM forum_posts WHERE id = ?").run(id);
  res.json({ ok: true });
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
  res.json({ replies: replies });
});

app.post("/api/forum/posts/:id/replies", requireLogin, function (req, res) {
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
  const content = (req.body || {}).content;
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const info = db
    .prepare("INSERT INTO forum_replies (post_id, user_id, username, content) VALUES (?, ?, ?, ?)")
    .run(postId, req.user.id, req.user.username, content);
  const reply = db.prepare("SELECT * FROM forum_replies WHERE id = ?").get(Number(info.lastInsertRowid));
  res.status(201).json({ reply: reply });
});

app.get("/api/recipes", function (req, res) {
  const rows = db.prepare("SELECT * FROM recipes ORDER BY name COLLATE NOCASE ASC, id ASC").all();
  res.json({ recipes: rows });
});

app.get("/api/recipes/weekly", function (req, res) {
  const rows = db
    .prepare("SELECT * FROM recipes WHERE is_weekly = 1 ORDER BY name COLLATE NOCASE ASC, id ASC")
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

app.post("/api/admin/weekly-menu/upload", checkRole("admin"), function (req, res) {
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

app.put("/api/admin/map-popup", checkRole("admin"), function (req, res) {
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

app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

app.listen(PORT, function () {
  console.log("Campus map running at http://localhost:" + PORT);
});
