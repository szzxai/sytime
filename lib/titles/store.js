"use strict";
/* 头衔系统（#10）数据层：头衔目录、用户拥有关系、佩戴状态。
   规则引擎见 ./rules.js，接口见 ./routes.js。 */

// 徽章颜色取自 site.css 的 [data-hue] 令牌
const HUES = ["teal", "vermilion", "ochre", "bamboo", "wisteria", "indigo", "rose", "stone"];

// 初始目录：auto 由规则引擎发放（管理员不可手动授予），grant 只能由管理员授予。
// rule 为空表示手动头衔；有 rule 时对应 rules.js 的规则 key。
const SEED_TITLES = [
  { key: "founder", name: "创站元老", hue: "teal", source: "grant", rule: "", description: "早期用户" },
  { key: "foodie", name: "三元坊老饕", hue: "ochre", source: "auto", rule: "shop_contributor", description: "累计推荐 10 家店铺" },
  { key: "nightowl", name: "夜读星", hue: "wisteria", source: "auto", rule: "login_streak", description: "连续 7 天登录" },
  { key: "scholar", name: "学子", hue: "bamboo", source: "auto", rule: "student_verified", description: "在校学生" },
  // 成就头衔（行为类，只增不减）
  { key: "catalyst", name: "论坛催化剂", hue: "vermilion", source: "auto", rule: "forum_catalyst", description: "3 篇帖子各获 5 条以上评论" },
  { key: "weekender", name: "闲者爱上网", hue: "wisteria", source: "auto", rule: "weekend_regular", description: "连续 3 个周末登录" },
  { key: "topliked", name: "高赞校友", hue: "rose", source: "auto", rule: "top_liked", description: "发帖累计获得 30 个赞" },
  { key: "canteen", name: "校园老吃家", hue: "ochre", source: "auto", rule: "canteen_veteran", description: "发布 10 篇菜品评价" },
  // 等级头衔：每个角色恰好一枚，互斥
  { key: "devgrade", name: "开发者", hue: "rose", source: "auto", rule: "role_developer", description: "网站开发与维护" },
  { key: "supegrade", name: "超级管理员", hue: "vermilion", source: "auto", rule: "role_super_admin", description: "站点超级管理员" },
  { key: "admingrade", name: "管理员", hue: "teal", source: "auto", rule: "role_admin", description: "站点管理员" },
  { key: "peer", name: "同窗", hue: "stone", source: "auto", rule: "role_user", description: "已注册用户" },
  // 师者改为手动授予，留给真正的教职员工
  { key: "mentor", name: "师者", hue: "indigo", source: "grant", rule: "", description: "教职员工标识" },
  { key: "official", name: "官方", hue: "vermilion", source: "grant", rule: "", description: "管理团队标识" }
];

const NAME_MAX = 8;
const DESC_MAX = 40;

function titleError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeHue(hue) {
  return HUES.indexOf(hue) === -1 ? "stone" : hue;
}

function normalizeText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function migrate(db) {
  db.exec(`
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_titles_key ON titles(key) WHERE key <> '';
    CREATE TABLE IF NOT EXISTS user_titles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title_id INTEGER NOT NULL,
      granted_by INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(user_id, title_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_titles_user ON user_titles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_titles_title ON user_titles(title_id);
    -- 登录按北京时间的自然日去重记录；「闲者爱上网」按周末窗口统计，需要逐日历史而不只是连续天数。
    CREATE TABLE IF NOT EXISTS user_login_days (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );
  `);

  // 佩戴状态挂在 users 上：一次最多佩戴一个，NULL 表示不佩戴
  const columns = db.prepare("PRAGMA table_info(users)").all().map(function (column) { return column.name; });
  if (columns.indexOf("equipped_title_id") === -1) {
    db.exec("ALTER TABLE users ADD COLUMN equipped_title_id INTEGER");
  }

  // 公共头衔全站按名称唯一；账号专属头衔（owner_user_id 非空）只在所属账号内唯一
  const titleColumns = db.prepare("PRAGMA table_info(titles)").all().map(function (column) { return column.name; });
  if (titleColumns.indexOf("owner_user_id") === -1) {
    db.exec("ALTER TABLE titles ADD COLUMN owner_user_id INTEGER");
  }
  db.exec(`
    DROP INDEX IF EXISTS idx_titles_name;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_titles_public_name ON titles(name) WHERE owner_user_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_titles_owner_name ON titles(owner_user_id, name) WHERE owner_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_titles_owner ON titles(owner_user_id);
  `);

  const seed = db.prepare(
    "INSERT OR IGNORE INTO titles (key, name, hue, source, rule, description) VALUES (?, ?, ?, ?, ?, ?)"
  );
  SEED_TITLES.forEach(function (title) {
    seed.run(title.key, title.name, title.hue, title.source, title.rule, title.description);
  });

  // 早期版本把「师者」作为自动头衔发给 admin 及以上；管理等级改为独立头衔后，
  // 师者转为手动授予。已发放的拥有关系保留（自然降级为手动授予）。
  db.prepare("UPDATE titles SET source = 'grant', rule = '' WHERE key = 'mentor' AND rule <> ''").run();
}

function catalogById(db, id) {
  return db.prepare("SELECT * FROM titles WHERE id = ?").get(id) || null;
}

function catalogByRule(db, rule) {
  if (!rule) return null;
  return db.prepare("SELECT * FROM titles WHERE rule = ? AND owner_user_id IS NULL").get(rule) || null;
}

// 公共目录：不含账号专属头衔
function listCatalog(db) {
  return db
    .prepare(
      "SELECT t.*, (SELECT COUNT(*) FROM user_titles ut WHERE ut.title_id = t.id) AS holder_count FROM titles t WHERE t.owner_user_id IS NULL ORDER BY t.id ASC"
    )
    .all();
}

// 账号专属头衔：同一账号内同名沿用已有行，避免重复创建
function catalogByOwnerAndName(db, userId, name) {
  return db.prepare("SELECT * FROM titles WHERE owner_user_id = ? AND name = ?").get(userId, name) || null;
}

function validateTitleInput(input) {
  const name = normalizeText(input.name);
  if (!name) throw titleError(400, "head title name is required");
  if (name.length > NAME_MAX) throw titleError(422, "head title name is too long");
  const description = normalizeText(input.description);
  if (description.length > DESC_MAX) throw titleError(422, "head title description is too long");
  return { name: name, description: description, hue: normalizeHue(input.hue) };
}

function createTitle(db, input) {
  const fields = validateTitleInput(input);
  const source = input.source === "auto" ? "auto" : "grant";
  const rule = source === "auto" ? normalizeText(input.rule) : "";
  if (source === "auto" && !rule) throw titleError(400, "auto head title requires a rule");
  if (source === "auto" && catalogByRule(db, rule)) throw titleError(409, "head title rule already exists");
  if (db.prepare("SELECT id FROM titles WHERE name = ? AND owner_user_id IS NULL").get(fields.name)) {
    throw titleError(409, "head title name already exists");
  }
  const info = db
    .prepare("INSERT INTO titles (key, name, hue, source, rule, description) VALUES ('', ?, ?, ?, ?, ?)")
    .run(fields.name, fields.hue, source, rule, fields.description);
  return catalogById(db, Number(info.lastInsertRowid));
}

// 超管为某个账号颁发的专属头衔：只出现在该账号的授予与佩戴界面，不进公共目录
function createExclusiveTitle(db, userId, input) {
  if (!db.prepare("SELECT id FROM users WHERE id = ?").get(userId)) throw titleError(404, "user not found");
  const fields = validateTitleInput(input);
  const existing = catalogByOwnerAndName(db, userId, fields.name);
  if (existing) {
    db.prepare("UPDATE titles SET hue = ?, description = ? WHERE id = ?")
      .run(fields.hue, fields.description || existing.description, existing.id);
    return catalogById(db, existing.id);
  }
  // 专属头衔不与公共目录同名，避免同一徽章名出现两次
  if (db.prepare("SELECT id FROM titles WHERE name = ? AND owner_user_id IS NULL").get(fields.name)) {
    throw titleError(409, "head title name already exists");
  }
  const info = db
    .prepare("INSERT INTO titles (key, name, hue, source, rule, description, owner_user_id) VALUES ('', ?, ?, 'grant', '', ?, ?)")
    .run(fields.name, fields.hue, fields.description, userId);
  return catalogById(db, Number(info.lastInsertRowid));
}

function updateTitle(db, id, input) {
  const current = catalogById(db, id);
  if (!current) throw titleError(404, "head title not found");
  const fields = validateTitleInput({
    name: input.name === undefined ? current.name : input.name,
    hue: input.hue === undefined ? current.hue : input.hue,
    description: input.description === undefined ? current.description : input.description
  });
  if (db.prepare("SELECT id FROM titles WHERE name = ? AND id <> ? AND owner_user_id IS ?").get(fields.name, id, current.owner_user_id)) {
    throw titleError(409, "head title name already exists");
  }
  db.prepare("UPDATE titles SET name = ?, hue = ?, description = ? WHERE id = ?")
    .run(fields.name, fields.hue, fields.description, id);
  return catalogById(db, id);
}

function deleteTitle(db, id) {
  const current = catalogById(db, id);
  if (!current) throw titleError(404, "head title not found");
  // 内置头衔（带 key）在每次启动由 migrate 重新播种，删除不会持久，直接拒绝
  if (current.key) throw titleError(409, "built-in head title cannot be deleted");
  const held = db.prepare("SELECT COUNT(*) AS n FROM user_titles WHERE title_id = ?").get(id).n;
  db.prepare("DELETE FROM user_titles WHERE title_id = ?").run(id);
  db.prepare("UPDATE users SET equipped_title_id = NULL WHERE equipped_title_id = ?").run(id);
  db.prepare("DELETE FROM titles WHERE id = ?").run(id);
  return { title: current, removed: held };
}

function grantTitle(db, userId, titleId, grantedBy) {
  const title = catalogById(db, titleId);
  if (!title) throw titleError(404, "head title not found");
  if (title.source === "auto") throw titleError(409, "auto head title cannot be granted manually");
  if (db.prepare("SELECT id FROM user_titles WHERE user_id = ? AND title_id = ?").get(userId, titleId)) {
    return { title: title, granted: false };
  }
  db.prepare("INSERT INTO user_titles (user_id, title_id, granted_by) VALUES (?, ?, ?)")
    .run(userId, titleId, grantedBy);
  return { title: title, granted: true };
}

// 撤销后若正佩戴该头衔则自动回「不佩戴」，并写一条系统消息告知用户。
function revokeTitle(db, userId, titleId) {
  const row = db.prepare("SELECT id FROM user_titles WHERE user_id = ? AND title_id = ?").get(userId, titleId);
  const title = catalogById(db, titleId);
  // 自动头衔由规则引擎发放，撤销后会在下次评估时自动恢复，因此不允许手动撤销
  if (title && title.source === "auto") throw titleError(409, "auto head title cannot be revoked");
  if (!row) return { removed: false, unequipped: false, title: title };
  const account = db.prepare("SELECT equipped_title_id FROM users WHERE id = ?").get(userId);
  db.prepare("DELETE FROM user_titles WHERE id = ?").run(row.id);
  const unequipped = !!(account && account.equipped_title_id === titleId);
  if (unequipped) {
    db.prepare("UPDATE users SET equipped_title_id = NULL WHERE id = ? AND equipped_title_id = ?").run(userId, titleId);
    db.prepare("INSERT INTO messages (user_id, type, title, body) VALUES (?, 'system', ?, ?)").run(
      userId,
      "头衔已撤销",
      "管理员已撤销你的「" + (title ? title.name : "头衔") + "」头衔，佩戴状态已自动取消。"
    );
  }
  // 专属头衔只服务于该账号：拥有关系撤销后目录行一并删除
  if (title && title.owner_user_id !== null && title.owner_user_id !== undefined) {
    db.prepare("DELETE FROM titles WHERE id = ?").run(titleId);
  }
  return { removed: true, unequipped: unequipped, title: title };
}

function setEquippedTitle(db, userId, titleId) {
  if (titleId === null || titleId === undefined || titleId === "" || Number(titleId) === 0) {
    db.prepare("UPDATE users SET equipped_title_id = NULL WHERE id = ?").run(userId);
    return null;
  }
  const id = parseInt(titleId, 10);
  if (isNaN(id)) throw titleError(422, "invalid head title");
  if (!catalogById(db, id)) throw titleError(404, "head title not found");
  if (!db.prepare("SELECT id FROM user_titles WHERE user_id = ? AND title_id = ?").get(userId, id)) {
    throw titleError(403, "head title not owned");
  }
  db.prepare("UPDATE users SET equipped_title_id = ? WHERE id = ?").run(id, userId);
  return equippedTitle(db, userId);
}

function ownedTitles(db, userId) {
  const account = db.prepare("SELECT equipped_title_id FROM users WHERE id = ?").get(userId);
  const equippedId = account ? account.equipped_title_id : null;
  return db
    .prepare(
      "SELECT t.id, t.name, t.hue, t.source, t.rule, t.description, ut.granted_by, ut.created_at AS granted_at FROM user_titles ut JOIN titles t ON t.id = ut.title_id WHERE ut.user_id = ? ORDER BY ut.created_at ASC, t.id ASC"
    )
    .all(userId)
    .map(function (row) {
      return Object.assign({}, row, { equipped: equippedId === row.id });
    });
}

function equippedTitle(db, userId) {
  const row = db
    .prepare(
      "SELECT t.name, t.hue FROM users u JOIN titles t ON t.id = u.equipped_title_id WHERE u.id = ? AND u.equipped_title_id IS NOT NULL"
    )
    .get(userId);
  return row ? { name: row.name, hue: row.hue } : null;
}

// 列表场景（论坛、评价、消息、后台用户表）批量取佩戴头衔，避免逐行查询。
function equippedTitleMap(db, userIds) {
  const ids = (userIds || []).filter(function (id) { return id !== null && id !== undefined; });
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(function () { return "?"; }).join(",");
  const rows = db
    .prepare(
      "SELECT u.id AS user_id, t.name, t.hue FROM users u JOIN titles t ON t.id = u.equipped_title_id WHERE u.id IN (" + placeholders + ") AND u.equipped_title_id IS NOT NULL"
    )
    .all(...ids);
  rows.forEach(function (row) { map.set(row.user_id, { name: row.name, hue: row.hue }); });
  return map;
}

function titlesByUserMap(db, userIds) {
  const ids = (userIds || []).filter(function (id) { return id !== null && id !== undefined; });
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(function () { return "?"; }).join(",");
  const rows = db
    .prepare(
      "SELECT ut.user_id, t.id, t.name, t.hue, t.source FROM user_titles ut JOIN titles t ON t.id = ut.title_id WHERE ut.user_id IN (" + placeholders + ") ORDER BY ut.created_at ASC, t.id ASC"
    )
    .all(...ids);
  rows.forEach(function (row) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push({ id: row.id, name: row.name, hue: row.hue, source: row.source });
  });
  return map;
}

function purgeUserTitles(db, userId) {
  db.prepare("DELETE FROM user_titles WHERE user_id = ?").run(userId);
}

module.exports = {
  HUES,
  SEED_TITLES,
  NAME_MAX,
  DESC_MAX,
  titleError,
  migrate,
  catalogById,
  catalogByRule,
  catalogByOwnerAndName,
  listCatalog,
  createTitle,
  createExclusiveTitle,
  updateTitle,
  deleteTitle,
  grantTitle,
  revokeTitle,
  setEquippedTitle,
  ownedTitles,
  equippedTitle,
  equippedTitleMap,
  titlesByUserMap,
  purgeUserTitles
};
