"use strict";
/* 临时验证：评价带图 / 人数与总价 / 人均自动计算。
   在临时目录启动真实 server.js（复制项目文件，不触碰项目 data.db）。 */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "szzx-review-test-"));
const port = 4811 + Math.floor(Math.random() * 200);
const base = "http://127.0.0.1:" + port;

fs.copyFileSync(path.join(root, "server.js"), path.join(temp, "server.js"));
fs.copyFileSync(path.join(root, "data.json"), path.join(temp, "data.json"));
fs.copyFileSync(path.join(root, "menu-json-rules.md"), path.join(temp, "menu-json-rules.md"));
fs.cpSync(path.join(root, "lib"), path.join(temp, "lib"), { recursive: true });
fs.cpSync(path.join(root, "data"), path.join(temp, "data"), { recursive: true });

let server = null, log = "";

require("node:test").before(async () => {
  server = spawn(process.execPath, [path.join(temp, "server.js")], {
    cwd: temp,
    env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), PORT: String(port), JWT_SECRET: "review-test-only-secret" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForReady();
});

function waitForReady() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.kill(); reject(new Error("timeout\n" + log)); }, 30000);
    function scan(chunk) {
      log += chunk;
      if (/Campus map running/.test(log)) { clearTimeout(timer); resolve(); }
    }
    server.stdout.on("data", scan);
    server.stderr.on("data", scan);
  });
}

async function apiJson(url, { token, method = "GET", body } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

async function account(username) {
  await apiJson("/api/register", { method: "POST", body: { username, nickname: username, password: "test-password" } });
  const login = await apiJson("/api/login", { method: "POST", body: { username, password: "test-password" } });
  assert.equal(login.status, 200);
  return login.data;
}

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function multipart(fields, fileField, filename) {
  const boundary = "----testboundary" + Date.now();
  const parts = [];
  Object.entries(fields).forEach(([k, v]) => {
    parts.push(Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + k + "\"\r\n\r\n" + v + "\r\n"));
  });
  if (fileField) {
    parts.push(Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + fileField + "\"; filename=\"" + filename + "\"\r\nContent-Type: image/png\r\n\r\n"));
    parts.push(PNG, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from("--" + boundary + "--\r\n"));
  return { body: Buffer.concat(parts), contentType: "multipart/form-data; boundary=" + boundary };
}

async function apiForm(url, token, fields, fileField, filename) {
  const { body, contentType } = multipart(fields, fileField, filename);
  const response = await fetch(base + url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": contentType },
    body
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

test("评价配图与人均价", async () => {
  const student = await account("rev_student");
  // 升级为 student：直接改临时库
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(path.join(temp, "data.db"));
  db.prepare("UPDATE users SET role = 'student', status = 'active' WHERE username = 'rev_student'").run();

  const me = await apiJson("/api/me", { token: student.token });
  console.log("DEBUG me:", me.status, JSON.stringify(me.data));
  const shop = await apiJson("/api/shops", { token: student.token, method: "POST", body: {
    name: "人均测试店", address: "苏州市姑苏区十梓街 1 号", type: "面馆",
    lat: 31.3004, lng: 120.6226, campus_distance_m: 420, campus_walk_min: 6,
    metro_station: "乐桥", metro_exit: "1 号口", metro_distance_m: 500, metro_walk_min: 7
  } });
  assert.equal(shop.status, 201, JSON.stringify(shop.data));
  const shopId = shop.data.shop.id;

  // 不带图、人数+总价 → 自动算人均
  const r1 = await apiForm("/api/shops/" + shopId + "/reviews", student.token, { rating: "5", content: "好吃", guests: "3", total_price: "128" });
  assert.equal(r1.status, 201, JSON.stringify(r1.data));
  assert.equal(r1.data.review.guests, 3);
  assert.equal(r1.data.review.total_price, 128);
  assert.equal(r1.data.review.per_person, 42.67);

  // 带图提交
  const r2 = await apiForm("/api/shops/" + shopId + "/reviews", student.token, { rating: "4", content: "带图更新", guests: "2", total_price: "60" }, "image", "shot.png");
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  assert.match(r2.data.review.image_url, /^\/uploads\/shops\//);

  // 公开列表返回这些字段
  const list = await apiJson("/api/shops/" + shopId + "/reviews");
  assert.equal(list.data.reviews[0].guests, 2);
  assert.equal(list.data.reviews[0].per_person, 30);
  assert.match(list.data.reviews[0].image_url, /^\/uploads\/shops\//);
  const imgPath = list.data.reviews[0].image_url;
  const imgRes = await fetch(base + imgPath);
  assert.equal(imgRes.status, 200, "评价配图可访问");

  // 勾选不带图（remove_image=1）→ 清除
  const r3 = await apiForm("/api/shops/" + shopId + "/reviews", student.token, { rating: "4", content: "不带图", remove_image: "1" });
  assert.equal(r3.data.review.image_url, "");
  const gone = await fetch(base + imgPath);
  assert.equal(gone.status, 404, "旧图文件已删除");

  // 非法人数 / 总价 → 422
  const bad1 = await apiForm("/api/shops/" + shopId + "/reviews", student.token, { rating: "4", guests: "0" });
  assert.equal(bad1.status, 422);
  const bad2 = await apiForm("/api/shops/" + shopId + "/reviews", student.token, { rating: "4", total_price: "-5" });
  assert.equal(bad2.status, 422);

  // 无图无人数评价仍兼容（JSON 提交）
  const r4 = await apiJson("/api/shops/" + shopId + "/reviews", { token: student.token, method: "POST", body: { rating: 5, content: "纯文字" } });
  assert.equal(r4.status, 200);
  assert.equal(r4.data.review.per_person, null);

  // 删除评价 → 配图一并删除
  const r5 = await apiForm("/api/shops/" + shopId + "/reviews", student.token, { rating: "5" }, "image", "again.png");
  const url5 = r5.data.review.image_url;
  const del = await apiJson("/api/shops/" + shopId + "/reviews/me", { token: student.token, method: "DELETE" });
  assert.equal(del.status, 200);
  assert.equal((await fetch(base + url5)).status, 404, "删除评价后配图删除");

  server.kill("SIGKILL");
});

require("node:test").after(() => { if (server && server.exitCode === null) server.kill("SIGKILL"); });
