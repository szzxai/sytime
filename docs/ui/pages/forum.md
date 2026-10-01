# 论坛 · forum.html

> 状态：现有改版 ｜ 优先级：P0 ｜ issue：#4（#9/#10 落地时增量）｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：`forum` ｜ 容器：`container--prose`

## 用途与目标

讨论/提问两个分类的帖子流；发帖改为对话框；行内展开回复；点赞乐观更新；删除入口从右键菜单改为 ⋯ 菜单；未登录全程可浏览。

## 布局

```text
手机 360                        桌面 1280
┌──────────────────┐    ┌──────────────────────────────────┐
│ 页头               │    │ 页头                               │
│ [讨论|提问] [发帖+] │    │ ┌─segmented─┐        [发布帖子+]   │
│ ┌──────────────┐ │    │ ┌──────────────────────────────┐ │
│ │林 头衔 讨论 ⋯  │ │    │ │林 三元坊老饕  3 小时前  讨论  ⋯ │ │
│ │标题…           │ │    │ │ 食堂二楼新开的面档…             │ │
│ │摘要 3 行…      │ │    │ │ 摘要 3 行…                     │ │
│ │赞12  评5       │ │    │ │ 赞12   评5                      │ │
│ └──────────────┘ │    │ └──────────────────────────────┘ │
│ …                │    │ …                                │
│ [加载更多]        │    └──────────────────────────────────┘
└──────────────────┘    发帖 = dialog--sheet dialog--wide
```

## HTML 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F5F3EE">
<title>论坛 · 校园信息网</title>
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/site.css">
</head>
<body data-nav="forum">
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<main id="main" class="main container container--prose">
  <div class="page-head">
    <div class="page-head__main">
      <span class="page-head__eyebrow">Forum</span>
      <h1 class="page-head__title">论坛</h1>
    </div>
    <div class="page-head__actions">
      <button type="button" class="btn btn--primary" id="newPostBtn"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-plus"></use></svg>发布帖子</button>
    </div>
  </div>

  <div class="segmented" role="tablist" aria-label="分类" style="margin-bottom:var(--sp-5)">
    <button type="button" class="segmented__item" role="tab" id="discussBtn" data-cat="讨论" aria-selected="true">讨论</button>
    <button type="button" class="segmented__item" role="tab" id="questionBtn" data-cat="提问" aria-selected="false">提问</button>
  </div>

  <div class="callout" id="loginHint" hidden>
    <span class="callout__text">登录后才能发布帖子、点赞和回复。</span>
    <span class="callout__actions"><a class="btn btn--sm" href="login.html">登录</a><a class="btn btn--primary btn--sm" href="register.html">注册</a></span>
  </div>

  <div class="stack stack--md" id="postList" aria-live="polite"></div>
  <div class="load-more" id="loadMore" hidden><button type="button" class="btn" id="moreBtn">加载更多</button><span id="moreInfo"></span></div>

  <dialog class="dialog dialog--sheet dialog--wide" id="postDialog" aria-labelledby="postDialog-t">
    <form class="dialog__form" id="postForm" method="dialog" novalidate>
      <div class="dialog__head">
        <h2 class="dialog__title" id="postDialog-t">发布帖子</h2>
        <button type="button" class="icon-btn icon-btn--sm" data-dialog-close aria-label="关闭"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-close"></use></svg></button>
      </div>
      <div class="dialog__body">
        <div class="field">
          <label class="field__label" for="title">标题</label>
          <input class="input" id="title" type="text" required data-counter="50" enterkeyhint="next">
          <div class="field__foot"><span class="field__hint"></span><span class="field__counter"></span></div>
        </div>
        <div class="field">
          <label class="field__label" for="category">分类</label>
          <select class="select" id="category"><option value="讨论">讨论</option><option value="提问">提问</option></select>
        </div>
        <div class="field">
          <label class="field__label" for="content">内容</label>
          <textarea class="textarea" id="content" required data-counter="2000"></textarea>
          <div class="field__foot"><span class="field__hint">支持换行</span><span class="field__counter"></span></div>
        </div>
      </div>
      <div class="dialog__foot">
        <button type="button" class="btn" data-dialog-close>取消</button>
        <button type="submit" class="btn btn--primary" id="postSubmit">发布</button>
      </div>
    </form>
  </dialog>
</main>
<div id="siteFooter"></div>
<script src="js/ui.js"></script>
<script src="forum.page.js"></script>
</body>
</html>
```

（`forum.page.js` 即下文页面脚本；也可内联。）

页面脚本（完整，替换旧脚本）：

```js
var token = UI.session.token();
var currentCategory = "讨论";
var PAGE_SIZE = UI.config.pageSize;
var listEl = document.getElementById("postList");
var loadMore = document.getElementById("loadMore");
var moreBtn = document.getElementById("moreBtn");
var moreInfo = document.getElementById("moreInfo");
var controller = null;

function postHtml(p) {
  var user = { id: p.user_id, username: p.username, nickname: p.nickname, role: p.role, avatar_url: p.avatar_url, title: p.title };
  var canDelete = !!(UI.session.user() && (UI.session.isAtLeast("admin") || String((UI.session.user() || {}).id) === String(p.user_id)));
  return '<article class="card card--interactive post" data-post-id="' + p.id + '" data-user-id="' + p.user_id + '">' +
    '<header class="post__head">' +
      UI.userLine(user, { meta: UI.timeEl(p.created_at) }) +
      '<span class="tag tag--primary">' + UI.esc(p.category) + '</span>' +
      (canDelete
        ? '<div class="menu card__action" data-menu><button type="button" class="icon-btn icon-btn--sm" data-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">' + UI.icon('more') + '</button>' +
          '<div class="menu__panel" role="menu" hidden><button type="button" class="menu__item menu__item--danger" role="menuitem" data-delete>' + UI.icon('trash') + '删除帖子</button></div></div>'
        : '') +
    '</header>' +
    '<h2 class="post__title"><a class="card__link" href="post.html?id=' + p.id + '">' + UI.esc(p.title) + '</a></h2>' +
    (p.content ? '<p class="post__excerpt">' + UI.esc(p.content) + '</p>' : '') +
    '<footer class="post__foot">' +
      '<button type="button" class="action-btn card__action" aria-pressed="' + (p.is_liked ? "true" : "false") + '" data-like>' + UI.icon('heart') + '<span data-like-count>' + (p.like_count || 0) + '</span></button>' +
      '<button type="button" class="action-btn card__action" aria-expanded="false" data-replies-toggle>' + UI.icon('message') + '<span data-reply-count>' + (p.reply_count || 0) + '</span></button>' +
    '</footer>' +
    '<div class="post__replies" data-replies hidden></div>' +
  '</article>';
}

function loadPosts(append) {
  if (controller) controller.abort();
  controller = new AbortController();
  if (!append) {
    listEl.innerHTML = UI.html.skeleton("post", 3);
    loadMore.hidden = true;
  }
  UI.api("/api/forum/posts?category=" + encodeURIComponent(currentCategory), { auth: !!token, signal: controller.signal }).then(function (r) {
    if (r.aborted) return;
    if (!r.ok) { listEl.innerHTML = UI.html.loadError(r); wireRetry(); return; }
    var posts = r.data.posts || [];
    if (!posts.length) {
      listEl.innerHTML = UI.html.empty({ icon: "message", title: "还没有帖子", desc: "来发第一帖吧，分享一下你在校园里的发现。", actions: token ? [{ label: "发布帖子", icon: "plus", primary: true, id: "emptyNew" }] : [{ label: "去登录", href: "login.html" }] });
      var en = document.getElementById("emptyNew");
      if (en) en.addEventListener("click", function () { openDialog(); });
      return;
    }
    var shown = append ? UI.qsa(".post", listEl).length : 0;
    var batch = posts.slice(shown, shown + PAGE_SIZE);
    if (append) listEl.insertAdjacentHTML("beforeend", batch.map(postHtml).join(""));
    else listEl.innerHTML = batch.map(postHtml).join("");
    loadMore.hidden = posts.length <= shown + batch.length;
    moreInfo.textContent = "已显示 " + Math.min(posts.length, shown + batch.length) + " / " + posts.length;
  });
}
function wireRetry() {
  var b = document.querySelector("#postList [data-retry]");
  if (b) b.addEventListener("click", function () { loadPosts(false); });
}

// 分类切换
document.getElementById("discussBtn").addEventListener("click", function () { setCategory("讨论"); });
document.getElementById("questionBtn").addEventListener("click", function () { setCategory("提问"); });
function setCategory(cat) {
  currentCategory = cat;
  document.getElementById("discussBtn").setAttribute("aria-selected", cat === "讨论" ? "true" : "false");
  document.getElementById("questionBtn").setAttribute("aria-selected", cat === "提问" ? "true" : "false");
  loadPosts(false);
}

// 发帖对话框
var postDialog = document.getElementById("postDialog");
function openDialog() {
  document.getElementById("category").value = currentCategory;
  UI.dialog.open(postDialog);
}
document.getElementById("newPostBtn").addEventListener("click", function () {
  if (!token) { UI.toast.warning("请先登录"); setTimeout(UI.goLogin, 900); return; }
  openDialog();
});
UI.ready(function () { UI.qsa('[data-counter]').forEach(UI.form.counter); });

document.getElementById("postForm").addEventListener("submit", function (e) {
  e.preventDefault();
  UI.form.clearAll(postDialog);
  var category = document.getElementById("category").value;
  var title = document.getElementById("title").value.trim();
  var content = document.getElementById("content").value.trim();
  var bad = null;
  if (!title) bad = ["title", "标题不能为空"];
  else if (!content) bad = ["content", "内容不能为空"];
  if (bad) { UI.form.fieldError(document.getElementById(bad[0]), bad[1]); UI.form.focusFirstInvalid(postDialog); return; }
  var submit = document.getElementById("postSubmit");
  UI.form.busy(submit, true);
  UI.api("/api/forum/posts", { method: "POST", body: { category: category, title: title, content: content } }).then(function (r) {
    UI.form.busy(submit, false);
    if (!r.ok) { UI.toast.error(UI.errorText(r, "发布失败")); return; }
    UI.dialog.close(postDialog);
    document.getElementById("postForm").reset();
    UI.qsa(".field__counter", postDialog).forEach(function (c) { c.textContent = "0 / " + c.textContent.split(" / ")[1]; });
    UI.toast.success("已发布");
    setCategory(category);   // 发布后切到该分类并刷新
  });
});

// 列表事件委托：点赞 / 回复展开 / 回复提交 / 删除
listEl.addEventListener("click", function (e) {
  var post = e.target.closest(".post");
  if (!post) return;
  var like = e.target.closest("[data-like]");
  if (like) { toggleLike(post); return; }
  var rt = e.target.closest("[data-replies-toggle]");
  if (rt) { toggleReplies(post); return; }
  var rs = e.target.closest("[data-reply-submit]");
  if (rs) { submitReply(post); return; }
});

function toggleLike(post) {
  if (!token) { UI.toast.warning("请先登录"); return; }
  var btn = post.querySelector("[data-like]");
  var count = post.querySelector("[data-like-count]");
  var liked = btn.getAttribute("aria-pressed") === "true";
  btn.disabled = true;
  // 乐观更新
  var next = Number(count.textContent) + (liked ? -1 : 1);
  count.textContent = String(Math.max(0, next));
  btn.setAttribute("aria-pressed", liked ? "false" : "true");
  btn.classList.add("is-popping");
  setTimeout(function () { btn.classList.remove("is-popping"); }, 350);
  UI.api("/api/forum/posts/" + post.getAttribute("data-post-id") + "/like", { method: liked ? "DELETE" : "POST" }).then(function (r) {
    btn.disabled = false;
    if (!r.ok) {
      // 回滚
      count.textContent = String(Number(count.textContent) + (liked ? 1 : -1));
      btn.setAttribute("aria-pressed", liked ? "true" : "false");
      UI.toast.error(UI.errorText(r));
      return;
    }
    if (r.data && typeof r.data.like_count === "number") count.textContent = String(r.data.like_count);
  });
}

function toggleReplies(post) {
  var box = post.querySelector("[data-replies]");
  var btn = post.querySelector("[data-replies-toggle]");
  var willShow = box.hidden;
  box.hidden = !willShow;
  btn.setAttribute("aria-expanded", willShow ? "true" : "false");
  if (willShow && !post.getAttribute("data-replies-loaded")) {
    post.setAttribute("data-replies-loaded", "1");
    loadReplies(post);
  }
}

function loadReplies(post) {
  var box = post.querySelector("[data-replies]");
  var id = post.getAttribute("data-post-id");
  box.innerHTML = UI.html.skeleton("row", 2);
  UI.api("/api/forum/posts/" + id + "/replies", { auth: false }).then(function (r) {
    if (!r.ok) { box.innerHTML = UI.html.loadError(r); var b = box.querySelector("[data-retry]"); if (b) b.addEventListener("click", function () { loadReplies(post); }); return; }
    var replies = r.data.replies || [];
    var html = replies.length
      ? '<ul class="reply-list">' + replies.map(function (r2, i) {
          var u = { id: r2.user_id, username: r2.username, nickname: r2.nickname, role: r2.role, avatar_url: r2.avatar_url, title: r2.title };
          return '<li class="reply" id="reply-' + r2.id + '">' +
            '<span class="avatar avatar--sm" data-hue="' + UI.hueFor(r2.user_id) + '">' + UI.esc(((r2.nickname || r2.username || "?").trim()[0] || "?").toUpperCase()) + '</span>' +
            '<div class="reply__body"><div class="reply__meta"><span class="user-line__name">' + UI.esc(r2.nickname || r2.username || "已注销用户") + '</span>' + (r2.title ? UI.titleBadge(r2.title) : "") + (r2.role ? UI.roleTag(r2.role) : "") + '<span>' + UI.timeEl(r2.created_at) + '</span><span class="reply__floor">' + (i + 1) + ' 楼</span></div>' +
            '<div class="reply__content">' + UI.esc(r2.content) + '</div></div></li>';
        }).join("") + '</ul>'
      : '<div class="u-muted u-fs-sm">还没有回复</div>';
    box.innerHTML = html + replyFormHtml();
    var input = box.querySelector("[data-reply-input]");
    var counter = box.querySelector(".field__counter");
    input.addEventListener("input", function () { counter.textContent = input.value.length + " / 1000"; counter.classList.toggle("is-over", input.value.length > 1000); });
  });
}

function replyFormHtml() {
  if (!token) return '<div class="callout"><span class="callout__text">登录后才能回复。</span><span class="callout__actions"><a class="btn btn--sm" href="login.html">登录</a></span></div>';
  return '<form class="composer"><textarea class="textarea" data-reply-input placeholder="写下你的回复…" data-counter="1000"></textarea>' +
    '<div class="composer__foot"><span class="field__counter">0 / 1000</span>' +
    '<button type="button" class="btn btn--primary btn--sm" data-reply-submit>发布回复</button></div></form>';
}

function submitReply(post) {
  var input = post.querySelector("[data-reply-input]");
  var btn = post.querySelector("[data-reply-submit]");
  var counter = post.querySelector(".composer .field__counter");
  var content = input.value.trim();
  if (!content) { UI.toast.warning("回复内容不能为空"); input.focus(); return; }
  UI.form.busy(btn, true);
  UI.api("/api/forum/posts/" + post.getAttribute("data-post-id") + "/replies", { method: "POST", body: { content: content } }).then(function (r) {
    UI.form.busy(btn, false);
    if (!r.ok) { UI.toast.error(UI.errorText(r, "发布失败")); return; }
    input.value = ""; counter.textContent = "0 / 1000";
    UI.toast.success("已发布回复");
    loadReplies(post);
    var c = post.querySelector("[data-reply-count]");
    c.textContent = String(Number(c.textContent) + 1);
  });
}

// 删除（⋯ 菜单 → UI.confirm）
listEl.addEventListener("click", function (e) {
  var del = e.target.closest("[data-delete]");
  if (!del) return;
  var post = del.closest(".post");
  UI.confirm({ title: "删除这条帖子？", message: "帖子及其回复、点赞将一并删除，无法恢复。", confirmText: "删除", danger: true }).then(function (ok) {
    if (!ok) return;
    UI.api("/api/forum/posts/" + post.getAttribute("data-post-id"), { method: "DELETE" }).then(function (r) {
      if (!r.ok) { UI.toast.error(UI.errorText(r, "删除失败")); return; }
      UI.toast.success("已删除");
      loadPosts(false);
    });
  });
});

if (!token) document.getElementById("loginHint").hidden = false;
UI.ready(function () { setCategory("讨论"); });
```

补充规则：
- 未登录点击「发布帖子」：toast「请先登录」+ 0.9s 后 `UI.goLogin()`（把 `UI.goLoginSoon` 定义为 `setTimeout(function(){UI.goLogin();},900)`；上文占位可删，直接写 `setTimeout(UI.goLogin, 900)`）。
- 空状态的「发布帖子」按钮与 page-head 主按钮同行为。
- 后端字段缺口：`/api/forum/posts` 现只返回 `username`，无 nickname/avatar/role/title。**回退**：`nickname || username`、头像按 `UI.hueFor(user_id)` 首字占位、不渲染 roleTag/titleBadge。**数据契约（需后端补充，P1）**：帖子与回复增加 `nickname`、`avatar_url`、`role`、`title`（含 `title.hue/name`）。缺字段时界面必须如常显示（上文模板已兼容）。

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| #discussBtn / #questionBtn | 分类切换 | 同 ID（segmented + aria-selected） | 保留 |
| #newPostBtn | 打开发帖 | 同 ID（未登录 toast+跳登录；不再显示 loginHint 的替代——callout 常显） | 保留 |
| #publishPanel / #collapsePostBtn / #postForm / #title / #category / #content / #postSubmit / #formMsg | 发帖面板 | `#postDialog`（dialog--sheet）内同 ID；#formMsg 删除 | 迁移 |
| #loginHint | 未登录提示 | `callout#loginHint`（hidden 属性） | 迁移 |
| #postList | 列表容器 | 同 ID（stack） | 保留 |
| `[data-post-id] [data-user-id] [data-like-toggle] [data-like-count] [data-replies-toggle] [data-replies] [data-replies-loaded] [data-reply-count] [data-reply-input] [data-reply-list] [data-reply-msg] [data-reply-submit]` | 卡片内交互 | `data-like`(原 like-toggle)、`data-replies`(hidden 属性)、`data-reply-input/submit/count` 保留；`data-replies-loaded` 保留；`data-reply-list`→`[data-replies]` 内部直渲染；`data-reply-msg` 删除（toast） | 迁移 |
| `.ctx-menu` / contextmenu 事件 | 右键删除 | `⋯ menu` + `UI.confirm` | 替换（删除 ctx-menu 代码） |
| `formatTime / escapeHtml` | 工具 | `UI.timeEl / UI.esc` | 替换 |
| `.active` 类 | 切换态 | `aria-selected / aria-pressed / aria-expanded` | 替换 |

## 需要修改的脚本行为（旧 → 新 速查）

| 旧 | 新 |
| --- | --- |
| `alert("请先登录")` | `UI.toast.warning("请先登录")` + 未登录点赞不跳转 |
| `confirm("确定要删除这条帖子吗？")` | `UI.confirm({…, danger:true})` |
| `list.innerHTML = '<div class="empty">加载中…</div>'` | `UI.html.skeleton("post", 3)` |
| `.empty` 文案块 | `UI.html.empty({...})` |
| 点赞同步更新 | 乐观更新 + 失败回滚（上文） |
| 回复数本地 +1 | 保留 + `loadReplies` 重载 |
| fetch 无超时/竞态 | `AbortController`（切分类/重载时取消旧请求） |
| `token ? headers : undefined` | `UI.api(path, {auth: !!token})` |

## 状态矩阵

| 状态 | 触发 | 界面与文案 |
| --- | --- | --- |
| 加载 | 切分类/首载 | 3 张骨架；loadMore 隐藏 |
| 空列表 | 0 帖 | empty「还没有帖子」+ 动作（登录态决定） |
| 加载失败 | 网络/5xx | loadError + 重试 |
| 正常 | 有帖 | 帖子卡流 |
| 未登录 | 无 token | callout 常显；点赞→toast「请先登录」；回复区显示登录 callout |
| 发帖对话框 | 点发布 | dialog--sheet/wide；焦点在标题 |
| 发帖校验失败 | 空/超限 | 字段内联错误 + 聚焦 |
| 发布成功 | 201 | 关闭 + toast「已发布」+ 列表刷新 |
| 点赞成功 | 200 | 数字与心形即时更新（弹跳） |
| 点赞失败 | 4xx | 回滚 + toast |
| 重复点赞 | 400 已点赞 | 回滚 + toast「你已经点过赞了」（正常操作不会出现） |
| 回复成功 | 201 | 输入清空 + toast「已发布回复」+ 列表重载 + 计数 +1 |
| 删除成功 | 200 | toast「已删除」+ 刷新 |
| 删除失败 | 403 | toast「你没有权限执行此操作」 |
| 离线 | status 0 | loadError/toast 网络文案 |

## 响应式

- 360：卡片全宽；segmented 占半宽；发布按钮在 page-head 右侧（`page-head__actions` 换行到标题下）；⋯ 菜单右对齐（`menu__panel` 默认 right）。
- 768：720 阅读列；帖子卡留白加大。
- 桌面：同结构；`post__replies` 展开更宽松。

## 边界场景

- 标题 50 字上限（data-counter）+ 后端不限制 → 前端超限阻止提交（「标题不能超过 50 字」）；内容 2000（软限制，超限阻止并提示）。
- 内容只有换行 → trim 后为空 → 校验拦。
- 连续点赞（点击后 disabled 至响应）→ 无重复。
- 删除时帖子已被他人删除 → 404 → toast「帖子不存在或已被删除」+ 刷新。
- 展开回复时断网 → 回复区 loadError + 重试。
- 帖子 content 为空（理论上不允许）→ 不渲染摘要行。
- 分类值非法（手改 URL 无入口）→ 不可达（按钮固定两值）。
- ⋯ 菜单在手机上贴近屏幕右缘 → `menu__panel` 默认右对齐且不溢出（min-width 200 < 360）。

## 无障碍要点

- 帖子标题是 h2（页面 h1=论坛）；卡内链接可聚焦；点赞/回复按钮有 aria-pressed/aria-expanded；⋯ 有 aria-label；回复输入框计数器与 1000 上限同步；骨架 aria-busy；列表容器 `aria-live="polite"`（新帖追加播报）。
- 回复楼层号「N 楼」为纯视觉，读屏可忽略。

## 验收清单

- [ ] 两分类切换 + 骨架 + 空态 + 错误重试。
- [ ] 未登录：可浏览；点赞/回复/发帖均给出登录引导（callout/toast）。
- [ ] 发帖对话框全流程（校验、busy、成功、失败、取消、Esc）。
- [ ] 点赞乐观更新 + 失败回滚 + 弹跳动画。
- [ ] 回复展开/收起 + 逐楼渲染 + 回复发布。
- [ ] 作者/管理员有 ⋯ 菜单 → UI.confirm → 删除成功/失败文案正确；其他人无菜单。
- [ ] 加载更多：20/批，计数正确，到底显示「已显示全部」。
- [ ] XSS 测试：发 `<img src=x onerror=alert(1)>` 原样显示不执行。
- [ ] 360/1280 无横向滚动；axe=0；控制台零报错。
