# 帖子详情 · post.html

## 当前视觉与布局 · 2026-10-17

帖子详情沿用 800px 阅读宽度，采用新版字号、细边框和绿色操作；动态网页标题使用拾光酥糕，回复定位、点赞、删除与登录判断不变。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：现有改版 ｜ 优先级：P0 ｜ issue：#4、#23（#9/#10 增量）｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：`forum` ｜ 容器：`container--prose`

## 用途与目标

单帖阅读：完整标题、作者行（user-line）、正文（prose）、点赞与收藏（收藏按钮在点赞右侧，打开统一收藏夹弹窗，#23）、回复列表**常显**（不再折叠）、底部回复框（登录后）。回复支持 `#reply-<id>` 深链高亮（#9 消息跳转的目标）。删除入口（作者/管理员）在标题行 ⋯ 菜单。

## 布局

```text
手机 360                       桌面 1280
┌──────────────────┐   ┌────────────────────────────────┐
│ ← 返回论坛         │   │ 页头                             │
│ ┌──────────────┐ │   │ ← 返回论坛                        │
│ │[讨论]         │ │   │ ┌────────────────────────────┐ │
│ │标题（24px）    │ │   │ │ [讨论]                       │ │
│ │林·头衔 时间    │ │   │ │ 标题（30px）                  │ │
│ │正文（prose）   │ │   │ │ 林·三元坊老饕 · 3 小时前        │ │
│ │───────────── │ │   │ │ 正文…                        │ │
│ │赞12  评5      │ │   │ │ 赞12  评5                     │ │
│ │ 回复          │ │   │ │ ── 回复 ──                    │ │
│ │ 王 1 楼 …    │ │   │ │ 王·头衔 1 楼 …                │ │
│ │ 管 2 楼 …    │ │   │ │ 管 2 楼 …                     │ │
│ │ [回复框]      │ │   │ │ [回复框 + 发布回复]             │ │
│ └──────────────┘ │   │ └────────────────────────────┘ │
└──────────────────┘   └────────────────────────────────┘
```

## HTML 骨架

容器部分（静态）：

```html
<body data-nav="forum">
…页头…
<main id="main" class="main container container--prose">
  <div id="detail" aria-live="polite"><div class="loading-block"><span class="spinner"></span>正在加载…</div></div>
</main>
…页脚…
```

详情模板（页面脚本 `renderPost(p)` 生成，直接替换旧版）：

```js
function renderPost(p) {
  var user = { id: p.user_id, username: p.username, nickname: p.nickname, role: p.role, avatar_url: p.avatar_url, title: p.title };
  var me = UI.session.user();
  var canDelete = !!(me && (UI.session.isAtLeast("admin", me) || String(me.id) === String(p.user_id)));
  detail.innerHTML =
    '<a class="back-link" href="forum.html">' + UI.icon('arrow-left', 'icon--sm') + '返回论坛</a>' +
    '<article class="card">' +
      '<div class="row row--sm"><span class="tag tag--primary">' + UI.esc(p.category) + '</span></div>' +
      '<h1 class="post-detail__title">' + UI.esc(p.title) + '</h1>' +
      '<div class="post-detail__meta">' + UI.userLine(user, { size: 'md', meta: UI.timeEl(p.created_at) }) + '</div>' +
      '<div class="post-detail__body prose">' + UI.esc(p.content) + '</div>' +
      '<div class="post-detail__actions">' +
        '<button type="button" class="action-btn" aria-pressed="' + (p.is_liked ? "true" : "false") + '" data-like>' + UI.icon('heart') + '<span data-like-count>' + (p.like_count || 0) + '</span></button>' +
        UI.collections.button("forum", p.id) +
        '<span class="grow"></span>' +
        (canDelete ? '<button type="button" class="action-btn" data-delete>' + UI.icon('trash') + '删除</button>' : '') +
      '</div>' +
    '</article>' +
    '<section class="section"><div class="section__head"><h2 class="section__title">回复</h2><span class="u-muted u-fs-sm" data-reply-total></span></div>' +
    '<div class="card">' +
      '<div id="replyList" class="reply-list"></div>' +
      replyFormHtml() +
    '</div></section>';
  bindEvents();
}
```

回复渲染（与 forum.md 的 `loadReplies` 相同规则，含 `id="reply-<id>"`、楼层号、titleBadge/roleTag、缺字段回退）；回复框 `composer`；未登录显示 callout。点赞逻辑与 forum.md 相同（乐观更新+回滚）。删除：`data-delete` → `UI.confirm({title:'删除这条帖子？', message:'帖子及其回复、点赞将一并删除，无法恢复。', confirmText:'删除', danger:true})` → 成功 toast「已删除」→ 0.5s 后 `location.href='forum.html'`。

`#reply-<id>` 深链：回复渲染完成后，若 `location.hash` 匹配 `#reply-\d+` → `el.scrollIntoView({block:'center'})` + 焦点（`el.tabIndex=-1; el.focus()`）；`:target` 高亮由 CSS 内置。

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| #detail | 详情容器 | 同 ID | 保留 |
| 动态 #repliesBox / #replyList / #replyInput / #replySubmit / #replyMsg | 回复区 | `#replyList` + composer（#replyInput/#replySubmit/#replyMsg → composer 内控件；#replyMsg 删除改 toast） | 迁移 |
| `[data-like-toggle] [data-like-count]` | 点赞 | `data-like` / `data-like-count` | 改名 |
| `[data-collect]` | 收藏按钮 | `UI.collections.button("forum", p.id)`；由 ui.js 全局委托打开收藏弹窗（#23） | 新增 |
| `[data-replies-toggle]` | 折叠回复 | 删除（回复常显） | 删除 |
| `.back` | 返回 | `.back-link` | 替换 |
| 👍 字符 | 点赞图标 | `i-heart` 图标 | 替换 |
| `.empty`（缺 id/404/失败） | 状态 | `UI.html.empty/loadError` | 替换 |

## 需要修改的脚本行为

1. `prompt/confirm/alert`：无（旧版无）；新增删除路径（旧版详情页无删除 → 从 forum 逻辑复制）。
2. 404：`post not found` → `UI.html.empty({icon:'compass', title:'帖子不存在或已被删除', desc:'', actions:[{label:'返回论坛', href:'forum.html'}]})`；缺 id → 同空态但 title「缺少帖子 id」。
3. 回复常显：加载详情成功即 `loadReplies()`（旧版需点「回复」展开）。
4. 错误经 `UI.errorText`；加载用 spinner 块（上文骨架）而非文字。

## 接口清单（保留）与补充钩子

- 接口：GET /api/forum/posts/:id（详情，含 is_liked）；GET /api/forum/posts/:id/replies；POST /api/forum/posts/:id/replies；POST /api/forum/posts/:id/like；DELETE /api/forum/posts/:id/like；DELETE /api/forum/posts/:id（删除）。
- 收藏（#23）：`GET /api/collections?section=forum`、`POST /api/collections`、`POST /api/collections/:id/items`，由共享收藏弹窗调用。
- DOM 钩子补充：详情 article 保留 `data-post-id`（脚本统一取 id）；旧 `data-loaded`（回复懒加载标记）随回复常显**删除**。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 加载中 | 首次 | spinner 块 |
| 缺 id | 无 ?id= | empty「缺少帖子 id」+ 返回论坛 |
| 帖子不存在 | 404 | empty「帖子不存在或已被删除」+ 返回论坛 |
| 加载失败 | 网络 | loadError + 重试（重载详情） |
| 正常 | 200 | 详情卡 + 回复区 |
| 未登录 | 无 token | 正文可读；点赞 toast「请先登录」；回复区 callout |
| 回复加载中 | 常显区 | replyList 内 2 条 row 骨架 |
| 无回复 | 0 条 | `u-muted`「还没有回复」 |
| 回复成功 | 201 | 输入清空 + toast + 重载 + 计数 |
| 点赞成功/失败 | — | 乐观/回滚（同 forum） |
| 删除成功 | 200 | toast → forum.html |
| hash 定位 | #reply-123 | 滚动到该回复 + 琥珀高亮 + 焦点 |

## 响应式

- 360：标题 24；动作条按钮触屏 44；回复框整宽。
- 768：标题 30。

## 边界场景

- 超长标题/正文/回复 → prose 断行；1000 回复 → 分批（同 forum 规则，回复区也要「加载更多」每次 20：渲染前 20 + load-more）。
- 回复同时被删 → 无删除他人回复功能（现状无），无需处理。

## 无障碍要点

- 标题 h1 唯一；回复 meta 内 roleTag/titleBadge 同 forum；`:target` 高亮不仅靠颜色（有背景+外圈）。

## 无障碍要点

- 点赞按钮 aria-pressed；收藏按钮 aria-pressed/aria-label（已收藏时主色高亮）；删除按钮 aria-label 已有文字；回复列表 `aria-live="polite"` 不必（重载手动）。
- `#reply-x` 聚焦后读屏读到回复内容（li 有内容）。

## 验收清单

- [ ] 三种进入失败态（缺 id / 404 / 网络）文案与动作正确。
- [ ] 回复常显 + 未登录 callout + 发布回复全流程。
- [ ] `post.html?id=1#reply-2` 定位高亮。
- [ ] 点赞乐观/回滚；作者与管理员的删除入口及二次确认。
- [ ] 点赞右侧收藏按钮：未登录提示；弹窗列出收藏夹、可新建、确认写入；已收藏时高亮（#23）。
- [ ] 无 alert/confirm/prompt；360/1280 正常；axe=0。

> 2026-10-17 共享加载状态修正：本页使用的 `UI.html.skeleton` 已补齐 `role="status"`，保留加载名称与 `aria-busy`，避免加载过程中的无障碍属性违规；外观与业务流程不变。


### 2026-10-19 · 共享标识与运营声明

浏览器图标改为 `brand-lime.svg` 青柠切面；共享顶栏、抽屉、页脚及登录/注册卡片复用该图形，首页链接名称仍为「拾光酥糕 首页」。有页脚的页面展示完整学生自主运营、与校方无隶属关系、知识产权和信息参考声明，勘误邮箱可点击。地图应用壳与极简 404 页继续不显示页脚。完整文字见 [文案规范](../copy.md)。
