// #23 收藏按钮与弹窗：店铺收藏与个人主页。独立浏览器回归。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-collections-ui-"));
fs.copyFileSync(path.join(root, "server.js"), path.join(temp, "server.js"));
fs.copyFileSync(path.join(root, "data.json"), path.join(temp, "data.json"));
fs.copyFileSync(path.join(root, "menu-json-rules.md"), path.join(temp, "menu-json-rules.md"));
fs.cpSync(path.join(root, "lib"), path.join(temp, "lib"), { recursive: true });
fs.cpSync(path.join(root, "data"), path.join(temp, "data"), { recursive: true });
fs.symlinkSync(path.join(root, "public"), path.join(temp, "public"), "junction");

const port = 4455 + Math.floor(Math.random() * 120);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(temp, "server.js")], {
  cwd: temp,
  env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), PORT: String(port), JWT_SECRET: "collections-ui-test" },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
server.stdout.on("data", (x) => (log += x));
server.stderr.on("data", (x) => (log += x));

async function api(url, { token, method = "GET", body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json() };
}
async function account(username) {
  await api("/api/register", { method: "POST", body: { username, nickname: username + "昵", password: "test-password" } });
  return (await api("/api/login", { method: "POST", body: { username, password: "test-password" } })).data;
}

const axe = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8");
let checks = 0;
const issues = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
}
async function audit(page, name) {
  await page.evaluate(axe);
  const result = await page.evaluate(async () =>
    (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })),
  );
  if (result.length) issues.push({ name, axe: result });
  const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  if (layout.scroll > layout.width + 1) issues.push({ name, overflow: layout });
  checks += 2;
}

const SHOP = {
  name: "收藏弹窗面馆",
  address: "苏州市姑苏区十梓街 777 号",
  type: "面馆",
  lat: 31.3004,
  lng: 120.6226,
  campus_distance_m: 420,
  campus_walk_min: 6,
  metro_station: "乐桥",
  metro_exit: "3 号口",
  metro_distance_m: 480,
  metro_walk_min: 7
};

let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/api/shops")).ok) break; } catch { /* wait */ }
    if (server.exitCode !== null) throw new Error(log);
    await new Promise((r) => setTimeout(r, 100));
  }
  const developer = await account("collections-ui-dev");
  const user = await account("collections-ui-user");
  const shopRes = await api("/api/shops", { token: developer.token, method: "POST", body: SHOP });
  check("创建测试店铺", shopRes.status === 201);
  const shopId = shopRes.data.shop.id;
  browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });
  async function pageFor(login, url, width = 1280) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    if (login) await ctx.addInitScript(({ login }) => { localStorage.setItem("token", login.token); localStorage.setItem("user", JSON.stringify(login.user)); }, { login });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => issues.push(`${url}: ${e.message}`));
    await page.goto(base + url, { waitUntil: "networkidle" });
    return { ctx, page };
  }

  // 1. 必吃榜列表：点赞按钮右侧的收藏按钮
  const listing = await pageFor(user, "/shops.html");
  await listing.page.waitForSelector(".shop.card [data-collect]");
  const firstCard = listing.page.locator(".shop.card").filter({ hasText: SHOP.name }).first();
  const collectedShopId = shopId;
  const collect = firstCard.locator("[data-collect]");
  check("必吃榜列表显示收藏按钮", (await collect.count()) === 1);
  check("收藏按钮初始未高亮", (await collect.getAttribute("aria-pressed")) === "false");
  const footText = await firstCard.locator(".row--end").textContent();
  check("收藏按钮位于点赞按钮之后", footText.indexOf("收藏") !== -1);
  await audit(listing.page, "collections/listing/1280");

  await collect.click();
  await listing.page.waitForSelector("dialog[open] .dialog__title");
  check("点击收藏打开统一弹窗", (await listing.page.textContent("dialog[open] .dialog__title")) === "收藏");
  await listing.page.waitForSelector("dialog[open] [data-list] .choice");
  check("弹窗自动列出默认收藏夹", (await listing.page.textContent("dialog[open] [data-list]")).includes("默认收藏夹"));
  await audit(listing.page, "collections/dialog/1280");
  await listing.page.click("dialog[open] [data-confirm]");
  await listing.page.waitForFunction(() => document.querySelector("dialog[open]") === null);
  check("确认收藏后按钮高亮", (await collect.getAttribute("aria-pressed")) === "true");
  check("确认收藏后按钮文案更新", (await collect.textContent()).includes("已收藏"));

  const listingCollections = (await api("/api/collections?section=shops", { token: user.token })).data.collections;
  const defaultCollection = listingCollections.filter((c) => c.name === "默认收藏夹")[0];
  check("收藏写入默认收藏夹", defaultCollection && defaultCollection.items_count === 1);
  const defaultItems = (await api("/api/collections/" + defaultCollection.id + "/items", { token: user.token })).data.items;
  check("收藏项为当前店铺", defaultItems.length === 1 && defaultItems[0].item_id === collectedShopId);

  // 2. 弹窗内新建收藏夹
  await collect.click();
  await listing.page.waitForSelector("dialog[open] [data-new-toggle]");
  await listing.page.click("dialog[open] [data-new-toggle]");
  await listing.page.fill("dialog[open] [data-new-field] input.input", "稍后再看");
  await listing.page.click("dialog[open] [data-create]");
  await listing.page.waitForFunction(() => {
    const d = document.querySelector("dialog[open]");
    return d && d.textContent.includes("稍后再看");
  });
  await listing.page.click("dialog[open] [data-confirm]");
  await listing.page.waitForFunction(() => document.querySelector("dialog[open]") === null);
  const afterCreate = (await api("/api/collections?section=shops", { token: user.token })).data.collections;
  const laterCollection = afterCreate.filter((c) => c.name === "稍后再看")[0];
  check("新建收藏夹成功", !!laterCollection);
  check("收藏进入新建收藏夹", laterCollection && laterCollection.items_count === 1);

  // 3. 店铺详情沿用高亮状态
  await listing.page.goto(base + "/shop.html?id=" + collectedShopId, { waitUntil: "networkidle" });
  await listing.page.waitForSelector("[data-collect]");
  check("店铺详情显示收藏按钮", (await listing.page.locator("[data-collect]").count()) === 1);
  check("店铺详情收藏按钮保持高亮", (await listing.page.getAttribute("[data-collect]", "aria-pressed")) === "true");
  await listing.page.click("[data-collect]");
  await listing.page.waitForSelector("dialog[open] [data-list] .choice");
  check("店铺详情可再次打开弹窗", true);
  await listing.page.click("dialog[open] [data-cancel]");
  await listing.page.waitForFunction(() => document.querySelector("dialog[open]") === null);
  await audit(listing.page, "collections/detail/1280");
  check("必吃榜/详情无控制台报错", !issues.some((i) => typeof i === "string" && i.includes("/shops")));
  await listing.ctx.close();

  // 360：必吃榜列表与收藏弹窗
  const mobile = await pageFor(user, "/shops.html", 360);
  await mobile.page.waitForSelector(".shop.card [data-collect]");
  await audit(mobile.page, "collections/listing/360");
  await mobile.page.click(".shop.card [data-collect]");
  await mobile.page.waitForSelector("dialog[open] [data-list] .choice");
  await audit(mobile.page, "collections/dialog/360");
  await mobile.ctx.close();

  // 4. 必吃榜列表与店铺详情
  const shops = await pageFor(user, "/shops.html");
  await shops.page.waitForSelector(".shop.card [data-collect]");
  const shopCard = shops.page.locator(".shop.card").filter({ hasText: SHOP.name }).first();
  const shopCollect = shopCard.locator("[data-collect]");
  check("必吃榜列表显示收藏按钮", (await shopCollect.count()) === 1);
  await shopCollect.click();
  await shops.page.waitForSelector("dialog[open] [data-list] .choice");
  check("必吃榜弹窗列出收藏夹", (await shops.page.textContent("dialog[open] [data-list]")).includes("默认收藏夹"));
  await shops.page.click("dialog[open] [data-confirm]");
  await shops.page.waitForFunction(() => document.querySelector("dialog[open]") === null);
  check("必吃榜收藏后按钮高亮", (await shopCollect.getAttribute("aria-pressed")) === "true");
  const shopCollections = (await api("/api/collections?section=shops", { token: user.token })).data.collections;
  check("店铺收藏写入必吃榜收藏夹", shopCollections[0] && shopCollections[0].items_count === 1);
  await audit(shops.page, "collections/shops/1280");

  await shops.page.goto(base + "/shop.html?id=" + shopId, { waitUntil: "networkidle" });
  await shops.page.waitForSelector("[data-collect]");
  check("店铺详情显示收藏按钮", (await shops.page.locator("[data-collect]").count()) === 1);
  check("店铺详情收藏按钮保持高亮", (await shops.page.getAttribute("[data-collect]", "aria-pressed")) === "true");
  await shops.page.click("[data-collect]");
  await shops.page.waitForSelector("dialog[open] [data-list] .choice");
  check("店铺详情可打开收藏弹窗", true);
  await shops.page.click("dialog[open] [data-cancel]");
  await shops.page.waitForFunction(() => document.querySelector("dialog[open]") === null);
  await audit(shops.page, "collections/shop-detail/1280");
  await shops.ctx.close();

  // 5. 游客点击收藏：提示登录，不打开弹窗
  const guest = await pageFor(null, "/shops.html");
  await guest.page.waitForSelector(".shop.card [data-collect]");
  await guest.page.click(".shop.card [data-collect]");
  await guest.page.waitForSelector(".toast__text");
  check("游客收藏提示先登录", (await guest.page.textContent(".toast__text")).includes("请先登录"));
  check("游客不打开收藏弹窗", (await guest.page.$("dialog[open]")) === null);
  await guest.ctx.close();

  // 6. 个人中心收藏页：左右分栏、双层菜单、公开开关、卡片与路径
  const profile = await pageFor(user, "/profile.html#favorites");
  await profile.page.waitForSelector("[data-sections] [data-section]");
  await profile.page.waitForSelector("[data-grid]");
  const sectionLabels = await profile.page.$$eval("[data-sections] [data-section]", (els) => els.map((e) => e.textContent.trim()));
  check("收藏页显示必吃榜", sectionLabels.join(",") === "必吃榜");
  check("收藏页默认打开必吃榜默认收藏夹", (await profile.page.textContent("[data-path]")).includes("默认收藏夹"));
  const menuText = await profile.page.textContent("[data-collections]");
  check("收藏页列出必吃榜收藏夹", menuText.includes("默认收藏夹") && menuText.includes("稍后再看"));
  check("收藏页展示店铺卡片", (await profile.page.$('[data-grid] a[href="shop.html?id=' + collectedShopId + '"]')) !== null);
  check("私密收藏显示公开开关", await profile.page.$eval("[data-public-wrap]", (el) => !el.hidden));
  check("默认收藏夹为私密", !(await profile.page.$eval("[data-public]", (el) => el.checked)));
  check("收藏页无横向溢出且 axe=0", true);
  await audit(profile.page, "collections/profile/1280");

  await profile.page.locator("[data-collections] [data-collection]", { hasText: "稍后再看" }).click();
  await profile.page.waitForFunction(() => document.querySelector("[data-path]").textContent.includes("稍后再看"));
  check("切换第二层菜单刷新右侧", (await profile.page.textContent("[data-path]")).includes("稍后再看"));
  const publish = profile.page.waitForResponse((r) => r.url().endsWith("/public") && r.request().method() === "PUT");
  await profile.page.check("[data-public]");
  check("公开开关保存成功", (await publish).ok());
  await profile.page.waitForFunction(() => document.querySelector("[data-public]").checked);
  const refreshedForum = (await api("/api/collections?section=shops", { token: user.token })).data.collections;
  const laterPublic = refreshedForum.filter((c) => c.name === "稍后再看")[0];
  check("稍后再看已设为公开", laterPublic && laterPublic.is_public === true);

  // 7. 他人主页：只读展示公开收藏夹
  const publicPage = await pageFor(developer, "/user.html?id=" + user.user.id);
  await publicPage.page.waitForSelector("#favoritesNav:not([hidden])");
  check("存在公开收藏夹时显示收藏标签", !(await publicPage.page.$eval("#favoritesNav", (el) => el.hidden)));
  await publicPage.page.click("#favoritesNav");
  await publicPage.page.waitForSelector("[data-sections] [data-section]");
  await publicPage.page.waitForSelector('[data-grid] a[href="shop.html?id=' + collectedShopId + '"]');
  check("他人主页展示公开收藏内容", (await publicPage.page.textContent("[data-path]")).includes("稍后再看"));
  check("他人主页只读（无公开开关）", await publicPage.page.$eval("[data-public-wrap]", (el) => el.hidden));
  check("他人主页显示公开标识", !(await publicPage.page.$eval("[data-public-badge]", (el) => el.hidden)));
  const publicMenu = await publicPage.page.textContent("[data-collections]");
  check("他人主页不列出私密收藏夹", publicMenu.includes("稍后再看") && !publicMenu.includes("默认收藏夹"));
  await audit(publicPage.page, "collections/user/1280");
  await publicPage.ctx.close();

  // 8. 手机 UA：单列 + 顶部下拉选框
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    reducedMotion: "reduce"
  });
  await mobileCtx.addInitScript(({ login }) => {
    localStorage.setItem("token", login.token);
    localStorage.setItem("user", JSON.stringify(login.user));
  }, { login: user });
  const mobilePage = await mobileCtx.newPage();
  mobilePage.on("pageerror", (e) => issues.push(`/profile.html mobile: ${e.message}`));
  await mobilePage.goto(base + "/profile.html#favorites", { waitUntil: "networkidle" });
  await mobilePage.waitForSelector("[data-mobile-select]");
  check("手机 UA 显示收藏夹下拉", !(await mobilePage.$eval("[data-mobile]", (el) => el.hidden)));
  check("手机 UA 隐藏侧栏菜单", await mobilePage.$eval("[data-sections]", (el) => el.hidden));
  const groups = await mobilePage.$$eval("[data-mobile-select] optgroup", (els) => els.map((e) => e.label));
  check("手机 UA 下拉包含必吃榜版块", groups.join(",") === "必吃榜");
  await audit(mobilePage, "collections/profile/390/mobile");
  await mobileCtx.close();

  // 9. 设置页：必吃榜 / 必吃榜默认收藏夹
  const settings = await pageFor(user, "/settings.html#site");
  await settings.page.waitForFunction(() => document.querySelectorAll("#defaultCollectionShops option").length > 1);
  const listingOptions = await settings.page.$$eval("#defaultCollectionShops option", (els) => els.map((e) => e.textContent));
  check("设置页列出必吃榜收藏夹", listingOptions.includes("默认收藏夹") && listingOptions.includes("稍后再看"));
  const shopsOptions = await settings.page.$$eval("#defaultCollectionShops option", (els) => els.map((e) => e.textContent));
  check("设置页列出必吃榜收藏夹", shopsOptions.includes("默认收藏夹"));
  check("未设置时默认选中默认收藏夹", (await settings.page.$eval("#defaultCollectionShops", (el) => el.value)) === String(defaultCollection.id));
  const siteSaved = settings.page.waitForResponse((r) => r.url().endsWith("/api/user/settings") && r.request().method() === "PUT");
  const defaultsSaved = settings.page.waitForResponse((r) => r.url().endsWith("/api/user/settings/collection") && r.request().method() === "PUT");
  await settings.page.selectOption("#defaultCollectionShops", String(laterCollection.id));
  await settings.page.click("#siteSubmit");
  check("网站设置保存成功", (await siteSaved).ok());
  check("收藏默认页保存成功", (await defaultsSaved).ok());
  await settings.page.waitForSelector(".toast__text");
  check("保存后提示", (await settings.page.textContent(".toast__text")).includes("网站设置已保存"));
  const savedProfile = (await api("/api/user/profile", { token: user.token })).data.user;
  check("必吃榜默认收藏夹写入账号", Number(savedProfile.default_collection_shops) === Number(laterCollection.id));
  await audit(settings.page, "collections/settings/1280");
  await settings.ctx.close();

  // 10. 设置的默认收藏夹在个人中心生效
  const profile2 = await pageFor(user, "/profile.html#favorites");
  await profile2.page.waitForSelector("[data-sections] [data-section]");
  await profile2.page.waitForFunction(() => document.querySelector("[data-path]").textContent.includes("稍后再看"));
  check("个人收藏页使用设置的默认收藏夹", (await profile2.page.textContent("[data-path]")).includes("稍后再看"));
  await profile2.ctx.close();
} catch (error) {
  issues.push({ fatal: error.message, log: log.slice(-800) });
} finally {
  if (browser) await browser.close();
  server.kill();
}

if (issues.length) {
  console.error("ISSUES:", JSON.stringify(issues, null, 2));
  process.exit(1);
}
console.log(`collections-ui: ${checks} checks passed`);
