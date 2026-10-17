# 校园信息网 · 进度文档（progress.md）

> 更新日期：2026-10-04。当前实现 #4 全站 UI、#5 独立菜品目录/网站内菜单同步、#6 姑苏区全域必吃榜数据重采与导入，以及 #10 头衔系统。#5 配置/备份/故障处理见 [菜单同步](./docs/menu-sync.md)，用户确认的范围见 [实施计划](./docs/issue-5-plan.md)，#10 范围见 [头衔实施计划](./docs/issue-10-plan.md)。完整结构及接口见 [MAP.md](./MAP.md)，验证见 [验收记录](./docs/ui/acceptance.md)。历史章节按当时实现保留。

---

## 1. 项目简介

一个采用「宣纸·黛青·朱印」极简风格的校园信息网站，包含首页、交互式校园地图、论坛、帖子详情、菜谱评价、每周食谱、公告、学生认证、个人中心及管理后台，并提供账号、角色、特殊权限、封禁申诉、全站横幅和工单。

后端为 Node.js + Express 5，数据库使用 Node 内置的 `node:sqlite`。前端使用原生 HTML/CSS/JavaScript，无构建步骤；共享样式与交互统一外置，地图使用本地 Leaflet 1.9.4，只显示静态 SVG 校园地图；旧楼层页面已移除，`data.json` 仅留作归档与后端兼容。

---

## 2. 运行环境与依赖

- 推荐 Node.js 24+；本次验证使用 Node.js 24.13.0、npm 11.19.0 和 Windows PowerShell。
- 运行依赖：Express、cors、bcrypt、jsonwebtoken、multer、dotenv、sharp、cheerio、Ajv、pinyin-pro；数据库无需额外驱动，生产无需 Python 或另一台菜单服务。
- 验证依赖：Playwright、axe-core。Windows 回归使用已安装的 Microsoft Edge；其他平台先运行 `npx playwright install chromium`。
- 安装：`npm.cmd ci`；启动：`npm.cmd start`；回归：`npm.cmd test`。
- 首页：`http://localhost:3000/`；地图：`http://localhost:3000/map.html`；地图接口：`http://localhost:3000/api/map-data`。
- 修改 `server.js` 需重启；修改 `public/` 刷新即可；修改 `data.json` 在下次请求时生效。

---

## 3. 目录结构

```text
szzx-info/
├── .env.example                 环境变量模板
├── .gitignore                   依赖、密钥、数据库临时文件与测试产物
├── public/
│   ├── *.html                   12 个现有页面及 404；about 为兼容跳转
│   ├── css/site.css             全站令牌、组件、明暗主题与响应式
│   ├── js/ui.js                 统一交互、登录态、导航壳与 API 客户端
│   ├── js/page.js               请求、表单、上传、面板与工单工具
│   ├── js/forum.js              论坛共用的点赞、回复和删除逻辑
│   ├── js/pages/                各页业务脚本
│   ├── img/                     网站图标与 SVG 图标库
│   ├── vendor/leaflet/           Leaflet 1.9.4 资源及上游许可证
│   └── auth.js                  旧共享脚本兼容入口
├── docs/ui/                     组件、页面、场景、文案、参考资产和验收
├── tests/ui-smoke.mjs            浏览器功能、布局和无障碍回归
├── tests/menu.test.cjs           菜单后端测试
├── tests/node-deploy.cjs         全新 Node 生产依赖安装验证
├── lib/menu/                    菜单来源、识别、配置、存储、队列及调度
├── data/menu-bootstrap.json     十篇历史菜单种子
├── tools/build-menu-seed.py      离线整理工具，仅开发时使用
├── .private/                    主密钥、原图、补图、诊断与缓存（忽略）
├── docs/menu-sync.md             同步配置、部署、备份和故障处理
├── uploads/                     头像、评价、weekly/ 食谱、bans/ 封禁图片
├── data.json                    227 个地图对象的几何、名称、楼层和主题
├── data.db                      SQLite 持久数据库
├── server.js                    Express 后端及菜单模块接入
├── package.json / package-lock.json
├── README.md                    使用、部署与复验说明
├── MAP.md                       项目结构、数据流和 API 索引
├── PLAN_2026-10-01.md            原始里程碑快照
├── UI.md                        全站设计手册总纲
├── LICENSE                      AGPL-3.0
└── progress.md                  本文
```

本机 `.env`、`.private/`、`node_modules/` 和 `output/` 不提交。data.db 和 uploads 保留历史快照；不要提交保存生产模型凭据后的数据库。完整结构见 MAP.md。

---

## 4. 环境变量（.env）

复制 `.env.example` 为 `.env`，部署时修改 JWT 密钥：

```dotenv
PORT=3000
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
```

---

## 5. 数据库结构（node:sqlite）

初始化在 `server.js` 启动时执行 `CREATE TABLE IF NOT EXISTS`（含旧表迁移：若 `users.email` 为 `NOT NULL` 则重建为可空；启动时回填 `avatar_url` 空值；删除废弃的 `verify_codes`）。

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_id TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  username TEXT UNIQUE,
  nickname TEXT,
  avatar_url TEXT NOT NULL DEFAULT '',
  signature TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  default_page TEXT NOT NULL DEFAULT 'index.html',
  default_floor INTEGER NOT NULL DEFAULT 1,
  recipe_default_view TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'active',
  ban_reason TEXT NOT NULL DEFAULT '',
  ban_image TEXT NOT NULL DEFAULT '',
  allow_appeal INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('讨论', '提问')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE forum_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE (post_id, user_id)
);

CREATE TABLE user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE (user_id, permission)
);

CREATE TABLE recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 0,
  comment TEXT,
  image_url TEXT,
  is_weekly INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  publish_date TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE student_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  student_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  real_name TEXT NOT NULL,
  extra_info TEXT,
  reject_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE weekly_menu_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  menu_start_date TEXT NOT NULL,
  menu_end_date TEXT NOT NULL,
  filename TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE ban_appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  appeal_reason TEXT NOT NULL,
  appeal_image TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'pending',
  reply_content TEXT NOT NULL DEFAULT '',
  reply_image TEXT NOT NULL DEFAULT '',
  reply_by TEXT NOT NULL DEFAULT '',
  replied_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX idx_forum_category ON forum_posts(category);
CREATE INDEX idx_forum_replies_post ON forum_replies(post_id);
CREATE INDEX idx_recipes_weekly ON recipes(is_weekly);
CREATE INDEX idx_announcements_date ON announcements(publish_date);
CREATE INDEX idx_student_applications_user ON student_applications(user_id);
CREATE INDEX idx_ban_appeals_status ON ban_appeals(status);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_user ON tickets(user_id);
```

迁移：启动时 `migrateUserSettings()` 会为旧库补齐 `default_page / default_floor / recipe_default_view / display_id / status / ban_reason / ban_image / allow_appeal` 列，并**批量回填旧用户 `display_id = CAST(id AS TEXT)`**。

初始化时执行 `INSERT OR IGNORE` 写入 `banner`（默认「欢迎来到校园信息网」）、`banner_version`（默认 `0`）与 `student_invite_code`（默认空字符串）三条设置；`banner_version` 每次更新横幅自增，用于「同一账号关闭横幅后，直到下次更新才再显示」。

时间字段（`created_at`）为 Unix 时间戳（秒）；`announcements.publish_date` 为 `YYYY-MM-DD` 文本。

---

## 6. 后端接口（server.js）

中间件：`cors()`、`express.json()`、`express.static(public/)`、`express.static(uploads/) → /uploads`，以及末尾统一的 JSON 错误处理。

**账号**
- `POST /api/register` — body `{ username, nickname, password }`；用户名重复 409；**第一个用户 role='developer'**，其余 'user'；bcrypt 哈希。**注册后自动生成 `display_id`（= 自增 `id` 的字符串，如 `'1'`、`'2'`），返回 `{ id, display_id, username, nickname, role }`**。
- `POST /api/login` — body `{ username, password }`；成功返回 `{ token, user }`；**JWT payload = { id, role, username }**。**若用户 `status='banned'` 返回 403**，body `{ error:"banned", ban_reason, allow_appeal }`（`allow_appeal` 为 1/0）。
- `GET /api/me`、`GET /api/admin/ping`（示例权限接口）。

**权限中间件**
- `ROLE_WEIGHTS = { developer:6, super_admin:5, admin:4, student:3, user:2, guest:1 }`
- `checkRole(requiredRole)`：解析 `Authorization: Bearer <token>`；无/无效 token **不报 401**，而是 `req.user = { id:null, role:'guest', username:null }` 放行；若指定了 requiredRole，则按权重比较，不足返回 **403**。token 缺 `username` 时按 id 回查数据库补全。
- `requireLogin`：基于 `checkRole()`，未登录返回 **401** `{ error:"login required" }`。
- **特殊权限（`user_permissions` 表 + `requirePermission(perm)`）**：在角色之外可给单个用户授予细粒度权限。`hasPermission` 判定 = **角色权重 ≥ 该权限默认要求**（`PERMISSION_REQUIRES`）**或**在 `user_permissions` 中有显式授权。权限键：`banner_edit`(super_admin)、`announcement_publish`(super_admin)、`student_review`(super_admin)、`invite_manage`(super_admin)、`user_manage`(super_admin)、`ban_appeal_review`(super_admin)、`weekly_menu_upload`(admin)、`map_popup_edit`(admin)、`ticket_manage`(admin)、`shop_create`(默认 student，可用 `SHOP_CREATE_MIN_ROLE` 调整)、`title_manage`(super_admin)。`requirePermission` 未登录 401、无权限 403。`GET /api/me` 与 `GET /api/user/profile` 均返回 `permissions` 数组。

**个人资料**（均需登录）
- `GET /api/user/profile` — 返回 `{ user: { id, display_id, username, nickname, avatar_url, signature, role, default_page, default_floor, recipe_default_view, shop_default_sort, shop_default_type, shop_layout, status } }`
- `POST /api/user/avatar` — multer 字段名 `avatar`，限 2MB、仅 jpg/png，存 `uploads/`，返回 `{ avatar_url }`
- `PUT /api/user/nickname` — body `{ nickname }`
- `PUT /api/user/signature` — body `{ signature }`
- `PUT /api/user/settings` — body 为可选项 `{ default_page, default_floor, recipe_default_view, shop_default_sort, shop_default_type, shop_layout }`，按传入字段部分更新；页面仅允许 index/map/forum/recipe，楼层 1–4，菜谱默认页 all/reviews/weekly，店铺样式 stacked/split，非法值拒绝，更新当前用户记录
- `PUT /api/user/password` — body `{ oldPassword, newPassword }`（兼容 `old_password`/`new_password`）；旧密码错误 400

**论坛**
- `GET /api/forum/posts?category=讨论`（`checkRole()` 放行未登录）— 按 `created_at DESC`；每条附带 `reply_count`、`like_count`（总点赞数）与 `is_liked`（当前登录用户是否已赞，未登录为 `false`）
- `GET /api/forum/posts/:id`（`checkRole()` 放行未登录）— 返回单条帖子完整信息（含 `id, user_id, username, category, title, content, created_at`）以及 `like_count`、`is_liked`；`id` 非法 400、不存在 **404**
- `POST /api/forum/posts` — 需登录；body `{ category ∈ {讨论,提问}, title, content }`
- `DELETE /api/forum/posts/:id` — 需登录；仅**帖子作者**或**管理员（权重 ≥ admin）**可删，删除时级联删除其回复与点赞；无权限 403、不存在 404
- `POST /api/forum/posts/:id/like` — 需登录；已点赞返回 **400 `{ error:"已点赞" }`**，否则写入 `post_likes`，返回 `{ ok, liked:true, like_count }`
- `DELETE /api/forum/posts/:id/like` — 需登录；删除当前用户对该帖的点赞，返回 `{ ok, liked:false, like_count }`
- `GET /api/forum/posts/:id/replies` — 按时间正序；帖子不存在 404、id 非法 400
- `POST /api/forum/posts/:id/replies` — 需登录；body `{ content }`

**菜谱**
- `GET /api/recipes` — 全部，按 `name COLLATE NOCASE ASC`
- `GET /api/recipes/weekly` — `is_weekly = 1`
- `POST /api/recipes` — 需登录，multer 字段名 `image`（限 2MB、仅 jpg/png），body `{ name, rating(0-5), comment, is_weekly }`

**地图**
- `GET /api/map-data` — 返回根目录 `data.json` 原文

**每周菜谱图片（管理员权限 ≥ 4）**
- `GET /api/weekly-menu`（公开）— 返回所有图片，按 `menu_start_date DESC, id DESC`，每项含 `user_id`、`username`（上传者）与 `url`（`/uploads/weekly/<filename>`）
- `POST /api/admin/weekly-menu/upload`（`checkRole("admin")`）— multer 字段名 `image`，限 5MB、仅 jpg/png，存 `uploads/weekly/`；记录 `user_id`；body `{ menu_start_date, menu_end_date }`（也兼容单独 `menu_date`，同时作为起止）；缺日期/图片 400，权限不足 403
- `DELETE /api/admin/weekly-menu/:id`（需登录）— **仅上传者本人或权重 ≥ super_admin（5）**可删，删除数据库记录并移除本地物理文件；无权限 403

**更新公告**
- `GET /api/announcements` — 返回所有公告，按 `publish_date DESC` 排列

**管理后台（`/api/admin/*` 一律要求权限权重 ≥ 5，即 `checkRole("super_admin")`，仅 developer / super_admin 可用）**
- `POST /api/admin/announcements` — body `{ title, content, publish_date? }`，发布公告
- `PUT /api/admin/settings/banner` — body `{ value }`（兼容 `banner`），更新全站横幅并自增 `banner_version`；传空字符串即「取消横幅」（全站不再显示）
- `GET /api/admin/student-applications` — 返回所有 `pending` 申请（附带提交人 `username`）
- `PUT /api/admin/student-applications/approve` — body `{ id }`，状态改 `approved` 并将对应用户升级为 `student`
- `PUT /api/admin/student-applications/reject` — body `{ id, reason? }`，状态改 `rejected` 并记录可选 `reject_reason`（不影响用户角色）
- `GET /api/admin/settings/invite-code` — 返回 `{ invite_code }`（旧的单邀请码，保留兼容）
- `PUT /api/admin/settings/invite-code` — body `{ invite_code }`（旧的单邀请码，保留兼容）
- `GET /api/admin/invite-codes` — 返回所有邀请码（含 `max_uses`、`used_count`）
- `POST /api/admin/invite-codes` — body `{ code, max_uses }`（`max_uses` 为 0 表示不限次数；重复码 409）
- `DELETE /api/admin/invite-codes/:id` — 删除邀请码
- `GET /api/admin/ping` — 权限探测示例

**用户管理（`checkRole("super_admin")`，仅权重 ≥ 5 可用）**
- `GET /api/admin/users` — 返回所有用户 `{ id, display_id, username, nickname, role, status, permissions }`（按 id 升序）
- `GET /api/admin/permissions` — 返回可分配权限目录 `{ permissions: [{ key, label }] }`
- `PUT /api/admin/users/permissions` — body `{ userId, permissions: [key...] }`；**不能改自己或权重 ≥ 自己的人**（403）；只接受合法权限键，先清空再写入，返回 `{ ok, permissions }`
- `PUT /api/admin/users/role` — body `{ userId, newRole }`。**不能改自己**；**不能改权重 ≥ 自己的人**；新角色权重须 `∈ [user(2), 自身权重 - 1]`（即不得 ≥ 自身等级）；违规 403，用户不存在 404
- `PUT /api/admin/users/ban` — body（multipart 或 JSON）`{ userId, ban_reason, allow_appeal }` + 可选图片字段 `ban_image`（限 5MB、仅 jpg/png，存 `uploads/bans/`）；将 `status='banned'` 并记录 `ban_reason / ban_image / allow_appeal`（默认 1）；不能封禁自己或权重 ≥ 自己者（403）
- `PUT /api/admin/users/unban` — body `{ userId }`；`status='active'`，清空 `ban_reason / ban_image`，`allow_appeal=1`

**封禁申诉**
- `POST /api/user/appeal`（**公开，无需登录**）— body `{ username, appeal_reason, appeal_image? }`；用户不存在 404、未被封禁 400；**限频：距上次申诉不足 10 分钟返回 429 `{ error:"rate_limited", message, retry_after }`；允许提交时先删除该用户旧申诉（覆盖上一次）再写入**，写入 `ban_appeals`（`status='pending'`），返回 `{ id, status }`
- `GET /api/admin/ban-appeals`（`requirePermission("ban_appeal_review")`）— 返回所有 `pending` 申诉，附带用户 `username`、`display_id`
- `PUT /api/admin/ban-appeals/review`（`requirePermission("ban_appeal_review")`）— body `{ appealId, action ∈ {approve, reject} }`；`approve` 将申诉置 `approved` 且用户解封（`status='active'`、清空封禁信息），`reject` 置 `rejected`

**工单**
- `POST /api/tickets`（需登录）— body `{ title, content, visibility }`；`title`/`content` 必填（400）；`visibility ∈ {admin, super_admin, developer}`，非法值回退 `admin`（表示「该角色及以上可见」，最低管理员）；写入 `tickets`（`status='pending'`），返回 `{ ticket:{ id, status } }`
- `GET /api/tickets/mine`（需登录）— 返回本人全部工单（含 `status / reply_content / reply_image / reply_by / replied_at`），按时间倒序
- `GET /api/admin/tickets`（`requirePermission("ticket_manage")`）— 仅返回**当前角色权重视野内**的工单（`ROLE_WEIGHTS[req.user.role] >= ROLE_WEIGHTS[ticket.visibility]`），待处理优先排序
- `PUT /api/admin/tickets/reply`（`requirePermission("ticket_manage")`）— body `{ id, reply, reply_image? }`；`reply` 必填（400）；工单不存在 404；**可见性不足 403**；置 `status='resolved'` 并记录 `reply_content / reply_image / reply_by / replied_at`
- `GET /api/admin/pending-counts`（需登录）— 返回 `{ counts: { student_review, ban_appeal_review, ticket_manage } }`；**仅有对应权限时才返回真实待办数否则为 0**；`ticket_manage` 仅统计当前角色可见范围内的 `pending` 工单。供管理后台菜单红点使用

**设置（公开）**
- `GET /api/settings/banner` — 返回 `{ banner, version }`，供全站横幅使用

**学生认证**
- `POST /api/student/apply`（需登录）— body `{ student_id, class_name, real_name, invite_code?, extra_info? }`；先查 `invite_codes` 表：**存在且未超过 `max_uses`（0=不限）**则 `used_count` 自增并把当前用户角色升级为 `student`（不会降级更高角色），返回 `{ status:"approved", role:"student" }`；否则再回退匹配旧的单邀请码 `settings.student_invite_code`；都不通过则写入 `student_applications`（`status='pending'`，含可选 `extra_info`），返回 `{ status:"pending" }`。**限频：距上次申请不足 10 分钟返回 429 `{ error:"rate_limited", message, retry_after }`；允许提交时会先删除该用户旧申请（覆盖上一次）再写入，保证每人仅一条待审记录**。缺少必填字段 400，未登录 401。

---

## 7. data.json 结构与坐标系

结构与字段：

```jsonc
{
  "meta": { "rectW": 1200, "rectH": 700, "axisY": 420, "minZoom": -2, "maxZoom": 6 },
  "style": {
    "outline": "#55656B",
    "labelColor": "#66747B",
    "fillOpacity": 0.75,
    "palette": { "building": "#E4DFD3", "green": "#CFE0CC", "water": "#BBD7DF", "white": "#FFFFFF", "none": null }
  },
  "features": [
    {
      "layers": ["base"] | [1] | [2,3,4],   // base=底图常显；数字=楼层，可多条
      "type": "polygon" | "polyline" | "label",
      "name": "东紫阳楼", "popup": "东紫阳楼 · 教学楼",
      "cat": "building" | "green" | "water" | "white" | "none",
      "points": [[x, y], ...],
      "fill": true, "stroke": true,
      "dash": "8,6" | null,
      "weight": 1 | 2 | 4,
      "text": "东紫阳楼", "x1": 60, "y1": 440, "x2": 100, "y2": 600, "scale": 0.8  // 仅 label
    }
  ]
}
```

坐标系（★重要）：Leaflet `L.CRS.Simple`，`point(x,y)` → `[y,x]`。
**左=北=−x，上=东=+y，右=南=+x，下=西=−y**；`x` 为南北向（屏幕水平），`y` 为东西向（屏幕垂直）。中轴 `y = axisY = 420`；画布 `x∈[0,1200]`，`y∈[0,700]`。

---

## 8. 前端页面

### 8.1 共享 UI 与导航

- `public/css/site.css` 维护全站设计令牌、组件、布局、明暗主题及响应式；页面不再维护内联 CSS。
- `public/js/ui.js` 维护 `window.UI`：登录态、角色与特殊权限、统一 API 请求、用户信息、转义、日期、表单校验、提交状态、Toast、对话框、菜单、抽屉、上传和图片查看器。
- `public/js/page.js` 复用表单、请求、上传、面板和工单逻辑；`public/js/forum.js` 复用点赞、回复、删除；各页脚本位于 `public/js/pages/`。`auth.js` 仅是旧调用兼容入口。
- Logo 返回首页；桌面导航提供地图、论坛、菜谱和公告；手机使用对话框抽屉。已登录显示头像和账户菜单，学生认证及管理入口按角色和特殊权限呈现。
- 横幅由 `/api/settings/banner` 提供，关闭状态使用 `bannerDismissed:<username>` 和版本保存；更新版本后可重新显示。
- 未登录的受限操作提供登录入口并携带 `next`；登录与注册成功后校验站内地址并返回原页面。
- 明暗主题样式已经验证，主题切换入口属于 P2，`UI.config.features.theme` 当前关闭。

### 8.2 各页面

| 页面 | 当前行为 |
| --- | --- |
| index | 首页介绍、四个功能入口、关于我们与工单反馈；根路径无锚点时按账号或本地默认页面跳转 |
| about | 兼容旧地址，跳转 `/index.html#about` |
| map | 本地 Leaflet + 北向上 SVG，28 地点、搜索/分类/详情、滚动与拖动平移、捏合或 Ctrl / ⌘ + 滚轮缩放、键盘/全景/加载重试；单一地图，无楼层视图和默认楼层设置 |
| login / register | 表单校验、密码显隐、登录/自动登录、站内回跳；被封用户查看理由、图片并按允许状态提交申诉，429 显示倒计时 |
| student_verify | 达到学生等级显示已认证；否则填写新生号、班级、姓名和可选邀请码/补充信息；保持直接认证、人工审核及限频规则 |
| forum | 讨论/提问切换、每批 20 条、发帖对话框、点赞及失败回滚、回复展开与发布、卡片详情跳转、可键盘访问的删除菜单 |
| post | 正文、点赞与默认显示的回复；分批加载、回复锚点定位；帖子缺失、无权限和加载失败有明确状态 |
| recipe | 全部菜品、菜品评价、每周食谱三个页签；A–Z 目录与名称/拼音/首字母搜索，原评价和每周图片操作保留；明确 URL 优先于账号默认设置 |
| announcements | 桌面列表与详情并排；手机选择后进入正文，可返回列表 |
| profile | 资料、账号安全、网站设置、消息通知、我的头衔、工单六个面板；ID/角色/额外权限、头像、昵称、签名、密码、默认页/楼层/菜谱视图及工单保持原接口；我的头衔按 `features.titles` 显隐侧栏项 |
| admin | 按权限显示横幅、公告、认证审核、邀请码、每周食谱、用户、头衔管理、申诉和工单九个面板；待办数、确认、拒绝、角色、特殊权限、封禁、头衔授予撤销和批复统一使用新组件 |
| 404 | 未知 GET 页面路径显示统一错误页；未知 API 仍返回 JSON 404 |

动态文本通过 `UI.esc` 或 `textContent` 输出。长列表使用加载更多；异步区域提供加载、空和错误重试状态。发帖、评价、工单与公告表单保护未保存内容，提交失败保留填写内容。

---

## 9. 已完成的关键变更（历史）

1. 建立 `index.html`、`map.html`（Leaflet 校园地图）与多轮几何迭代。
2. 任务0：有名字的闭合图形实线/虚线统一 `weight 1`；围墙 `weight 4`；香樟大道 `weight 2`。
3. 任务①–⑮：楼梯范围、紫阳楼 2F 开口、红楼楼梯、各类绿地/水体/道山/碧霞池重排，新增 3F/4F（仅紫阳楼 + 三元楼）。
4. 静态 → 动态：搭建 Express、抽离 `data.json`、低饱和度上色、`map.html` 改 fetch 动态绘制。
5. **账号系统（弃用邮箱/验证码/邮件）**：
   - 依赖安装；`node:sqlite` 建库；`users` 表。
   - `/api/register`（首用户 developer）、`/api/login`（JWT 含 id/role/username）。
   - `checkRole` 权重中间件（无 token 作 guest 放行，权限不足 403）与 `requireLogin`（401）。
   - 个人资料接口：profile / avatar / nickname / password（后加 signature）。
6. **页面前端**：登录、注册、论坛、菜谱评价；导航栏加「论坛」「菜谱评价」。
7. **登录态导航**：`public/auth.js` 统一渲染，登录后显示圆形头像（跳个人中心）。
8. **论坛回复功能**：`forum_replies` 表 + 读写接口；列表附 `reply_count`；前端回复展开/发布。
9. **论坛发布优化**：独立「发布帖子」按钮 + 面板「收起」按钮；提问版块默认分类为提问。
10. **个人中心升级为设置页**：左侧菜单 + 三个子页（个人资料/账号安全/网站设置）；后端加 signature；网站设置（默认界面、默认楼层）经 `localStorage` 生效（index 根路径跳转、map 默认楼层）。
11. **菜单栏折叠**：右下外侧小三角收起（动画）+ 右上展开三角，状态持久化。
12. **地图修正**：3F/4F 的「东红楼 / 西红楼」文字标签层由 `base` 改为 `[1,2]`，不再出现在 3F/4F。
13. **更新公告**：新增 `announcements` 表与 `GET /api/announcements`；新增 `announcements.html`（左列表右详情）；所有页面导航栏加入「更新公告」。
14. **管理后台**：新增 `settings` 表（含 `banner` 初始数据）与全站横幅；新增 `/api/admin/*`（权重 ≥ 5）、`GET /api/settings/banner`；新增 `admin.html`（编辑横幅含二次确认、发布公告）；导航栏按角色显示「管理后台」按钮。
15. **横幅优化**：横幅加 × 关闭按钮（按账号、按 `banner_version` 记录，更新后才再显示）；管理后台新增「取消横幅」；`GET /api/settings/banner` 增加 `version` 字段。
16. **学生认证（用户端）**：新增 `student_applications` 表与 `POST /api/student/apply`；`settings` 增加 `student_invite_code`；新增 `student_verify.html`；登录后导航栏加入「学生认证」入口。
17. **学生认证（管理端）**：新增 `/api/admin/student-applications`（列表/审核）与 `/api/admin/settings/invite-code`（读/写）；`admin.html` 新增「学生认证审核」「邀请码设置」菜单及面板。
18. **多邀请码**：新增 `invite_codes` 表（`code` 唯一、`max_uses`、`used_count`）与 `/api/admin/invite-codes`（增/查/删）；学生认证改为按表校验并可限制使用次数；`admin.html` 邀请码面板改为多条管理与删除。
19. **网站设置同步账号**：`users` 新增 `default_page`（默认 `index.html`）与 `default_floor`（默认 1）并自动迁移旧库；`GET /api/user/profile` 返回二者，新增 `PUT /api/user/settings`；`profile.html` 保存改为写账号（回退 localStorage），`index.html`/`map.html` 加载优先读账号设置。
20. **导航栏优化**：所有页面导航移除「更新公告 / 关于我们」；Logo 改为可点击按钮，悬停/点击弹出下拉菜单（更新公告、关于我们）；下拉 CSS/JS 统一在 `auth.js`；新增 `about.html`。
21. **学生认证补充信息**：`student_applications` 新增 `extra_info`（自动迁移）；`POST /api/student/apply` 接收可选 `extra_info`；`student_verify.html` 增加“补充更多信息（选填）”文本域（提示可提高通过率）；管理后台审核列表显示补充信息。
22. **论坛删除帖子**：新增 `DELETE /api/forum/posts/:id`（作者或管理员可删，级联删回复）；`forum.html` 帖子右键弹出上下文菜单「删除帖子」（二次确认）。
23. **每周菜谱图片**：新增 `weekly_menu_images` 表、`uploads/weekly/` 目录与独立 multer（5MB、jpg/png）；新增 `GET /api/weekly-menu`（公开）、`POST /api/admin/weekly-menu/upload`、`DELETE /api/admin/weekly-menu/:id`（均需权重 ≥ 4）。
24. **每周菜谱前端**：`admin.html` 新增「每周菜谱管理」（日期选择整框可点弹出、列表显示上传者、缩略图放大、删除）；`recipe.html`「每周食谱」不显示评价表单，支持点击大图（滚轮缩放/拖动/点空白关闭）与上传者/super_admin 删除。`weekly_menu_images` 新增 `user_id` 记录上传者，删除接口改为「上传者或 ≥ super_admin」。
25. **菜谱默认页设置**：`users` 新增 `recipe_default_view`（默认 `all`）并自动迁移；`GET /api/user/profile` 返回、`PUT /api/user/settings` 接收；`profile.html` 网站设置新增「菜谱评价默认页」，`recipe.html` 加载时优先采用。
26. **每周菜谱交互细化**：
    - `admin.html` 上传改为**上传栏内预览 + 「确认上传 / 取消」**（不再单独弹窗），预览图白底；上传列表显示上传者用户名。
    - `recipe.html`「每周食谱」每条改为**上方日期（起始-结束）按钮**展开/收起大图（不直接显示图片），**大图下方左下角另加「收起」按钮**，日期与收起均极简黑白风格；大图白底、点击打开缩放层（滚轮缩放/拖动/点空白关闭）。
    - `GET /api/weekly-menu` 关联 `users` 返回上传者 `username`；`PUT /api/user/settings` 校验 `recipe_default_view`（`all`/`weekly`）。
27. **账号系统升级（展示ID / 权限 / 封禁 / 申诉，后端）**：
    - `users` 新增 `display_id`（唯一，= 主键 id 的字符串）并**批量回填旧用户**；注册自动生成；`GET /api/user/profile` 返回。
    - 管理后台入口收紧：`auth.js` 的「管理后台」按钮改为**仅权重 ≥ super_admin(5)** 显示，`admin` 不再显示。
    - `users` 新增 `status`（默认 `active`，可为 `banned`）、`ban_reason`、`ban_image`、`allow_appeal`（默认 1）。
    - 新增用户管理接口：`GET /api/admin/users`、`PUT /api/admin/users/role`（不能改自己/同级以上，新角色权重 ≤ 自身 - 1 且 ≥ user）、`PUT /api/admin/users/ban`（multer 存 `uploads/bans/`）、`PUT /api/admin/users/unban`。
    - `POST /api/login` 对被封用户返回 403 并带 `ban_reason`、`allow_appeal`。
    - 新增 `ban_appeals` 表与申诉接口：`POST /api/user/appeal`（公开）、`GET /api/admin/ban-appeals`、`PUT /api/admin/ban-appeals/review`（approve=解封 / reject）。
28. **账号系统升级（前端界面）**：
    - `admin.html` 新增「用户管理」「申诉处理」两个菜单与面板：用户表格 + 角色下拉（选中即改）+ 自定义遮罩层封号（理由/图片/允许申诉）+ 解封二次确认；对自己或权限 ≥ 自己者隐藏所有修改控件。
    - `login.html` 处理封禁：显示封禁理由；允许申诉时展开内嵌申诉表单（理由 + 选填图片，转 DataURL）提交 `POST /api/user/appeal`；不允许时提示线下联系超级管理员。
    - 管理后台入口与页面访问均限定权限 ≥ super_admin（developer / super_admin）。
29. **提交限频与覆盖**：学生认证（`POST /api/student/apply`）与申请解封（`POST /api/user/appeal`）均改为**同一用户 10 分钟内只能提交一次**（不足 10 分钟返回 429），且**允许提交时先删除该用户旧记录再写入（覆盖上一次）**，避免管理端出现重复申请。`student_verify.html` 与 `login.html`（申诉表单）均新增提示「重复提交将覆盖上一次申请；10 分钟内只能提交一次。」，并展示后端返回的限频提示。
30. **合并「关于我们」到首页**：将原 `about.html` 的正文（关于我们 / 发起原因 / 联系方式）并入 `index.html` 的 `<main>`（`.main` 改为 `min-height` 以免内容被裁切），删除 `about.html`；`auth.js` Logo 下拉的「关于我们」改指向 `index.html`。
31. **导航栏精简与 Logo 交互**：删除全部页面的「首页」导航按钮（共 10 个 HTML）；Logo 下拉仅保留「更新公告」（移除「关于我们」）；Logo 增加悬停下划线，点击 Logo 跳转 `index.html`（下拉内部链接除外）。
32. **更新公告上移到顶部导航**：把「更新公告」从 Logo 下拉移到顶部导航（各页导航变为 校园地图 / 论坛 / 菜谱评价 / 更新公告）；Logo 彻底取消下拉菜单（移除 caret/menu 相关 CSS/JS），仅保留悬停下划线与点击回首页。
33. **论坛点赞**：新增 `post_likes` 表（`UNIQUE(post_id,user_id)`）；`GET /api/forum/posts` 改为 `checkRole()` 放行并附带 `like_count`、`is_liked`；新增 `POST /api/forum/posts/:id/like`（已赞返回 400「已点赞」）与 `DELETE /api/forum/posts/:id/like`；删帖时级联清理点赞。`forum.html` 每条帖子底部加「点赞（n）」按钮，`is_liked` 时高亮，点击按状态切换点赞/取消并本地更新计数（未登录提示「请先登录」且不发请求）。
34. **论坛详情页**：新增 `GET /api/forum/posts/:id`（含 `like_count`、`is_liked`，不存在 404）；`forum.html` 帖子**卡片整体可点击**（标题/正文/空白处）跳 `post.html?id=<id>`（点赞、回复、回复框、右键菜单等交互区不触发）；新建 `post.html` 详情页（正文 + 点赞；**进入默认展开回复界面**，可用「回复」按钮收起/展开）。
35. **修复点赞状态丢失**：`forum.html` 列表与 `post.html` 详情的 GET 请求此前未带 token，导致服务端始终返回 `is_liked:false`（离开再返回后点赞不高亮、且再点因「已点赞」400 无法取消）。现两处请求均在已登录时附带 `Authorization` 头，点赞高亮与取消恢复正常。
36. **学生认证拒绝 + 清理遗留申请**：`student_applications` 新增 `reject_reason`（自动迁移）；新增 `PUT /api/admin/student-applications/reject`（body `{ id, reason? }`，状态改 `rejected` 并记录原因，不改角色）；`admin.html` 审核项新增「拒绝」按钮 + 自定义遮罩层填选填原因。同时**清空历史遗留的学生认证申请**（11 条测试数据）并重置其自增序列。
37. **用户主键去空号**：将现存用户按顺序重排主键（`test2: 13 → 3`），同步更新所有 `user_id` 引用表，重置 `sqlite_sequence`，使 `users` 为连续的 1/2/3。
38. **特殊权限系统**：新增 `user_permissions` 表与 `requirePermission(perm)` 中间件（判定=角色权重达标 **或** 显式授权）。9 个管理接口改用细粒度权限（公告/横幅/邀请码/学生审核/用户管理/申诉 → super_admin；菜谱上传/地图弹窗 → admin）。`GET /api/me`、`GET /api/user/profile` 返回 `permissions`；`GET /api/admin/users` 附带每人 `permissions`；新增 `GET /api/admin/permissions` 与 `PUT /api/admin/users/permissions`（不能改自己或 ≥ 自己的人）。`admin.html` 菜单按权限过滤、用户管理新增「权限」勾选弹窗；`auth.js` 有任意授予权限即可显示「管理后台」入口；`map.html` 授予 `map_popup_edit` 即可编辑弹窗。
39. **文档**：新增 `README.md`（面向 GitHub 的项目说明）；`progress.md` 同步目录结构与最新功能。
40. **许可证统一为 AGPL-3.0**：新增 `LICENSE`（GNU AGPL v3 全文）；`package.json` 的 `license` 字段由 `ISC` 改为 `AGPL-3.0`；README 的 License 章节同步更新。
41. **纳入 data.db 与 uploads**：`.gitignore` 改为仅忽略 `node_modules/`、`.env` 及 SQLite 临时文件（`*.db-journal/-wal/-shm`），使 `data.db` 与 `uploads/` 随仓库提交；README 与本文档同步说明。
42. **补充文档**：新增 `项目文档.md`（概述/角色权限/功能/架构/数据模型/接口清单/部署规范）与 `开发计划模板.md`（迭代计划通用模板）。
43. **个人资料展示账号信息**：`profile.html` 个人资料顶部新增「账号信息」框，显示 **ID、权限等级（角色中文名）、特殊权限**（仅显示超出当前角色范围、通过 `user_permissions` 单独授予的权限，无则显示「无」）；数据取自 `GET /api/user/profile`（已含 `display_id`/`role`/`permissions`，无需改后端）。同时压缩个人资料页各框内边距与间距，减少留白。
44. **工单功能**：新增 `tickets` 表（标题/内容/可见范围/状态/批复内容+图片+人+时间）。普通用户在 `profile.html` 新增「提交工单」面板（标题、内容、可见范围：管理员及以上 / 超级管理员及以上 / 仅开发者，最低管理员）调用 `POST /api/tickets`，并在「我的工单」查看 `GET /api/tickets/mine`。`admin.html` 新增「工单管理」面板，可对可见范围内工单「批复」（**内容必填 + 图片选填**，`PUT /api/admin/tickets/reply`）。新增权限 `ticket_manage`(admin)。**管理后台菜单「学生认证审核 / 申诉处理 / 工单管理」在小红点提示未处理项**（`GET /api/admin/pending-counts`）。因工单最低可见级为管理员，管理后台进入条件由「≥ super_admin」放宽为「**≥ admin**」（`auth.js` 入口与 `admin.html` 判定同步调整）。
45. **需求 #4 全站 UI 改版**：统一 12 个现有页面及新增 404，采用「宣纸·黛青·朱印」令牌、组件和响应式布局；抽出共享及各页脚本；本地化 Leaflet 并调整配色和缩放，保留 227 个地图对象。原有账号、论坛、菜谱、认证、后台权限和工单流程保持原 API。新增浏览器回归，264 项检查通过，明暗主题与 360px/1280px 扫描零违规；参考组件 101 项通过。同步 UI 手册、项目结构、使用说明、里程碑快照及验收记录。
46. **需求 #5 独立菜品与网站内同步**：导入十篇历史种子（1,243 菜品、5,874 供应记录），统一 Node 拼音排序，菜品页改为目录/评价/每周食谱三个页签。developer 可配置提供商、加密 Key、视觉模型和每日北京时间；Node worker 直接抓官网、识别、复核及原子发布，支持进度、诊断、停止、重试和补图。13 项后端、295 项浏览器及全新 Node 生产安装通过；三张真实菜单抽核中发现的模型不一致由完整性门禁拦截，详情见 docs/menu-validation.md。生产无需 Python 或第二个服务。
47. **菜单 JSON 人工导入与复测**：三种管理角色可粘贴数组、新建批次、编辑已发布记录及失败识图候选、查看受限原图。增加严格预览、修改失效、整篇原子替换、版本/同步冲突检查与审计，18 项后端、331 项浏览器、技能包校验及全新生产安装通过。根 menu-json-rules.md 详述八字段规则，skills/szzx-menu 与 szzx-menu.skill 提供直接图片转 JSON 技能及离线格式验证。当前 vision-catalog-v2、openai/gpt-6-luna 三图实测无缓存，抽样四字段匹配 27/30，完整自动导入 0/3；诊断复核也存在误读，未把格式通过视为准确率保证。
48. **菜单同步审查修复**：① `lib/menu/config.js` —— 编辑 AI 设置（提供商/地址/模型/Key）时忽略前端提交的 `enabled:true`，一律保存为停用草稿。原逻辑仅在未提交 `enabled` 时才停用，导致自动同步开启状态下勾选保存会被整体拒绝、且新配置不落库；已补回归断言。② `public/js/pages/menu-admin.js` —— 针对单轮最多识别 10 篇的截断，任务列表在终态且 `total > processed` 时显示「仍有 N 篇待同步，可再次点击立即同步」提示，避免误以为已全部完成。
49. **修复图片查看器放大发虚**：`public/css/site.css` 的 `.viewer__img` 移除 `will-change: transform`。该属性使浏览器在缩放前按显示尺寸（长图约 210px 宽）预栅格化并缓存，随后 `transform: scale()` 放大会拉伸低分辨率纹理导致模糊；移除后浏览器按缩放后的尺寸重新栅格化，与旧版 `.zoom-img`（无该属性）行为一致。
50. **需求 #9 消息箱**：新增 `messages` 表（type/actors(JSON)/count/target/title/body/snippet/important/read_at）与 `users` 三条通知偏好列（`pref_comment`/`pref_reply`/`pref_like`，自动迁移）。论坛回复触发评论通知、点赞触发按目标聚合的点赞通知（取消点赞回退聚合），帖子删除级联清理消息。新增接口：`GET /api/messages`（type/unread/before 游标 + 每类未读计数）、`GET /api/messages/unread-count`、`PUT /api/messages/:id/read`、`PUT /api/messages/read-all`、`GET|PUT /api/user/preferences`、`POST /api/admin/notifications`（`announcement_publish`，向全体用户发送系统通知）。前端：新增 `inbox.html` + `public/js/pages/inbox.js`（按天分组、四类标签、只看未读、全部已读、点击已读并跳转、系统长文折叠、聚合点赞文案），`ui.js` 开启 `features.inbox` 并启用页头消息铃未读数轮询，`profile.html` 新增「消息通知」偏好面板，`admin.html` 新增「发送系统通知」面板。空环境（无 `.env`）下服务器用默认密钥，端到端与浏览器冒烟均通过、控制台零报错。
51. **需求 #6 三元坊必吃榜（首期）**：新增 `shops` 表与 `lib/shops/` 校验/路由，公开 `GET /api/shops[/:id]`、`GET /api/shops/meta`，`POST /api/shops` 后端再次校验 `shop_create`（默认 student，可由 `SHOP_CREATE_MIN_ROLE` 调整，也可显式授权）。页面支持本部单一出发点、地铁出口步行字段、预设/自定义标签、拼音 A–Z、店名/道路/商场搜索、距离/步行时间范围筛选及整卡详情导航。首期范围曾使用四个近似 DMS/WGS84 顶点，后在 #55 全域调整中替换。高德 Web 服务 Key 仅存 `.env` 服务器端；同源静态底图代理和 HTML 标记不将 Key 交给浏览器。增加 `npm run test:shops` 与 `npm run test:shops:ui`。

52. **首页入口与品牌绿主题**：首页「功能入口」新增「必吃榜」卡片，指向 `/shops.html`，采用店铺图标和绿色色块。全站主色改为 `#085628`，同步浅色/深色主题的主色、hover/press、浅色背景及品牌标记；17 个 HTML 页的浏览器 `theme-color`、favicon SVG 与图标 fallback 均同步，favicon URL 加版本参数以绕过缓存。`ui.js` 切换明暗主题时地址栏颜色分别使用深绿与亮绿。浏览器回归 47 项通过，首页移动宽度无溢出。

53. **必吃榜点赞与评分评价**：迁移新增 `shop_likes`、`shop_reviews`（一名认证学生每店一条评价，可更新；`rating` 限 1–5），写操作后端重新查当前账号状态/认证角色，游客和未认证用户返回 401/403。店铺列表、卡片和详情显示点赞数、评价数、平均评分及评分数；支持按点赞/评价/评分排序，并以点赞、评价、评分最小/最大值过滤。详情页增加点赞按钮、1–5 星控件、文字评价和评价列表；店铺搜索 URL 可分享筛选。后端 13 项、浏览器 57 项测试通过。

54. **大众点评链接**：`shops` 表迁移新增可选 `dianping_url` 字段；添加店铺表单可粘贴链接，后端验证只允许 HTTPS 且主机为 `dianping.com` 或其子域，卡片和详情页有链接时显示安全外链（`noopener noreferrer`），无链接时不显示。后端 13 项、浏览器 58 项通过。

55. **必吃榜范围切换与姑苏区数据重录（2026-10-03 完成）**：`collect-pois.mjs` 使用高德行政区 adcode `320508` 的 323 点 GCJ-02 边界、小网格分页、区界过滤、去重和 tile 检查点；25/25 个根网格递归完成，得到 5,942 条唯一 POI。`enrich-candidates.mjs --slow` 补全地址、校园步行矩阵及最近地铁出口路线；5,629 条通过初筛，内存库预演确认 5,567 条可导入，62 条因同名去重。正式事务替换仅删除旧“高德地图 POI”记录 196 条，并导入 5,567 条；其余 313 条候选因地址不满足门牌格式、明确停业标记、名称超长或缺少地铁步行路线而跳过（原因可能重叠）。数据库当前 5,567 条均在区界内。数据仅代表高德可检索 POI，不承诺覆盖所有实际营业店铺。后端 13 项、浏览器 58 项测试通过；meta API 返回 323 点、zoom 11。

56. **必吃榜地图交互与近邻聚合**：静态图代理 `/api/shops/map-image` 接受中心点/缩放参数，中心限于姑苏区边界外扩 0.06°，缩放限制 9–18，并缓存最近 32 个视图。新增 `shops-map-interactive.js`：桌面拖动/滚轮/双击缩放，移动端拖动/双指缩放，缩放按钮与全域复位；近邻店铺以屏幕距离聚成数量徽标，点击后以聚合中心放大。底图仍走同源服务端 Key，不需浏览器 JS Key。真实页面冒烟验证 5,567 家、聚合点击、缩放、拖动动态底图成功；后端 13 项、浏览器 58 项通过。

57. **必吃榜详情双布局与一批修复（#7）**：店铺详情页提供「纵向 / 双栏」两种布局（分段切换、个人中心设默认、窄屏自动纵向并提示），评价区支持作者删除本人评价（`DELETE /api/shops/:id/reviews/me`）。个人中心网站设置新增「菜品与食谱默认页 → 菜品评价」「必吃榜默认排序」「必吃榜默认餐食类型」；`PUT /api/user/settings` 改为按字段部分更新。更新公告详情对有发布权限者显示「删除公告」+ 二次确认，无公告时空态居中；管理后台「更新公告」面板在发布表单下列出已发布公告并可逐条删除。学生认证已认证态移除「去论坛」按钮与解锁说明。必吃榜列表由「加载更多」改为分页器（每页 20 条，首页/末页/当前页 ±2/上一页/下一页，筛选、排序、搜索回到第 1 页）。修复：进入消息箱/后台或离开个人中心时误报「是否离开此网站」；后台「已上传菜谱」「已有邀请码」标题与上方表单过近；详情页仅学生可评价；上传评分与所选评分不符；选择评分时仅所选星亮起（改为选中星及左侧同亮）。

58. **必吃榜评价带图与人均价**：`shop_reviews` 迁移新增 `guests`、`total_price`、`image_url` 字段（旧库自动 ALTER）。`POST /api/shops/:id/reviews` 改用 multer 接收 multipart：可选一张 JPG/PNG 配图（≤2 MB，存 `uploads/shops/`，重传替换、勾选「不带图」或 `remove_image=1` 清除并删文件，删除评价同步清理）；可选 `guests`（1–99 整数）与 `total_price`（0–100000 元，两位小数），服务端按总价/人数计算并回传 `per_person`，纯 JSON 提交继续兼容。评价列表与我的评价返回新字段。详情页评价表单新增「就餐人数」「总价（元）」选填输入（输入时实时预览「人均约 ¥xx」）与「评价带图」勾选（展开上传区，复用 `UI.upload` 组件，支持拖拽、预览、移除，更新时回填已有配图可换可移）；评价卡片显示「N 人 · 人均 ¥xx」和可点击放大的配图缩略图。`tests/shops.test.cjs` 新增 `tests/review-image.test.cjs`（后端 14 项），浏览器回归 `tests/shops-ui.mjs` 新增 6 项检查共 64 项通过。

59. **需求 #10 头衔系统**：新增 `lib/titles/` 模块。`store.js` 建 `titles`（名称/颜色/来源/规则/描述/`owner_user_id`）、`user_titles`（拥有关系，`granted_by` 为空表示自动发放）与 `user_login_days`（登录逐日历史，供周末统计）三张表，给 `users` 自动迁移 `equipped_title_id`（佩戴状态，一次最多一个）以及 `login_streak`/`last_login_date`（连续登录计数），启动幂等写入 14 个头衔种子。`rules.js` 是可扩展的自动规则注册表（`{key,label,measure}`），本轮实现 **11 条自动规则**：五个角色等级（`role_developer` / `role_super_admin` / `role_admin` / `student_verified` / `role_user`）+ 六个成就条件（累计推荐 10 家店铺、连续登录 7 天、论坛催化剂 = 3 篇帖子各获 ≥5 条评论、闲者爱上网 = 连续 3 个周末登录、高赞校友 = 发帖累计 30 个赞、校园老吃家 = 10 篇菜品评价且排除 `is_weekly`）；新增条件只需注册表加一项并给 `titles.rule` 关联目录行。角色口径：**每个角色恰好一枚等级徽章且互斥** —— 开发者（`developer`）/ 超级管理员（`super_admin`）/ 管理员（`admin`）/ 学子（`student`，精确匹配）/ 同窗（`user`）；`evaluateAutoTitles` 在角色变化时自动换发等级徽章（升为超级管理员会收回「管理员」并发放「超级管理员」），成就类头衔只增不减，两者可并存。`guest` 未登录、没有账号，无法持有头衔。「师者」不绑定角色，改为手动授予留给真正的教职员工（`migrate()` 会把早期作为自动头衔的「师者」目录行转为手动，已发放的拥有关系保留）。「我的头衔」的未达成列表按完成度从高到低排序。`routes.js` 提供用户与后台接口，`server.js` 挂载。新增特殊权限 **`title_manage`**（默认 super_admin），同步 `server.js` 标签表与最低角色表、`public/js/ui.js` 的 `PERMISSION_LABELS`、`public/js/pages/profile.js` 权限映射。接口：`GET /api/user/titles`（已拥有头衔含佩戴状态 + 未达成自动头衔的进度文案）、`PUT /api/user/title`（佩戴/不佩戴，未拥有 403、非法 id 404）、`GET /api/admin/titles/rules`、`GET|POST /api/admin/titles`、`PUT|DELETE /api/admin/titles/:id`、`POST /api/admin/users/:id/titles`（自动头衔不可手动授予，409；重复授予幂等）、`POST /api/admin/users/:id/titles/custom`（超管为单个账号颁发专属自定义头衔：名称 1–8 字 + 8 色任选，写 `titles.owner_user_id`；同名沿用同一行；公共目录与 `/api/admin/titles` 都不列出；该账号撤销时目录行一并删除）、`DELETE /api/admin/users/:id/titles/:titleId`（撤销佩戴中的头衔会清空佩戴并写入一条系统消息）。自动头衔在登录（`recordLogin` 更新连续登录后评估）、新增店铺（`mountShopRoutes` 新增 `onCreated` 回调）与打开「我的头衔」时评估，不引入定时任务。统一用户组件补数据：个人资料返回佩戴头衔，论坛帖子/回复补齐 `nickname/avatar_url/role` 并附佩戴头衔，店铺评价卡改用 `UI.userLine`；由于 `forum_posts` 自身有 `title` 列（帖子标题），佩戴头衔统一放在 `user_title` 字段，避免覆盖。前端：`profile.html` 新增「我的头衔」面板（佩戴预览、脏检测后启用保存、不佩戴、未达成自动头衔的锁定卡与进度（按完成度从高到低排序）、撤销后回退）；针对具体账号的授予/撤销/专属颁发在后端统一校验目标权重（不能给自己或权重不低于自己的人，与改角色/封号的既有约定一致），`admin.html` 新增「头衔管理」面板（目录表格、新建/编辑对话框含 8 色 chip 预览、删除二次确认、用户表新增头衔列与授予/撤销、授予对话框底部「专属头衔」名称输入 + 选色 + 颁发），`ui.js` 开启 `features.titles`。新增 `tests/titles.test.cjs`（后端 14 项，覆盖规则引擎与全部等级/成就规则、周末窗口计算、目录 CRUD、授予撤销与系统消息、佩戴、自动发放、专属头衔可见性与清理、目标权重边界、序列化与权限）并挂入 `npm test` 的 `test:titles`；`tests/ui-smoke.mjs` 新增 31 项头衔检查（佩戴流程、重名内联报错、目录增删、用户表徽章、专属头衔颁发与撤销、等级头衔与学子锁定、未达成列表只渲染进行中的、360/1280 布局与 axe），浏览器回归共 **363 项通过**。同时修掉 `tests/ui-smoke.mjs` 菜单同步面板的一处既有竞态：面板打开会异步 `refresh(true)` 回填表单，迟到的回填会覆盖测试刚填入的值，导致间歇超时；现在等待 `networkidle` 并以「界面回显 + 接口落库」双重断言、必要时重试，连续多次全绿。文档同步 [docs/issue-10-plan.md](./docs/issue-10-plan.md)、[头衔页面规范](./docs/ui/pages/titles.md)、本文件与 [MAP.md](./MAP.md)、[README.md](./README.md)。

60. **头衔系统审查修复（#10 复审）**：① 自动头衔不可手动撤销——`revokeTitle` 对 `source === 'auto'` 返回 409（此前撤销后会被规则再次发放，易被误解为失效），前端用户表与授予弹窗对自动头衔不再渲染撤销按钮（标「自动」）；② 内置头衔不可删除——`deleteTitle` 对带 `key` 的种子行返回 409（此前删除会在重启时被 `migrate()` 重新播种），前端删除按钮置灰禁用；③ 专属头衔不再与公共目录同名（`createExclusiveTitle` 重名返回 409，避免同一徽章名出现两次）；④ 自动头衔改为**即时评估**：发评论、点赞（评估帖子作者）与发布菜品评价（评估作者）后立即调用 `evaluateAutoTitles`，与登录、新建店铺、打开「我的头衔」一致，无需等待下次评估；`ui.js` 补相应错误文案。`tests/titles.test.cjs` 新增 1 项保护与即时发放用例（后端 15 项通过）。

61. **下线角色等级头衔（#10 调整）**：角色改由界面上的「权限等级」标签体现后，删除按角色自动发放的等级头衔（开发者/超级管理员/管理员/学子/同窗），避免重复。`lib/titles/store.js` 的种子由 14 个减为 9 个（六个成就 + 三个手动），`lib/titles/rules.js` 移除角色规则与等级头衔的换发/收回逻辑；启动迁移会清理旧库中的这些目录行及其拥有与佩戴记录。`tests/titles.test.cjs`（13 项）与 `tests/ui-smoke.mjs` 的头衔用例同步更新。

62. **2026-10-09 · 配套地图编辑器审查与文档维护规则**：`../szzx-mapeditor` 参照本项目地图数据、渲染器和页面规范，修复绘制、输入快捷键、属性/文件校验、拖动、缩放、导入、缓存、历史及窄屏问题；内置地图与本项目 `data.json` 的 227 个要素完全一致。编辑器新增 `MAP.md` 和 16 组真实离线浏览器回归（Windows Edge 全部通过、零未捕获异常）；测试未运行本网站服务，未修改本项目生产代码、地图、数据库或依赖，既有未提交改动保留。本仓库新增 `agent.md` 兼容入口并强化 `AGENTS.md`，明确每次代码更新必须同步相关文档并实质修改最新根目录 `MAP.md`；同步 README、项目地图、地图页面兼容说明与本条记录。当前网站不会读取编辑器单独颜色、分段边线、字体样式与手动层级，这一边界已明确记入双方文档。本轮本仓库仅有文档变更，未重新执行网站业务测试。

63. **个人中心拆分出「设置」（#19）**：新增 `public/settings.html` + `public/js/pages/settings.js`，与个人中心同构（`.shell` + `.side-nav` + `.view` 分区），承接从 `profile.html` 迁出的「账号安全、网站设置、工单、消息通知、退出登录」；`profile.html` / `public/js/pages/profile.js` 精简为「个人资料 + 我的头衔」两个分区。`public/js/ui.js` 的 `accountLinks()` 在「个人中心」与「管理后台」之间新增「设置」入口（桌面头像菜单与手机抽屉同步），页脚「提交工单」及 `index.html`/`inbox.html` 的相关链接改指 `settings.html#tickets` / `settings.html#messages`。`tests/ui-smoke.mjs` 的工单与网站设置用例改走 `settings.html`。文档同步：新增 `docs/ui/pages/settings.md`，更新 `docs/ui/pages/profile.md`、`docs/ui/pages/inbox.md`、`docs/ui/pages/system-pages.md`、`docs/ui/components.md`、`docs/ui/copy.md`、`UI.md`、`MAP.md`、`README.md`、`CHANGELOG.md`。浏览器聚焦验证：设置页四分区切换 + 退出登录、账户菜单顺序「个人中心 / 设置 / 管理后台」、个人中心仅两分区、无页面报错。

64. **个人中心重做（#20，类 B 站）**：`profile.html` 重写为**资料头部 + 吸顶横向菜单栏**。头部：头像（含右下编辑按钮、与容器左缘留距）+ 上行「用户名（唯一可见 `<h1>`）/ 权限等级标签 / 昵称」+ 下行「个性签名」；昵称与个性签名改为 `contenteditable`（优先 `plaintext-only`，不支持则退回 `true` 并过滤粘贴 HTML）**点击即可编辑**，失焦且有变化时 `UI.confirm` 询问是否保存，保存走 `PUT /api/user/nickname` / `PUT /api/user/signature`，取消或失败还原原值，昵称空则提示并不保存。横向菜单栏 `.profile-tabs`（`position: sticky; top: var(--header-h)`）含「主页 / 收藏 / 头衔 / 设置」：主页与收藏为 `UI.html.empty` 空页面，头衔沿用原「我的头衔」面板（`#view-titles`、`#titleChoices`、`#titlesLocked`、`#wearSubmit` 等 id 保留），「设置」为普通链接直接跳转 `settings.html`（无返回键）。分区切换沿用 `UI.page.panels`（hash `#home/#favorites/#titles`）；`public/css/site.css` 以 `.profile-hero` / `.profile-tabs` 替换原 `.profile-head` 样式（保留 `.avatar-edit`）。聚焦浏览器验证（1280/360）：头部与菜单项渲染、主页/收藏/头衔切换、昵称编辑（取消还原 + 保存写库）、菜单栏 `position: sticky`、axe 0、无横向溢出、可见 h1 = 1、零报错；`test:titles` 13 项通过。

65. **头像进入用户主页（#21）**：后端新增公开接口 `GET /api/users/:id/profile`（昵称/签名/头像/角色/`show_role`/状态/佩戴头衔）与 `GET /api/users/:id/titles`（已拥有头衔，只读），以及 `GET /api/admin/users/:id`（单用户管理信息：角色/状态/显式权限/头衔）。前端 `public/js/ui.js` 新增 `UI.userHref()` / `UI.avatarLink()`：本人头像 → `profile.html`，他人 → `user.html?id=`；`UI.userLine` 改为头像可点击（传入 `opt.href` 时不嵌套链接），`public/js/forum.js` 的回复头像同步改用。新增 `public/user.html` + `public/js/pages/user.js`：与个人中心（#20）同版式但**只读**——资料头部不可编辑、权限等级由目标 `show_role` 决定、无设置入口、头衔只读；当访问者权重高于目标（非本人）且具备 `user_manage` / `title_manage` 时追加**「管理」**分区，可改权限等级、发放特殊权限、发放/撤销头衔（含专属）、封号/解封，均复用既有管理接口；访问 `user.html?id=<本人>` 自动跳转个人中心。`public/css/site.css` 增加 `.user-avatar--link` 及 `.profile-hero__nickname/__signature`。新增独立回归 `tests/user-ui.mjs`（25 项，含 1280/360 axe 审计）并加 `npm run test:user`，接入 `npm test`。文档同步：新增 `docs/ui/pages/user-home.md`，更新 `AGENTS.md`、`MAP.md`、`README.md`、`UI.md`、`docs/ui/components.md`、`docs/ui/copy.md`、`docs/ui/pages/profile.md`、`CHANGELOG.md`。验证：`test:user` 25 项通过、`test:titles` 13 项通过、`test:shops` 14 项通过。

---

## 10. 已知事项 / 待办

2026-10-09 文档维护补充：配套 `szzx-mapeditor` 已参照本项目地图数据和渲染器完成检查；跨项目协作规则与兼容边界见上方第 62 条及两仓库 `MAP.md`。

- #5 独立菜品目录与同步、#6 姑苏区全域店铺榜首期及交互地图、#7 店铺详情双布局与评价删除、#9 消息箱、#10 头衔系统已实现；当前有 5,567 条通过校验的高德餐饮 POI。采集源可能漏掉未被高德收录或检索返回的实际店铺；未通过地址/营业状态/路线/名称校验及同名项未导入。交互地图使用同源服务器端静态图代理，无需浏览器 JS Key。**#8 店铺菜品关联仍待实施**。菜谱同步仍需 developer 配置提供商/Key/模型并开启。
- #10 自动头衔目前有六个成就条件（推荐店铺、连续登录、论坛催化剂、闲者爱上网、高赞校友、校园老吃家）；角色等级头衔已下线（角色改由权限等级标签体现），注册时间等示例条件留作扩展（规则注册表 + 目录即可新增）。自动头衔不可手动撤销（撤销返回 409，会被规则重新发放），内置（种子）头衔不可删除（删除返回 409，重启会重新播种）；仅手动头衔可由管理员撤销拥有关系、仅非内置目录行可删除，规则本身不提供「取消达成」；成就头衔只增不减，数据被删（帖子/评价被删）也不会收回已获得的成就徽章。「师者」为手动授予。专属头衔只服务于所属账号，撤销即删除目录行，不能转正为公共头衔。「闲者爱上网」依赖 `user_login_days`，该表从上线起累积，历史登录无法回填。`guest` 无账号，无法持有头衔。
- 地图建筑插画为类型示意，地点说明采用维护者确认的现用途与已核对的公开背景，可继续补充真实建筑细节；当前单一地图北向上，篮球场与操场均为大面积示意场地，旧楼层页面已移除。
- 主题切换入口是手册 P2 能力，当前未开启。
- 回归测试可用 `npm.cmd test` 重跑，在系统临时目录中运行，不修改项目数据库或上传数据；输出在被忽略的 `output/playwright/`。
- 部署需要 Node 后端及可写、持久化的数据存储；该站点不能直接部署到 GitHub Pages。

---

## 11. 编码约定

- 前端继续使用原生 HTML/CSS/JavaScript，不增加构建流程；页面业务脚本放在 `public/js/pages/`。
- 颜色、字号、间距、圆角和组件以 UI.md 与 `public/css/site.css` 的令牌为准；校园地图的局部令牌在 `public/css/map.css`，当前页面不读取旧 `data.json.style`。
- 公共交互使用 `UI.*`，跨页业务工具使用 `UI.page` 和共享论坛脚本，避免重复实现。
- 所有动态文本经过 `UI.esc` 或 `textContent`；URL 使用 `UI.safeUrl`；受限操作继续由后端校验权限。
- 接口失败提供中文错误和重试入口；提交按钮管理 busy 状态，确认和输入使用统一对话框。
- 修改共享组件或业务脚本后运行仓库回归，并按设计手册核对键盘、手机布局与明暗主题。

## 12. 后续开发记录

66. **2026-10-17 · #11 校园地图完整重做**：按用户提供的粗略卫星标注图制作北向上 SVG 导览，补齐 28 个地点，涵盖南部校园与文庙；「来秀坊」「泮水居」名称经用户确认。新增 `public/js/campus-places.js`、`public/img/map/campus.svg`、`public/css/map.css`，重写地图页面与脚本，提供地点名/别名搜索、分类过滤、SVG 插画选点、介绍卡、目录折叠、键盘与触控操作、全景复位和明暗主题。原楼层渲染迁至 `map-floor.js` 并延迟加载，保留 1F–4F、默认楼层、原有接口和弹窗编辑权限；不修改数据库与 227 个楼层要素。新增 `tests/map-ui.mjs` 并接入 `npm test`；维护全站回归的双视图入口，并修正原测试脚本的浏览器平台选择、角色保存等待时机及个人中心/设置页过期选择器。全站扫描同时发现共享骨架屏命名缺少有效角色，已补齐 `role="status"`，不改变外观。相关页面规范、文案、README、UI 手册、CHANGELOG 与根目录 MAP 已同步。验证：地图专项 `npm run test:map` 127 项、全站浏览器 `npm run test:ui` 369 项均通过；地图覆盖 1440×1000、390×844、360×740、1280×900、844×390，明暗主题、键盘、鼠标拖动、双指缩放与失败重试均通过，axe、页面报错与横向溢出为 0。菜单后端 18 项、头衔后端 13 项、店铺后端 14 项、店铺浏览器 64 项、用户主页浏览器 28 项亦通过。所有测试使用隔离数据库和上传目录。


67. **2026-10-17 · #11 校园地图精简与 Mac 手势调整**：按用户反馈删除旧楼层页面及渲染脚本、顶部视图切换器，并移除设置页默认楼层字段及其读取/保存逻辑；后端旧接口、数据库字段与楼层数据仅保留兼容。普通滚轮或双指滚动改为双轴平移，捏合及 Ctrl / ⌘ + 滚轮以指针为中心连续缩放；按帧合并事件，兼容 Safari 原生手势并抑制重复滚轮，保留手机触控缩放。移除固定平移边界，修复宽屏回弹与缩放锚点漂移。篮球场扩大为 210 × 330 的纵向 SVG 场地，与 290 × 370 的操场呼应，地点可独立配置高度。相关页面规范、设置规范、文案、README、UI 手册、CHANGELOG、验收记录与根目录 MAP 已同步。验证：地图专项 134 项、全站浏览器 370 项通过，覆盖旧视图/请求移除、篮球场尺寸、双轴平移、连续缩放、指针锚定、Safari 手势、搜索与选点、键盘、手机、明暗主题及失败重试，axe、横向溢出和页面报错均为 0。桌面及手机截图已人工检查；Safari 手势在 Chromium 中模拟事件验证，未测试 Safari 引擎或实体 Mac 触控板。测试使用临时数据库与上传目录。


68. **2026-10-17 · #11 地标点选与介绍优化**：将悬停、焦点及选中光晕统一绘制在所有建筑下方，不改变建筑顺序，修复东红楼选中背景遮挡相邻楼宇的问题。点选保留当前缩放，可见地标不移动；仅在离屏或被详情、控制条遮挡时计算最短平移，以460ms缓出动画避让，减少动态效果模式直接完成，键盘聚焦采用相同策略。手机详情卡限制高度并保留地图可见区域，标题与关闭入口固定，长文可键盘滚动，覆盖从泮水居切换至希文楼长介绍的边界场景。按维护者补充的校内用途和已阅读的学校官网、我苏网原文重写全部28处介绍，移除位置行，新增用途摘要、用途搜索及10个可查阅来源，希文楼归入生活类。新增 docs/map-sources.md 记录公开引用与校内补充的支持范围，相关页面、文案、组件、UI、README、CHANGELOG及根目录MAP同步。验证：地图专项169项、全站浏览器370项通过，包含建筑层级、可见与边缘点选、动画中间帧、用途搜索、长文来源、手机键盘滚动及既有触控/键盘/明暗/失败回归；axe、横向溢出及页面报错均为0。人工检查东红楼、泮水居、手机详情及暗色长文截图。未改后端接口、数据库或示意坐标。


69. **2026-10-17 · #11 校园位置校准与地表细化**：依据维护者新增位置参考图重排全部建筑与地块，校准三元楼长条、科学楼U形、红楼草坪、尊经阁、文庙及南部生活区；补充墨子馆、府学碑廊、泮池与泮桥，共31个可检索地点。细化春雨池矩形水面、碧霞池折线岸、道山曲径、东侧林地交叉园路、文庙庭院殿堂及竹林；粉色地块保留无名轮廓，梦工厂仅作周边参考。篮球场为132×292、北部六片加南部一片，操场扩大为310×568并细化跑道与足球场。标签新增偏移及相对字号，点击范围限于地块和文字，保留原有选中层级、镜头避让与触控手势；补充明暗主题地表令牌，暗色保持园路及场线可读。原28处已确认用途保留，新地点仅采用图中名称和可支持的文化背景，不虚构墨子馆现用途。同步页面规范、资料来源、文案、组件、UI、README、CHANGELOG、验收及根目录MAP。验证：地图专项197项、全站浏览器370项通过，新增31地点、地表分区、空间顺序、球场布局/比例及新地标实际点击验证；五种尺寸明暗主题axe、横向溢出与页面报错均为0，人工检查桌面/手机/暗色/详情截图。未改后端、数据库及归档楼层数据。


70. **2026-10-17 · #11 政道楼信息及球场遮挡修复**：按维护者确认将墨子馆更名政道楼，保留旧名搜索，更新为北京大学中学物理实验教学中心，并补充“文正之道”寓意和对诺贝尔物理学奖得主李政道先生的致敬，删除原墨家介绍。确认篮球场标签下缘进入操场透明热区并被后绘操场覆盖，将标签移回篮球场自身地块底部，保持建筑和场地既有绘制顺序。新增五种尺寸下的旧名查找、新介绍、标签与操场分离及标签下缘实际点选回归，地图专项217项、全站浏览器370项通过；axe、横向溢出与页面报错为0，人工核对桌面与手机截图。相关页面、文案、来源、组件、UI、README、CHANGELOG、验收和根目录MAP同步。
