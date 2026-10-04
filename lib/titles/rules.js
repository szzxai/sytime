"use strict";
/* 头衔系统（#10）自动授予规则引擎。
   新增一条自动头衔 = 往 RULES 加一项（key 与 titles.rule 对应）+ 往 store.js 的 SEED_TITLES 加一行，
   或在后台以 source=auto 新建头衔并填写已注册的 rule key。 */
const store = require("./store");

const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
// 北京时间自然日（与 lib/menu/schedule.js 的 localDay 口径一致，避免跨模块依赖）
const beijingDay = (now) => isoDay(Number(now) + 8 * 3600000);

// 从最近一个已到来的周六往回数，连续有多少个周末（周六或周日）存在登录记录。
function consecutiveWeekends(days, now) {
  if (!days || !days.length) return 0;
  const seen = {};
  days.forEach(function (day) { seen[day] = true; });
  const base = Date.parse(beijingDay(now === undefined ? Date.now() : now) + "T00:00:00Z");
  const dow = new Date(base).getUTCDay(); // 0=周日 … 6=周六
  const saturday = base - (dow === 0 ? 1 : dow === 6 ? 0 : dow + 1) * DAY;
  let count = 0;
  while (count < days.length) {
    const sat = saturday - count * 7 * DAY;
    if (seen[isoDay(sat)] || seen[isoDay(sat + DAY)]) count += 1;
    else break;
  }
  return count;
}

// 等级头衔：每个角色恰好一枚，彼此互斥；角色变化时旧的等级徽章会被自动收回（见 evaluateAutoTitles）。
// 「师者」不是等级头衔，改为手动授予，留给真正的教职员工。
const ROLE_TITLES = [
  { role: "developer", key: "role_developer", label: "开发者" },
  { role: "super_admin", key: "role_super_admin", label: "超级管理员" },
  { role: "admin", key: "role_admin", label: "管理员" },
  // 学子沿用更具体的文案，提示可以去完成学生认证
  { role: "student", key: "student_verified", label: "学子", metText: "学生认证已达成", missText: "尚未通过学生认证" },
  { role: "user", key: "role_user", label: "同窗", missText: "登录后自动获得" }
];
const ROLE_TITLE_KEYS = ROLE_TITLES.map(function (entry) { return entry.key; });

function roleRule(entry) {
  const metText = entry.metText || "当前角色为" + entry.label;
  const missText = entry.missText || "需要" + entry.label + "角色";
  return {
    key: entry.key,
    label: entry.label,
    target: 1,
    unit: "",
    measure(db, userId) {
      const row = db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
      const passed = !!row && row.role === entry.role;
      return { progress: passed ? 1 : 0, target: 1, binary: true, text: passed ? metText : missText };
    }
  };
}

const RULES = [
  {
    key: "shop_contributor",
    label: "推荐店铺",
    target: 10,
    unit: "家",
    measure(db, userId) {
      const row = db.prepare("SELECT COUNT(*) AS n FROM shops WHERE created_by = ?").get(userId);
      return { progress: row ? row.n : 0, target: 10, text: "累计推荐" };
    }
  },
  {
    key: "login_streak",
    label: "连续登录",
    target: 7,
    unit: "天",
    measure(db, userId) {
      const row = db.prepare("SELECT login_streak FROM users WHERE id = ?").get(userId);
      return { progress: row && row.login_streak ? row.login_streak : 0, target: 7, text: "连续" };
    }
  },
  {
    key: "forum_catalyst",
    label: "论坛催化剂",
    target: 3,
    unit: "篇",
    measure(db, userId) {
      const row = db
        .prepare(
          "SELECT COUNT(*) AS n FROM forum_posts p WHERE p.user_id = ? AND (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id) >= 5"
        )
        .get(userId);
      return { progress: row ? row.n : 0, target: 3, text: "评论 5 条以上的帖子" };
    }
  },
  {
    key: "weekend_regular",
    label: "闲者爱上网",
    target: 3,
    unit: "个周末",
    measure(db, userId) {
      const days = db
        .prepare("SELECT day FROM user_login_days WHERE user_id = ?")
        .all(userId)
        .map(function (row) { return row.day; });
      return { progress: consecutiveWeekends(days), target: 3, text: "连续周末登录" };
    }
  },
  {
    key: "top_liked",
    label: "高赞校友",
    target: 30,
    unit: "个赞",
    measure(db, userId) {
      const row = db
        .prepare("SELECT COUNT(*) AS n FROM post_likes l JOIN forum_posts p ON p.id = l.post_id WHERE p.user_id = ?")
        .get(userId);
      return { progress: row ? row.n : 0, target: 30, text: "帖子累计获赞" };
    }
  },
  {
    key: "canteen_veteran",
    label: "校园老吃家",
    target: 10,
    unit: "篇",
    measure(db, userId) {
      const row = db.prepare("SELECT COUNT(*) AS n FROM recipes WHERE user_id = ? AND is_weekly = 0").get(userId);
      return { progress: row ? row.n : 0, target: 10, text: "菜品评价" };
    }
  },
  ...ROLE_TITLES.map(roleRule)
];

function ruleByKey(key) {
  if (!key) return null;
  return RULES.filter(function (rule) { return rule.key === key; })[0] || null;
}

function progressText(rule, measure) {
  if (measure.binary) return measure.text;
  return measure.text + " " + Math.min(measure.progress, measure.target) + "/" + measure.target + " " + rule.unit;
}

// 收回一枚等级徽章；若正佩戴则一并取消佩戴。
function dropTitle(db, userId, titleId) {
  db.prepare("DELETE FROM user_titles WHERE user_id = ? AND title_id = ?").run(userId, titleId);
  db.prepare("UPDATE users SET equipped_title_id = NULL WHERE id = ? AND equipped_title_id = ?").run(userId, titleId);
}

// 评估该用户的自动头衔：
//   - 行为类（推荐店铺、连续登录）只增不减；
//   - 等级类互斥，只保留当前角色对应的那一枚，角色变化时收回旧的。
// 返回本次新发放的头衔列表。
function evaluateAutoTitles(db, userId) {
  if (!userId) return [];
  const granted = [];
  const autoTitles = store.listCatalog(db).filter(function (title) { return title.source === "auto" && title.rule; });
  for (const title of autoTitles) {
    const rule = ruleByKey(title.rule);
    if (!rule) continue;
    const owned = !!db
      .prepare("SELECT id FROM user_titles WHERE user_id = ? AND title_id = ?")
      .get(userId, title.id);
    const met = rule.measure(db, userId).progress >= rule.target;
    const isRoleTitle = ROLE_TITLE_KEYS.indexOf(title.rule) !== -1;
    if (!met) {
      if (isRoleTitle && owned) dropTitle(db, userId, title.id);
      continue;
    }
    if (owned) continue;
    db.prepare("INSERT OR IGNORE INTO user_titles (user_id, title_id, granted_by) VALUES (?, ?, NULL)")
      .run(userId, title.id);
    granted.push({ id: title.id, name: title.name, hue: title.hue, rule: title.rule });
  }
  return granted;
}

// 个人中心的「未获得」锁定卡：给出已拥有与未达成自动头衔的进度。
function autoTitleProgress(db, userId) {
  const result = [];
  const autoTitles = store.listCatalog(db).filter(function (title) { return title.source === "auto" && title.rule; });
  for (const title of autoTitles) {
    const rule = ruleByKey(title.rule);
    if (!rule) continue;
    const measure = rule.measure(db, userId);
    result.push({
      title_id: title.id,
      name: title.name,
      hue: title.hue,
      description: title.description || rule.label,
      rule: title.rule,
      met: measure.progress >= measure.target,
      progress: Math.min(measure.progress, measure.target),
      target: measure.target,
      text: progressText(rule, measure)
    });
  }
  return result;
}

module.exports = {
  RULES,
  ROLE_TITLES,
  ROLE_TITLE_KEYS,
  ruleByKey,
  evaluateAutoTitles,
  autoTitleProgress,
  consecutiveWeekends
};
