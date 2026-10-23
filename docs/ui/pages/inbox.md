# 消息箱 · inbox.md（#9）

## 当前视觉与布局 · 2026-10-17

消息页标题上方改为「与你有关的消息」，消息分组使用细边框面板和浅绿未读状态；继承新导航、页脚、明暗主题，已读/筛选/跳转行为保持。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：新功能 ｜ 优先级：P1 ｜ issue：#9 ｜ 依赖：阶段 0；#9 数据与接口 ｜ 落点：inbox.html（新页）+ 页头消息铃 + settings.html#messages 设置（#19 起从个人中心迁出）+ admin.html#notify 发送面板

## 需求对照表（PLAN #9 → 本文档）

| 需求 | 满足位置 |
| --- | --- |
| 系统消息（标题/正文/时间；发送权限） | §2 变体；§6 后台发送（super_admin） |
| 评论/回复/点赞通知（B 站式） | §2 变体与聚合 |
| 消息列表/已读未读/未读数/点击跳转/标已读 | §3 列表与交互 |
| 消息设置（类型开关；重要不可关） | §5 设置 |

## 用途与目标

统一消息箱：接收系统消息与互动通知（评论/回复/点赞），含已读与偏好设置；覆盖 PLAN #9 全部需求与验收标准。

新页面：无旧代码钩子，「JS 钩子清单 / 需要修改的脚本行为」不适用；布局 = 页头铃 + Tabs + 工具栏 + 按天分组列表 + 加载更多（手机/桌面同构，720 阅读列）。

## 1. 页头消息铃（全站）

- `features.inbox=true` 时 ui.js 页头渲染 `<a class="icon-btn" href="inbox.html" id="inboxBell" aria-label="消息">bell 图标<span class="count-badge" id="inboxCount" hidden></span></a>`。
- `UI.inbox`：每 60s 轮询 `GET /api/messages/unread-count`（建议路径）→ `UI.inbox.set(n)`；页面隐藏暂停、回前台即拉；1–99 显示数字，>99 显示 `99+`；`aria-label` 同步为「消息，N 条未读」/「消息」。
- 后端未就绪期间：接口 404 → 静默（铃无徽标）。

## 2. 消息变体（.msg 的四型）

| type | lead | kind 图标 | 主文案 | 附加 |
| --- | --- | --- | --- | --- |
| comment | 评论者头像 | message（青） | `<b>{{actor}}</b> 评论了你的帖子《{{target.title}}》` | quote = 评论内容 2 行 |
| reply | 回复者头像 | message（青） | `<b>{{actor}}</b> 回复了你的评论` | quote = 对方回复内容 |
| like | 点赞者头像（聚合时取第一人） | heart（朱） | `<b>{{A}}、{{B}}</b> 等 {{N}} 人赞了你的帖子《{{title}}》`（N=1 时 `<b>{{A}}</b> 赞了你的帖子《{{title}}》`；目标为评价时「评价」） | — |
| system | `msg__icon`（megaphone） | — | `msg__title` 标题 +（重要时）`<span class="tag tag--outline">lock 图标 重要</span>` | `msg__body` 正文（长文折叠，§2.1） |

数据契约（建议路径 〔接口以实现为准〕）：

```json
{ "messages": [ { "id": 88, "type": "comment", "actors": [{"id":7,"username":"zhang","nickname":"张同学"}],
  "count": 1, "target": {"kind":"post","id":42,"url":"post.html?id=42","title":"食堂面档","snippet":"原文片段…"},
  "title": null, "body": null, "important": false, "read": false, "created_at": 1790000000 } ] }
```

回退规则：`actors` 空 → 不带头像/名字（仅系统）；`target.url` 缺 → 条目不可点（渲染为 div）；`snippet` 缺 → 无 quote；`type` 未知 → 按 system 无 title 渲染。**数据未具备的子类型**（回复带父评论、评论点赞）：接口不产生即不显示；契约字段齐备后自动生效（前端按 type 渲染，无需改码）。

## 2.1 系统消息长正文

`body` > 120 字 → 折叠（前 120 字 + 「…展开」按钮 `link-btn` 语义用 `btn--link btn--sm`）；展开后全文 + 「收起」。渲染为 `msg__body` 内切换。

## 3. inbox.html 页面

### 3.1 HTML 骨架

```html
<body>
…页头…
<main id="main" class="main container container--prose">
  <div class="page-head">
    <div class="page-head__main"><span class="page-head__eyebrow">与你有关的消息</span><h1 class="page-head__title">消息箱</h1></div>
  </div>
  <div class="tabs" role="tablist" aria-label="消息类型" style="margin-bottom:var(--sp-4)">
    <button type="button" class="tab" role="tab" data-filter="" aria-selected="true">全部<span class="tab__count tab__count--alert" id="cntAll" hidden></span></button>
    <button type="button" class="tab" role="tab" data-filter="system" aria-selected="false">系统</button>
    <button type="button" class="tab" role="tab" data-filter="interact" aria-selected="false">评论与回复</button>
    <button type="button" class="tab" role="tab" data-filter="like" aria-selected="false">点赞</button>
  </div>
  <div class="inbox-toolbar">
    <label class="check-row" style="padding-block:0"><input type="checkbox" class="switch" role="switch" id="unreadOnly" aria-label="只看未读"><span>只看未读</span></label>
    <div class="row row--sm">
      <button type="button" class="btn btn--sm" id="readAllBtn"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-check"></use></svg>全部标为已读</button>
      <a class="btn btn--sm btn--ghost" href="settings.html#messages"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-settings"></use></svg>消息设置</a>
    </div>
  </div>
  <div id="inboxList" aria-live="polite"></div>
  <div class="load-more" id="loadMore" hidden><button type="button" class="btn" id="moreBtn">加载更多</button><span id="moreInfo"></span></div>
</main>
…页脚…
```

### 3.2 列表渲染（按天分组）

- 分组键：今天 / 昨天 / 更早（本地时区，`UI.timeEl` 同源判断）。
- 组标题：`<h2 class="msg-group__title">今天</h2>`；组容器 `.msg-list`。
- 条目：components.md「Message」骨架；点击行为 = 标记已读（PUT 或列表内乐观置已读）+ 300ms 后 `location.href = target.url`（系统消息无 url 则仅已读并展开）。
- 已读动作失败 → 保持未读 + toast；成功 → 移除 is-unread + 未读计数减一（页头铃与 Tab 计数同步）。

### 3.3 筛选与状态

- Tab data-filter：空=全部 / system / interact(comment+reply) / like；客户端过滤 + URL `?type=…` 同步（replaceState）。
- 只看未读：客户端过滤（已选类型内）。
- 计数：`cntAll` 显示未读总数；Tab 上各类未读数可选（接口给 per-type 未读则显示，不给则隐藏）。

### 3.4 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 未登录 | 无 token | `UI.goLogin()` |
| 加载中 | 首次 | msg-list 位置 3 条 post 骨架 |
| 空（全部） | 0 条 | empty「暂无消息」「有新的互动或通知时会出现在这里。」 |
| 空（某 Tab/只看未读） | 过滤后 0 | empty（compact）「暂无{{未读}}消息」 |
| 失败 | 网络 | loadError + 重试 |
| 全部标为已读 | 点击 | busy → PUT → toast「已全部标为已读」+ 列表刷新 + 铃清零 |
| 点击消息 | click | 已读 + 跳转 |
| 目标已删 | 跳转后 404 | 目标页 404 态（消息已读不回滚） |
| 离线 | — | 黄条 + loadError/toast |

## 4. 点击跳转与高亮

- 帖子/评论目标：`post.html?id=…`（评论类目标含评论 id 时 url 为 `post.html?id=…#reply-<id>`；post.md 已支持高亮）。
- 评价目标（#8 后）：`shop.html?id=…` 或 dish 页；以 target.url 为准。
- 系统消息：无跳转（原地展开）。

## 5. 消息设置（settings.html#messages 分区，见 [settings.md](settings.md)）

```html
<section class="view" id="view-messages" hidden>
  <h1 class="page-head__title" style="font-size:var(--fs-2xl)">消息通知</h1>
  <div class="panel">
    <div class="panel__head"><h2 class="panel__title">接收以下消息</h2><p class="panel__desc">关闭后不再产生对应的新消息；已收到的消息不受影响。</p></div>
    <div class="panel__body">
      <div class="switch-row">
        <div class="switch-row__text"><span class="switch-row__title">系统消息</span><span class="switch-row__desc">管理员发布的通知。其中「重要」通知无法关闭。</span></div>
        <input type="checkbox" class="switch" role="switch" checked disabled aria-label="系统消息">
      </div>
      <div class="switch-row"><div class="switch-row__text"><span class="switch-row__title">评论通知</span><span class="switch-row__desc">有人评论你的帖子或评价</span></div><input type="checkbox" class="switch" role="switch" id="prefComment" checked aria-label="评论通知"></div>
      <div class="switch-row"><div class="switch-row__text"><span class="switch-row__title">回复通知</span><span class="switch-row__desc">有人回复你的评论</span></div><input type="checkbox" class="switch" role="switch" id="prefReply" checked aria-label="回复通知"></div>
      <div class="switch-row"><div class="switch-row__text"><span class="switch-row__title">点赞通知</span><span class="switch-row__desc">有人赞了你的内容</span></div><input type="checkbox" class="switch" role="switch" id="prefLike" aria-label="点赞通知"></div>
    </div>
  </div>
</section>
```

行为：change 即保存（PUT `/api/user/preferences` 建议路径）→ toast「偏好已保存」；失败 → 回滚开关 + toast。系统消息行 disabled 且选中（说明「无法关闭」）；「重要系统消息」永远可达（不设开关）。

## 6. 后台发送系统通知（admin.html#notify 面板，super_admin）

```html
<section class="view" id="view-notify" hidden>
  <h1 …>发送系统通知</h1>
  <div class="panel">
    <div class="panel__head"><h2 class="panel__title">新建系统通知</h2><p class="panel__desc">将出现在全体用户的消息箱中。</p></div>
    <div class="panel__body stack">
      <div class="field"><label class="field__label" for="ntTitle">标题</label><input class="input" id="ntTitle" data-counter="40"></div>
      <div class="field"><label class="field__label" for="ntBody">正文</label><textarea class="textarea" id="ntBody" data-counter="500" style="min-height:10rem"></textarea></div>
      <label class="check-row"><input type="checkbox" class="check" id="ntImportant"><span class="check-row__text">标记为重要<span class="check-row__desc">显示「重要」标记；用户的系统消息接收始终包含此类</span></span></label>
    </div>
    <div class="panel__foot"><span class="status-text" id="ntMsg"></span><button type="button" class="btn btn--primary" id="ntSubmit">发送</button></div>
  </div>
</section>
```

行为：校验（标题/正文必填）→ `UI.confirm({title:'向全体用户发送这条通知？', message:'发送后不可撤回。', confirmText:'确认发送'})` → POST → toast「已发送」+ 清空；受众固定「全体用户」（〔待产品确认〕；如需按角色，加 select select 于正文下方）。权限：`announcement_publish`（super_admin 默认）。

## 7. 响应式

- 360：Tab 可横滚；工具栏两行；msg 全宽。
- 768：720 阅读列。
- 900+：不变（消息箱不需要侧栏）。

## 8. 边界场景

- 未读 1000+ → 铃 99+；列表加载更多上限照常。
- 聚合人数很多（100 人点赞）→ 名字取前 2 个 + 「等 N 人」。
- actors 头像缺失 → hueFor 首字。
- 消息时间很老 → 「更早」组；超过一年 → 完整日期。
- 只看未读 + 全部已读 → 空态「暂无未读消息」。
- readAll 期间新消息到达 → 竞态：以响应为准，toast 后重拉一次列表与计数。

## 9. 无障碍

- 铃 aria-label 动态（含未读数）；未读条目有红点 + aria-label「未读」（msg__dot）；Tab 计数在文本中（读屏可读「全部，4」）；开关有 role=switch + label。
- 点击整条 = `<a>`（可 Tab）；系统消息展开按钮有文字。

## 10. 验收清单

- [ ] 铃：轮询、99+、aria-label、暂停恢复。
- [ ] 列表：四型消息正确渲染（含聚合点赞、系统长文折叠、重要标记）。
- [ ] 天分组；Tab 过滤 + URL；只看未读；计数联动。
- [ ] 点击=已读+跳转+目标高亮；已读失败回滚。
- [ ] 全部标为已读（busy/toast/铃清零）。
- [ ] 设置四个开关（系统锁定）即时保存与回滚。
- [ ] 后台发送（确认、成功）；发送后消息箱可见。
- [ ] 未登录/未开启功能的行为正确；360/1280 正常；axe=0。

> 2026-10-17 共享加载状态修正：本页使用的 `UI.html.skeleton` 已补齐 `role="status"`，保留加载名称与 `aria-busy`，避免加载过程中的无障碍属性违规；外观与业务流程不变。


### 2026-10-19 · 共享标识与运营声明

浏览器图标改为 `brand-lime.svg` 青柠切面；共享顶栏、抽屉、页脚及登录/注册卡片复用该图形，首页链接名称仍为「拾光酥糕 首页」。有页脚的页面展示完整学生自主运营、与校方无隶属关系、知识产权和信息参考声明，勘误邮箱可点击。地图应用壳与极简 404 页继续不显示页脚。完整文字见 [文案规范](../copy.md)。
