# 校园地图项目 · 进度文档（progress.md）

> 用途：开启新对话时，把本文件贴给 AI，即可快速恢复上下文并继续开发下一个功能。

---

## 1. 项目简介

一个黑白极简风格的校园信息网站，含**首页、可切换楼层的交互式校园地图、论坛、菜谱评价、更新公告、个人中心（设置）、管理后台**，并带一套**账号系统**（注册 / 登录 / JWT / 角色权限 / 资料修改）与**全站横幅**。
后端为 **Node.js + Express**，地图几何数据抽离到 `data.json`，前端 `fetch` 动态绘制并已上色（低饱和度实景风格）。数据库使用 **SQLite（Node 内置 `node:sqlite`）**。

---

## 2. 运行环境与依赖

- 运行环境：Node.js **v24.21.0**，npm **11.19.0**（Windows 10，PowerShell）
- 依赖（`package.json`）：`express ^5.2.1`、`cors ^2.8.6`、`bcrypt ^6.0.0`、`jsonwebtoken ^9.0.3`、`multer ^2.4.0`、`dotenv ^18.0.3`、`nodemailer ^10.0.10`（**已弃用未引入**）
- **数据库**：使用 Node 内置模块 `node:sqlite` 的 `DatabaseSync`（**未安装 `sqlite3`**，因其在 Node 24 无预编译包且本机缺 Python/编译工具而安装失败；改用内置模块，零依赖）。
- 启动：
  ```
  npm.cmd start        # = node server.js（PowerShell 默认策略会阻止 npm.ps1，故用 npm.cmd）
  ```
- 访问：
  - 首页 <http://localhost:3000/>
  - 地图 <http://localhost:3000/map.html>
  - 接口 <http://localhost:3000/api/map-data>
- 停止服务：结束监听 3000 端口的 node 进程。
- 说明：修改 `data.json` **无需重启**（每次请求实时读取）；修改 `server.js` 需重启。

---

## 3. 目录结构

```
项目文件夹/                     ← 项目根目录（Git 仓库根）
├── node_modules/              ← 已加入 .gitignore
├── uploads/                   ← 图片上传目录（头像/菜谱；uploads/weekly/ 存每周菜谱图片）（已加入 .gitignore，启动时自动创建）
├── public/                    ← Express 静态目录
│   ├── index.html             ← 首页（含默认界面跳转脚本）
│   ├── map.html               ← 校园地图（fetch 数据动态绘制）
│   ├── login.html             ← 登录页
│   ├── register.html          ← 注册页
│   ├── forum.html             ← 论坛
│   ├── recipe.html            ← 菜谱评价
│   ├── announcements.html     ← 更新公告（左侧公告列表 + 右侧详情）
│   ├── about.html             ← 关于我们（项目介绍 / 发起原因 / 联系方式）
│   ├── admin.html             ← 管理后台（编辑横幅 / 更新公告）
│   ├── student_verify.html    ← 学生认证（新生号/班级/真实姓名/邀请码）
│   ├── profile.html           ← 个人中心（设置：个人资料/账号安全/网站设置）
│   └── auth.js                ← 全站共享脚本（导航头像/登录态、菜单栏折叠）
├── data.json                  ← 地图数据（几何 + 名称 + 弹窗 + 颜色），约 178 条 feature
├── data.db                    ← SQLite 数据库（已加入 .gitignore）
├── server.js                  ← Express 后端
├── package.json / package-lock.json
├── .env                       ← 端口与密钥（已加入 .gitignore）
├── .env.example               ← 环境变量模板
├── .gitignore                 ← node_modules/  .env  *.db  *.db-journal  uploads/
└── progress.md                ← 本文件
```

---

## 4. 环境变量（.env）

```
PORT=3000
MAIL_USER=your_email@example.com      # 已弃用
MAIL_PASS=your_smtp_auth_code         # 已弃用
MAIL_HOST=smtp.qq.com                 # 已弃用
MAIL_PORT=465                         # 已弃用
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
```

---

## 5. 数据库结构（node:sqlite）

初始化在 `server.js` 启动时执行 `CREATE TABLE IF NOT EXISTS`（含旧表迁移：若 `users.email` 为 `NOT NULL` 则重建为可空；启动时回填 `avatar_url` 空值；删除废弃的 `verify_codes`）。

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE INDEX idx_forum_category ON forum_posts(category);
CREATE INDEX idx_forum_replies_post ON forum_replies(post_id);
CREATE INDEX idx_recipes_weekly ON recipes(is_weekly);
CREATE INDEX idx_announcements_date ON announcements(publish_date);
CREATE INDEX idx_student_applications_user ON student_applications(user_id);
```

初始化时执行 `INSERT OR IGNORE` 写入 `banner`（默认「欢迎来到校园信息网」）、`banner_version`（默认 `0`）与 `student_invite_code`（默认空字符串）三条设置；`banner_version` 每次更新横幅自增，用于「同一账号关闭横幅后，直到下次更新才再显示」。

时间字段（`created_at`）为 Unix 时间戳（秒）；`announcements.publish_date` 为 `YYYY-MM-DD` 文本。

---

## 6. 后端接口（server.js）

中间件：`cors()`、`express.json()`、`express.static(public/)`、`express.static(uploads/) → /uploads`，以及末尾统一的 JSON 错误处理。

**账号**
- `POST /api/register` — body `{ username, nickname, password }`；用户名重复 409；**第一个用户 role='developer'**，其余 'user'；bcrypt 哈希。
- `POST /api/login` — body `{ username, password }`；成功返回 `{ token, user }`；**JWT payload = { id, role, username }**。
- `GET /api/me`、`GET /api/admin/ping`（示例权限接口）。

**权限中间件**
- `ROLE_WEIGHTS = { developer:6, super_admin:5, admin:4, student:3, user:2, guest:1 }`
- `checkRole(requiredRole)`：解析 `Authorization: Bearer <token>`；无/无效 token **不报 401**，而是 `req.user = { id:null, role:'guest', username:null }` 放行；若指定了 requiredRole，则按权重比较，不足返回 **403**。token 缺 `username` 时按 id 回查数据库补全。
- `requireLogin`：基于 `checkRole()`，未登录返回 **401** `{ error:"login required" }`。

**个人资料**（均需登录）
- `GET /api/user/profile` — 返回 `{ user: { id, username, nickname, avatar_url, signature, role, default_page, default_floor, recipe_default_view } }`
- `POST /api/user/avatar` — multer 字段名 `avatar`，限 2MB、仅 jpg/png，存 `uploads/`，返回 `{ avatar_url }`
- `PUT /api/user/nickname` — body `{ nickname }`
- `PUT /api/user/signature` — body `{ signature }`
- `PUT /api/user/settings` — body `{ default_page, default_floor, recipe_default_view }`；页面仅允许 index/map/forum/recipe，楼层 1–4，菜谱默认页 all/weekly，非法值回退默认，更新当前用户记录
- `PUT /api/user/password` — body `{ oldPassword, newPassword }`（兼容 `old_password`/`new_password`）；旧密码错误 400

**论坛**
- `GET /api/forum/posts?category=讨论` — 按 `created_at DESC`；返回附带 `reply_count`
- `POST /api/forum/posts` — 需登录；body `{ category ∈ {讨论,提问}, title, content }`
- `DELETE /api/forum/posts/:id` — 需登录；仅**帖子作者**或**管理员（权重 ≥ admin）**可删，删除时级联删除其回复；无权限 403、不存在 404
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
- `GET /api/admin/settings/invite-code` — 返回 `{ invite_code }`（旧的单邀请码，保留兼容）
- `PUT /api/admin/settings/invite-code` — body `{ invite_code }`（旧的单邀请码，保留兼容）
- `GET /api/admin/invite-codes` — 返回所有邀请码（含 `max_uses`、`used_count`）
- `POST /api/admin/invite-codes` — body `{ code, max_uses }`（`max_uses` 为 0 表示不限次数；重复码 409）
- `DELETE /api/admin/invite-codes/:id` — 删除邀请码
- `GET /api/admin/ping` — 权限探测示例

**设置（公开）**
- `GET /api/settings/banner` — 返回 `{ banner, version }`，供全站横幅使用

**学生认证**
- `POST /api/student/apply`（需登录）— body `{ student_id, class_name, real_name, invite_code?, extra_info? }`；先查 `invite_codes` 表：**存在且未超过 `max_uses`（0=不限）**则 `used_count` 自增并把当前用户角色升级为 `student`（不会降级更高角色），返回 `{ status:"approved", role:"student" }`；否则再回退匹配旧的单邀请码 `settings.student_invite_code`；都不通过则写入 `student_applications`（`status='pending'`，含可选 `extra_info`），返回 `{ status:"pending" }`。缺少必填字段 400，未登录 401。

---

## 7. data.json 结构与坐标系

结构与字段：

```jsonc
{
  "meta": { "rectW": 1200, "rectH": 700, "axisY": 420, "minZoom": -1, "maxZoom": 6 },
  "style": {
    "outline": "#333333",
    "labelColor": "#777777",
    "fillOpacity": 0.6,
    "palette": { "building": "#D9D9D9", "green": "#D1E8D1", "water": "#B3D9FF", "white": "#FFFFFF", "none": null }
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

### 8.1 公共导航（各页顶部 header）
- 左侧 Logo「校园信息网」为**可点击按钮**（`auth.js` 注入 `logo-caret` 与 `.logo-menu` 下拉），悬停或点击时在下方弹出「更新公告」（`announcements.html`）与「关于我们」（`about.html`）；右侧导航：**首页 / 校园地图 / 论坛 / 菜谱评价**；最右为登录态区域（`.auth#authArea`）。
- **共享脚本 `public/auth.js`** 负责：
  1. **登录态渲染**：读 `localStorage.token` → 调 `GET /api/user/profile` → 已登录显示**圆形头像**（点击跳 `profile.html`，无头像显示昵称首字），未登录显示「登录 / 注册」；401 自动清理。
  2. **菜单栏折叠**：在菜单栏**正下方右下角外侧**注入小三角按钮（44×22，紧贴下边框的凸片），点击后带动画收起菜单栏；收起后在右上角显示同尺寸的展开三角。状态存 `localStorage.navCollapsed`。
  3. **全站横幅**：加载时调 `GET /api/settings/banner`，将文本渲染为导航栏上方全宽黑底白字横幅（空则不显示），并把高度写入 CSS 变量 `--banner-h` 以修正首页/地图布局位移。横幅右侧有 **×** 关闭按钮：关闭后按账号记录 `bannerDismissed:<username>` = 当前 `version`，该账号在 `version` 未变化前不再显示；横幅更新（version 自增）后重新显示。
  4. **管理后台入口**：`GET /api/user/profile` 返回 `role`，当角色为 developer / super_admin 时，在导航右侧注入「管理后台」按钮（跳 `admin.html`）。
  5. **学生认证入口**：登录后（任意角色）在导航右侧注入「学生认证」按钮（跳 `student_verify.html`）。
  6. 全局注入相关样式（头像、横幅、折叠、地图/首页随折叠位移）。
  7. **Logo 下拉菜单**：把 `.logo` 变为可点击按钮并注入下拉（更新公告 / 关于我们），悬停或点击展开，点击外部关闭；对应 CSS/JS 均在 `auth.js`。

### 8.2 各页面
- **index.html**：首页。`<head>` 内脚本：访问根路径 `/` 时，若已登录则先调 `GET /api/user/profile` 取 `default_page` 跳转，否则按 `localStorage.defaultPage` 跳转（仅根路径，避免循环）。
- **map.html**：Leaflet 地图（`CRS.Simple`，右下缩放控件）；`labelsPane`(z650) 承载所有文字；`baseLayer` 常显 + `floorGroups[1..4]` 切换；右上 1F–4F 按钮（间距已下移避开折叠按钮）。进入时若已登录优先用账号 `default_floor`，否则用 `localStorage.defaultFloor` 选择默认楼层。WASD/方向键平移。
- **login.html / register.html**：账号表单；成功后 token+user 存 `localStorage` 并跳转首页；register 成功自动登录。
- **forum.html**：讨论/提问切换；**独立「发布帖子」按钮**点击后展开面板（未登录点按提示“请先登录”），面板底部有「收起」按钮；在提问版块点发布默认分类为「提问」。帖子列表带 `reply_count`，「回复（n）」展开回复列表并可发布回复（已登录）。**右键帖子卡片弹出上下文菜单**，作者本人或管理员可「删除帖子」（二次确认后删除并刷新列表）。
- **recipe.html**：全部（A-Z）/每周食谱切换；发布评价表单仅登录可见（菜名/评分1-5/评论/图片），图文卡片列表。**默认显示标签优先读账号 `recipe_default_view`，其次 `localStorage.recipeDefaultView`，再回退「全部」**。「每周食谱」标签**不显示评价表单**，改为调 `GET /api/weekly-menu`，每条上方一个**日期（起始-结束）按钮**用于展开/收起大图（不直接展示图片），大图下方左下角另有「收起」按钮（同一功能，均极简黑白风格）；点击大图可打开缩放层（**滚轮缩放、拖动、单击空白处关闭**，白底）；**仅上传者本人或 super_admin 及以上**时图片右上角显示「删除」（二次确认）；无数据显示「暂未上传本周食谱」。
- **announcements.html**：更新公告。左侧侧边栏列出公告日期 + 标题概览（点击切换），右侧主区域显示选中公告的标题、发布日期与正文；加载时 fetch `/api/announcements` 并默认选中最新一条。
- **admin.html**：管理后台（仅 developer / super_admin）。左侧菜单「编辑横幅 / 更新公告 / 学生认证审核 / 邀请码设置 / 每周菜谱管理」；编辑横幅读取 `GET /api/settings/banner`，点「确认修改」**先 `confirm()` 二次确认**再 `PUT /api/admin/settings/banner`；另有「取消横幅」按钮（二次确认后将横幅置空，全站不再显示）。更新公告填写标题/内容后 `POST /api/admin/announcements`。学生认证审核列出待审核申请（新生号/班级/真实姓名/提交人/补充信息），每条「通过」调用审核接口并移除。邀请码设置支持**多条邀请码**：输入邀请码与可用次数（0=不限）后「添加」，下方列出已有邀请码及「已用 x / y」并可删除。每周菜谱管理：选第一天与最后一天日期（点整框弹出日历）+ 「选择图片并上传」，**选图后在上传栏内显示大图预览与「确认上传 / 取消」按钮（不单独弹出界面）**，下方按日期倒序列出已上传图片（显示上传者用户名、缩略图点击可放大、可删除并二次确认）。非管理员进入会显示无权限提示。
- **student_verify.html**：学生认证。加载时查当前角色，若已是 student 或更高则显示「你已认证为学生」并隐藏表单；否则显示表单（新生号/班级/真实姓名/邀请码选填/**补充更多信息选填**，含提示），提交 `POST /api/student/apply` 后提示「认证成功」或「已提交，等待管理员审核」。
- **profile.html**：个人中心（设置）。左侧菜单栏：可折叠的「设置」→ 子项 **个人资料 / 账号安全 / 网站设置**；底部「退出登录」。
  - 个人资料：用户名（只读）、头像、昵称、个性签名（除用户名外均可改）。
  - 账号安全：修改密码。
  - 网站设置：默认进入界面（首页/地图/论坛/菜谱）、校园地图默认楼层（1F–4F）、菜谱评价默认页（全部 A-Z / 每周食谱）；**保存改为调用 `PUT /api/user/settings` 同步到账号**，并回写 `localStorage` 作为回退；页面加载优先读账号设置，无则回退 `localStorage`。

所有用户输入均做 HTML 转义（`escapeHtml`）防 XSS；数据全部经 `fetch` 调 API 获取。

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

---

## 10. 已知事项 / 待办

- `nodemailer` 仍在 `package.json` 但**未使用**，可移除。
- 首页「关于我们」仍是空链接（`href="#"`）。
- 弹窗文字多为占位（如“东紫阳楼 · 教学楼”），可按需补充真实介绍/图片。
- 设置页左侧「设置」板块预留，后续可加更多板块。
- 网站设置（默认界面/默认楼层/菜谱评价默认页）已同步到账号（`PUT /api/user/settings`），未登录时回退 `localStorage`。
- **部署注意**：这是**动态**站点（Node 后端 + `/api/*`），**不能**直接放 GitHub Pages；可选 Render / Railway / Vercel（Node）。数据与上传目录（`data.db`、`uploads/`）需持久化存储。
- 修改 `data.json` 无需重启；修改 `server.js` 需重启。

---

## 11. 编码约定

- 纯前端原生 JS（`var`、无构建工具、无框架），**代码中不写注释**。
- 中文标签统一 `#777777`、字重 300、按框自动居中（竖排/横排自动判断）。
- 颜色/透明度统一从 `data.json` 的 `style` 读取。
- 共享前端逻辑放 `public/auth.js`；所有动态文本经 `escapeHtml` 转义。
