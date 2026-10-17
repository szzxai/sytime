# 管理后台 · admin.html

> 状态：现有改版（P0），#9「发送系统通知」、#10「头衔管理」增量（P1）｜ issue：#4、#9、#10 ｜ 依赖：阶段 0 ｜ 壳：**应用**（`data-shell="app"`，无页脚）｜ data-nav：无 ｜ 容器：`container--wide` + `.shell`

## 用途与目标

按权限过滤的管理面板集合。侧栏分组：**内容**（编辑横幅 / 更新公告 / 每周菜谱管理）、**审核**（学生认证审核 / 申诉处理 / 工单管理）、**用户**（用户管理 / 邀请码设置）；待办计数用红胶囊（原红点废弃）。#9/#10 增面板（入口本文给出，规格见 inbox.md / titles.md）。手机侧栏为吸顶横条。

## 权限矩阵（保留现有 PANEL_PERMS 逻辑）

| 面板 | 权限 | 默认最低角色 |
| --- | --- | --- |
| banner | banner_edit | super_admin |
| announce | announcement_publish | super_admin |
| review | student_review | super_admin |
| invite | invite_manage | super_admin |
| weekly | weekly_menu_upload | admin |
| users | user_manage | super_admin |
| appeals | ban_appeal_review | super_admin |
| tickets | ticket_manage | admin |
| menu（#5） | 无可转授的特殊权限；核对当前 role/status | 仅 active developer |
| notify（#9 新） | announcement_publish | super_admin |
| titles-mgmt（#10 新） | title_manage | super_admin |

无任何面板权限（角色 <admin 且无显式权限）→ 整页 `empty--lock`「暂无权限访问管理后台」+「返回首页」。

## 菜单自动同步（#5 当前实现）

系统分组新增 `admin.html#menu`，仅正常状态 developer 可见。服务端每次读取当前账号角色与封禁状态，旧 JWT 或其他特殊权限不能绕过。

提供商为 OpenRouter / OpenAI 兼容接口；自定义 HTTPS Base URL 仅在兼容接口时出现。API Key 是密码输入，显示服务器掩码，提交后清空，不写入浏览器存储。空输入保留旧 Key，删除使用确认对话框，删除时关闭同步并停止当前任务与模型测试。

开发者先保存、再测试已保存配置，测试真实生成图片和八字段 JSON 后才能开启。每日时间为可编辑 time 输入，默认 08:00、北京时间固定。显示下一次执行时间；时间修改不触发立即补跑、不停止任务、不使测试失效。

任务区提供立即同步、刷新、运行阶段及逐篇数量。运行中可停止；结束后可重试失败菜单。详情对话框支持带认证的原图获取与放大、JSON/诊断下载；失败篇目可选择一至六张完整菜单图片补充重试。状态和错误使用中文文案，网络失败有重试，重复保存有提交状态。

前端钩子及交互在 `public/js/pages/menu-admin.js`，配置和接口说明见 [菜单同步运维](../../menu-sync.md)。测试使用临时数据，360px/1280px 检查配置表单、任务详情及无障碍。

## 布局

```text
桌面 ≥900                                手机 <900
┌─────────────────────────────────────┐ ┌──────────────────────────┐
│ 页头（应用壳）                          │ │ 页头                       │
│ ┌────────┬────────────────────────┐ │ │ [横幅|公告|认证|申诉|工单|…]横条 │
│ │管理后台  │ 学生认证审核              │ │ │ ┌──────────────────────┐ │
│ │ 内容    │ 共 3 条待审核申请          │ │ │ │队列卡…                │ │
│ │ 编辑横幅 │ ┌────────────────────┐ │ │ │ └──────────────────────┘ │
│ │ 更新公告 │ │林小满   [通过] [拒绝]│ │ │ └──────────────────────────┘
│ │ 每周菜谱 │ │新生号… 班级…        │ │ │
│ │ 审核    │ └────────────────────┘ │ │
│ │ 认证 (3) │ …                     │ │
│ │ 申诉     │                        │ │
│ │ 工单 (12)│                        │ │
│ │ 用户    │                        │ │
│ │ 用户管理 │                        │ │
│ │ 邀请码   │                        │ │
│ └────────┴────────────────────────┘ │
└─────────────────────────────────────┘
```

## HTML 骨架（结构级）

```html
<body data-shell="app">
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<main id="main" class="main container container--wide" style="padding-top:0">
  <div class="shell" style="align-items:start">
    <nav class="side-nav" aria-label="后台分类" id="adminNav">
      <span class="side-nav__group">内容</span>
      <button type="button" class="side-nav__item" data-panel="banner"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-megaphone"></use></svg>编辑横幅</button>
      <button type="button" class="side-nav__item" data-panel="announce"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-mail"></use></svg>更新公告</button>
      <button type="button" class="side-nav__item" data-panel="weekly"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-utensils"></use></svg>每周菜谱管理</button>
      <span class="side-nav__group">审核</span>
      <button type="button" class="side-nav__item" data-panel="review"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-graduation"></use></svg>学生认证审核<span class="side-nav__count" data-count="review" hidden></span></button>
      <button type="button" class="side-nav__item" data-panel="appeals"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-shield"></use></svg>申诉处理<span class="side-nav__count" data-count="appeals" hidden></span></button>
      <button type="button" class="side-nav__item" data-panel="tickets"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-clipboard"></use></svg>工单管理<span class="side-nav__count" data-count="tickets" hidden></span></button>
      <span class="side-nav__group">用户</span>
      <button type="button" class="side-nav__item" data-panel="users"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-users"></use></svg>用户管理</button>
      <button type="button" class="side-nav__item" data-panel="invite"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-tag"></use></svg>邀请码设置</button>
      <!-- P1：<button data-panel="notify">发送系统通知</button>（features.inbox）；<button data-panel="titles">头衔管理</button>（features.titles） -->
    </nav>

    <div class="shell__main">
      <section class="view is-active" id="view-banner">…</section>
      …每面板一个 .view（hidden）…
      <div id="denyBox" hidden></div>   <!-- 无权限整页 -->
    </div>
  </div>
</main>
<!-- 四个对话框：#banModal #rejectModal #permsModal #ticketModal（结构见各面板） -->
<script src="js/ui.js"></script>
<script src="admin.page.js"></script>
</body>
</html>
```

侧栏是 `<button>`（面板切换不是链接）；`data-count` 计数由 `refreshCounts()` 填充（>99 显示 99+，0 隐藏）。**横幅/公告文本输入**上限：横幅 100（data-counter）、公告标题 60、正文 2000（软限制，UI 提示）。

## 面板 1 · 编辑横幅（#view-banner）

```html
<h1 class="page-head__title" style="font-size:var(--fs-2xl)">编辑横幅</h1>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">全站横幅</h2><p class="panel__desc">显示在每个页面顶部，留空则不显示。</p></div>
  <div class="panel__body">
    <div class="field"><label class="field__label" for="bannerInput">横幅文本</label><input class="input" id="bannerInput" data-counter="100" placeholder="例如：国庆假期期间网站可能短暂维护"></div>
  </div>
  <div class="panel__foot"><span class="status-text" id="bannerMsg"></span><span class="row row--sm"><button type="button" class="btn" id="bannerClear">取消横幅</button><button type="button" class="btn btn--primary" id="bannerSubmit">确认修改</button></span></div>
</div>
```
行为：修改/取消都要 `UI.confirm`（copy.md §8 文案）→ PUT → toast「横幅已更新，刷新页面即可看到」/「横幅已取消，全站不再显示横幅」；403 → toast「无权限（需要开发者 / 超级管理员）」（**原英文 developer/super_admin 改中文**）。初值从 `GET /api/settings/banner` 读。

## 面板 2 · 更新公告（#view-announce）

```html
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">发布公告</h2></div>
  <div class="panel__body">
    <div class="field"><label class="field__label" for="annTitle">公告标题</label><input class="input" id="annTitle" data-counter="60"></div>
    <div class="field"><label class="field__label" for="annContent">公告内容</label><textarea class="textarea" id="annContent" data-counter="2000" style="min-height:12rem"></textarea></div>
  </div>
  <div class="panel__foot"><span class="status-text" id="annMsg"></span><button type="button" class="btn btn--primary" id="annSubmit">发布公告</button></div>
</div>
<h2 class="section__title u-mt-6 u-mb-4">已发布公告</h2>
<div id="annList" class="queue-list" aria-live="polite"></div>
```
校验：标题/内容空 → 内联；成功 toast「公告已发布」+ 清空，并刷新下方列表。
列表：`GET /api/announcements` 倒序；每条显示标题、发布日期与内容摘要，删除按钮 `data-delete-announce` 经确认后 `DELETE /api/admin/announcements/:id` 并刷新。

## 面板 3 · 学生认证审核（#view-review）

```html
<h1 …>学生认证审核</h1>
<div id="reviewList" class="queue-list" aria-live="polite"></div>
```
队列项（queue-item 结构）：

```js
function reviewItem(a) {
  return '<article class="card queue-item" data-id="' + a.id + '">' +
    '<div class="queue-item__main"><div class="queue-item__title">' + UI.esc(a.real_name) + '</div>' +
    '<div class="queue-item__fields"><span><b>新生号</b>' + UI.esc(a.student_id) + '</span><span><b>班级</b>' + UI.esc(a.class_name) + '</span>' +
    (a.extra_info ? '<span><b>补充信息</b>' + UI.esc(a.extra_info) + '</span>' : '') + '</div>' +
    '<div class="queue-item__meta">提交人 ' + UI.esc(a.username || ("用户#" + a.user_id)) + ' · ' + UI.timeEl(a.created_at) + '</div></div>' +
    '<div class="queue-item__actions"><button type="button" class="btn btn--primary btn--sm" data-approve="' + a.id + '">' + UI.icon('check', 'icon--sm') + '通过</button>' +
    '<button type="button" class="btn btn--sm" data-reject="' + a.id + '">拒绝</button></div></article>';
}
```
- 通过：busy → PUT approve → toast「已通过」→ 移除该项 + refreshCounts；403 toast「无权限（需要开发者 / 超级管理员）」。
- 拒绝：`#rejectModal`（dialog--sheet）：拒绝原因（选填，input）→ 确认拒绝（btn--danger? 否——拒绝不是高危，用 primary；标题「拒绝学生认证」；确认按钮「确认拒绝」）→ 成功 toast「已拒绝」→ 移除 + counts。
- 空态：`empty`（check-circle，暂无待审核申请 / 全部处理完毕。）。

## 面板 4 · 邀请码设置（#view-invite）

```html
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">添加邀请码</h2><p class="panel__desc">学生认证时填入有效邀请码可直接通过；次数用完后该邀请码失效。</p></div>
  <div class="panel__body">
    <div class="form-grid form-grid--2">
      <div class="field"><label class="field__label" for="inviteCodeInput">邀请码</label><input class="input" id="inviteCodeInput" placeholder="例如 SZZX2026"></div>
      <div class="field"><label class="field__label" for="inviteMaxInput">可用次数</label><div class="input-group"><input class="input input--unit" id="inviteMaxInput" type="number" min="0" step="1" value="0"><span class="input-group__unit">0 为不限</span></div></div>
    </div>
  </div>
  <div class="panel__foot"><span class="status-text" id="inviteMsg"></span><button type="button" class="btn btn--primary" id="inviteAdd">添加</button></div>
</div>
<h2 …>已有邀请码</h2>
<div id="inviteList" class="queue-list" aria-live="polite"></div>
```
列表项：`card queue-item`：code（mono 加粗）+ `已用 N / M`（M=不限 时「已用 N / 不限」）+ 右侧「删除」（btn--sm btn--danger-quiet → UI.confirm「删除该邀请码吗？」…「删除」）→ 成功 toast「已删除」+ 重载。空态「暂无邀请码」。409「该邀请码已存在」toast。

## 面板 5 · 每周菜谱管理（#view-weekly）

```html
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">上传菜谱图片</h2><p class="panel__desc">一张图覆盖一个日期范围，学生端按范围折叠展示。</p></div>
  <div class="panel__body">
    <div class="form-grid form-grid--2">
      <div class="field"><label class="field__label" for="weeklyStart">第一天</label><input class="input" type="date" id="weeklyStart"></div>
      <div class="field"><label class="field__label" for="weeklyEnd">最后一天</label><input class="input" type="date" id="weeklyEnd"></div>
    </div>
    <button type="button" class="btn" id="weeklyChoose"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-upload"></use></svg>选择图片并上传</button>
    <input type="file" id="weeklyFile" accept="image/jpeg,image/png" class="u-hidden">
    <div id="weeklyPreview" hidden>
      <div class="upload-preview"><img class="upload-preview__img" id="weeklyPreviewImg" alt="预览"><div class="upload-preview__meta"><div class="upload-preview__name" id="weeklyPreviewName"></div><div class="upload-preview__size" id="weeklyPreviewSize"></div></div></div>
      <div class="row row--sm" style="margin-top:var(--sp-3)"><button type="button" class="btn btn--primary" id="weeklyConfirm">确认上传</button><button type="button" class="btn" id="weeklyCancel">取消</button></div>
    </div>
  </div>
  <div class="panel__foot"><span class="status-text" id="weeklyMsg"></span></div>
</div>
<h2 …>已上传菜谱</h2>
<div id="weeklyList" class="queue-list" aria-live="polite"></div>
```
行为：选文件 → 校验（5MB/JPG-PNG；错误 toast 同 copy.md 5.6 但 5 MB）→ 预览（`URL.createObjectURL`）→ 确认上传（busy → POST multipart → toast「上传成功」+ 重载）→ 取消（撤预览）。日期校验：两个都必填（「请先选择第一天和最后一天」toast 或字段错误）；start > end → 字段错误「第一天不能晚于最后一天」。列表项：`.thumb`(96px?) — 用 `.thumb`（80px）+ 日期范围（粗体）+ `上传者 X · 时间` + 删除按钮（UI.confirm「删除这张食谱图片？」）；缩略图点击 `UI.viewer`。空态「暂无菜谱图片」。`showPicker` 增强保留（点击日期 input 自动弹日历）。

## 面板 6 · 用户管理（#view-users）

```html
<div id="userList"></div>
```
表格（`.table-wrap > table.table.table--stack`）：

| 列 | 内容 | 手机 data-label |
| --- | --- | --- |
| ID | display_id（mono） | ID |
| 用户名 | username | 用户名 |
| 昵称 | nickname | 昵称 |
| 角色 | 可编辑行 = `select.select`（aria-label="角色"）；否则文本 | 角色 |
| 状态 | 正常 = `badge badge--ok`；已封禁 = `badge badge--danger` | 状态 |
| 操作 | 权限 / 封号 / 解封 | 操作 |

- 可编辑判定（保留原逻辑）：非本人且目标权重 < 自己。
- 角色下拉选项（保留原范围逻辑）；change → `UI.confirm({title:'将 {{用户名}} 的角色改为 {{角色}}？', message:'该用户将立即获得新角色的权限。', confirmText:'确认修改'})` → PUT → 成功 toast「角色已更新」→ 重载；失败 toast（copy.md 5.5 映射）+ 重载（回滚显示）。
- 封号 → `#banModal`；解封 → `UI.confirm({title:'确定要解封该用户吗？', message:'解封后可正常登录使用。', confirmText:'确认解封'})` → PUT unban → toast「已解封」+ 重载。
- 403 类错误文案按 copy.md 5.5；用户名等单元格 esc。

封禁对话框（#banModal，dialog--sheet dialog--wide）：

```html
<dialog class="dialog dialog--sheet dialog--wide" id="banModal" aria-labelledby="banModal-t">
  <form class="dialog__form" id="banForm" novalidate>
    <div class="dialog__head"><h2 class="dialog__title" id="banModal-t">封禁用户 <span id="banTargetName"></span></h2><button type="button" class="icon-btn icon-btn--sm" data-dialog-close aria-label="关闭">close</button></div>
    <div class="dialog__body stack">
      <div class="field"><label class="field__label" for="banReasonInput">封禁理由 <span class="field__opt">（选填）</span></label><input class="input" id="banReasonInput" data-counter="100"></div>
      <div class="field" data-upload data-max-mb="5" data-types="image/jpeg,image/png">
        <span class="field__label">上传图片 <span class="field__opt">（选填）</span></span>
        <label class="upload">…upload 骨架…<input type="file" id="banImageInput" accept="image/jpeg,image/png"></label>
        <div class="upload-preview-slot"></div>
      </div>
      <label class="check-row"><input type="checkbox" class="check" id="banAllowAppeal" checked><span class="check-row__text">允许申请解封<span class="check-row__desc">关闭后该用户只能线下联系超级管理员</span></span></label>
    </div>
    <div class="dialog__foot"><button type="button" class="btn" data-dialog-close>取消</button><button type="submit" class="btn btn--danger" id="banConfirm">确认封禁</button></div>
  </form>
</dialog>
```
提交：FormData（userId/ban_reason/allow_appeal/ban_image）→ busy → 成功关框 toast「已封禁」+ 重载用户表。

## 面板 7 · 申诉处理（#view-appeals）

队列项：`用户 {{display_id}}（{{username}}）` + 申诉理由（prose 短版）+ 申诉图（`.thumb` data-zoom）+ 动作「通过」（primary sm）/「驳回」（sm）。
- 通过/驳回都要 `UI.confirm`（「通过该申诉并解封？/用户将立即恢复登录。」确认「确认解封」；「确定要驳回该申诉吗？」确认「驳回」——驳回非高危但也不可逆，用 confirm 常规）。
- 成功 toast「已解封」/「已驳回」；重载 + counts。
- 空态「暂无待处理申诉」。

## 面板 8 · 工单管理（#view-tickets）

队列项：标题（粗）+ 状态徽标（待处理 pending / 已批复 ok）+ 内容（prose）+ meta 行（提交人 · 可见范围 · 时间）+ 已批复时显示 `queue-item__reply`（批复人/时间/正文/批复图 thumb+zoom）+ 待处理时动作「批复」（primary sm）。
批复对话框（#ticketModal）：批复内容（必填 textarea）+ 图片（选填 ≤5MB，DataURL 上传）→ `UI.confirm` 不需要（表单即确认）→ 提交 busy → 成功 toast「已批复」→ 关框 + 重载 + counts；空内容 → 字段错误「请填写批复内容」。
工单加载失败/空态同其它面板。

## 面板 9（P1）· 发送系统通知（#view-notify）

入口与规格见 [inbox.md](./inbox.md) §后台发送系统通知；本文件只加侧栏按钮（features.inbox 时显示）。

## 面板 10（P1）· 头衔管理（#view-titles）

见 [titles.md](./titles.md)；侧栏按钮在 features.titles 时显示。

## 需要修改的脚本行为（通用）

| 旧 | 新 |
| --- | --- |
| `menu-dot` 红点 + `refreshDots()` | `.side-nav__count` 计数 + `refreshCounts()`（读 `/api/admin/pending-counts`，映射 review/appeals/tickets→student_review/ban_appeal_review/ticket_manage；>99 → 99+；0 → hidden） |
| `.menu-item`/`.active` | `.side-nav__item` + `is-active` 类（后台面板切换保留 class 切换，view 用 is-active） |
| `denyAccess()` notice | `denyBox` 内 `UI.html.empty({tone:'lock', icon:'lock', title:'暂无权限访问管理后台', actions:[{label:'返回首页', href:'index.html'}]})` + 侧栏隐藏 |
| `alert(...)` 全部 | `UI.toast.error(UI.errorText(...))` |
| `confirm(...)` 全部 | `UI.confirm({...})`（文案 copy.md §8） |
| `prompt/开窗` | 自定义 dialog（ban/reject/perms/ticket）|
| `handleStatus(401)` | `UI.api` 自动 |
| modal display:flex 切换 | `UI.dialog.open/close` |
| 每面板加载失败 `app-empty` | `UI.html.loadError(r)` + `[data-retry]` 重载 |
| 「需要 developer / super_admin」 | 「需要开发者 / 超级管理员」（全中文） |
| 表格 select 无 label | 加 `aria-label="角色"` |
| `input[type=date]` 无增强问题 | 保留 showPicker 点击增强 |

## JS 钩子清单（旧 → 新）

元素钩子（hooks.json 核对，全部覆盖）：

| 旧钩子 | 新位置 | 处置 |
| --- | --- | --- |
| `#annContent` | 新骨架同 ID | 保留 |
| `#annMsg` | 新骨架同 ID | 保留 |
| `#annSubmit` | 新骨架同 ID | 保留 |
| `#annTitle` | 新骨架同 ID | 保留 |
| `#appealList` | 新骨架同 ID | 保留 |
| `#banAllowAppeal` | 新骨架同 ID | 保留 |
| `#banCancel` | 改为 data-dialog-close 按钮 | 替换 |
| `#banConfirm` | 新骨架同 ID | 保留 |
| `#banImageChoose` | 由 UI.upload 预览取代 | 删除 |
| `#banImageInput` | 移入 upload 组件内 | 保留 |
| `#banImageName` | 由 UI.upload 预览取代 | 删除 |
| `#banModal` | 新骨架同 ID | 保留 |
| `#banMsg` | 新骨架同 ID | 保留 |
| `#banReasonInput` | 新骨架同 ID | 保留 |
| `#banTargetName` | 新骨架同 ID | 保留 |
| `#bannerClear` | 新骨架同 ID | 保留 |
| `#bannerInput` | 新骨架同 ID | 保留 |
| `#bannerMsg` | 新骨架同 ID | 保留 |
| `#bannerSubmit` | 新骨架同 ID | 保留 |
| `#contentArea` | 内容容器 | 迁移：.shell__main；无权限态改用 #denyBox |
| `#inviteAdd` | 新骨架同 ID | 保留 |
| `#inviteCodeInput` | 新骨架同 ID | 保留 |
| `#inviteList` | 新骨架同 ID | 保留 |
| `#inviteMaxInput` | 新骨架同 ID | 保留 |
| `#inviteMsg` | 新骨架同 ID | 保留 |
| `#menuArea` | 侧栏容器 | 迁移：改为静态 .side-nav（#adminNav） |
| `#permsCancel` | 改为 data-dialog-close 按钮 | 替换 |
| `#permsConfirm` | 新骨架同 ID | 保留 |
| `#permsList` | 保留 ID；结构改为 .check-row 群 | 迁移 |
| `#permsModal` | 新骨架同 ID | 保留 |
| `#permsMsg` | 新骨架同 ID | 保留 |
| `#permsTargetName` | 新骨架同 ID | 保留 |
| `#rejectCancel` | 改为 data-dialog-close 按钮 | 替换 |
| `#rejectConfirm` | 新骨架同 ID | 保留 |
| `#rejectModal` | 新骨架同 ID | 保留 |
| `#rejectMsg` | 新骨架同 ID | 保留 |
| `#rejectReasonInput` | 新骨架同 ID | 保留 |
| `#reviewList` | 新骨架同 ID | 保留 |
| `#ticketCancel` | 改为 data-dialog-close 按钮 | 替换 |
| `#ticketConfirm` | 新骨架同 ID | 保留 |
| `#ticketImageChoose` | 由 UI.upload 预览取代 | 删除 |
| `#ticketImageInput` | 新骨架同 ID | 保留 |
| `#ticketImageName` | 由 UI.upload 预览取代 | 删除 |
| `#ticketList` | 新骨架同 ID | 保留 |
| `#ticketModal` | 新骨架同 ID | 保留 |
| `#ticketMsg` | 新骨架同 ID | 保留 |
| `#ticketReplyInput` | 新骨架同 ID | 保留 |
| `#ticketTargetTitle` | 新骨架同 ID | 保留 |
| `#userList` | 新骨架同 ID | 保留 |
| `#weeklyCancel` | 新骨架同 ID | 保留 |
| `#weeklyChoose` | 新骨架同 ID | 保留 |
| `#weeklyConfirm` | 新骨架同 ID | 保留 |
| `#weeklyEnd` | 新骨架同 ID | 保留 |
| `#weeklyFile` | 新骨架同 ID | 保留 |
| `#weeklyList` | 新骨架同 ID | 保留 |
| `#weeklyMsg` | 新骨架同 ID | 保留 |
| `#weeklyPreview` | 新骨架同 ID | 保留 |
| `#weeklyPreviewImg` | 新骨架同 ID | 保留 |
| `#weeklyStart` | 新骨架同 ID | 保留 |

data 属性钩子：

| 旧钩子 | 用途 | 处置 |
| --- | --- | --- |
| `data-appeal-id` | 队列/表格操作标记 | 保留 |
| `data-approve` | 队列/表格操作标记 | 保留 |
| `data-approve-appeal` | 队列/表格操作标记 | 保留 |
| `data-ban` | 队列/表格操作标记 | 保留 |
| `data-code-id` | 队列/表格操作标记 | 保留 |
| `data-delete-code` | 队列/表格操作标记 | 保留 |
| `data-delete-weekly` | 队列/表格操作标记 | 保留 |
| `data-dot` | 红点 | 迁移：改 data-count 计数胶囊 |
| `data-id` | 队列/表格操作标记 | 保留 |
| `data-name` | 队列/表格操作标记 | 保留 |
| `data-panel` | 面板切换 | 保留 |
| `data-perms` | 队列/表格操作标记 | 保留 |
| `data-reject` | 队列/表格操作标记 | 保留 |
| `data-reject-appeal` | 队列/表格操作标记 | 保留 |
| `data-reply-ticket` | 队列/表格操作标记 | 保留 |
| `data-role-select` | 队列/表格操作标记 | 保留 |
| `data-ticket-id` | 队列/表格操作标记 | 保留 |
| `data-title` | 队列/表格操作标记 | 保留 |
| `data-unban` | 队列/表格操作标记 | 保留 |
| `data-zoom` | 放大 | 保留（→ UI.viewer） |

## 接口与存储（保留清单）

- 接口：GET /api/settings/banner、GET /api/user/profile、GET /api/announcements、POST /api/admin/announcements、DELETE /api/admin/announcements/、PUT /api/admin/settings/banner、GET/POST /api/admin/invite-codes、DELETE /api/admin/invite-codes/、GET /api/admin/permissions、GET /api/admin/student-applications、PUT /api/admin/student-applications/approve、PUT /api/admin/student-applications/reject、GET /api/admin/users、PUT /api/admin/users/role、PUT /api/admin/users/ban、PUT /api/admin/users/unban、PUT /api/admin/users/permissions、GET /api/weekly-menu、POST /api/admin/weekly-menu/upload、DELETE /api/admin/weekly-menu/、GET /api/admin/ban-appeals、PUT /api/admin/ban-appeals/review、GET /api/admin/tickets、PUT /api/admin/tickets/reply、GET /api/admin/pending-counts。
- localStorage：token、user（经 UI.session）；navCollapsed 废弃。

## 对话框钩子

| 旧 ID | 新 ID（保留旧名避免脚本大改） | 变化 |
| --- | --- | --- |
| #banModal | #banModal | dialog--sheet dialog--wide；#banImageChoose/#banImageName 删除（UI.upload）；#banMsg → #banMsg 保留（status-text）或删（错误进 toast）——**保留 #banMsg 用于表单级错误**（如批复内容空） |
| #rejectModal | #rejectModal | 同上 |
| #permsModal | #permsModal | perms-list → `.stack` 内 `.check-row` 群；#permsTargetName 保留 |
| #ticketModal | #ticketModal | 图片改 UI.upload（≤5MB） |

权限对话框（#permsModal）：标题「设置权限 {{username}}」；复选列表（9 项，label = UI.PERMISSION_LABELS）；保存（primary）→ PUT → toast「权限已更新」→ 重载用户表。

## 状态矩阵（全后台通用）

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 未登录 | 无 token | `UI.goLogin()` |
| 无权限 | profile 返回后判定 | 整页 empty--lock + 返回首页 |
| 面板加载中 | 切面板/首载 | 队列区骨架（post×3）或空态前 spinner |
| 队列空 | 0 条 | empty（各面板文案） |
| 队列加载失败 | 网络/403 | loadError + 重试（403 显示「无权限」） |
| 操作成功 | 各动作 | toast（见各面板） |
| 操作失败 | 4xx/网络 | toast（UI.errorText） |
| 401 | token 过期 | ui.js 自动（清会话→登录页） |
| 计数刷新 | 动作成功后 | refreshCounts() |

## 响应式

- 360：侧栏 → 吸顶横条；队列卡操作换行到内容下；表格转卡片（table--stack + data-label）；对话框全宽底部面板。
- 768：仍横条（<900）。
- 900：双列；表格完整列。
- 内容列最大 720（现 content max-width 720 保留）。

## 边界场景

### 菜单手动导入

仅 active developer、super_admin、admin 显示 `menu-import` 面板；普通用户的特殊后台权限不授予此面板。自动同步设置面板仍仅开发者可见。

选择新批次或已有来源，粘贴八字段数组。已有来源可载入已发布 JSON 或已结束任务的识图结果，对失败候选显示补全提示，并用带凭据的请求查看原图。切换目标保留编辑框内容，显式载入有覆盖草稿确认。

校验按钮显示行号/字段错误，成功后格式化并显示记录数、菜品数、去重数。编辑文本、名称、目标或任务使校验与复核勾选失效。用户勾选已核对后可发布；已有来源按钮明确写“替换并发布菜单”。版本变化、同步运行中返回冲突。操作记录显示操作者、时间、数量与修订。JSON 编辑器使用等宽字体，360px 下在编辑框内部横向滚动，页面不横向溢出；原图支持查看器放大。

- [ ] 三种管理角色可粘贴、校验、发布与修正候选；其他角色/封禁/撤权被拒绝。
- [ ] 失败结果提示、受限原图、完全重复项去重、修改后按钮失效及整篇替换语义。
- [ ] 根规则文档可打开；360/1280、明暗主题、axe 无违规。

- 待处理含超长申诉理由/工单内容 → 卡内 prose 断行，卡片高度自适应。
- 申诉图 404 → thumb 占位。
- 同一申请两人同时处理 → 后者「该申请不存在或已处理」toast + 刷新。
- 批复图片读取失败（FileReader）→ 表单级错误「图片读取失败」（#ticketMsg）。
- 日期 input 在 iOS 无 showPicker → 原生行为即可。
- 邀请码含空格 → trim 后提交。
- 角色下拉对 developer 目标不可编辑（原逻辑）→ 显示文本。
- 用户表 500+ 行 → 全量渲染（后台可接受；如卡顿 P2 分批）。

## 无障碍要点

- 侧栏按钮 aria-pressed 不适用——用 `is-active` + `aria-current="page"` 亦可（推荐 aria-current）；计数胶囊有数字文本。
- 表格 select 有 aria-label；对话框 aria-labelledby；危险确认焦点在取消。
- 队列卡操作按钮全部有文字（无裸图标按钮）。

## 验收清单（按面板）

- [ ] 权限矩阵：无权限者看到整页锁态；部分权限者侧栏过滤 + 默认首面板。
- [ ] 横幅：修改/取消（confirm、toast、403 中文文案）。
- [ ] 公告：校验、发布成功、清空。
- [ ] 认证审核：通过（busy/toast/移除）/拒绝（对话框+原因）。
- [ ] 邀请码：添加（校验/409）、列表、删除（confirm）。
- [ ] 每周菜谱：日期校验（必填/倒填）、5MB 预览确认、上传、列表删除、viewer。
- [ ] 用户管理：表格（桌面列/手机卡片）、角色确认修改、封禁对话框（理由/图/允许申诉）、解封 confirm、权限对话框。
- [ ] 申诉：通过/驳回 confirm + 图放大。
- [ ] 工单：批复对话框（必填/图）+ 已批复展示。
- [ ] 计数胶囊：>0 显示、处理后归零、99+。
- [ ] 全部 alert/confirm/prompt 清零；计数与文案中文；360/900 正常；axe=0。

> 2026-10-17 共享加载状态修正：本页使用的 `UI.html.skeleton` 已补齐 `role="status"`，保留加载名称与 `aria-busy`，避免加载过程中的无障碍属性违规；外观与业务流程不变。
