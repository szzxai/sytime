# 菜谱评价 · recipe.html

> 状态：现有改版（P0），#5 上线时扩展为目录形态（P1）｜ issue：#4、#5 ｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：`recipe` ｜ 容器：`container`

## 用途与目标

两个 Tab：

1. **全部菜品**（默认视图按用户设置）：P0 = 评价卡片网格（一条评价 = 一张卡，按菜名拼音序）；P1（#5）= 切换为 A–Z 目录形态（见 [dishes.md](./dishes.md)，本文只写衔接）。
2. **每周食谱**：按日期范围折叠的管理员上传大图。

写评价用对话框（P0）。默认 Tab 读取用户设置 `recipe_default_view`（回退 localStorage `recipeDefaultView`，再回退 `all`）。

## 布局

```text
手机 360                       桌面 1280
┌──────────────────┐    ┌───────────────────────────────────┐
│ 页头               │    │ 页头                                │
│ [全部|每周]  [写评价+]│   │ [全部菜品 | 每周食谱]  [写评价+]      │
│ ┌────┐┌────┐     │    │ ┌────┐┌────┐┌────┐                 │
│ │图   ││无图  │    │ │ │评价卡网格 3 列                     │
│ │名称 星││名称  │    │ │ └────┘└────┘└────┘                 │
│ │评论…  ││      │   │ 每周食谱 Tab：                       │
│ └────┘└────┘     │    │ ┌──────────────────────────────┐  │
│ [加载更多]        │    │ │2026-09-28 ~ 10-04   [本周]  ⌄ │  │
└──────────────────┘    │ │ [大图]              (⋯删除)     │  │
                         │ └──────────────────────────────┘  │
```

## HTML 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F5F3EE">
<title>菜谱评价 · 校园信息网</title>
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/site.css">
</head>
<body data-nav="recipe">
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<main id="main" class="main container">
  <div class="page-head">
    <div class="page-head__main">
      <span class="page-head__eyebrow">Canteen</span>
      <h1 class="page-head__title">菜谱评价</h1>
    </div>
    <div class="page-head__actions" id="writeAction">
      <button type="button" class="btn btn--primary" id="writeBtn"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-pencil"></use></svg>写评价</button>
    </div>
  </div>

  <div class="segmented" role="tablist" aria-label="视图" style="margin-bottom:var(--sp-5)">
    <button type="button" class="segmented__item" role="tab" id="allBtn" data-view="all" aria-selected="true">全部菜品</button>
    <button type="button" class="segmented__item" role="tab" id="weeklyBtn" data-view="weekly" aria-selected="false">每周食谱</button>
  </div>

  <div class="callout" id="loginHint" hidden>
    <span class="callout__text">登录后才能写评价。</span>
    <span class="callout__actions"><a class="btn btn--sm" href="login.html">登录</a><a class="btn btn--primary btn--sm" href="register.html">注册</a></span>
  </div>

  <div id="recipeList" aria-live="polite"></div>
  <div class="load-more" id="loadMore" hidden><button type="button" class="btn" id="moreBtn">加载更多</button><span id="moreInfo"></span></div>

  <dialog class="dialog dialog--sheet dialog--wide" id="reviewDialog" aria-labelledby="reviewDialog-t">
    <form class="dialog__form" id="recipeForm" novalidate>
      <div class="dialog__head">
        <h2 class="dialog__title" id="reviewDialog-t">写评价</h2>
        <button type="button" class="icon-btn icon-btn--sm" data-dialog-close aria-label="关闭"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-close"></use></svg></button>
      </div>
      <div class="dialog__body">
        <div class="field">
          <label class="field__label" for="name">菜名</label>
          <input class="input" id="name" type="text" required data-counter="20" enterkeyhint="next">
          <div class="field__foot"><span class="field__hint">和食堂菜单写法一致更容易被搜到</span><span class="field__counter"></span></div>
        </div>
        <div class="field">
          <span class="field__label" id="ratingLabel">评分</span>
          <div class="rating-input" role="radiogroup" aria-labelledby="ratingLabel">
            <input type="radio" name="rating" id="r5" value="5"><label for="r5" title="5 分"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-star"></use></svg></label>
            <input type="radio" name="rating" id="r4" value="4"><label for="r4" title="4 分"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-star"></use></svg></label>
            <input type="radio" name="rating" id="r3" value="3"><label for="r3" title="3 分"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-star"></use></svg></label>
            <input type="radio" name="rating" id="r2" value="2"><label for="r2" title="2 分"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-star"></use></svg></label>
            <input type="radio" name="rating" id="r1" value="1"><label for="r1" title="1 分"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-star"></use></svg></label>
          </div>
          <div class="field__hint">默认 5 分可改</div>
        </div>
        <div class="field">
          <label class="field__label" for="comment">评论 <span class="field__opt">（选填）</span></label>
          <textarea class="textarea" id="comment" data-counter="500"></textarea>
          <div class="field__foot"><span class="field__hint"></span><span class="field__counter"></span></div>
        </div>
        <div class="field" data-upload data-max-mb="2" data-types="image/jpeg,image/png">
          <span class="field__label">图片 <span class="field__opt">（选填）</span></span>
          <label class="upload"><span class="upload__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="img/icons.svg#i-image"></use></svg></span><span class="upload__title">点击选择或拖入图片</span><span class="upload__hint">JPG / PNG，不超过 2 MB</span><input type="file" id="image" accept="image/jpeg,image/png"></label>
          <div class="upload-preview-slot"></div>
        </div>
      </div>
      <div class="dialog__foot">
        <button type="button" class="btn" data-dialog-close>取消</button>
        <button type="submit" class="btn btn--primary" id="recipeSubmit">发布</button>
      </div>
    </form>
  </dialog>
</main>
<div id="siteFooter"></div>
<script src="js/ui.js"></script>
<script src="recipe.page.js"></script>
</body>
</html>
```

页面脚本要点（完整逻辑按此实现；结构与 forum.md 相同的模式不重复展开）：

```js
var token = UI.session.token();
var currentView = "all";
var PAGE_SIZE = UI.config.pageSize;

// 视图切换
document.getElementById("allBtn").addEventListener("click", function () { setView("all"); });
document.getElementById("weeklyBtn").addEventListener("click", function () { setView("weekly"); });
function setView(view) {
  currentView = view;
  document.getElementById("allBtn").setAttribute("aria-selected", view === "all" ? "true" : "false");
  document.getElementById("weeklyBtn").setAttribute("aria-selected", view === "weekly" ? "true" : "false");
  document.getElementById("writeAction").hidden = view !== "all";   // 每周 Tab 不显示写评价
  document.getElementById("loginHint").hidden = !(view === "all" && !token);
  loadList(false);
}

// 默认视图：账号设置 → localStorage → all
function applyDefaultView() {
  var fallback = localStorage.getItem("recipeDefaultView") || "all";
  if (!token) { setView(fallback === "weekly" ? "weekly" : "all"); return; }
  UI.api("/api/user/profile").then(function (r) {
    var v = r.ok && r.data && r.data.user && r.data.user.recipe_default_view ? r.data.user.recipe_default_view : fallback;
    setView(v === "weekly" ? "weekly" : "all");
  });
}

// 全部（P0）：评价卡网格
function loadRecipes(append) {
  var list = document.getElementById("recipeList");
  if (!append) list.innerHTML = UI.html.skeleton("card", 6);
  UI.api("/api/recipes", { auth: false }).then(function (r) {
    if (!r.ok) { list.innerHTML = UI.html.loadError(r); wireRetry(loadRecipes); return; }
    var recipes = r.data.recipes || [];
    if (!recipes.length) { list.innerHTML = UI.html.empty({ icon: "utensils", title: "暂无菜谱评价", desc: "食堂的菜好不好吃，你来告诉大家。", actions: token ? [{ label: "写评价", icon: "pencil", primary: true, id: "emptyWrite" }] : [{ label: "去登录", href: "login.html" }]); var e = document.getElementById("emptyWrite"); if (e) e.addEventListener("click", openDialog); return; }
    // 排序（后端已按 name NOCASE；前端按拼音稳定化）
    recipes.sort(function (a, b) { return new Intl.Collator("zh-Hans-CN-u-co-pinyin").compare(a.name, b.name) || (a.id - b.id); });
    renderBatch(list, recipes, append);
  });
}

function recipeCard(r) {
  var user = { id: r.user_id, username: r.username };
  return '<article class="card card--flush card--interactive review-card">' +
    (r.image_url ? '<div class="card__media"><img src="' + UI.safeUrl(r.image_url) + '" alt="' + UI.esc(r.name) + '" loading="lazy" decoding="async" data-zoom="' + UI.safeUrl(r.image_url) + '" data-caption="' + UI.esc(r.name) + '"></div>'
                 : '<div class="card__media" style="display:grid;place-items:center;background:var(--h-' + UI.hueFor(r.id) + '-tint);color:var(--h-' + UI.hueFor(r.id) + '-ink)">' + UI.icon('utensils', 'icon--xl') + '</div>') +
    '<div class="review-card__body"><div class="review-card__head"><h2 class="review-card__name">' + UI.esc(r.name) + '</h2>' + UI.stars(r.rating) + '</div>' +
    (r.comment ? '<p class="review-card__text">' + UI.esc(r.comment) + '</p>' : '') + '</div>' +
    '<div class="review-card__foot">' + UI.userLine(user, { size: "xs", meta: UI.timeEl(r.created_at) }) + '</div>' +
  '</article>';
}

// 每周食谱：折叠列表
function loadWeekly(append) {
  var list = document.getElementById("recipeList");
  if (!append) list.innerHTML = UI.html.skeleton("post", 3);
  UI.api("/api/weekly-menu", { auth: false }).then(function (r) {
    if (!r.ok) { list.innerHTML = UI.html.loadError(r); wireRetry(loadWeekly); return; }
    var images = r.data.images || [];
    if (!images.length) { list.innerHTML = UI.html.empty({ icon: "calendar", title: "暂未上传本周食谱", desc: "请等待管理员上传。" }); return; }
    list.innerHTML = '<div class="stack stack--md">' + images.map(weeklyItem).join("") + '</div>';
  });
}

function inRange(item) {
  var today = new Date();
  var iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  return iso >= item.menu_start_date && iso <= item.menu_end_date;
}

function weeklyItem(it) {
  var range = it.menu_start_date === it.menu_end_date ? it.menu_start_date : it.menu_start_date + " ~ " + it.menu_end_date;
  var me = UI.session.user();
  var canDelete = !!(me && (UI.session.isAtLeast("super_admin", me) || (it.user_id !== null && it.user_id !== undefined && String(it.user_id) === String(me.id))));
  return '<div class="collapse' + (inRange(it) ? " is-open" : "") + '">' +
    '<button type="button" class="collapse__trigger" aria-expanded="' + (inRange(it) ? "true" : "false") + '">' +
      '<span class="num">' + UI.esc(range) + '</span>' +
      '<span class="row row--sm">' + (inRange(it) ? '<span class="badge badge--info">本周</span>' : '') + UI.icon('chevron-down', 'collapse__chevron') + '</span>' +
    '</button>' +
    '<div class="collapse__panel"><div class="collapse__inner"><div class="collapse__content stack">' +
      '<img class="weekly-figure" src="' + UI.safeUrl(it.url) + '" alt="每周食谱 ' + UI.esc(range) + '" loading="lazy" decoding="async" data-zoom="' + UI.safeUrl(it.url) + '" data-caption="' + UI.esc(range) + ' · 每周食谱">' +
      '<div class="row row--between"><span class="u-muted u-fs-xs">上传者 ' + UI.esc(it.username || "未知") + ' · ' + UI.timeEl(it.uploaded_at) + '</span>' +
      (canDelete ? '<button type="button" class="btn btn--sm btn--danger-quiet" data-delete-weekly="' + it.id + '">' + UI.icon('trash', 'icon--sm') + '删除</button>' : '') + '</div>' +
    '</div></div></div></div>';
}

// 删除每周图（UI.confirm danger → DELETE /api/admin/weekly-menu/:id → toast + 重载）
// 错误：403 → toast「没有权限删除（仅上传者或超级管理员）」

// 写评价对话框
function openDialog() { if (!token) { UI.toast.warning("请先登录"); setTimeout(UI.goLogin, 900); return; } UI.dialog.open(document.getElementById("reviewDialog")); }
document.getElementById("writeBtn").addEventListener("click", openDialog);
document.getElementById("recipeForm").addEventListener("submit", function (e) {
  e.preventDefault();
  UI.form.clearAll(this);
  var name = document.getElementById("name").value.trim();
  var rating = (document.querySelector('input[name="rating"]:checked') || {}).value || "5";
  var comment = document.getElementById("comment").value.trim();
  if (!name) { UI.form.fieldError(document.getElementById("name"), "请填写菜名"); return; }
  var submit = document.getElementById("recipeSubmit");
  UI.form.busy(submit, true);
  var fd = new FormData();
  fd.append("name", name); fd.append("rating", rating); fd.append("comment", comment);
  var file = UI.upload.get(document.querySelector('#reviewDialog [data-upload]'));
  if (file) fd.append("image", file);
  UI.api("/api/recipes", { method: "POST", form: fd }).then(function (r) {
    UI.form.busy(submit, false);
    if (!r.ok) { UI.toast.error(UI.errorText(r, "发布失败")); return; }
    UI.dialog.close(document.getElementById("reviewDialog"));
    document.getElementById("recipeForm").reset();
    UI.upload.clear(document.querySelector('#reviewDialog [data-upload]'));
    UI.toast.success("已发布");
    loadRecipes(false);
  });
});

UI.ready(function () {
  UI.qsa('[data-counter]').forEach(UI.form.counter);
  UI.qsa('[data-upload]').forEach(function (el) { UI.upload.bind(el); });
  applyDefaultView();
});
```

补齐说明：`renderBatch` = 分批渲染 20 条 + loadMore（同 forum.md 模式：`已显示 X / Y`）；`wireRetry(fn)` = 给 `[data-retry]` 绑重载。删除每周图成功文案「已删除」；确认框「删除这张食谱图片？」/「删除后学生端将不再显示。」/确认按钮「删除」（copy.md §8）。

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| #allBtn / #weeklyBtn | 视图切换 | 同 ID（segmented + aria-selected） | 保留 |
| #publishPanel / #recipeForm / #name / #rating / #comment / #image / #recipeSubmit / #formMsg | 发布面板 | `#reviewDialog`；#rating(select) → 星级 input(name=rating)；#formMsg 删除 | 迁移 |
| #loginHint | 未登录提示 | `callout#loginHint` | 迁移 |
| #recipeList | 列表容器 | 同 ID | 保留 |
| `[data-toggle-weekly] [data-weekly-body] [data-collapse-weekly] [data-delete-weekly] [data-zoom]` | 周食谱交互 | collapse 组件 + `data-delete-weekly` 保留 + `data-zoom` 保留 | 迁移 |
| `.weekly-mode` 类 | 布局切换 | 不需要（weekly 用 stack 布局） | 删除 |
| `.zoom-overlay` 自实现 | 放大 | `UI.viewer` | 删除 |
| `ratingStars()`（★☆ 字符） | 评分 | `UI.stars()` | 替换 |
| `.active` | 切换态 | aria-selected | 替换 |

## 需要修改的脚本行为（要点）

1. 视图切换：publishPanel 不再常驻；写评价按钮隐藏于每周 Tab。
2. 星级输入替代 select（value 默认 5）。
3. 上传走 `UI.upload`（2MB 校验自动化）。
4. 周食谱结构改 `.collapse`（默认展开当日在范围内的项）；删除按钮入折叠内容区（原右上角绝对定位取消）。
5. 放大统一 `UI.viewer`；图片带 data-zoom/data-caption。
6. 排序前端拼音稳定化；分批 20。
7. 默认视图逻辑保留（profile → localStorage → all）。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 加载（两视图） | 首载/切 Tab | card×6 / post×3 骨架 |
| 空（全部） | 0 评价 | empty「暂无菜谱评价」+ 写评价/去登录 |
| 空（每周） | 0 图 | empty「暂未上传本周食谱」 |
| 失败 | 网络 | loadError + 重试 |
| 未登录 | 无 token | callout；写评价按钮仍显示但点击引导登录 |
| 图片失败 | img error | 自动占位 |
| 删除确认 | 点删除 | UI.confirm danger |
| 删除失败 403 | — | toast「没有权限删除（仅上传者或超级管理员）」 |
| 上传超限 | 前端 | upload 内联错误 |
| 限流 | — | 菜谱接口无 429；不适用 |

## 响应式

- 360：卡片网格 1 列（minmax 240→自动）；周图全宽。
- 768：2–3 列；对话框 40rem 居中。
- 评价卡媒体 4:3 裁切（`object-fit:cover`）。

## 边界场景

- 菜名 20 字上限（data-counter）；评论 500。后端无限制 → 前端超限阻止（「菜名不能超过 20 字」）。
- 无图评价 → 占位块（tint 底 + utensils 图标）。
- 同名菜多评价 → 各自成卡（P0；#5 后聚合成目录）。
- rating 0（后端允许 0–5）→ 显示 0 星。
- 周食谱日期串格式异常（后端历史数据）→ 原样显示字符串；`inRange` 比较失败则不标「本周」不自动展开。
- 删除时图片已被删 → 404「图片不存在或已被删除」+ 重载。
- 大图 5MB 内的周图 → lazy + viewer 缩放。

## 无障碍要点

- segmented/tab 语义 + 方向键（UI.tabs 或浏览器原生——segmented 用 aria-selected）；星级 radiogroup（方向键原生）；data-zoom 触发器可聚焦（thumb/collapse 内 img 包在可聚焦元素——img 本身不可聚焦：包一层 `<button type="button" class="thumb" data-zoom=…>`；周食谱大图用 `<button class="weekly-figure …">` 包裹）。
- 删除按钮 aria-label 已有文字「删除」。

## 验收清单

- [ ] 两 Tab 切换 + 默认视图读取（账号/localStorage/回退）。
- [ ] 评价卡：有图/无图/评分/长文截断；点击图进 viewer。
- [ ] 写评价对话框全流程（校验/星级/图片/成功/失败/取消）。
- [ ] 周食谱：当日本周徽标+自动展开；懒加载图；viewer；删除（权限、确认、错误）。
- [ ] 分批加载与计数；空/错/骨架三态。
- [ ] 360/1280 正常；无 alert/confirm/prompt；axe=0。

---

## 与 #5 的衔接（P1，见 dishes.md）

- 「全部菜品」Tab 内容替换为 A–Z 目录 + 搜索（dishes.md）；评价卡网格移入 dish.html 详情页。
- 「写评价」对话框保留，但入口移到菜品详情页（菜名自动带入）。
- 数据：recipes 表增加 `dish_id` 关联（后端）；本页脚本按 `features.dishes` 分支渲染两种形态，P0 代码保留为回退（接口无 dish 数据时自动用评价卡网格）。
