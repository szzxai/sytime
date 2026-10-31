const test=require('node:test'),assert=require('node:assert/strict');const {DatabaseSync}=require('./helpers/database.cjs');const titleStore=require('../apps/api/src/domain/titles/store');const rules=require('../apps/api/src/domain/titles/rules');const {fixture}=require('./helpers/accounts-fixture.cjs');
test("规则引擎：新增规则只依赖注册表，未注册的 rule 不会发放", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user', login_streak INTEGER NOT NULL DEFAULT 0)");
  db.exec("CREATE TABLE shops (id INTEGER PRIMARY KEY, created_by INTEGER)");
  // 成就类规则会查询这些业务表
  db.exec("CREATE TABLE recipes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, is_weekly INTEGER NOT NULL DEFAULT 0)");
  titleStore.migrate(db);
  db.prepare("INSERT INTO users (id, role) VALUES (1, 'user'), (2, 'student'), (3, 'admin'), (4, 'developer'), (5, 'super_admin')").run();

  const catalog = titleStore.listCatalog(db);
  assert.equal(catalog.length, 7);
  assert.deepEqual(
    catalog.filter(function (t) { return t.source === "auto"; }).map(function (t) { return t.rule; }).sort(),
    ["canteen_veteran", "login_streak", "shop_contributor", "weekend_regular"]
  );
  assert.equal(
    catalog.some(function (t) { return t.rule.indexOf("role_") === 0 || t.rule === "student_verified"; }),
    false,
    "已无角色/权限等级头衔"
  );
  const mentor = catalog.filter(function (t) { return t.key === "mentor"; })[0];
  assert.equal(mentor.name, "师者");
  assert.equal(mentor.source, "grant", "师者已改为手动授予");
  assert.equal(mentor.rule, "");

  // 行为类头衔只增不减
  db.prepare("UPDATE users SET login_streak = 7 WHERE id = 1").run();
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["夜读星"]);
  const insert = db.prepare("INSERT INTO shops (created_by) VALUES (?)");
  for (let i = 0; i < 10; i += 1) insert.run(1);
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["三元坊老饕"]);
  assert.deepEqual(
    titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }).sort(),
    ["三元坊老饕", "夜读星"].sort()
  );
  // 幂等：再次评估不重复发放
  assert.deepEqual(rules.evaluateAutoTitles(db, 1), []);
  // 角色变化不再影响头衔（已无等级头衔）
  db.prepare("UPDATE users SET role = 'admin' WHERE id = 1").run();
  assert.deepEqual(rules.evaluateAutoTitles(db, 1), []);
  assert.deepEqual(
    titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }).sort(),
    ["三元坊老饕", "夜读星"].sort()
  );
  db.close();
});

test("周末窗口：连续三个周末登录才算达成", () => {
  const now = Date.parse("2026-10-07T02:00:00Z");
  const DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = Date.parse(new Date(now + 8 * 3600000).toISOString().slice(0, 10) + "T00:00:00Z");
  const dow = new Date(today).getUTCDay();
  const sat = today - (dow === 0 ? 1 : dow === 6 ? 0 : dow + 1) * DAY;
  const thisSat = iso(sat);
  const thisSun = iso(sat + DAY);
  const lastWeekend = iso(sat - 7 * DAY);
  const twoWeeksAgo = iso(sat - 14 * DAY);

  assert.equal(rules.consecutiveWeekends([], now), 0);
  assert.equal(rules.consecutiveWeekends([thisSat], now), 1);
  assert.equal(rules.consecutiveWeekends([thisSun], now), 1, "周日与同周末的周六算同一个周末");
  assert.equal(rules.consecutiveWeekends([thisSat, lastWeekend], now), 2);
  assert.equal(rules.consecutiveWeekends([thisSat, lastWeekend, twoWeeksAgo], now), 3);
  assert.equal(rules.consecutiveWeekends([thisSat, twoWeeksAgo], now), 1, "中间断档就重新计数");
  assert.equal(rules.consecutiveWeekends([lastWeekend, twoWeeksAgo], now), 0, "最近一个周末没登录就不算连续");
});

test("成就头衔：校园老吃家 / 闲者爱上网", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user', login_streak INTEGER NOT NULL DEFAULT 0)");
  db.exec("CREATE TABLE shops (id INTEGER PRIMARY KEY, created_by INTEGER)");
  db.exec("CREATE TABLE recipes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, is_weekly INTEGER NOT NULL DEFAULT 0)");
  titleStore.migrate(db);
  db.prepare("INSERT INTO users (id, role) VALUES (1, 'user')").run();

  const names = function () { return titleStore.ownedTitles(db, 1).map(function (t) { return t.name; }); };
  // 校园老吃家：累计 10 篇食堂菜品评价，每周食谱不计入
  const addRecipe = db.prepare("INSERT INTO recipes (user_id, is_weekly) VALUES (1, ?)");
  for (let i = 0; i < 9; i += 1) addRecipe.run(0);
  addRecipe.run(1);
  rules.evaluateAutoTitles(db, 1);
  assert.equal(names().indexOf("校园老吃家"), -1, "每周食谱不算菜品评价");
  addRecipe.run(0);
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["校园老吃家"]);

  // 闲者爱上网：连续 3 个周末登录
  const now = Date.now();
  const DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = Date.parse(new Date(now + 8 * 3600000).toISOString().slice(0, 10) + "T00:00:00Z");
  const dow = new Date(today).getUTCDay();
  const sat = today - (dow === 0 ? 1 : dow === 6 ? 0 : dow + 1) * DAY;
  const markDay = db.prepare("INSERT OR IGNORE INTO user_login_days (user_id, day) VALUES (1, ?)");
  markDay.run(iso(sat));
  markDay.run(iso(sat - 7 * DAY));
  rules.evaluateAutoTitles(db, 1);
  assert.equal(names().indexOf("闲者爱上网"), -1, "仅 2 个周末还不发放");
  markDay.run(iso(sat - 14 * DAY));
  assert.deepEqual(rules.evaluateAutoTitles(db, 1).map(function (t) { return t.name; }), ["闲者爱上网"]);

  assert.deepEqual(
    names().sort(),
    ["校园老吃家", "闲者爱上网"].sort(),
    "两个成就头衔并存"
  );
  db.close();
});
test('新角色体系下的头衔目录、授予、佩戴、通知和目标保护',async t=>{
 const f=await fixture(t);const op=await f.account('title_operator','operator'),admin=await f.account('title_admin','admin'),user=await f.account('title_user');
 assert.equal((await f.api('/api/admin/titles',{token:user.token})).status,403);
 const created=await f.api('/api/admin/titles',{method:'POST',token:admin.token,body:{name:'校园志愿者',hue:'bamboo',description:'审核体系测试'}});assert.equal(created.status,201);const id=created.data.title.id;
 assert.equal((await f.api('/api/admin/titles',{method:'POST',token:admin.token,body:{name:'校园志愿者',hue:'bamboo'}})).status,409);
 const grant=await f.api(`/api/admin/users/${user.id}/titles`,{method:'POST',token:admin.token,body:{title_id:id}});assert.equal(grant.status,200);
 assert.equal((await f.api('/api/user/title',{method:'PUT',token:user.token,body:{title_id:id}})).status,200);
 assert.equal((await f.api(`/api/users/${user.id}/profile`)).data.user.title.name,'校园志愿者');
 assert.equal((await f.api(`/api/admin/users/${admin.id}/titles`,{method:'POST',token:admin.token,body:{title_id:id}})).status,403);
 assert.equal((await f.api(`/api/admin/users/${op.id}/titles`,{method:'POST',token:admin.token,body:{title_id:id}})).status,403);
 assert.equal((await f.api(`/api/admin/users/${admin.id}/titles`,{method:'POST',token:op.token,body:{title_id:id}})).status,200);
 assert.equal((await f.api(`/api/admin/users/${user.id}/titles/${id}`,{method:'DELETE',token:admin.token})).status,200);
 assert.equal((await f.api(`/api/users/${user.id}/profile`)).data.user.title,null);
 assert.ok((await f.api('/api/messages',{token:user.token})).data.messages.length>0);
 assert.equal((await f.api('/api/admin/permissions',{token:op.token})).status,404);
});
