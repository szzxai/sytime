# 头衔系统（#10）

## 目标

建立用户头衔系统，支持管理员授予、系统自动获得以及用户自行选择佩戴。

> 状态：已实现。设计稿与逐项验收见 [UI 页面规范](ui/pages/titles.md)，变更记录见 [progress.md](../progress.md) 第 59 条，后端回归见 [tests/titles.test.cjs](../tests/titles.test.cjs)。

## 头衔来源

### 超级管理员授予

* [x] 超级管理员可以向用户发放头衔（`POST /api/admin/users/:id/titles`，需 `title_manage`，默认 super_admin）
* [x] 可以撤销已发放头衔（`DELETE /api/admin/users/:id/titles/:titleId`；撤销佩戴中的头衔会同时清空佩戴状态并写入一条系统消息）
* [x] 可以为单个账号颁发**自定义专属头衔**（`POST /api/admin/users/:id/titles/custom`，名称 1–8 字 + 8 色任选；只在该账号出现，不进公共目录，撤销时目录行一并删除）

### 自动获得

* [x] 系统能够根据条件自动授予头衔（`lib/titles/rules.js` 的规则注册表，登录、新增店铺与打开「我的头衔」时评估，不引入定时任务）
* [x] 自动头衔条件应可扩展（新增条件 = 规则注册表加一项 + 目录加一行；`titles.rule` 关联两者）

#### 例如未来可根据：

* [ ] 注册时间
* [ ] 权限
* [ ] 活跃度
* [ ] 特定活动
* [ ] 特殊成就

> 本轮落地 11 条自动规则：五个角色等级（`role_developer` / `role_super_admin` / `role_admin` / `student_verified` / `role_user`）+ 六个成就条件（累计推荐 10 家店铺、连续登录 7 天、3 篇帖子各获 5 条以上评论、连续 3 个周末登录、发帖累计 30 个赞、发布 10 篇菜品评价）。其余示例条件（注册时间、权限等）保留为扩展方向，未实现。自动头衔不可手动授予，接口返回 409。
>
> 角色口径：**每个角色恰好一枚等级徽章且互斥** —— `developer` → 开发者、`super_admin` → 超级管理员、`admin` → 管理员、`student` → 学子、`user` → 同窗；角色变化时自动换发（升为超级管理员会收回「管理员」）。`guest` 未登录、没有账号，无法持有头衔，因此不设访客头衔。「师者」不绑定角色，改为**手动授予**，留给真正的教职员工。成就类头衔只增不减，任何头衔都可由管理员撤销。

## 用户头衔管理

### 个人信息页面：

* [x] 查看自己拥有的全部头衔（`GET /api/user/titles`，同时返回未达成自动头衔的条件与进度）
* [x] 选择一个头衔佩戴（`PUT /api/user/title`；未拥有的头衔返回 403）
* [x] 可以选择“不佩戴头衔”（`title_id: null`）
* [x] 保存当前佩戴状态（存 `users.equipped_title_id`，一次最多一个）

### 展示

* [x] 论坛（帖子卡头与回复 meta）
* [x] 评论区（帖子详情 `post.html` 的作者行与回复）
* [x] 店铺评价（`shop.html` 评价卡改用统一用户组件）
* [x] 其他用户内容页面（个人中心资料头部；任何位置缺 `title` 字段都不报错、不渲染空徽章）
* [x] 推荐统一使用一个用户信息组件（全部经 `UI.userLine` / `UI.titleBadge`，徽章数据为佩戴中的 `{name, hue}`）

## 验收标准

- [x] 用户可以同时拥有多个头衔（`user_titles` 一对多）
- [x] 用户一次最多佩戴一个头衔（`users.equipped_title_id` 单值）
- [x] 超级管理员可以授予/撤销头衔
- [x] 系统可以自动授予头衔
- [x] 评论等位置正确显示当前佩戴头衔
- [x] 超管可以为单个账号颁发专属自定义头衔，且不影响公共目录

## 初始头衔目录

| 名称 | 颜色 | 来源 | 规则 / 说明 |
| --- | --- | --- | --- |
| 开发者 | rose 绛红 | 自动 | `developer` 角色（`role_developer`） |
| 超级管理员 | vermilion 朱印 | 自动 | `super_admin` 角色（`role_super_admin`） |
| 管理员 | teal 黛青 | 自动 | `admin` 角色（`role_admin`） |
| 学子 | bamboo 竹青 | 自动 | `student` 角色（`student_verified`） |
| 同窗 | stone 石灰 | 自动 | `user` 角色（`role_user`） |
| 三元坊老饕 | ochre 赭石 | 自动 | 累计推荐 10 家店铺（`shops.created_by`） |
| 夜读星 | wisteria 紫藤 | 自动 | 连续登录 7 天（`users.login_streak`） |
| 论坛催化剂 | vermilion 朱印 | 自动 | 3 篇帖子各获 ≥5 条评论（`forum_replies` 计数） |
| 闲者爱上网 | wisteria 紫藤 | 自动 | 连续 3 个周末登录（`user_login_days`） |
| 高赞校友 | rose 绛红 | 自动 | 发帖累计 30 个赞（`post_likes`） |
| 校园老吃家 | ochre 赭石 | 自动 | 10 篇菜品评价（`recipes.is_weekly = 0`） |
| 师者 | indigo 靛蓝 | 手动授予 | 教职员工标识，不绑定角色 |
| 创站元老 | teal 黛青 | 手动授予 | 早期用户 |
| 官方 | vermilion 朱印 | 手动授予 | 管理团队标识 |

> 颜色只有 8 种，头衔多于 8 个后必然重复；颜色可在后台「头衔管理 → 编辑」随时调整。
> `user_login_days` 由 `lib/titles/store.js` 的 `migrate()` 创建，登录时按北京时间自然日去重写入。

目录在 `lib/titles/store.js` 的 `SEED_TITLES` 中，启动时 `INSERT OR IGNORE` 写入，可安全重复执行；后台可增删改，自动头衔的规则字段只读展示。此外，超管可为单个账号颁发**不进入该目录**的专属头衔（`titles.owner_user_id` 非空）。

## 接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/user/titles` | 登录 | 已拥有头衔（含佩戴状态）+ 未达成自动头衔的进度 |
| PUT | `/api/user/title` | 登录 | 佩戴 / 取消佩戴，`{ title_id: 12 }` 或 `{ title_id: null }` |
| GET | `/api/admin/titles/rules` | `title_manage` | 可用的自动规则清单 |
| GET | `/api/admin/titles` | `title_manage` | 头衔目录与持有人数 |
| POST | `/api/admin/titles` | `title_manage` | 新建头衔（重名 409、名称超长 422） |
| PUT | `/api/admin/titles/:id` | `title_manage` | 改名 / 换色 / 改描述 |
| DELETE | `/api/admin/titles/:id` | `title_manage` | 删除头衔，并清理拥有与佩戴记录 |
| POST | `/api/admin/users/:id/titles` | `title_manage` + 目标权重低于自己 | 授予公共头衔（幂等；自动头衔 409） |
| POST | `/api/admin/users/:id/titles/custom` | `title_manage` + 目标权重低于自己 | 为该账号创建并颁发专属头衔（同名沿用；不进公共目录） |
| DELETE | `/api/admin/users/:id/titles/:titleId` | `title_manage` + 目标权重低于自己 | 撤销，佩戴中会一并清空并写系统消息 |

针对具体账号的三个写操作都遵守项目一贯的权重边界：不能给自己或权重不低于自己的人授予/撤销（403；目标不存在 404）。目录维护（`/api/admin/titles*`）是全局的，只校验 `title_manage`。

## 已知限制

- 评论不支持点赞、回复没有父级 ID（与 #9 记录一致），因此没有对应的自动条件。
- 佩戴头衔在帖子/回复/评价等行数据里使用 `user_title` 字段，避免覆盖 `forum_posts.title` 这类同名列表。
- 自动头衔的撤销需要管理员撤销拥有关系或删除目录，规则本身不提供「取消达成」。
- 等级头衔按角色精确匹配且互斥：角色变化时自动换发，旧的等级徽章被收回（成就徽章不受影响）。
- 「师者」改为手动授予后不再自动发放，需要管理员为在职教职员工逐个授予。
- `guest` 没有账号，无法持有头衔，因此没有访客头衔；`user` 角色的徽章是「同窗」。
- 「闲者爱上网」依赖 `user_login_days`，该表从上线起累积，历史登录无法回填。
- 成就头衔只增不减；数据被删除（如帖子被删、评价被删）不会收回已获得的成就徽章。
- 专属头衔不能手动授予给其他账号，也不能转正为公共目录头衔；需要共用时请在「头衔目录」新建公共头衔。
