// #21 用户主页：头像跳转、他人主页（只读）与「管理」操作。独立浏览器回归。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-user-ui-"));
const output = path.join(root, "output/playwright");
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, "server.js"), path.join(temp, "server.js"));
fs.copyFileSync(path.join(root, "data.json"), path.join(temp, "data.json"));
fs.copyFileSync(path.join(root, "menu-json-rules.md"), path.join(temp, "menu-json-rules.md"));
fs.cpSync(path.join(root, "lib"), path.join(temp, "lib"), { recursive: true });
fs.cpSync(path.join(root, "data"), path.join(temp, "data"), { recursive: true });
fs.symlinkSync(path.join(root, "public"), path.join(temp, "public"), "junction");
const port = 4345;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(temp, "server.js")], {
  cwd: temp,
  env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), PORT: String(port), JWT_SECRET: "user-ui-test" },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (x) => (log += x));
server.stderr.on("data", (x) => (log += x));
async function api(url, { token, method = "GET", body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
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
  const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, headers: [...document.querySelectorAll("h1")].filter((el) => !!el.getClientRects().length).length }));
  if (layout.scroll > layout.width + 1) issues.push({ name, overflow: layout });
  if (layout.headers !== 1) issues.push({ name, heading: layout });
  checks += 3;
}

let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/api/settings/banner")).ok) break; } catch { /* wait */ }
    if (server.exitCode !== null) throw new Error(log);
    await new Promise((r) => setTimeout(r, 100));
  }
  const dev = await account("dev-boss");
  const target = await account("target-user");
  check("first account is developer", dev.user.role === "developer");
  await api("/api/user/signature", { token: target.token, method: "PUT", body: { signature: "目标用户签名" } });
  await api("/api/forum/posts", { token: target.token, method: "POST", body: { category: "讨论", title: "头像跳转测试帖", content: "正文内容" } });
  await api("/api/forum/posts", { token: dev.token, method: "POST", body: { category: "讨论", title: "开发者自己的帖子", content: "正文" } });

  browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });
  async function pageFor(login, url, width = 1280) {
    const ctx = await browser.newContext({ viewport: { width, height: 880 } });
    if (login) await ctx.addInitScript(({ login }) => { localStorage.setItem("token", login.token); localStorage.setItem("user", JSON.stringify(login.user)); }, { login });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => issues.push(`${url}: ${e.message}`));
    await page.goto(base + url, { waitUntil: "networkidle" });
    return { ctx, page };
  }

  // 1. 论坛头像跳转：本人 → 个人中心；他人 → user.html?id=
  const forum = await pageFor(dev, "/forum.html");
  const hrefs = await forum.page.$$eval(".user-line a.user-avatar--link", (els) => els.map((e) => e.getAttribute("href")));
  check("own avatar links to profile", hrefs.includes("profile.html"));
  check("other avatar links to user page", hrefs.includes("user.html?id=" + target.user.id));
  await audit(forum.page, "forum/1280");
  await forum.ctx.close();

  // 2. 他人主页（只读）+ 管理
  const other = await pageFor(dev, `/user.html?id=${target.user.id}`);
  check("hero shows target username", (await other.page.$eval("#heroUsername", (e) => e.textContent)) === "target-user");
  check("hero shows nickname", (await other.page.$eval("#heroNickname", (e) => e.textContent)) === "target-user昵");
  check("hero shows signature", (await other.page.$eval("#heroSignature", (e) => e.textContent)) === "目标用户签名");
  check("hero shows role tag", (await other.page.$eval("#heroRole", (e) => e.textContent)).includes("普通用户"));
  check("no settings tab on user page", !(await other.page.$('#userNav [href="settings.html"]')));
  check("manage tab visible for admin", !(await other.page.$eval("#manageNav", (e) => e.hidden)));
  await other.page.click('#userNav [data-panel="titles"]');
  await other.page.waitForTimeout(300);
  check("titles tab is read-only (no save button)", !(await other.page.$("#wearSubmit")));
  await audit(other.page, "user/other/1280");
  await other.page.click('#userNav [data-panel="manage"]');
  await other.page.waitForSelector("#mgRole");
  const panelTitles = await other.page.$$eval("#manageBox .panel__title", (els) => els.map((e) => e.textContent));
  for (const t of ["权限等级", "特殊权限", "账号状态", "头衔"]) check(`manage has ${t}`, panelTitles.includes(t));
  await other.page.selectOption("#mgRole", "student");
  await other.page.click("#mgRoleSave");
  await other.page.waitForSelector("dialog[open]");
  await other.page.click('dialog[open] [data-r="ok"]');
  await other.page.waitForTimeout(600);
  check("manage role change persists", (await api(`/api/admin/users/${target.user.id}`, { token: dev.token })).data.user.role === "student");
  await other.page.screenshot({ path: path.join(output, "user-manage-1280.png"), fullPage: true });
  await other.ctx.close();

  // 3. 访问自己的 id → 跳转个人中心
  const selfCtx = await pageFor(dev, `/user.html?id=${dev.user.id}`);
  check("self id redirects to profile", /\/profile\.html(#.*)?$/.test(selfCtx.page.url()));
  await selfCtx.ctx.close();

  // 4. 匿名只读
  const anon = await pageFor(null, `/user.html?id=${target.user.id}`, 360);
  check("anonymous sees target", (await anon.page.$eval("#heroUsername", (e) => e.textContent)) === "target-user");
  check("anonymous has no manage tab", await anon.page.$eval("#manageNav", (e) => e.hidden));
  await audit(anon.page, "user/other/360");
  await anon.ctx.close();

  // 5. show_role=0（非普通用户角色）时不显示权限等级
  await api("/api/user/settings", { token: target.token, method: "PUT", body: { show_role: 0 } });
  const hidden = await pageFor(dev, `/user.html?id=${target.user.id}`);
  check("role hidden when show_role=0", (await hidden.page.$eval("#heroRole", (e) => e.textContent)).trim() === "");
  await hidden.ctx.close();
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
console.log(`user-ui: ${checks} checks passed`);
