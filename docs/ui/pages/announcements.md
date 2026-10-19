# 更新公告 · announcements.html

## 当前视觉与布局 · 2026-10-17

公告使用 280px 左侧列表与右侧正文，选中项浅绿，无卡片大阴影；手机依次排列。标题上方英文改为「网站动态」，详情切换与管理入口不变。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：现有改版 ｜ 优先级：P0 ｜ issue：#4 ｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：`announce` ｜ 容器：`container`

## 用途与目标

公告列表 + 正文阅读。桌面为左列表（sticky）右正文的主从视图；手机为两步视图（列表 → 详情，用 URL hash `#<公告id>` 深链，浏览器返回键回列表）。

## 布局

```text
桌面 ≥900                              手机 <900
┌──────────────────────────────────┐  ┌──────────────┐
│ 页头                               │  │ 页头          │
│ ┌────────┬─────────────────────┐ │  │ 更新公告      │
│ │更新公告  │ 国庆假期期间的网站维护通知 │ │  │ ┌──────────┐│
│ │────────  │ 发布于 2026-10-01 [最新] │ │  │ │10-01 标题 ││
│ │●10-01 标题│                        │ │  │ │09-30 标题 ││
│ │ 09-30 标题│ 10 月 1 日至…（prose）   │ │  │ └──────────┘│
│ │ 09-24 标题│                        │ │  └──────────────┘
│ └────────┴─────────────────────┘ │  │ 点进详情（is-detail）│
└──────────────────────────────────┘  │ 返回 ← 列表        │
                                       └──────────────┘
```

## HTML 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFFFFF">
<title>更新公告 · 拾光酥糕</title>
<link rel="icon" href="/img/suzhou-high-school-mark.png?v=20261018" type="image/png">
<link rel="stylesheet" href="css/site.css">
</head>
<body data-nav="announce">
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<main id="main" class="main container">
  <div class="page-head">
    <div class="page-head__main">
      <span class="page-head__eyebrow">网站动态</span>
      <h1 class="page-head__title">更新公告</h1>
    </div>
  </div>
  <div id="annRoot" class="master-detail">
    <div class="master-list" id="annList" aria-label="公告列表" aria-busy="true"></div>
    <article class="detail-pane" id="annDetail"></article>
  </div>
</main>
<div id="siteFooter"></div>
<script src="js/ui.js"></script>
<script>
var announcements = [];
var root = document.getElementById("annRoot");
var listEl = document.getElementById("annList");
var detailEl = document.getElementById("annDetail");
var latestDate = "";

UI.api("/api/announcements", { auth: false }).then(function (r) {
  listEl.setAttribute("aria-busy", "false");
  if (!r.ok) { root.innerHTML = UI.html.loadError(r); wireRetry(); return; }
  announcements = r.data.announcements || [];
  if (!announcements.length) {
    root.innerHTML = UI.html.empty({ icon: "megaphone", title: "暂无公告", desc: "有新动态时会第一时间发布在这里。" });
    return;
  }
  latestDate = announcements[0].publish_date;
  listEl.innerHTML = announcements.map(function (a) {
    var isNew = a.publish_date === latestDate;
    return '<button type="button" class="master-item" data-id="' + a.id + '" aria-current="false">' +
      '<span class="master-item__date">' + UI.esc(a.publish_date) + (isNew ? '<span class="tag tag--primary">最新</span>' : '') + '</span>' +
      '<span class="master-item__title">' + UI.esc(a.title) + '</span></button>';
  }).join("");
  listEl.addEventListener("click", function (e) {
    var item = e.target.closest(".master-item");
    if (!item) return;
    selectItem(item.getAttribute("data-id"));
  });
  var wanted = location.hash ? location.hash.slice(1) : String(announcements[0].id);
  selectItem(wanted);
});

function selectItem(id) {
  var found = null;
  for (var i = 0; i < announcements.length; i++) if (String(announcements[i].id) === String(id)) { found = announcements[i]; break; }
  var items = UI.qsa(".master-item", listEl);
  for (var j = 0; j < items.length; j++) items[j].setAttribute("aria-current", String(announcements[j].id) === String(id) ? "true" : "false");
  if (!found) { root.classList.remove("is-detail"); if (window.innerWidth < 900) { /* 无此公告：回列表 */ } return; }
  renderDetail(found);
  history.replaceState(null, "", "#" + found.id);
}

function renderDetail(a) {
  detailEl.innerHTML =
    '<h2 class="detail-pane__title">' + UI.esc(a.title) + '</h2>' +
    '<div class="detail-pane__meta"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-calendar"></use></svg>发布于 ' + UI.esc(a.publish_date) + '</div>' +
    '<div class="prose">' + UI.esc(a.content) + '</div>' +
    (canManage
      ? '<div class="row row--sm u-mt-4"><button type="button" class="btn btn--danger-quiet btn--sm" id="annDelete">' +
        UI.icon('trash', 'icon--sm') + '删除公告</button></div>'
      : '') +
    '<a class="back-link u-hide-desktop" href="announcements.html"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-arrow-left"></use></svg>返回公告列表</a>';
  root.classList.add("is-detail");
  window.scrollTo(0, 0);
}

function wireRetry() {
  var btn = document.querySelector("[data-retry]");
  if (btn) btn.addEventListener("click", function () { location.reload(); });
}
// 手机返回键：监听 hashchange，从详情回列表
window.addEventListener("hashchange", function () {
  if (!location.hash && window.innerWidth < 900) root.classList.remove("is-detail");
});
</script>
</body>
</html>
```

说明（与旧版差异的关键行为）：
- 手机两步导航：`selectItem` 加 `is-detail`；返回键 = 浏览器返回（hash 从 `#id` 变空触发 hashchange 收起详情）。返回列表链接同时提供（`u-hide-desktop`）。
- URL hash 深链：`announcements.html#3` 打开指定公告（旧版无此能力，新增）。
- **打印**：详情区可打印（全局 print 样式已藏按钮/页头）。
- 「最新」标签 = 列表首条（按发布日期倒序的第一条）。
- **删除公告**：进入页面时以 `announcement_publish`（或 `super_admin`）判断 `canManage`；有权用户详情底部显示「删除公告」按钮，`UI.confirm`（危险色）二次确认后 `DELETE /api/admin/announcements/:id`；成功「已删除」、404（`announcement not found`）提示「该公告已不存在，已为你刷新列表」，随后重载列表。
- **空态居中**：无公告时移除 `master-detail` 类再渲染空态，使提示在页面居中。

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| #annList / #annDetail | 列表与详情容器 | 同 ID | 保留 |
| `.ann-item / .ann-item.active / .ann-date / .ann-title` | 列表项 | `.master-item`（aria-current 驱动） | 替换 |
| `.side-title` | 列表标题 | `page-head__title`（页面级标题） | 删除 |
| `.detail h1 / .detail-date / .detail-body` | 详情 | `.detail-pane__title / __meta / .prose` | 替换 |
| `.empty`（旧虚线框） | 空/错 | `UI.html.empty / loadError` | 替换 |

## 需要修改的脚本行为

1. `escapeHtml` → `UI.esc`；`render`/`selectItem` 重写为上文（aria-current 替代 .active）。
2. 列表/详情渲染用 `.master-item`/`.detail-pane` 结构（上文已给）。
3. 空/错/加载用 `UI.html.*`；请求经 `UI.api`（auth: false）。
4. 新增 hash 深链与手机 is-detail 切换（上文脚本已含）。
5. 发布时间显示：直接显示 `publish_date` 字符串（原样）。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 加载中 | 首次 | 列表容器 3 条骨架（`UI.html.skeleton('text',3)` 放入 annList；详情空白） |
| 空数据 | 0 条 | `empty`（megaphone，文案见上） |
| 加载失败 | 网络/500 | `UI.html.loadError(r)` + 重试 |
| 正常（桌面） | ≥900 | 左列表 + 首条详情（或 hash 指定项） |
| 正常（手机） | <900 | 先列表；点开详情 is-detail；返回键/返回链接回列表 |
| hash 无效 | `#999` 不存在 | 忽略 → 显示首条 |
| 单条公告 | 仅 1 条 | 正常显示；「最新」标签显示 |
| 删除公告 | 有权用户点删除 | 危险确认 → 成功「已删除」并重载；404 提示已不存在并刷新 |
| 无删除权限 | 游客/普通用户 | 详情不显示删除按钮 |

## 响应式

- 360：列表全宽；详情全宽；标题 24。
- 768–899：仍是两步（<900）。
- 900：双列；列表 sticky（`top: header+16`）；标题 30。
- 打印：仅详情区（全局 print 隐藏列表？——列表保留亦可；确保正文完整分页 `break-inside`）。

## 边界场景

- 标题/正文超长 → `master-item__title` 两行截断；正文 `.prose` 无限长正常滚动。
- 正文含换行 → `pre-wrap`（`.prose`）。
- 正文含 HTML → esc 后原样显示。
- 公告仅手机进入详情后刷新 → hash 保持，仍显示该详情。
- 两公告同日期 → 按 id 倒序（后端已排）。

## 无障碍要点

- 列表项是 `<button>`（可键盘）；当前项 `aria-current="true"`；`aria-busy` 管理加载态。
- 详情标题 h2（页面 h1 是「更新公告」）；hash 跳转后焦点移动：`detailEl.setAttribute('tabindex','-1'); detailEl.focus()`。

## 验收清单

- [ ] 桌面双列 + sticky 列表；手机两步 + 返回键可用。
- [ ] hash 深链 `#<id>` 直达；无效 hash 回首条。
- [ ] 空/加载失败（含重试）状态正确。
- [ ] 「最新」标签只在首条。
- [ ] 有发布权限者可在详情删除公告（危险确认 + 404 兜底并刷新）；无权限不显示按钮。
- [ ] 无 alert/confirm；零报错；360/900 正常。

> 2026-10-17 共享加载状态修正：本页使用的 `UI.html.skeleton` 已补齐 `role="status"`，保留加载名称与 `aria-busy`，避免加载过程中的无障碍属性违规；外观与业务流程不变。

2026-10-17 精校：公告选中项的日期使用更深的次要文字色，在浅绿选中底上保持可读性；顶栏与按钮采用 UI.md v2.1 的统一尺寸。
