# 消息箱 · inbox.html

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
