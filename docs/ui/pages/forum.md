# 论坛 · forum.html

## 新建收藏夹公开选择 · 2026-10-24（#29）

帖子旁「收藏」弹窗的新建表单新增「公开」开关，每次展开从当前账号重新读取默认公开偏好，读取中禁用创建，失败默认私密并说明；用户可单独覆盖，失败保留填写，下一次新建重新读取默认值。确认收藏、帖子与回复交互不变；组件状态见 [收藏弹窗](../components.md#collection-收藏按钮与选择弹窗23)。

## 当前视觉与布局 · 2026-10-17

论坛改为 `.workspace--forum`：桌面左侧 290px 放标题、发帖按钮、讨论/提问分类及登录提示，右侧为细边框帖子流；手机顺排，分类横向。帖子、行内回复、发帖对话框和权限钩子不变。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：现有改版 ｜ 优先级：P0 ｜ issue：#4、#23（#9/#10 落地时增量）｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：`forum` ｜ 容器：`workspace--forum`

## 用途与目标

讨论/提问两个分类的帖子流；发帖改为对话框；行内展开回复；点赞乐观更新；点赞右侧新增「收藏」按钮（打开统一收藏夹选择弹窗，#23）；删除入口从右键菜单改为 ⋯ 菜单；未登录全程可浏览。

## 页面结构

页面真实骨架以 [forum.html](../../../public/forum.html) 为准：`main.workspace` 内是 `aside.workspace__sidebar`、`div.workspace__content` 和发帖对话框。侧栏含标题、发帖、分类、登录提示；内容列含 `postList` 与 `loadMore`。小于 768px 时上下排列。标题和帖子区只保留一个 h1。

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| #discussBtn / #questionBtn | 分类切换 | 同 ID（segmented + aria-selected） | 保留 |
| #newPostBtn | 打开发帖 | 同 ID（未登录 toast+跳登录；不再显示 loginHint 的替代——callout 常显） | 保留 |
| #publishPanel / #collapsePostBtn / #postForm / #title / #category / #content / #postSubmit / #formMsg | 发帖面板 | `#postDialog`（dialog--sheet）内同 ID；#formMsg 删除 | 迁移 |
| #loginHint | 未登录提示 | `callout#loginHint`（hidden 属性） | 迁移 |
| #postList | 列表容器 | 同 ID（stack） | 保留 |
| `[data-post-id] [data-user-id] [data-like-toggle] [data-like-count] [data-collect] [data-replies-toggle] [data-replies] [data-replies-loaded] [data-reply-count] [data-reply-input] [data-reply-list] [data-reply-msg] [data-reply-submit]` | 卡片内交互 | `data-like`(原 like-toggle)、`data-collect`（#23，`data-section`/`data-item-id`，由 ui.js 全局委托）、`data-replies`(hidden 属性)、`data-reply-input/submit/count` 保留；`data-replies-loaded` 保留；`data-reply-list`→`[data-replies]` 内部直渲染；`data-reply-msg` 删除（toast） | 迁移 |
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

- 帖子标题是 h2（页面 h1=论坛）；卡内链接可聚焦；点赞/回复按钮有 aria-pressed/aria-expanded；收藏按钮有 aria-pressed/aria-label（已收藏时主色高亮）；⋯ 有 aria-label；回复输入框计数器与 1000 上限同步；骨架 aria-busy；列表容器 `aria-live="polite"`（新帖追加播报）。
- 回复楼层号「N 楼」为纯视觉，读屏可忽略。

## 验收清单

- [ ] 两分类切换 + 骨架 + 空态 + 错误重试。
- [ ] 未登录：可浏览；点赞/回复/发帖均给出登录引导（callout/toast）。
- [ ] 发帖对话框全流程（校验、busy、成功、失败、取消、Esc）。
- [ ] 点赞乐观更新 + 失败回滚 + 弹跳动画。
- [ ] 收藏按钮位于点赞右侧：未登录提示登录；登录后弹窗列出收藏夹、可新建并确认收藏；已收藏时按钮高亮（#23）。
- [ ] 回复展开/收起 + 逐楼渲染 + 回复发布。
- [ ] 作者/管理员有 ⋯ 菜单 → UI.confirm → 删除成功/失败文案正确；其他人无菜单。
- [ ] 加载更多：20/批，计数正确，到底显示「已显示全部」。
- [ ] XSS 测试：发 `<img src=x onerror=alert(1)>` 原样显示不执行。
- [ ] 360/1280 无横向滚动；axe=0；控制台零报错。

> 2026-10-17 共享加载状态修正：本页使用的 `UI.html.skeleton` 已补齐 `role="status"`，保留加载名称与 `aria-busy`，避免加载过程中的无障碍属性违规；外观与业务流程不变。


### 2026-10-19 · 共享标识与运营声明

浏览器图标改为 `brand-lime.svg` 青柠切面；共享顶栏、抽屉、页脚及登录/注册卡片复用该图形，首页链接名称仍为「拾光酥糕 首页」。有页脚的页面展示完整学生自主运营、与校方无隶属关系、知识产权和信息参考声明，勘误邮箱可点击。地图应用壳与极简 404 页继续不显示页脚。完整文字见 [文案规范](../copy.md)。
