/* 三元坊必吃榜（#6）浏览器回归：列表浏览、整卡点击进详情、上传权限前后端一致、表单校验。
   在临时目录启动独立后端（临时数据库），不改动项目 data.db。
   测试环境未配置高德 JS Key，因此同时验证地图降级路径。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-shops-ui-"));
fs.copyFileSync(path.join(root, "server.js"), path.join(temp, "server.js"));
fs.copyFileSync(path.join(root, "data.json"), path.join(temp, "data.json"));
fs.copyFileSync(path.join(root, "menu-json-rules.md"), path.join(temp, "menu-json-rules.md"));
fs.cpSync(path.join(root, "lib"), path.join(temp, "lib"), { recursive: true });
fs.cpSync(path.join(root, "data"), path.join(temp, "data"), { recursive: true });
fs.symlinkSync(path.join(root, "public"), path.join(temp, "public"), "junction");

const port = 4712;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(temp, "server.js")], {
  cwd: temp,
  env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), PORT: String(port), JWT_SECRET: "shops-ui-test-secret" },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (chunk) => (log += chunk));
server.stderr.on("data", (chunk) => (log += chunk));

let checks = 0;
const issues = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks += 1;
}

async function api(url, { token, method = "GET", body } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

async function account(username) {
  await api("/api/register", { method: "POST", body: { username, nickname: username, password: "test-password" } });
  return (await api("/api/login", { method: "POST", body: { username, password: "test-password" } })).data;
}

const axe = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8");
let browser;

async function context(login, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript(
    ({ login }) => {
      localStorage.setItem("theme", "light");
      if (login) {
        localStorage.setItem("token", login.token);
        localStorage.setItem("user", JSON.stringify(login.user));
      }
    },
    { login },
  );
  const page = await ctx.newPage();
  page.consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") page.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => page.consoleErrors.push(String(error)));
  return { ctx, page };
}

async function audit(page, name) {
  await page.evaluate(axe);
  const result = await page.evaluate(async () =>
    (
      await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
      })
    ).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
  );
  if (result.length) issues.push({ name, axe: result });
  const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  if (layout.scroll > layout.width + 1) issues.push({ name, overflow: layout });
  checks += 2;
}

const SHOP = {
  name: "老王面馆",
  address: "苏州市姑苏区十梓街 123 号",
  location_note: "路口第二家",
  type: "面馆",
  lat: 31.3004,
  lng: 120.6226,
  campus_distance_m: 420,
  campus_walk_min: 6,
  dianping_url: "https://www.dianping.com/shop/test-shop",
  metro_station: "乐桥",
  metro_exit: "3 号口",
  metro_distance_m: 480,
  metro_walk_min: 7,
};

try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/shops")).ok) break;
    } catch {
      /* wait for the isolated server */
    }
    if (server.exitCode !== null) throw new Error(log);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });

  const developer = await account("shops-browser-dev");
  const ordinary = await account("shops-browser-user");
  const studentAccount = await account("shops-browser-student");
  const promoted = await api("/api/admin/users/role", { token: developer.token, method: "PUT", body: { userId: studentAccount.user.id, newRole: "student" } });
  assert.equal(promoted.status, 200);
  const student = (await api("/api/login", { method: "POST", body: { username: "shops-browser-student", password: "test-password" } })).data;
  assert.equal((await api("/api/shops/meta", { token: student.token })).data.can_interact, true, "verified student recognized by API");
  const created = await api("/api/shops", { token: developer.token, method: "POST", body: SHOP });
  check("developer 可创建店铺", created.status === 201);
  const shopId = created.data.shop.id;
  check("普通用户后端拒绝上传", (await api("/api/shops", { token: ordinary.token, method: "POST", body: { ...SHOP, name: "无权限店" } })).status === 403);
  const alphaShop = await api("/api/shops", { token: developer.token, method: "POST", body: { ...SHOP, name: "阿婆面馆", address: "司前街 88 号", campus_distance_m: 800, campus_walk_min: 10, metro_exit: "2 号口" } });
  const englishShop = await api("/api/shops", { token: developer.token, method: "POST", body: { ...SHOP, name: "Blue Cup咖啡", address: "凤凰街 99 号", type: "饮品", campus_distance_m: 1100, campus_walk_min: 14, metro_exit: "1 号口" } });
  check("测试店铺用于 A-Z 与范围筛选", alphaShop.status === 201 && englishShop.status === 201);

  /* 1. 游客浏览列表：无上传入口、卡片五要素齐全、地图降级提示 */
  const guest = await context(null);
  await guest.page.goto(base + "/shops.html", { waitUntil: "networkidle" });
  await guest.page.waitForSelector(".shop.card");
  check("游客看不到添加店铺入口", (await guest.page.$("#createAction a")) === null);
  check("游客不显示权限说明", await guest.page.$eval("#addHint", (el) => el.hidden));
  const cardText = await guest.page.textContent(".shop.card");
  check("卡片含名称", cardText.includes(SHOP.name));
  check("卡片含地址", cardText.includes(SHOP.address));
  check("卡片含类型", cardText.includes(SHOP.type));
  check("卡片含本部距离与步行时间", cardText.includes("距苏州中学本部") && cardText.includes("420 米") && cardText.includes("6 分钟"));
  check("卡片含地铁站出口与步行", cardText.includes("乐桥 3 号口") && cardText.includes("步行 480 米") && cardText.includes("7 分钟"));
  check("可选大众点评链接显示", await guest.page.$eval(".shop__dianping", (el) => el.href.includes("www.dianping.com/shop/test-shop")));
  check("整卡可点（卡片内有详情链接）", (await guest.page.$(".shop.card .card__link[href='shop.html?id=" + shopId + "']")) !== null);
  check("地图降级提示", (await guest.page.textContent("#shopMap")).includes("高德地图"));
  const routeFormats = await guest.page.evaluate(() => ({
    distance: ShopsMap.parseDistance("1.2公里"),
    minutes: ShopsMap.parseDuration("12分钟"),
    hours: ShopsMap.parseDuration("1小时 5分钟"),
  }));
  check("高德路线距离/时间格式解析", routeFormats.distance === 1200 && routeFormats.minutes === 12 && routeFormats.hours === 65);
  check("覆盖范围文案", (await guest.page.textContent("#areaText")).includes("姑苏区"));
  await audit(guest.page, "shops.html 游客 1280");

  /* 2. 点整卡进详情 */
  await guest.page.click(".shop.card .card__link");
  await guest.page.waitForURL("**/shop.html?id=" + shopId);
  await guest.page.waitForSelector(".shop-hero__title");
  check("详情标题为店铺名", (await guest.page.textContent(".shop-hero__title")).trim() === SHOP.name);
  const detailText = await guest.page.textContent("#shopBody");
  check("详情含地址", detailText.includes(SHOP.address));
  check("详情含学校本部路线", detailText.includes("苏州中学本部") && detailText.includes("420 米"));
  check("详情含地铁站出口", detailText.includes("乐桥 3 号口") && detailText.includes("480 米"));
  check("详情有高德地图外链", (await guest.page.$("a[href*='uri.amap.com']")) !== null);
  await audit(guest.page, "shop.html 1280");

  /* 学生认证门槛与点赞/评价交互 */
  const ordinaryDetail = await context(ordinary);
  await ordinaryDetail.page.goto(base + "/shop.html?id=" + shopId, { waitUntil: "networkidle" });
  await ordinaryDetail.page.waitForSelector("#reviewsPanel");
  check("普通用户不能点赞", await ordinaryDetail.page.$eval("#likeShopButton", (el) => el.hidden));
  check("普通用户不能评价", await ordinaryDetail.page.$eval("#reviewForm", (el) => el.hidden));
  check("普通用户看到权限提示", (await ordinaryDetail.page.textContent("#reviewAccess")).includes("学生及以上"));
  await ordinaryDetail.ctx.close();

  const studentDetail = await context(student);
  await studentDetail.page.goto(base + "/shop.html?id=" + shopId, { waitUntil: "networkidle" });
  await studentDetail.page.waitForSelector("#reviewForm:not([hidden])");
  check("认证学生可以点赞和评价", !(await studentDetail.page.$eval("#likeShopButton", (el) => el.hidden)));
  await studentDetail.page.click("#likeShopButton");
  await studentDetail.page.waitForFunction(() => document.getElementById("likeShopButton").textContent.includes("已点赞"));
  check("点赞后计数与状态更新", (await studentDetail.page.textContent("#detailEngagementStats")).includes("1"));
  await studentDetail.page.locator('.shop-rating-choice[for="shopRating5"]').click();
  await studentDetail.page.fill("#reviewContent", "用餐环境整洁，值得推荐");
  /* 人数与总价：自动计算人均预览，带图提交 */
  await studentDetail.page.fill("#reviewGuests", "3");
  await studentDetail.page.fill("#reviewTotalPrice", "120");
  await studentDetail.page.waitForFunction(() => !document.getElementById("reviewPerPerson").hidden);
  check("人均价自动计算预览", (await studentDetail.page.textContent("#reviewPerPerson")).includes("¥40"));
  await studentDetail.page.check("#reviewHasImage");
  check("勾选带图后显示上传区", !(await studentDetail.page.$eval("#reviewUploadField", (el) => el.hidden)));
  await studentDetail.page.setInputFiles("#reviewUploadField input[type=file]", path.join(root, "tests", "fixtures", "review-shot.png"));
  await studentDetail.page.click("#reviewSubmit");
  await studentDetail.page.waitForSelector(".shop-review-item");
  check("评价带星级和文字显示", (await studentDetail.page.textContent("#reviewList")).includes("用餐环境整洁，值得推荐") && (await studentDetail.page.textContent("#reviewList")).includes("★★★★★"));
  check("评价显示人数与人均价", (await studentDetail.page.textContent("#reviewList")).includes("3 人") && (await studentDetail.page.textContent("#reviewList")).includes("人均 ¥40"));
  check("评价显示配图", (await studentDetail.page.$("#reviewList .shop-review-thumb img")) !== null);
  await studentDetail.page.waitForFunction(() => document.getElementById("reviewSubmit").textContent.includes("更新"));
  check("更新评价时回填人数与总价", (await studentDetail.page.inputValue("#reviewGuests")) === "3" && (await studentDetail.page.inputValue("#reviewTotalPrice")) === "120");
  check("更新评价时回填带图状态", await studentDetail.page.$eval("#reviewHasImage", (el) => el.checked));
  check("评价数与评分汇总更新", (await studentDetail.page.textContent("#reviewSummary")).includes("1 条评价") && (await studentDetail.page.textContent("#reviewSummary")).includes("5.0 / 5"));
  await audit(studentDetail.page, "shop.html 认证学生互动");
  check("互动页无控制台报错", studentDetail.page.consoleErrors.length === 0);
  await studentDetail.ctx.close();

  /* A–Z 排序、道路关键词与本部距离/步行时间筛选 */
  await guest.page.goto(base + "/shops.html?sort=az", { waitUntil: "networkidle" });
  await guest.page.waitForSelector(".shop.card");
  var namesAz = await guest.page.$$eval(".shop.card .card__title", (els) => els.map((el) => el.textContent.trim()));
  check("A-Z 按拼音排序", namesAz[0] === "阿婆面馆");
  await guest.page.fill("#shopSearch", "司前街");
  await guest.page.waitForFunction(() => document.querySelectorAll(".shop.card").length === 1);
  check("可按店名/道路关键词搜索", (await guest.page.textContent(".shop.card")).includes("阿婆面馆"));
  await guest.page.fill("#shopSearch", "");
  await guest.page.fill("#distanceMin", "750");
  await guest.page.fill("#distanceMax", "850");
  await guest.page.fill("#walkMin", "9");
  await guest.page.fill("#walkMax", "11");
  await guest.page.waitForFunction(() => document.querySelectorAll(".shop.card").length === 1);
  check("可按本部步行距离与时间范围筛选", (await guest.page.textContent(".shop.card")).includes("阿婆面馆"));
  await guest.page.click("#clearShopFilters");
  await guest.page.waitForFunction(() => document.querySelectorAll(".shop.card").length === 3);
  check("可一键清除筛选", true);
  check("列表、详情和筛选无控制台报错", guest.page.consoleErrors.length === 0);

  /* 2.5 登录但未达最低角色：无入口 + 提示说明 */
  const ordinaryCtx = await context(ordinary);
  await ordinaryCtx.page.goto(base + "/shops.html", { waitUntil: "networkidle" });
  await ordinaryCtx.page.waitForSelector(".shop.card");
  check("普通用户看不到添加店铺入口", (await ordinaryCtx.page.$("#createAction a")) === null);
  check("普通用户可见权限说明", (await ordinaryCtx.page.textContent("#addHint")).includes("暂无此权限"));
  await ordinaryCtx.ctx.close();

  /* 2.6 #22 店铺详情页样式：手动 / 自动 */
  const layoutCtx = await context(developer);
  const lp = layoutCtx.page;
  await lp.goto(base + "/settings.html", { waitUntil: "networkidle" });
  await lp.click('#settingsNav [data-panel="site"]');
  await lp.waitForSelector('#shopPrefFields:not([hidden]) input[name="shopLayoutMode"]');
  check("设置提供手动/自动两种样式", (await lp.$$eval('input[name="shopLayoutMode"]', (els) => els.map((e) => e.value))).join(",") === "manual,auto");
  check("手动悬停提示", (await lp.getAttribute('#shopLayoutModeChoices label[title="手动切换样式"]', "title")) === "手动切换样式");
  check("自动悬停提示", (await lp.getAttribute('#shopLayoutModeChoices label[title="根据屏幕宽度自动切换"]', "title")) === "根据屏幕宽度自动切换");
  let saved = lp.waitForResponse((r) => r.url().endsWith("/api/user/settings") && r.request().method() === "PUT");
  await lp.click('#shopLayoutModeChoices label.choice:has(input[value="auto"])');
  check("自动样式已选中", await lp.$eval('input[name="shopLayoutMode"][value="auto"]', (el) => el.checked));
  await lp.click("#siteSubmit");
  check("自动样式保存成功", (await saved).ok());
  check("自动样式写入账号", (await api("/api/user/profile", { token: developer.token })).data.user.shop_layout_mode === "auto");

  await lp.goto(base + "/shop.html?id=" + shopId, { waitUntil: "networkidle" });
  await lp.waitForSelector("#shopLayout");
  check("自动模式隐藏纵向/双栏开关", await lp.$eval("#layoutSwitch", (el) => el.hidden));
  check("自动模式使用 auto 布局类", await lp.$eval("#shopLayout", (el) => el.classList.contains("shop-layout--auto")));
  const positions = () =>
    lp.evaluate(() => {
      const a = document.getElementById("shopDishes").getBoundingClientRect();
      const b = document.getElementById("reviewsPanel").getBoundingClientRect();
      return { a: { top: a.top, left: a.left, right: a.right }, b: { top: b.top, left: b.left } };
    });
  let box = await positions();
  check("宽屏自动为双栏", Math.abs(box.b.top - box.a.top) < 5 && box.b.left >= box.a.right - 2);
  check("宽屏自动隐藏分段导航", await lp.$eval("#shopSubnav", (el) => getComputedStyle(el).display === "none"));
  await lp.waitForSelector("#reviewForm:not([hidden])");
  await lp.fill("#reviewContent", "窗口宽度变化测试");
  await lp.setViewportSize({ width: 360, height: 900 });
  await lp.waitForTimeout(150);
  box = await positions();
  check("窄屏自动为纵向", box.b.top > box.a.top + 20 && Math.abs(box.b.left - box.a.left) < 2);
  check("窄屏自动显示分段导航", await lp.$eval("#shopSubnav", (el) => getComputedStyle(el).display !== "none"));
  check("宽度变化不丢失输入内容", (await lp.inputValue("#reviewContent")) === "窗口宽度变化测试");

  await lp.setViewportSize({ width: 1280, height: 900 });
  await lp.goto(base + "/settings.html", { waitUntil: "networkidle" });
  await lp.click('#settingsNav [data-panel="site"]');
  await lp.waitForSelector('#shopPrefFields:not([hidden]) input[name="shopLayoutMode"]');
  saved = lp.waitForResponse((r) => r.url().endsWith("/api/user/settings") && r.request().method() === "PUT");
  await lp.click('#shopLayoutModeChoices label.choice:has(input[value="manual"])');
  await lp.click("#siteSubmit");
  check("手动样式保存成功", (await saved).ok());
  check("手动样式写入账号", (await api("/api/user/profile", { token: developer.token })).data.user.shop_layout_mode === "manual");

  await lp.goto(base + "/shop.html?id=" + shopId, { waitUntil: "networkidle" });
  await lp.waitForSelector("#layoutSwitch:not([hidden])");
  check("手动模式显示纵向/双栏开关", !(await lp.$eval("#layoutSwitch", (el) => el.hidden)));
  await lp.click('#layoutSwitch [data-layout="split"]');
  await lp.waitForFunction(() => document.getElementById("shopLayout").classList.contains("shop-layout--split"));
  check("手动选择双栏写入账号", (await api("/api/user/profile", { token: developer.token })).data.user.shop_layout === "split");
  check("手动双栏宽屏并排", await lp.evaluate(() => {
    const a = document.getElementById("shopDishes").getBoundingClientRect();
    const b = document.getElementById("reviewsPanel").getBoundingClientRect();
    return Math.abs(b.top - a.top) < 5 && b.left >= a.right - 2;
  }));
  await lp.reload({ waitUntil: "networkidle" });
  await lp.waitForSelector("#shopLayout");
  check("再次进入保持上次双栏选择", await lp.$eval("#shopLayout", (el) => el.classList.contains("shop-layout--split")));
  await audit(lp, "shop.html 自动/手动布局 1280");
  check("布局设置无控制台报错", lp.consoleErrors.length === 0);
  await layoutCtx.ctx.close();

  /* 3. 手机宽度 */  const mobile = await context(null, 360);
  await mobile.page.goto(base + "/shops.html", { waitUntil: "networkidle" });
  await mobile.page.waitForSelector(".shop.card");
  await audit(mobile.page, "shops.html 游客 360");

  /* 4. 添加店铺页：游客与学生以上权限差异 */
  const guestNew = await context(null);
  await guestNew.page.goto(base + "/shop-new.html", { waitUntil: "networkidle" });
  await guestNew.page.waitForTimeout(800);
  if (!(await guestNew.page.$("#permNotice .empty"))) {
    throw new Error("游客上传页权限状态未渲染；console=" + JSON.stringify(guestNew.page.consoleErrors) + "; html=" + (await guestNew.page.locator("#main").innerText()));
  }
  check("游客添加页显示登录引导", (await guestNew.page.textContent("#permNotice")).includes("登录后才能添加店铺"));
  check("游客添加页隐藏表单", await guestNew.page.$eval("#shopForm", (el) => el.hidden));
  await audit(guestNew.page, "shop-new.html 游客 1280");

  const devNew = await context(developer);
  await devNew.page.goto(base + "/shop-new.html", { waitUntil: "networkidle" });
  await devNew.page.waitForSelector("#shopForm:not([hidden])");
  check("有权限用户可见表单", !(await devNew.page.$eval("#shopForm", (el) => el.hidden)));
  check("预设类型渲染为 chips", (await devNew.page.$$("#typeChips .chip")).length === 7);

  /* 5. 表单校验：地址必须含道路/巷坊名与门牌号，自定义类型可展开 */
  await devNew.page.fill("#sName", "校验用店铺");
  await devNew.page.fill("#sAddr", "十梓街 123");
  await devNew.page.click("#shopSubmit");
  check("地址缺「号」时报错", (await devNew.page.$eval("#sAddr", (el) => el.getAttribute("aria-invalid"))) === "true");
  check("错误文案正确", (await devNew.page.textContent("#sAddr ~ .field__error, #sAddr + .field__error, .field.is-invalid .field__error")).includes("门牌号"));
  await devNew.page.locator("#typeChips label.chip:has(input[value='__other'])").click();
  check("选择其他后出现自定义输入", !(await devNew.page.$eval("#customType", (el) => el.hidden)));

  /* 6. 成功提交后跳转详情 */
  await devNew.page.fill("#sAddr", "十梓街 456 号");
  await devNew.page.fill("#customType", "卤味");
  await devNew.page.fill("#sLat", "31.3005");
  await devNew.page.fill("#sLng", "120.6227");
  await devNew.page.fill("#sCampusDist", "300");
  await devNew.page.fill("#sCampusWalk", "5");
  await devNew.page.fill("#sMetro", "乐桥");
  await devNew.page.fill("#sMetroExit", "2 号口");
  await devNew.page.fill("#sMetroDist", "360");
  await devNew.page.fill("#sMetroWalk", "6");
  await devNew.page.click("#shopSubmit");
  await devNew.page.waitForURL("**/shop.html?id=*", { timeout: 15000 });
  check("提交成功后进入详情页", /\/shop\.html\?id=\d+/.test(devNew.page.url()));
  await devNew.page.waitForSelector(".shop-hero__title");
  check("自定义类型可保存并显示", (await devNew.page.textContent("#shopBody")).includes("卤味"));
  check("新店铺出现在列表中", (await api("/api/shops?type=" + encodeURIComponent("卤味"))).data.shops.length === 1);
  check("添加页无控制台报错", devNew.page.consoleErrors.length === 0);

  /* 7. 详情页非法 id */
  const badPage = await context(null);
  await badPage.page.goto(base + "/shop.html?id=999999", { waitUntil: "networkidle" });
  check("不存在的店铺显示空态", (await badPage.page.textContent("#shopBody")).includes("店铺不存在或已被删除"));
  await badPage.page.goto(base + "/shop.html", { waitUntil: "networkidle" });
  check("缺 id 显示提示", (await badPage.page.textContent("#shopBody")).includes("缺少店铺编号"));

  if (issues.length) {
    console.error(JSON.stringify(issues, null, 2));
    throw new Error("存在 " + issues.length + " 项浏览器问题");
  }
  console.log("shops-ui ok：" + checks + " 项检查通过");
} catch (error) {
  console.error(log);
  throw error;
} finally {
  if (browser) await browser.close();
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
  try {
    fs.rmSync(temp, { recursive: true, force: true });
  } catch {
    /* Windows 下句柄可能稍后释放 */
  }
}
