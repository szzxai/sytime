import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-ui-test-"));
const output = path.join(root, "output/playwright");
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, "server.js"), path.join(temp, "server.js"));
fs.copyFileSync(path.join(root, "data.json"), path.join(temp, "data.json"));
fs.copyFileSync(path.join(root, "menu-json-rules.md"), path.join(temp, "menu-json-rules.md"));
fs.cpSync(path.join(root, "lib"), path.join(temp, "lib"), { recursive: true });
fs.cpSync(path.join(root, "data"), path.join(temp, "data"), { recursive: true });
// The isolated app uses temporary SQLite/uploads and the current static files.
fs.symlinkSync(
  path.join(root, "public"),
  path.join(temp, "public"),
  "junction",
);
const port = 4319;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(temp, "server.js")], {
  cwd: temp,
  env: {
    ...process.env,
    NODE_PATH: path.join(root, "node_modules"),
    PORT: String(port),
    JWT_SECRET: "ui-test-only-secret",
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (x) => {
  log += x;
});
server.stderr.on("data", (x) => {
  log += x;
});
let browser,
  checks = 0;
const issues = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
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
  const data = await response.json();
  return { status: response.status, data };
}
async function account(username) {
  await api("/api/register", {
    method: "POST",
    body: { username, nickname: username, password: "test-password" },
  });
  return (
    await api("/api/login", {
      method: "POST",
      body: { username, password: "test-password" },
    })
  ).data;
}
const axe = fs.readFileSync(
  path.join(root, "node_modules/axe-core/axe.min.js"),
  "utf8",
);
async function context(login, width = 1280, theme = "light") {
  const ctx = await browser.newContext({
    viewport: { width, height: 850 },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(
    ({ login, theme }) => {
      localStorage.setItem("theme", theme);
      if (login) {
        localStorage.setItem("token", login.token);
        localStorage.setItem("user", JSON.stringify(login.user));
      }
    },
    { login, theme },
  );
  return ctx;
}
async function pageFor(login, url, width = 1280, theme = "light") {
  const ctx = await context(login, width, theme),
    page = await ctx.newPage();
  page.on("pageerror", (error) => issues.push(`${url}: ${error.message}`));
  await page.goto(base + url, { waitUntil: "networkidle" });
  return { ctx, page };
}
async function audit(page, name) {
  await page.evaluate(axe);
  const result = await page.evaluate(async () =>
    (
      await axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
        },
      })
    ).violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  );
  if (result.length) issues.push({ name, axe: result });
  const layout = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: innerWidth,
    headers: [...document.querySelectorAll("h1")].filter(
      (el) => !!el.getClientRects().length,
    ).length,
  }));
  if (layout.scroll > layout.width + 1) issues.push({ name, overflow: layout });
  if (layout.headers !== 1) issues.push({ name, heading: layout });
  checks += 3;
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/settings/banner")).ok) break;
    } catch {
      /* Wait for isolated server. */
    }
    if (server.exitCode !== null) throw new Error(log);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const admin = await account("developer"),
    ordinary = await account("campus-user"),
    banned = await account("banned-user");
  const post = (
    await api("/api/forum/posts", {
      token: ordinary.token,
      method: "POST",
      body: {
        category: "讨论",
        title: "校园里的新发现",
        content: "分享一个校园角落。\n<img src=x onerror=window.XSS=true>",
      },
    })
  ).data.post;
  for (let i = 0; i < 25; i++)
    await api(`/api/forum/posts/${post.id}/replies`, {
      token: ordinary.token,
      method: "POST",
      body: { content: "第 " + (i + 1) + " 条回复" },
    });
  for (let i = 0; i < 22; i++)
    await api("/api/forum/posts", {
      token: ordinary.token,
      method: "POST",
      body: {
        category: "讨论",
        title: "校园讨论 " + i,
        content: "欢迎交流校园生活。",
      },
    });
  await api("/api/forum/posts", {
    token: ordinary.token,
    method: "POST",
    body: {
      category: "提问",
      title: "图书馆几点开放？",
      content: "想了解开放时间。",
    },
  });
  await api("/api/admin/announcements", {
    token: admin.token,
    method: "POST",
    body: { title: "网站 UI 更新", content: "第一段公告。\n第二段公告。" },
  });
  await api("/api/admin/settings/banner", {
    token: admin.token,
    method: "PUT",
    body: { value: "校园信息网新界面测试横幅。" },
  });
  await api("/api/student/apply", {
    token: ordinary.token,
    method: "POST",
    body: {
      student_id: "2026001",
      class_name: "高一（1）班",
      real_name: "测试同学",
    },
  });
  await api("/api/tickets", {
    token: ordinary.token,
    method: "POST",
    body: {
      title: "界面建议",
      content: "希望查看布局反馈。",
      visibility: "admin",
    },
  });
  await api("/api/admin/users/ban", {
    token: admin.token,
    method: "PUT",
    body: {
      userId: banned.user.id,
      ban_reason: "测试封禁说明",
      allow_appeal: 1,
    },
  });
  await api("/api/user/appeal", {
    method: "POST",
    body: { username: "banned-user", appeal_reason: "测试申诉说明" },
  });
  const db = new DatabaseSync(path.join(temp, "data.db"));
  db.prepare(
    "INSERT INTO recipes (user_id, username, name, rating, comment) VALUES (?, ?, ?, ?, ?)",
  ).run(
    ordinary.user.id,
    "campus-user",
    "红烧牛肉",
    4,
    "味道不错，欢迎来评价。",
  );
  const menuJobId = "11111111-1111-4111-8111-111111111111";
  db.prepare("INSERT INTO menu_sync_jobs(id,trigger,status,phase,created_at,finished_at,config_revision,provider,model,total,processed,failed,error) VALUES(?,'manual','failed','done',?,?,0,'openrouter','fixture',1,1,1,'菜单复核发现遗漏')").run(menuJobId, Date.now(), Date.now());
  db.prepare("INSERT INTO menu_job_items(job_id,source_id,article_id,title,status,phase,error) VALUES(?,'szzx1000:36:11392',11392,'测试菜单','failed','audit','底部漏行')").run(menuJobId);
  const menuArtifactDir = path.join(temp, ".private", "menu-jobs", menuJobId, "11392");
  fs.mkdirSync(menuArtifactDir, {recursive: true});
  fs.writeFileSync(path.join(menuArtifactDir, "source.json"), JSON.stringify({image_count: 1}));
  const importRecord = {date:"2026-10-01",weekday:"周四",time:["noon"],place:null,group:null,name:"红烧牛肉面",price:17,spicy:false};
  fs.writeFileSync(path.join(menuArtifactDir, "diagnostic.json"), JSON.stringify({complete: false, error: "底部漏行",partial_records:[importRecord]}));
  fs.writeFileSync(path.join(menuArtifactDir, "image-0.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6h0AAAAASUVORK5CYII=", "base64"));
  db.close();
  browser = await chromium.launch({
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
  });
  const files = [
    "index",
    "login",
    "register",
    "student_verify",
    "announcements",
    "forum",
    "post",
    "recipe",
    "profile",
    "admin",
    "map",
    "404",
  ];
  for (const width of [360, 1280]) {
    for (const theme of ["light", "dark"]) {
      for (const file of files) {
        const login = ["profile", "admin", "student_verify"].includes(file)
          ? admin
          : null;
        const url = `/${file}.html${file === "post" ? "?id=" + post.id : ""}`;
        const { ctx, page } = await pageFor(login, url, width, theme);
        await audit(page, `${file}/${width}/${theme}`);
        if (
          theme === "light" &&
          ["index", "forum", "admin", "map", "profile"].includes(file)
        )
          await page.screenshot({
            path: path.join(output, `${file}-${width}.png`),
            fullPage: file !== "map",
          });
        await ctx.close();
      }
      console.log(`Page layouts audited: ${width}px / ${theme}`);
    }
  }
  const { ctx, page } = await pageFor(ordinary, "/forum.html", 360);
  check(
    "first feed batch has 20 posts",
    (await page.locator("[data-post-id]").count()) === 20,
  );
  await page.locator("#moreBtn").click();
  check(
    "remaining feed batch appended",
    (await page.locator("[data-post-id]").count()) === 23,
  );
  await page.locator("#questionBtn").click();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-post-id]").length === 1,
  );
  check(
    "category changes fetch matching posts",
    (await page.locator(".post__title").textContent()) === "图书馆几点开放？",
  );
  await page.locator("#newPostBtn").click();
  await page.locator("#postSubmit").click();
  check(
    "empty post is rejected inline",
    (await page.locator("#title").getAttribute("aria-invalid")) === "true",
  );
  await page.locator("#title").fill("测试 UI 发帖");
  await page.locator("#content").fill("键盘与手机端提交。");
  await page.locator("#postSubmit").click();
  await page.waitForFunction(() => !document.getElementById("postDialog").open);
  check("post dialog closes after creation", true);
  await page.goto(base + "/post.html?id=" + post.id + "#reply-25", {
    waitUntil: "networkidle",
  });
  check(
    "reply deep link expands the required batch",
    (await page.locator("#reply-25").count()) === 1,
  );
  check(
    "user content is escaped",
    await page.evaluate(
      () =>
        !window.XSS &&
        document
          .querySelector(".post-detail__body")
          .textContent.includes("<img"),
    ),
  );
  await page.locator("[data-like]").click();
  await page.waitForFunction(
    () => !document.querySelector("[data-like]").disabled,
  );
  check(
    "like is reflected by the server",
    (await api(`/api/forum/posts/${post.id}`, { token: ordinary.token })).data
      .post.is_liked,
  );
  await page.locator("[data-reply-input]").fill("新的回复");
  await page.locator('.composer button[type="submit"]').click();
  await page.waitForFunction(
    () => document.getElementById("replyTotal").textContent === "26",
  );
  check("reply count refreshes", true);
  await page.goto(base + "/settings.html#tickets", { waitUntil: "networkidle" });
  await page.locator("#ticketTitle").fill("通过新 UI 提交");
  await page.locator("#ticketContent").fill("工单正文");
  await page.locator("#ticketSubmit").click();
  await page.waitForFunction(
    () => document.querySelectorAll("#myTicketList article").length === 2,
  );
  check("personal ticket form reaches the existing API", true);
  await page.goto(base + "/settings.html#site", { waitUntil: "networkidle" });
  await page.locator("#defaultFloor").selectOption("3");
  await page.locator("#recipeDefaultView").selectOption("weekly");
  await page.locator("#siteSubmit").click();
  await page.waitForFunction(
    () => localStorage.getItem("defaultFloor") === "3",
  );
  check(
    "site settings remain persistent",
    (await api("/api/user/profile", { token: ordinary.token })).data.user
      .default_floor === 3,
  );
  await ctx.close();

  const adminPage = await pageFor(admin, "/admin.html#review", 360);
  await adminPage.page.locator("[data-approve]").click();
  await adminPage.page.waitForFunction(
    () => !document.querySelector("[data-approve]"),
  );
  check(
    "student application approved through new queue",
    (await api("/api/user/profile", { token: ordinary.token })).data.user
      .role === "student",
  );
  for (const panel of [
    "banner",
    "announce",
    "weekly",
    "review",
    "appeals",
    "tickets",
    "users",
    "invite",
    "menu",
    "menu-import",
  ]) {
    await adminPage.page.locator(`[data-panel="${panel}"]`).click();
    await adminPage.page.waitForLoadState("networkidle");
    await audit(adminPage.page, `admin/${panel}/360`);
  }
  await adminPage.page.locator('[data-panel="announce"]').click();
  await adminPage.page.waitForSelector("#annList .queue-item");
  check(
    "published announcements listed in admin",
    (await adminPage.page.locator("#annList [data-delete-announce]").count()) >= 1,
  );
  await adminPage.page.locator('[data-panel="menu"]').click();
  await adminPage.page.waitForLoadState("networkidle");
  // 面板打开时会异步 refresh(true) 回填表单；迟到的回填可能覆盖本次输入，
  // 因此以“表单提交后界面回显 10:35”为准，未回显就重试（落库结果由下面的接口断言保证）。
  let menuSaved = false;
  for (let attempt = 0; attempt < 4 && !menuSaved; attempt += 1) {
    await adminPage.page.locator("#menuDailyTime").fill("10:35");
    await adminPage.page.locator("#menuSave").click();
    try {
      await adminPage.page.waitForFunction(
        () => document.getElementById("menuSchedule").textContent.includes("10:35"),
        null,
        { timeout: 5000 },
      );
      menuSaved = true;
    } catch (err) {
      /* 迟到的回填覆盖了输入，重试 */
    }
  }
  check("developer saves daily time from the panel", menuSaved);
  check("developer daily time persisted", (await api("/api/admin/menu-sync/settings", {token: admin.token})).data.settings.daily_time === "10:35");
  await adminPage.page.locator("#menuModel").fill("vision-test");
  await adminPage.page.locator("#menuKey").fill("test-only-menu-key");
  await adminPage.page.locator("#menuSave").click();
  await adminPage.page.waitForFunction(() => document.getElementById("menuKeyHint").textContent.includes("已保存"));
  check("key input cleared after save", await adminPage.page.locator("#menuKey").inputValue() === "");
  check("public settings never return full key", !JSON.stringify((await api("/api/admin/menu-sync/settings", {token: admin.token})).data).includes("test-only-menu-key"));
  const malformedMenu = await fetch(base + "/api/admin/menu-sync/settings", {method: "PUT", headers: {Authorization: "Bearer " + admin.token, "Content-Type": "application/json"}, body: '{"api_key":"malformed-secret-test-key"'});
  check("malformed settings rejected without logging credentials", malformedMenu.status === 400 && !log.includes("malformed-secret-test-key"));
  await adminPage.page.locator("[data-menu-detail]").click();
  await adminPage.page.waitForSelector("[data-menu-file]");
  await audit(adminPage.page, "admin/menu/detail/360");
  await adminPage.page.locator('[data-menu-file="source"]').click();
  await adminPage.page.waitForSelector("[data-images] img");
  check("private menu image loads through authenticated request", true);
  const downloadWait = adminPage.page.waitForEvent("download");
  await adminPage.page.locator('[data-menu-file="diagnostic"]').click();
  const download = await downloadWait;
  check("menu diagnostic downloads", download.suggestedFilename().endsWith("-diagnostic.json"));
  await adminPage.page.locator("#menuJobDialog [data-dialog-close]").click();
  await adminPage.page.locator('[data-panel="menu-import"]').click();
  await adminPage.page.waitForFunction(()=>document.querySelectorAll("#menuImportSource option").length>1);
  await adminPage.page.locator("#menuImportJson").fill('{"records":[]}');
  await adminPage.page.locator("#menuImportValidate").click();
  await adminPage.page.waitForFunction(()=>document.getElementById("menuImportStatus").textContent.includes("数组"));
  check("invalid pasted JSON cannot publish",await adminPage.page.locator("#menuImportPublish").isDisabled());
  await adminPage.page.locator("#menuImportJson").fill(JSON.stringify([importRecord,importRecord]));
  await adminPage.page.locator("#menuImportValidate").click();
  await adminPage.page.waitForFunction(()=>document.getElementById("menuImportStatus").textContent.includes("去除 1 条"));
  check("manual preview normalizes and removes exact duplicates",JSON.parse(await adminPage.page.locator("#menuImportJson").inputValue()).length===1);
  await adminPage.page.locator("#menuImportReviewed").check();
  await adminPage.page.locator("#menuImportJson").fill(JSON.stringify([{...importRecord,price:0}]));
  check("editing invalidates preview and review acknowledgement",await adminPage.page.locator("#menuImportPublish").isDisabled() && !await adminPage.page.locator("#menuImportReviewed").isChecked());
  await adminPage.page.locator("#menuImportValidate").click();
  await adminPage.page.waitForFunction(()=>document.getElementById("menuImportStatus").textContent.includes("校验通过"));
  await adminPage.page.locator("#menuImportReviewed").check();await adminPage.page.locator("#menuImportPublish").click();
  await adminPage.page.waitForFunction(()=>document.getElementById("menuImportStatus").textContent.includes("已发布 1 条"));
  const imported = (await api("/api/admin/menu-sync/imports",{token:admin.token})).data;
  check("developer manual import publishes and records actor",imported.history[0].actor_id===admin.user.id && imported.history[0].records_count===1);
  await adminPage.page.locator("#menuImportSource").selectOption("szzx1000:36:11392");
  await adminPage.page.locator("#menuImportJob").selectOption(menuJobId);
  await adminPage.page.locator("#menuImportLoad").click();
  await adminPage.page.waitForFunction(()=>document.getElementById("menuImportWarning").textContent.includes("补全全部遗漏"));
  check("failed vision candidates load into JSON editor",JSON.parse(await adminPage.page.locator("#menuImportJson").inputValue())[0].name===importRecord.name);
  const draft=await adminPage.page.locator("#menuImportJson").inputValue();
  await adminPage.page.locator("#menuImportRefresh").click();await adminPage.page.waitForLoadState("networkidle");
  check("manual refresh preserves draft and selected task",await adminPage.page.locator("#menuImportJson").inputValue()===draft && await adminPage.page.locator("#menuImportJob").inputValue()===menuJobId);
  await adminPage.page.locator("#menuImportImages").click();await adminPage.page.waitForSelector("#menuImportImageList img");
  check("manual editor fetches private source image",true);
  await audit(adminPage.page,"admin/manual/360");
  await adminPage.page.screenshot({path:path.join(output,"menu-import-360.png"),fullPage:true});
  await adminPage.page.setViewportSize({width:1280,height:850});await audit(adminPage.page,"admin/manual/1280");
  await adminPage.page.screenshot({path:path.join(output,"menu-import-1280.png"),fullPage:true});
  check("manual rules link serves detailed UTF-8 rules",(await fetch(base+"/menu-json-rules.md")).status===200);
  await adminPage.page.locator('[data-panel="menu"]').click();
  await adminPage.page.screenshot({path: path.join(output, "menu-admin-360.png"), fullPage: true});
  await adminPage.page.setViewportSize({width: 1280, height: 850});
  await audit(adminPage.page, "admin/menu/1280");
  await adminPage.page.screenshot({path: path.join(output, "menu-admin-1280.png"), fullPage: true});
  await adminPage.page.setViewportSize({width: 360, height: 850});
  await adminPage.page.locator('[data-panel="tickets"]').click();
  await adminPage.page.locator("[data-reply-ticket]").first().click();
  await adminPage.page.locator("#ticketReplyInput").fill("已收到，谢谢反馈。");
  await adminPage.page.locator("#ticketConfirm").click();
  await adminPage.page.waitForFunction(
    () => !document.getElementById("ticketModal").open,
  );
  check(
    "admin ticket reply reaches the existing API",
    (
      await api("/api/tickets/mine", { token: ordinary.token })
    ).data.tickets.some((t) => t.status === "resolved"),
  );
  await adminPage.ctx.close();
  const denied = await pageFor(ordinary, "/admin.html");
  check(
    "ordinary user has a permission state",
    await denied.page.locator("#denyBox").isVisible(),
  );
  await denied.ctx.close();
  const loggedOut = await pageFor(null, "/login.html?next=%2Fforum.html", 360);
  await loggedOut.page.locator("#username").fill("banned-user");
  await loggedOut.page.locator("#password").fill("test-password");
  await loggedOut.page.locator("#submitBtn").click();
  await loggedOut.page.waitForFunction(
    () => !document.getElementById("appealBox").hidden,
  );
  check("banned login reveals appeal form", true);
  await audit(loggedOut.page, "login/banned/360");
  await loggedOut.ctx.close();

  // Forms and administrative mutations use real endpoints in the temporary app.
  const fixture = {
    name: "campus.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6h0AAAAASUVORK5CYII=",
      "base64",
    ),
  };
  const member = await account("moderated-user");
  const extra = await pageFor(admin, "/admin.html#users", 360, "dark");
  const ep = extra.page;
  for (const panel of [
    "banner",
    "announce",
    "weekly",
    "review",
    "appeals",
    "tickets",
    "users",
    "invite",
    "menu-import",
  ]) {
    await ep.locator(`[data-panel="${panel}"]`).click();
    await ep.waitForLoadState("networkidle");
    await audit(ep, `admin/${panel}/dark`);
  }
  await ep.locator('[data-panel="invite"]').click();
  await ep.locator("#inviteCodeInput").fill("CAMPUS-UI");
  await ep.locator("#inviteMaxInput").fill("3");
  await ep.locator("#inviteAdd").click();
  await ep.waitForFunction(() =>
    document.querySelector("#inviteList").textContent.includes("CAMPUS-UI"),
  );
  check("invitation creation works", true);
  await ep.locator('[data-panel="weekly"]').click();
  await ep.locator("#weeklyStart").fill("2026-10-01");
  await ep.locator("#weeklyEnd").fill("2026-10-07");
  await ep.locator("#weeklyFile").setInputFiles(fixture);
  check(
    "weekly upload preview is visible",
    await ep.locator("#weeklyPreview").isVisible(),
  );
  await ep.locator("#weeklyConfirm").click();
  await ep.waitForFunction(
    () => !!document.querySelector("#weeklyList [data-zoom]"),
  );
  check(
    "weekly multipart upload works",
    (await api("/api/weekly-menu")).data.images.length === 1,
  );
  await ep.locator("#weeklyList [data-zoom]").click();
  await audit(ep, "weekly/viewer/dark");
  await ep.keyboard.press("Escape");
  await ep.locator('[data-panel="users"]').click();
  await ep.waitForLoadState("networkidle");
  await ep
    .locator(`[data-role-select="${member.user.id}"]`)
    .selectOption("student");
  await ep.locator('dialog[open] button[type="submit"]').click();
  await ep.waitForFunction(
    (id) =>
      document.querySelector(`[data-role-select="${id}"]`)?.value ===
        "student" && !document.querySelector("dialog[open]"),
    member.user.id,
  );
  check(
    "role confirmation works",
    (await api("/api/user/profile", { token: member.token })).data.user.role ===
      "student",
  );
  await ep.locator(`[data-perms="${member.user.id}"]`).click();
  await audit(ep, "admin/permissions/dialog/dark");
  await ep.locator('#permsList input[value="banner_edit"]').check();
  await ep.locator("#permsConfirm").click();
  await ep.waitForFunction(() => !document.getElementById("permsModal").open);
  check(
    "special permissions save",
    (
      await api("/api/user/profile", { token: member.token })
    ).data.user.permissions.includes("banner_edit"),
  );
  await ep.locator(`[data-ban="${member.user.id}"]`).click();
  await audit(ep, "admin/ban/dialog/dark");
  await ep.locator("#banReasonInput").fill("测试理由");
  await ep.locator("#banImageInput").setInputFiles(fixture);
  await ep.locator("#banConfirm").click();
  await ep.waitForFunction(() => !document.getElementById("banModal").open);
  check(
    "ban dialog multipart submit works",
    (await api("/api/admin/users", { token: admin.token })).data.users.find(
      (u) => u.id === member.user.id,
    ).status === "banned",
  );
  await ep.locator(`[data-unban="${member.user.id}"]`).click();
  await ep.locator('dialog[open] button[type="submit"]').click();
  await ep.waitForFunction(
    (id) => !!document.querySelector(`[data-ban="${id}"]`),
    member.user.id,
  );
  check("unban confirmation works", true);
  await ep.locator('[data-panel="appeals"]').click();
  await ep.waitForLoadState("networkidle");
  await ep.locator("[data-approve-appeal]").click();
  await ep.locator('dialog[open] button[type="submit"]').click();
  await ep.waitForFunction(
    () => !document.querySelector("[data-approve-appeal]"),
  );
  check("appeal approval clears queue", true);
  await ep.locator('[data-panel="tickets"]').click();
  await ep.waitForLoadState("networkidle");
  await ep.locator("[data-reply-ticket]").first().click();
  await audit(ep, "admin/ticket/dialog/dark");
  await ep.locator("#ticketReplyInput").fill("图片批复");
  await ep.locator("#ticketImageInput").setInputFiles(fixture);
  await ep.locator("#ticketConfirm").click();
  await ep.waitForFunction(() => !document.getElementById("ticketModal").open);
  check(
    "ticket image DataURL submit works",
    (
      await api("/api/tickets/mine", { token: ordinary.token })
    ).data.tickets.some((t) => t.reply_image.startsWith("data:image/png;")),
  );
  await ep.goto(base + "/map.html", { waitUntil: "networkidle" });
  await ep.locator("#floor4Btn").click();
  check(
    "map floor changes ARIA state",
    (await ep.locator("#floor4Btn").getAttribute("aria-pressed")) === "true",
  );
  await ep.locator("#floor1Btn").click();
  await ep.locator("#helpBtn").click();
  check("map help expands", await ep.locator("#helpPanel").isVisible());
  await ep.locator(".leaflet-interactive").first().dispatchEvent("click");
  await ep.locator(".map-popup__edit").click();
  await audit(ep, "map/edit/dialog/dark");
  await ep.locator("dialog[open] textarea").fill("更新后的校园建筑说明");
  await ep.locator('dialog[open] button[type="submit"]').click();
  await ep.waitForFunction(
    () =>
      document.querySelector(".map-popup__text")?.textContent ===
      "更新后的校园建筑说明",
  );
  check(
    "map popup update persists",
    (await api("/api/map-data")).data.features.some(
      (f) => f.popup === "更新后的校园建筑说明",
    ),
  );
  await extra.ctx.close();
  const partial = await pageFor(member, "/admin.html#users");
  check(
    "explicit permission filters sidebar",
    (await partial.page.locator("#adminNav [data-panel]:visible").count()) ===
      1 && (await partial.page.locator("#view-banner").isVisible()),
  );
  await partial.ctx.close();
  check("ordinary token cannot access menu settings", (await api("/api/admin/menu-sync/settings", {token: ordinary.token})).status === 403);
  check("guest cannot fetch menu artifacts", (await api("/api/admin/menu-sync/jobs/" + menuJobId + "/artifacts/source?source_id=szzx1000:36:11392")).status === 401);
  const recipe = await pageFor(ordinary, "/recipe.html", 360);
  await recipe.page.locator("#allBtn").click();
  await recipe.page.waitForFunction(() => document.querySelectorAll("[data-dish-id]").length === 1243);
  check("historical dishes visible independently from reviews", true);
  await recipe.page.locator('#dishRail a[href="#dish-group-H"]').click();
  await recipe.page.waitForFunction(() => {
    const group = document.getElementById("dish-group-H").getBoundingClientRect();
    return group.top >= document.getElementById("dishSearchArea").getBoundingClientRect().bottom && group.top < innerHeight;
  });
  check("A-Z jump keeps group title visible below sticky search", true);
  await recipe.page.evaluate(() => { const input = document.getElementById("dishSearch"); input.dispatchEvent(new CompositionEvent("compositionstart")); input.value = "hongshao"; input.dispatchEvent(new Event("input", {bubbles: true})); });
  await recipe.page.waitForTimeout(350);
  check("IME composing does not filter prematurely", await recipe.page.locator("[data-dish-id]").count() === 1243);
  await recipe.page.evaluate(() => document.getElementById("dishSearch").dispatchEvent(new CompositionEvent("compositionend")));
  await recipe.page.locator("#dishSearch").fill("hongshao");
  await recipe.page.waitForFunction(() => document.querySelectorAll("[data-dish-id]").length > 0 && document.querySelectorAll("[data-dish-id]").length < 1243);
  check("pinyin query persisted in URL", new URL(recipe.page.url()).searchParams.get("q") === "hongshao");
  await recipe.page.locator("#dishSearch").fill("<script>invalid</script>");
  await recipe.page.waitForFunction(() => document.querySelectorAll("[data-dish-id]").length === 0);
  check("search empty state escapes query", await recipe.page.locator("#recipeList").getByText("没有找到相关菜品").isVisible());
  await recipe.page.locator("#dishSearchClear").click();
  check("clear restores directory and focus", await recipe.page.locator("#dishSearch").evaluate(el => el === document.activeElement));
  await audit(recipe.page, "recipe/directory/360");
  await recipe.page.screenshot({path: path.join(output, "dishes-360.png")});
  await recipe.page.setViewportSize({width: 1280, height: 850});
  await audit(recipe.page, "recipe/directory/1280");
  await recipe.page.screenshot({path: path.join(output, "dishes-1280.png")});
  await recipe.page.locator("#dishSearch").fill("牛肉");
  await recipe.page.waitForFunction(() => !!document.querySelector("#recipeList mark"));
  check("Chinese query highlighted safely", true);
  await recipe.page.reload({waitUntil: "networkidle"});
  check("query restored after refresh", await recipe.page.locator("#dishSearch").inputValue() === "牛肉");
  await recipe.page.setViewportSize({width: 360, height: 850});
  await recipe.page.locator("#reviewsBtn").click();
  await recipe.page.locator("#writeBtn").click();
  await audit(recipe.page, "recipe/dialog/360");
  await recipe.page.locator("#name").fill("清蒸鱼");
  await recipe.page.locator('label[for="r4"]').click();
  await recipe.page.locator("#comment").fill("新 UI 的图片评价");
  await recipe.page.locator("#image").setInputFiles(fixture);
  await recipe.page.locator("#recipeSubmit").click();
  await recipe.page.waitForFunction(
    () => !document.getElementById("reviewDialog").open,
  );
  check(
    "review multipart upload works",
    (await api("/api/recipes")).data.recipes.some(
      (r) => r.name === "清蒸鱼" && r.rating === 4 && r.image_url,
    ),
  );
  await recipe.page.locator("#weeklyBtn").click();
  await recipe.page.waitForLoadState("networkidle");
  await audit(recipe.page, "recipe/weekly/360");
  await recipe.ctx.close();
  const profile = await pageFor(ordinary, "/profile.html", 360);
  for (const panel of ["profile", "security", "site", "tickets"]) {
    await profile.page.locator(`[data-panel="${panel}"]`).click();
    await profile.page.waitForLoadState("networkidle");
    await audit(profile.page, `profile/${panel}/360`);
  }
  await profile.page.locator('[data-panel="profile"]').click();
  await profile.page.locator("#nickname").fill("校园昵称");
  await profile.page.locator("#nicknameSubmit").click();
  await profile.page.waitForFunction(
    () => document.getElementById("profileName").textContent === "校园昵称",
  );
  await profile.page.locator("#avatarFile").setInputFiles(fixture);
  await profile.page.waitForFunction(
    () => !!document.querySelector("#avatarBox img"),
  );
  check(
    "nickname and avatar save",
    !!(await api("/api/user/profile", { token: ordinary.token })).data.user
      .avatar_url,
  );
  await profile.ctx.close();
  const registration = await pageFor(
    null,
    "/register.html?next=%2Fforum.html",
    360,
  );
  for (const [id, value] of [
    ["username", "ui-registration"],
    ["nickname", "注册昵称"],
    ["password", "test-password"],
    ["confirm", "test-password"],
  ])
    await registration.page.locator("#" + id).fill(value);
  await registration.page.locator("#submitBtn").click();
  await registration.page.waitForURL("**/forum.html");
  check(
    "registration automatically logs in and returns to next",
    !!(await registration.page.evaluate(() => localStorage.getItem("token"))),
  );
  await registration.ctx.close();
  const retry = await pageFor(null, "/forum.html", 360);
  await retry.page.route("**/api/forum/posts?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "server error" }),
    }),
  );
  await retry.page.locator("#questionBtn").click();
  await retry.page.locator("[data-retry]").waitFor();
  check("fetch failure provides retry", true);
  await retry.page.unroute("**/api/forum/posts?*");
  await retry.page.locator("[data-retry]").click();
  await retry.page.waitForFunction(
    () => !!document.querySelector("[data-post-id]"),
  );
  check("retry reloads the failed list", true);
  await retry.ctx.close();
  for (const role of ["super_admin","admin"]) {
    const staff=await account("manual-"+role);
    check(role+" role assigned",(await api("/api/admin/users/role",{token:admin.token,method:"PUT",body:{userId:staff.user.id,newRole:role}})).status===200);
    const login=(await api("/api/login",{method:"POST",body:{username:"manual-"+role,password:"test-password"}})).data;
    const manual=await pageFor(login,"/admin.html#menu-import",360,"dark");
    await manual.page.waitForSelector("#view-menu-import:not([hidden])");
    check(role+" has manual panel without AI settings",await manual.page.locator('[data-panel="menu-import"]').isVisible() && !await manual.page.locator('[data-panel="menu"]').isVisible());
    await manual.page.locator("#menuImportJson").fill(JSON.stringify([importRecord]));await manual.page.locator("#menuImportValidate").click();
    await manual.page.waitForFunction(()=>document.getElementById("menuImportStatus").textContent.includes("校验通过"));
    await manual.page.locator("#menuImportReviewed").check();await manual.page.locator("#menuImportPublish").click();
    await manual.page.waitForFunction(()=>document.getElementById("menuImportStatus").textContent.includes("已发布 1 条"));
    check(role+" publishes pasted JSON",(await api("/api/admin/menu-sync/imports",{token:login.token})).data.history[0].actor_id===login.user.id);
    await manual.page.locator("#menuImportSource").selectOption("szzx1000:36:11392");
    await manual.page.locator("#menuImportJob").selectOption(menuJobId);await manual.page.locator("#menuImportLoad").click();
    await manual.page.waitForFunction(()=>document.getElementById("menuImportWarning").textContent.includes("补全全部遗漏"));
    check(role+" can edit failed vision JSON",JSON.parse(await manual.page.locator("#menuImportJson").inputValue())[0].name===importRecord.name);
    const current=(await api("/api/admin/menu-sync/imports/source?source_id=szzx1000:36:11392",{token:login.token})).data.records;
    await manual.page.locator("#menuImportJson").fill(JSON.stringify([...current,{...importRecord,price:0}]));
    await manual.page.locator("#menuImportValidate").click();await manual.page.waitForFunction(()=>document.getElementById("menuImportStatus").textContent.includes("校验通过"));
    await manual.page.locator("#menuImportReviewed").check();await manual.page.locator("#menuImportPublish").click();
    await manual.page.waitForFunction(()=>document.getElementById("menuImportStatus").textContent.includes("已发布"));
    const history=(await api("/api/admin/menu-sync/imports",{token:login.token})).data.history[0];
    check(role+" publishes corrected vision JSON",history.actor_id===login.user.id && history.job_id===menuJobId && history.source_id==="szzx1000:36:11392");
    await audit(manual.page,"admin/manual/"+role+"/dark");await manual.ctx.close();
  }
  /* ---------- 头衔系统（#10） ---------- */
  const catalog = (await api("/api/admin/titles", { token: admin.token })).data
    .titles;
  check(
    "title catalog seeded with rules",
    catalog.length === 9 &&
      catalog.some((t) => t.rule === "shop_contributor") &&
      catalog.some((t) => t.rule === "forum_catalyst") &&
      catalog.some((t) => t.rule === "weekend_regular") &&
      catalog.some((t) => t.rule === "top_liked") &&
      catalog.some((t) => t.rule === "canteen_veteran") &&
      !catalog.some(
        (t) => t.rule.indexOf("role_") === 0 || t.rule === "student_verified",
      ) &&
      catalog.some((t) => t.name === "师者" && t.source === "grant") &&
      catalog.some((t) => t.source === "grant"),
  );
  const devTitles = (await api("/api/user/titles", { token: admin.token })).data;
  check(
    "developer has no grade title",
    !devTitles.titles.some((t) => t.name === "开发者") &&
      !devTitles.titles.some((t) => t.name === "学子") &&
      !devTitles.titles.some((t) => t.name === "师者"),
  );
  const founder = catalog.find((t) => t.name === "创站元老");
  check(
    "developer grants a manual title",
    (
      await api(`/api/admin/users/${ordinary.user.id}/titles`, {
        token: admin.token,
        method: "POST",
        body: { title_id: founder.id },
      })
    ).data.granted === true,
  );
  check(
    "auto title rejects manual grant",
    (
      await api(`/api/admin/users/${ordinary.user.id}/titles`, {
        token: admin.token,
        method: "POST",
        body: { title_id: catalog.find((t) => t.source === "auto").id },
      })
    ).status === 409,
  );
  check(
    "user wears the granted title",
    (
      await api("/api/user/title", {
        token: ordinary.token,
        method: "PUT",
        body: { title_id: founder.id },
      })
    ).status === 200,
  );

  const titlesPage = await pageFor(ordinary, "/profile.html#titles", 1280);
  await titlesPage.page.waitForSelector("#view-titles:not([hidden])");
  check(
    "profile titles panel renders",
    await titlesPage.page.locator("#view-titles").isVisible(),
  );
  check(
    "worn title shows in preview",
    (await titlesPage.page.locator("#titlePreview").textContent()).includes(
      "创站元老",
    ),
  );
  check(
    "save stays disabled until a change",
    await titlesPage.page.locator("#wearSubmit").isDisabled(),
  );
  await titlesPage.page.locator("#titleChoices label").first().click();
  check(
    "choosing no title enables save",
    !(await titlesPage.page.locator("#wearSubmit").isDisabled()),
  );
  const apiLocked = (await api("/api/user/titles", { token: ordinary.token }))
    .data.locked;
  const inProgress = apiLocked.filter((t) => !t.met && t.progress > 0);
  const renderedLocked = await titlesPage.page
    .locator("#titlesLocked .choice")
    .count();
  check(
    `locked list shows only in-progress titles (rendered ${renderedLocked}, expected ${inProgress.length})`,
    renderedLocked === inProgress.length,
  );
  check(
    "zero-progress titles are not rendered",
    (await titlesPage.page.locator("#titlesLocked").textContent()).includes(
      "校园老吃家",
    ) === inProgress.some((t) => t.name === "校园老吃家"),
  );
  await titlesPage.page.locator("#wearSubmit").click();
  await titlesPage.page.waitForFunction(
    () => document.getElementById("wearSubmit").disabled,
  );
  check(
    "saving clears the worn title",
    (await api("/api/user/profile", { token: ordinary.token })).data.user
      .title === null,
  );
  await audit(titlesPage.page, "profile/titles/1280");
  await titlesPage.page.screenshot({
    path: path.join(output, "profile-titles-1280.png"),
    fullPage: true,
  });
  await titlesPage.ctx.close();

  const narrowTitles = await pageFor(ordinary, "/profile.html#titles", 360);
  await narrowTitles.page.waitForSelector("#view-titles:not([hidden])");
  await audit(narrowTitles.page, "profile/titles/360");
  await narrowTitles.ctx.close();

  const titlesAdmin = await pageFor(admin, "/admin.html#titles-mgmt", 1280);
  await titlesAdmin.page.waitForSelector("#view-titles-mgmt:not([hidden])");
  check(
    "admin catalog lists seeded titles",
    (await titlesAdmin.page.locator("#titleList tbody tr").count()) === 9,
  );
  await titlesAdmin.page.locator("#titleAdd").click();
  await titlesAdmin.page.waitForSelector("#titleModal[open]");
  await titlesAdmin.page.locator("#titleName").fill("创站元老");
  await titlesAdmin.page.locator("#titleConfirm").click();
  await titlesAdmin.page.waitForFunction(() =>
    document.getElementById("titleMsg").textContent.includes("已存在"),
  );
  check(
    "duplicate title name shows inline error",
    await titlesAdmin.page.locator("#titleModal[open]").isVisible(),
  );
  await titlesAdmin.page.locator("#titleName").fill("测试头衔");
  await titlesAdmin.page.locator("#titleConfirm").click();
  await titlesAdmin.page.waitForFunction(
    () => document.querySelectorAll("#titleList tbody tr").length === 10,
  );
  check(
    "new title appears in catalog",
    (await titlesAdmin.page.locator("#titleList tbody tr").count()) === 10,
  );
  await titlesAdmin.page.locator("[data-delete-title]").last().click();
  await titlesAdmin.page.locator('dialog[open] [data-r="ok"]').click();
  await titlesAdmin.page.waitForFunction(
    () => document.querySelectorAll("#titleList tbody tr").length === 9,
  );
  check(
    "deleting a title refreshes the catalog",
    (await titlesAdmin.page.locator("#titleList tbody tr").count()) === 9,
  );
  await audit(titlesAdmin.page, "admin/titles/1280");
  await titlesAdmin.page.screenshot({
    path: path.join(output, "admin-titles-1280.png"),
    fullPage: true,
  });
  await titlesAdmin.page.locator('[data-panel="users"]').click();
  await titlesAdmin.page.waitForSelector("#view-users:not([hidden])");
  await titlesAdmin.page.waitForSelector("#userList tbody tr");
  check(
    "users table lists granted titles",
    (await titlesAdmin.page.locator("#userList").textContent()).includes(
      "创站元老",
    ),
  );

  // 专属头衔：超管给单个账号颁发自定义头衔
  const userRow = titlesAdmin.page
    .locator("#userList tbody tr")
    .filter({ hasText: "campus-user" });
  await userRow.locator("[data-titles]").click();
  await titlesAdmin.page.waitForSelector("#grantModal[open]");
  await titlesAdmin.page.locator("#exclusiveName").fill("首席摸鱼官");
  await titlesAdmin.page
    .locator("#exclusiveHues label")
    .filter({ hasText: "绛红" })
    .click();
  await titlesAdmin.page.locator("#exclusiveGrant").click();
  await titlesAdmin.page.waitForFunction(() =>
    document.getElementById("grantOwned").textContent.includes("首席摸鱼官"),
  );
  check(
    "exclusive title granted to a single account",
    (await titlesAdmin.page.locator("#grantOwned").textContent()).includes(
      "首席摸鱼官",
    ),
  );
  check(
    "exclusive title stays out of the shared catalog",
    (await api("/api/admin/titles", { token: admin.token })).data.titles
      .length === 9,
  );
  await titlesAdmin.page
    .locator("#grantOwned [data-revoke-title]")
    .last()
    .click();
  await titlesAdmin.page.locator('dialog[open] [data-r="ok"]').click();
  await titlesAdmin.page.waitForFunction(
    () =>
      !document.getElementById("grantOwned").textContent.includes("首席摸鱼官"),
  );
  check("exclusive title removed on revoke", true);
  await titlesAdmin.ctx.close();

  const notFound = await fetch(base + "/missing/deep/path");
  check(
    "unknown page returns styled 404",
    notFound.status === 404 &&
      (await notFound.text()).includes("/css/site.css"),
  );
  check(
    "unknown API remains JSON 404",
    (await api("/api/missing")).status === 404,
  );
  const oldData = JSON.parse(
    fs.readFileSync(path.join(root, "data.json"), "utf8"),
  );
  check("map data matches feature count", oldData.features.length > 200);
  fs.writeFileSync(
    path.join(output, "audit.json"),
    JSON.stringify({ checks, issues }, null, 2),
  );
  assert.deepEqual(
    issues,
    [],
    "Browser console, layout and accessibility findings: " +
      JSON.stringify(issues),
  );
  console.log(
    `${checks} checks passed. Temporary database and uploads isolated from the repository.`,
  );
} finally {
  fs.writeFileSync(
    path.join(output, "audit.json"),
    JSON.stringify({ checks, issues }, null, 2),
  );
  if (browser) await browser.close();
  server.kill();
  await new Promise((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once("exit", resolve);
  });
  // Only remove the mkdtemp directory after verifying its resolved parent.
  if (
    path.dirname(fs.realpathSync(temp)).toLowerCase() !==
    fs.realpathSync(os.tmpdir()).toLowerCase()
  )
    throw new Error("Unexpected temporary path");
  fs.rmSync(temp, { recursive: true, force: true });
}
