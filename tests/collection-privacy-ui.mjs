import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import fixture from "./helpers/app-fixture.cjs";

const site = await fixture.startApp("szzx-collection-privacy-ui-");
const output = path.join(site.root, "output/playwright/collection-privacy");
fs.mkdirSync(output, { recursive: true });
const axe = fs.readFileSync(path.join(site.root, "node_modules/axe-core/axe.min.js"), "utf8");
const issues = [], completed = [];
let checks = 0, browser, currentPage, failure;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
}
async function account(username) {
  const registration = await site.api("/api/register", { method: "POST",
    body: { username, nickname: "收藏隐私体验员", password: "test-password" } });
  assert.equal(registration.status, 201);
  return (await site.api("/api/login", { method: "POST", body: { username, password: "test-password" } })).data;
}
async function audit(page, name) {
  await page.evaluate(axe);
  const violations = await page.evaluate(async () => (await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
  })).violations.map(violation => ({ id: violation.id, impact: violation.impact,
    nodes: violation.nodes.map(node => node.target) })));
  if (violations.length) issues.push({ name, axe: violations });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow) issues.push({ name, overflow: true });
  checks += 2;
}
async function pageFor(login, width = 1280, theme = "light") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(({ login, theme }) => {
    localStorage.setItem("theme", theme);
    localStorage.setItem("token", login.token);
    localStorage.setItem("user", JSON.stringify(login.user));
  }, { login, theme });
  const page = await context.newPage();
  currentPage = page;
  page.on("pageerror", error => issues.push({ page: page.url(), error: error.message }));
  page.setDefaultTimeout(10000);
  return { context, page };
}
async function settingsReady(page) {
  await page.goto(site.base + "/settings.html#site", { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.querySelector("#collectionDefaultPublic").disabled);
}
async function saveDefault(page, value) {
  const saved = page.waitForResponse(response => response.url().endsWith("/api/user/settings") && response.request().method() === "PUT");
  await page.locator("#collectionDefaultPublic").focus();
  await page.keyboard.press("Space");
  const response = await saved;
  check("开关单独立即保存 " + value, response.status() === 200 && (await response.json()).collection_default_public === value);
  assert.deepEqual(response.request().postDataJSON(), { collection_default_public: value });
  await page.waitForFunction(() => !document.querySelector("#collectionDefaultPublic").disabled);
}
async function openCollector(page, sample) {
  await page.goto(site.base + sample.url, { waitUntil: "networkidle" });
  await page.locator('[data-collect][data-section="' + sample.section + '"][data-item-id="' + sample.itemId + '"]').first().click();
  await page.waitForSelector("dialog[open] [data-new-toggle]");
}
async function openNew(page) {
  await page.locator("dialog[open] [data-new-toggle]").click();
  await page.waitForFunction(() => {
    const toggle = document.querySelector("dialog[open] [data-new-public]");
    return toggle && !toggle.disabled;
  });
}
async function createCollection(page, name) {
  await page.locator("dialog[open] [data-new-field] input.input").fill(name);
  const saved = page.waitForResponse(response => response.url().endsWith("/api/collections") && response.request().method() === "POST");
  await page.locator("dialog[open] [data-create]").click();
  const response = await saved;
  assert.equal(response.status(), 201);
  const collection = (await response.json()).collection;
  await page.waitForFunction(name => {
    const dialog = document.querySelector("dialog[open]");
    return dialog.querySelector("[data-new-field]").hidden && dialog.querySelector("[data-list]").textContent.includes(name);
  }, name);
  check("创建请求包含明确数字公开状态", response.request().postDataJSON().is_public === (collection.is_public ? 1 : 0));
  return collection;
}
async function closeCollector(page, confirm = false) {
  await page.locator(confirm ? "dialog[open] [data-confirm]" : "dialog[open] [data-cancel]").click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
}

try {
  const developer = await account("privacy-ui-developer");
  const shop = await site.api("/api/shops", { token: developer.token, method: "POST", body: {
    name: "收藏隐私测试面馆", address: "苏州市姑苏区十梓街 777 号", type: "面馆", lat: 31.3004, lng: 120.6226,
    campus_distance_m: 420, campus_walk_min: 6, metro_station: "乐桥", metro_exit: "3 号口", metro_distance_m: 480, metro_walk_min: 7,
  } });
  assert.equal(shop.status, 201);
  const samples = [
    { width: 360, theme: "light", url: "/shops.html", section: "shops", itemId: shop.data.shop.id },
    { width: 360, theme: "dark", url: "/shop.html?id=" + shop.data.shop.id, section: "shops", itemId: shop.data.shop.id },
    { width: 1280, theme: "light", url: "/shops.html", section: "shops", itemId: shop.data.shop.id },
    { width: 1280, theme: "dark", url: "/shop.html?id=" + shop.data.shop.id, section: "shops", itemId: shop.data.shop.id },
  ];
  browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });
  let lastLogin;
  for (const sample of samples) {
    const label = sample.width + "-" + sample.theme;
    const login = await account("privacy-ui-" + label);
    lastLogin = login;
    const { context, page } = await pageFor(login, sample.width, sample.theme);
    await settingsReady(page);
    check(label + " 新账号默认不公开", !await page.locator("#collectionDefaultPublic").isChecked());
    await page.locator("#defaultPage").selectOption("map.html");
    await saveDefault(page, 1);
    check(label + " 开关不会提前保存其他草稿", (await site.api("/api/user/profile", { token: login.token })).data.user.default_page === "index.html");
    await settingsReady(page);
    check(label + " 刷新保留公开默认值", await page.locator("#collectionDefaultPublic").isChecked());
    await page.locator("#collectionDefaultPublic").scrollIntoViewIfNeeded();
    await audit(page, label + "/settings");
    await page.screenshot({ path: path.join(output, label + "-settings.png") });
    await openCollector(page, sample);
    await openNew(page);
    const publicToggle = page.locator("dialog[open] [data-new-public]");
    check(label + " 新建弹窗读取当前账号默认公开", await publicToggle.isChecked());
    await audit(page, label + "/new-collection");
    await page.screenshot({ path: path.join(output, label + "-new.png") });
    await publicToggle.uncheck();
    const privateCollection = await createCollection(page, "仅本次私密 " + label);
    check(label + " 默认公开可手动改为私密", privateCollection.is_public === false);
    await openNew(page);
    check(label + " 再次新建重新读取默认值而非上次覆盖", await publicToggle.isChecked());
    const publicCollection = await createCollection(page, "遵循默认公开 " + label);
    check(label + " 不覆盖时新建公开且不修改已有私密收藏夹", publicCollection.is_public === true &&
      (await site.api("/api/collections?section=" + sample.section, { token: login.token })).data.collections
        .find(collection => collection.id === privateCollection.id).is_public === false);
    await closeCollector(page, true);
    check(label + " 新建公开收藏夹可立即匿名读取", (await site.api("/api/collections/" + publicCollection.id + "/items")).status === 200);
    await settingsReady(page);
    await saveDefault(page, 0);
    await openCollector(page, sample);
    await openNew(page);
    check(label + " 关闭默认公开后新建默认私密", !await publicToggle.isChecked());
    await publicToggle.check();
    const overridden = await createCollection(page, "仅本次公开 " + label);
    check(label + " 默认私密可手动改为公开", overridden.is_public === true);
    await closeCollector(page);
    completed.push({ width: sample.width, theme: sample.theme, url: sample.url });
    await context.close();
  }

  await site.api("/api/user/settings", { token: lastLogin.token, method: "PUT", body: { collection_default_public: 1 } });
  const { context, page } = await pageFor(lastLogin, 360, "dark");
  await settingsReady(page);
  await page.route("**/api/user/settings", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "暂时不可用" }) }));
  await page.locator("#collectionDefaultPublic").uncheck();
  await page.waitForFunction(() => {
    const toggle = document.querySelector("#collectionDefaultPublic");
    return !toggle.disabled && toggle.checked;
  });
  check("保存失败回滚开关且服务端不变", (await site.api("/api/user/profile", { token: lastLogin.token })).data.user.collection_default_public === 1 &&
    (await page.locator("#siteMsg").textContent()).includes("已恢复原设置"));
  await page.unroute("**/api/user/settings");
  await openCollector(page, samples[1]);
  let releaseProfile;
  const profileGate = new Promise(resolve => { releaseProfile = resolve; });
  await page.route("**/api/user/profile", async route => {
    await profileGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { collection_default_public: 1 } }) });
  });
  await page.locator("dialog[open] [data-new-toggle]").click();
  check("默认值尚未就绪时不能误提交", await page.locator("dialog[open] [data-create]").isDisabled() &&
    await page.locator("dialog[open] [data-new-public]").isDisabled());
  releaseProfile();
  await page.waitForFunction(() => !document.querySelector("dialog[open] [data-new-public]").disabled);
  check("延迟返回后正确回显默认值", await page.locator("dialog[open] [data-new-public]").isChecked());
  await page.unroute("**/api/user/profile");
  await page.locator("dialog[open] [data-new-public]").uncheck();
  await page.locator("dialog[open] [data-new-field] input.input").fill("失败后保留私密草稿");
  await page.route("**/api/collections", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "暂时不可用" }) }));
  await page.locator("dialog[open] [data-create]").click();
  await page.waitForFunction(() => !document.querySelector("dialog[open] [data-create]").disabled);
  check("创建失败保留名称和本次公开选择", await page.locator("dialog[open] [data-new-field] input.input").inputValue() === "失败后保留私密草稿" &&
    !await page.locator("dialog[open] [data-new-public]").isChecked());
  await page.unroute("**/api/collections");
  check("重试沿用本次私密选择", (await createCollection(page, "失败后保留私密草稿")).is_public === false);
  await page.route("**/api/user/profile", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "暂时不可用" }) }));
  await openNew(page);
  check("无法读取偏好时安全回退不公开并允许手动设置", !await page.locator("dialog[open] [data-new-public]").isChecked() &&
    (await page.locator("dialog[open] [data-new-public-hint]").textContent()).includes("本次默认不公开"));
  await audit(page, "fallback-private/360/dark");
  await page.locator("dialog[open] [data-new-public]").check();
  check("读取失败后仍可明确选择公开", (await createCollection(page, "读取失败后手动公开")).is_public === true);
  await page.unroute("**/api/user/profile");
  await closeCollector(page);
  await context.close();
  check("无脚本错误、可访问性问题或横向溢出", issues.length === 0);
} catch (error) {
  failure = error;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(output, "audit.json"), JSON.stringify({ checks, completed, issues, error: failure?.stack || null }, null, 2));
  if (browser) await browser.close();
  await site.stop();
}
console.log("Collection privacy UI: " + checks + " checks; " + issues.length + " issues. Report: output/playwright/collection-privacy/audit.json");
if (failure) throw failure;
