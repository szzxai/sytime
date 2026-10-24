import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import fixture from "./helpers/app-fixture.cjs";
import store from "../lib/dishes/store.js";

const site = await fixture.startApp("szzx-dishes-ui-");
const output = path.join(site.root, "output/playwright/dishes");
fs.mkdirSync(output, { recursive: true });
const axe = fs.readFileSync(path.join(site.root, "node_modules/axe-core/axe.min.js"), "utf8");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const issues = [], completed = [];
let checks = 0, browser, currentPage, failure;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
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
    if (login) {
      localStorage.setItem("token", login.token);
      localStorage.setItem("user", JSON.stringify(login.user));
    }
  }, { login, theme });
  const page = await context.newPage();
  currentPage = page;
  page.on("pageerror", error => issues.push({ page: page.url(), error: error.message }));
  page.setDefaultTimeout(10000);
  return { context, page };
}
async function choose(page, dish) {
  await page.locator("#name").fill(dish.name);
  await page.locator("#dishOptions").getByRole("option", { name: dish.name, exact: true }).click();
}
async function verifyPickerPaging(page, label, catalog) {
  const input = page.locator("#name"), more = page.locator("#dishPickerMore");
  const options = page.locator('#dishOptions [role="option"]');
  const ids = () => options.evaluateAll(elements => elements.map(element => Number(element.dataset.dishChoice)));
  await input.fill("");
  await page.waitForFunction(() => document.querySelectorAll('#dishOptions [role="option"]').length === 50);
  check(label + " 初始显示五十条候选", await options.count() === 50 && await more.isVisible());
  assert.deepEqual(await ids(), catalog.slice(0, 50).map(dish => dish.id));
  check(label + " 状态提示包含当前显示数", (await page.locator("#dishPickerStatus").textContent()).includes("已显示 50 道"));
  await input.press("Tab");
  check(label + " Tab 可访问显示更多且不关闭候选", await more.evaluate(element => element === document.activeElement) && await page.locator("#dishPickerPopup").isVisible());
  await page.keyboard.press("Enter");
  check(label + " 键盘显示更多增加五十条", await options.count() === 100);
  await page.keyboard.press("Space");
  check(label + " 空格键继续追加至一百五十条", await options.count() === 150);
  await page.locator("#dishOptions").evaluate(element => { element.scrollTop = 80; });
  const scrollTop = await page.locator("#dishOptions").evaluate(element => element.scrollTop);
  await more.click();
  check(label + " 再次追加五十条并保留滚动位置", await options.count() === 200 &&
    await page.locator("#dishOptions").evaluate(element => element.scrollTop) === scrollTop);
  assert.deepEqual(await ids(), catalog.slice(0, 200).map(dish => dish.id));
  check(label + " 显示更多不会自动选中或重复菜品", await page.locator("#selectedDishId").inputValue() === "" && new Set(await ids()).size === 200);
  await audit(page, label + "/more");
  await page.screenshot({ path: path.join(output, label + "-more.png") });
  await options.nth(149).click();
  check(label + " 鼠标可选中追加项且浮层保持关闭", await page.locator("#selectedDishId").inputValue() === String(catalog[149].id) &&
    await page.locator("#dishPickerPopup").isHidden());
  const filtered = catalog.filter(dish => dish.name.includes("豆"));
  assert.ok(filtered.length > 100 && filtered.length < 150);
  await input.fill("豆");
  check(label + " 新关键词重新显示前五十条", await options.count() === 50 && await more.isVisible());
  await more.click();
  check(label + " 筛选结果按五十条追加", await options.count() === 100 && await more.isVisible());
  await more.click();
  assert.deepEqual(await ids(), filtered.map(dish => dish.id));
  check(label + " 最后不足五十条完整显示且收起入口", await options.count() === filtered.length && await more.isHidden());
  check(label + " 最后一批加载后焦点回到输入框", await input.evaluate(element => element === document.activeElement));
  await input.press("ArrowUp");
  await input.press("Enter");
  check(label + " 可键盘选择第五十条之后的菜品", await page.locator("#selectedDishId").inputValue() === String(filtered.at(-1).id) &&
    await page.locator("#dishPickerPopup").isHidden());
  await input.fill("粉");
  const shortList = catalog.filter(dish => dish.name.includes("粉"));
  check(label + " 不足五十条无需显示更多", await options.count() === shortList.length && shortList.length < 50 && await more.isHidden());
  await input.fill("没有匹配的分页测试菜名");
  check(label + " 无匹配隐藏显示更多", await options.count() === 0 && await more.isHidden());
  await input.fill("");
  check(label + " 清空关键词恢复首批五十条", await options.count() === 50 && await more.isVisible() && await page.locator("#selectedDishId").inputValue() === "");
  await input.press("Tab");
  await page.keyboard.press("Escape");
  check(label + " 显示更多上的 Escape 只收起候选", await page.locator("#dishPickerPopup").isHidden() && await page.locator("#reviewDialog").isVisible());
  await input.press("ArrowDown");
  await input.press("Tab");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => document.querySelector("#dishPickerPopup").hidden);
  check(label + " Tab 离开候选后关闭列表但不选菜", await page.locator("#selectedDishId").inputValue() === "");
}

try {
  const registration = await site.api("/api/register", { method: "POST",
    body: { username: "dishes-ui", nickname: "菜品体验员", password: "test-password" } });
  check("创建隔离测试用户", registration.status === 201);
  const login = (await site.api("/api/login", { method: "POST",
    body: { username: "dishes-ui", password: "test-password" } })).data;
  const catalog = (await site.api("/api/dishes")).data.dishes;
  const target = catalog.find(dish => dish.name === "红烧牛肉面");
  const longDish = catalog.reduce((longest, dish) => dish.name.length > longest.name.length ? dish : longest);
  const other = catalog.find(dish => dish.id !== target.id && dish.id !== longDish.id);
  const legacyComment = "旧评价仍然属于这道菜";
  const unsafeComment = '<img src=x onerror="window.dishXss=true">完整评论按文本显示';
  const database = new DatabaseSync(path.join(site.directory, "data.db"));
  try {
    fs.mkdirSync(path.join(site.directory, "uploads"), { recursive: true });
    fs.writeFileSync(path.join(site.directory, "uploads/dish-ui.png"), png);
    const insert = database.prepare(`INSERT INTO recipes (dish_id, user_id, username, name, rating, comment, image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const now = Math.floor(Date.now() / 1000) - 30;
    for (let position = 0; position < 25; position++) {
      insert.run(position === 0 ? null : target.id, login.user.id, login.user.username,
        position === 0 ? "  红烧牛肉面  " : target.name, 3 + position % 3,
        position === 0 ? legacyComment : position === 2 ? unsafeComment : "牛肉面评论 " + position,
        position === 1 ? "/uploads/dish-ui.png" : null, now - position);
    }
    insert.run(other.id, login.user.id, login.user.username, other.name, 2, "另一道菜的评价不可混入", null, now);
    insert.run(null, login.user.id, login.user.username, "目录外旧菜名", 4, "历史内容保留", null, now);
    store.migrate(database);
  } finally { database.close(); }
  browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });

  for (const width of [360, 1280]) for (const theme of ["light", "dark"]) {
    const label = width + "-" + theme;
    const { context, page } = await pageFor(login, width, theme);
    let posts = 0;
    page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/recipes")) posts++; });
    await page.goto(site.base + "/recipe.html?view=all&q=" + encodeURIComponent(target.name), { waitUntil: "networkidle" });
    const link = page.locator('.dish-row a[href="dish.html?id=' + target.id + '"]');
    await link.waitFor();
    check(label + " 目录使用原生详情链接", await link.getAttribute("role") === null && await page.locator(".dish-row").first().getAttribute("role") === null);
    if (width === 360 && theme === "light") { await link.focus(); await link.press("Enter"); }
    else await page.locator('[data-dish-id="' + target.id + '"]').click({ position: { x: 12, y: 12 } });
    await page.waitForURL("**/dish.html?id=" + target.id);
    await page.waitForSelector("#dishReviews .dish-review");
    const summary = (await site.api("/api/dishes/" + target.id)).data.dish;
    check(label + " 标题与评分来自当前菜品", await page.locator("#dishTitle").textContent() === target.name &&
      (await page.locator("#dishSummary").textContent()).includes(summary.rating_avg.toFixed(1) + " / 5"));
    check(label + " 首次加载二十条且仅含当前菜品", await page.locator("#dishReviews .dish-review").count() === 20 &&
      !(await page.locator("#dishReviews").textContent()).includes("另一道菜的评价不可混入"));
    check(label + " 历史评价与作者信息保留", (await page.locator("#dishReviews").textContent()).includes(legacyComment) &&
      (await page.locator("#dishReviews").textContent()).includes("菜品体验员"));
    check(label + " 评论不会作为 HTML 执行", await page.locator(".dish-review__text").filter({ hasText: unsafeComment }).count() === 1 &&
      await page.evaluate(() => !window.dishXss && !document.querySelector("#dishReviews img[src=x]")));
    await page.locator(".dish-review__image").first().click();
    await page.waitForSelector(".viewer[open]");
    check(label + " 评价图片可以放大", true);
    await page.keyboard.press("Escape");
    await page.locator("#dishMoreButton").click();
    await page.waitForFunction(total => document.querySelectorAll("#dishReviews .dish-review").length === total, summary.reviews_count);
    check(label + " 评价分页无丢失且末页收起", await page.locator("#dishMore").isHidden());
    await audit(page, label + "/detail");
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, label + "-detail.png") });

    await page.locator("#writeDishReview").click();
    await page.waitForSelector("#reviewDialog[open]");
    check(label + " 详情写评价预选当前菜品", await page.locator("#selectedDishId").inputValue() === String(target.id));
    await verifyPickerPaging(page, label + "-detail-picker", catalog);
    await page.locator("#name").fill("不存在的临时新菜名");
    await page.waitForFunction(() => document.querySelector("#dishPickerStatus").textContent.includes("没有匹配"));
    await page.locator("#recipeSubmit").click();
    check(label + " 任意新菜名不能提交", posts === 0 && await page.locator("#selectedDishId").inputValue() === "" &&
      (await page.locator("#dishPicker .field__error").textContent()).includes("请从下拉列表选择已有菜品"));
    await page.locator("#name").fill(target.name);
    await page.locator("#name").press("Tab");
    await page.locator("#recipeSubmit").click();
    check(label + " 输入完整已有菜名仍须明确选择", posts === 0 && await page.locator("#selectedDishId").inputValue() === "");
    await page.locator("#name").fill("hongshaoniuroumian");
    check(label + " 支持拼音过滤", await page.locator("#dishOptions").getByRole("option", { name: target.name, exact: true }).count() === 1);
    await page.locator("#name").fill("hsnrm");
    check(label + " 支持首字母过滤", await page.locator("#dishOptions").getByRole("option", { name: target.name, exact: true }).count() === 1);
    await page.locator("#name").fill(longDish.name);
    await page.locator("#name").press("ArrowDown");
    check(label + " 下拉键盘项具有活动后代", !!await page.locator("#name").getAttribute("aria-activedescendant"));
    await page.locator("#name").press("Enter");
    check(label + " 超过二十字的已有菜品可选", longDish.name.length > 20 && await page.locator("#selectedDishId").inputValue() === String(longDish.id));
    await page.locator("#name").press("ArrowDown");
    await page.locator("#name").press("Escape");
    check(label + " Escape 只先关闭下拉列表", await page.locator("#dishPickerPopup").isHidden() && await page.locator("#reviewDialog").isVisible());
    await page.locator("#name").fill(target.name + " ");
    check(label + " 修改已选名称立即清空菜品身份", await page.locator("#selectedDishId").inputValue() === "");
    await choose(page, target);
    await page.locator("#name").press("ArrowDown");
    await audit(page, label + "/picker");
    const popup = await page.locator("#dishPickerPopup").boundingBox();
    check(label + " 下拉列表不超出手机或桌面视口", popup.x >= 0 && popup.x + popup.width <= width + 1);
    await page.screenshot({ path: path.join(output, label + "-picker.png") });
    await page.locator("#name").press("Escape");
    await page.locator('label[for="r4"]').click();
    const comment = "新发布的牛肉面评价 " + label;
    await page.locator("#comment").fill(comment);
    await page.locator("#image").setInputFiles({ name: "dish.png", mimeType: "image/png", buffer: png });
    check(label + " 图片选择产生预览", await page.locator("#recipeForm .upload-preview").count() === 1);
    const published = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/api/recipes"));
    await page.locator("#recipeSubmit").click();
    const response = await published;
    check(label + " 发布包含真实菜品身份并保留图片", response.status() === 201 && (await response.json()).recipe.dish_id === target.id);
    await page.waitForFunction(text => document.querySelector("#dishReviews").textContent.includes(text), comment);
    await page.waitForFunction(() => !document.querySelector("#reviewDialog").open);
    check(label + " 发布后评论与计数立即更新", (await page.locator("#dishSummary").textContent()).includes("共 " + (summary.reviews_count + 1) + " 条评价") &&
      await page.locator("#selectedDishId").inputValue() === "" && await page.locator("#comment").inputValue() === "");
    await page.goto(site.base + "/recipe.html?view=reviews", { waitUntil: "networkidle" });
    await page.waitForSelector(".review-card");
    check(label + " 菜品评价栏仍为原有卡片和二十条分页", await page.locator(".review-card").count() === 20 &&
      await page.locator("#reviewsBtn").getAttribute("aria-selected") === "true" && await page.locator("#writeBtn").isVisible());
    await page.locator("#moreBtn").click();
    check(label + " 原评价栏继续保留无法关联的历史内容", (await page.locator("#recipeList").textContent()).includes("历史内容保留"));
    await page.locator("#writeBtn").click();
    await page.waitForFunction(() => document.querySelectorAll('#dishOptions [role="option"]').length === 50);
    check(label + " 评价页初次打开也显示五十条", await page.locator("#dishPickerMore").isVisible());
    await verifyPickerPaging(page, label + "-recipe-picker", catalog);
    await page.locator('#reviewDialog [aria-label="关闭"]').click();
    completed.push(label);
    await context.close();
  }

  const { context, page } = await pageFor(login);
  await page.goto(site.base + "/dish.html?id=" + longDish.id, { waitUntil: "networkidle" });
  await page.waitForSelector("#dishReviews .empty");
  check("没有评论时不虚构评分", (await page.locator("#dishSummary").textContent()).includes("暂无评分") &&
    (await page.locator("#dishReviews").textContent()).includes("还没有评价"));
  await page.route("**/api/dishes", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "暂时不可用" }) }));
  await page.locator("#writeDishReview").click();
  await page.waitForSelector("#dishPickerRetry:not([hidden])");
  check("下拉菜品加载失败有重试入口", (await page.locator("#dishPickerStatus").textContent()).includes("加载失败") && await page.locator("#dishPickerMore").isHidden());
  await page.unroute("**/api/dishes");
  await page.locator("#dishPickerRetry").click();
  await page.waitForSelector('#dishOptions [role="option"]');
  check("下拉重试可以恢复真实菜品", await page.locator("#dishOptions").getByRole("option", { name: longDish.name, exact: true }).count() === 1);
  await choose(page, other);
  await page.locator("#comment").fill("改选菜品后跳往对应详情");
  await page.locator("#recipeSubmit").click();
  await page.waitForURL("**/dish.html?id=" + other.id);
  check("详情中改选其他已有菜品后跳往对应详情", true);
  await page.goto(site.base + "/dish.html?id=invalid", { waitUntil: "networkidle" });
  check("无效链接呈现友好状态和返回入口", (await page.locator("#dishState").textContent()).includes("没有找到这道菜品") && await page.locator("#writeDishReview").isHidden());
  await page.route("**/api/dishes/" + target.id, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "暂时不可用" }) }));
  await page.goto(site.base + "/dish.html?id=" + target.id, { waitUntil: "networkidle" });
  await page.waitForSelector("#dishState [data-retry]");
  check("详情网络失败可重试", true);
  await page.unroute("**/api/dishes/" + target.id);
  await page.locator("#dishState [data-retry]").click();
  await page.waitForSelector("#dishReviews .dish-review");
  check("详情重试后恢复评论", await page.locator("#dishTitle").textContent() === target.name);
  for (const total of [0, 50, 51, 100]) {
    await page.route("**/api/dishes", route => route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ dishes: catalog.slice(0, total) }) }));
    await page.goto(site.base + "/recipe.html?view=reviews", { waitUntil: "networkidle" });
    await page.locator("#writeBtn").click();
    await page.waitForFunction(() => !document.querySelector("#dishPickerStatus").textContent.includes("正在加载"));
    check(total + " 条目录正确展示首批", await page.locator('#dishOptions [role="option"]').count() === Math.min(total, 50));
    if (total > 50) {
      await page.locator("#dishPickerMore").click();
      check(total + " 条目录末批全部显示", await page.locator('#dishOptions [role="option"]').count() === total);
    }
    check(total + " 条目录全部显示后没有多余入口", await page.locator("#dishPickerMore").isHidden() && await page.locator("#selectedDishId").inputValue() === "");
    await page.unroute("**/api/dishes");
  }
  await context.close();
  const guest = await pageFor(null);
  await guest.page.goto(site.base + "/dish.html?id=" + target.id, { waitUntil: "networkidle" });
  await guest.page.locator("#writeDishReview").click();
  await guest.page.waitForURL("**/login.html?**");
  check("访客写评价仍然要求登录", true);
  await guest.context.close();
  check("浏览器无脚本错误、可访问性问题或横向溢出", issues.length === 0);
} catch (error) {
  failure = error;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(output, "audit.json"), JSON.stringify({ checks, completed, issues, error: failure?.stack || null }, null, 2));
  if (browser) await browser.close();
  await site.stop();
}
console.log("Dish UI: " + checks + " checks; " + issues.length + " issues. Report: output/playwright/dishes/audit.json");
if (failure) throw failure;
