# 更新公告 · announcements.html

更新：2026-10-31。公告公开浏览；仅 admin / operator 可发布或删除，删除需确认。登录 user 或 student 不能通过旧授权获得公告管理能力。

公告和横幅在新版后台“站点内容”维护，成功写入管理操作记录。公告列表/详情导航、正文换行、主题和响应式保持。

## 实现与验证

当前实现：React + TanStack Query/Router，Hono + SQLite/Drizzle。权限以数据库当前角色、状态和有效会话为准，隐藏入口不能替代后端校验。验证命令、实测结果与限制见根目录 [MAP.md](../../../MAP.md) 最新记录，以及 [验收记录](../acceptance.md)。
