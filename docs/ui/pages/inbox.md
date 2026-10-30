# 消息箱 · inbox.html

## 2026-10-25 · 导航行为同步

消息正文中的站内页面链接支持意图预加载；消息筛选仍只更新当前内容，正文外导航按主栏目位置切换。 共同规则见 [导航与加载规范](../../navigation.md)，实际验证见根目录 MAP 与 UI 验收记录。

## 当前 React 实现 · 2026-10-25

实现位于 `apps/web/src/pages/`：InboxPage.tsx。消息筛选由 Router search 管理，Query 获取系统通知与授予消息；已读、未读数量、分页及标记操作保持。

视觉令牌和资源位于 `apps/web/public/`；共享站点壳、弹窗、上传、主题和用户展示见 [组件规范](../components.md)。本页 HTML/CSS 示例用于说明最终 DOM 与视觉约束，旧 `UI.*` 或页面脚本示例属于迁移前实现，不是当前可调用 API。当前请求由 TanStack Query、路径/查询/hash 由 TanStack Router 管理，后端为 Hono + Drizzle。最新验证见根目录 [MAP.md](../../../MAP.md) 与 [验收记录](../acceptance.md)。


更新日期：2026-10-23。

消息箱需要登录，使用共享导航、页脚和明暗主题。页面只接收管理员系统通知及头衔授予通知；「全部」「系统」两个标签均保留。支持仅看未读、游标分页、加载更多、单条已读和全部已读。长正文可展开，内容经过转义；重要消息显示标记。

## 接口与数据

- `GET /api/messages`：`type=system`、`unread`、`before`、`page_size`；返回 `messages`、`has_more` 和 `counts`（all/system）。消息的 `target` 为 null。
- `GET /api/messages/unread-count`：供共享铃铛轮询。
- `PUT /api/messages/:id/read`、`PUT /api/messages/read-all`：仅操作本人消息。
- `POST /api/admin/notifications`：有公告发布权限的管理者发送系统通知。

## 设置与迁移

设置页消息分区仅说明系统通知，常显且禁用的系统通知开关保持开启。评论、回复和点赞偏好及对应接口已删除；启动迁移删除旧帖子消息，系统消息保留。消息展示不再查询帖子或提供帖子链接。

## 验证

覆盖消息读取、导航、手机布局、明暗主题及无障碍；具体结果见根目录 MAP.md 最新验证记录。
