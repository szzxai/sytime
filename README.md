# 校园信息网 · szzx-info

一个集校园地图、交流论坛、菜谱评价与账号管理于一体的校园信息网站。界面采用黑白极简风格，地图使用低饱和度配色，支持楼层切换、地点介绍与在线维护。

项目由原生 HTML、CSS、JavaScript 前端和 Node.js + Express 后端组成，使用 SQLite 保存业务数据。前端无需构建，后端同时提供页面、接口与上传文件访问。

> 本项目需要运行 Node.js 服务，并使用可持久化的本地文件。仅上传 `public/` 到静态网站托管平台，无法使用完整功能。

## 功能

| 模块 | 当前功能 |
| --- | --- |
| 校园地图 | 拖动与缩放、1—4 楼切换、地点弹窗、文字标签；管理员可修改地点介绍 |
| 交流论坛 | 「讨论」「提问」分类、发布帖子、回复、显示回复数量；作者和管理员可删除帖子 |
| 菜谱评价 | 菜品名称、0—5 分评分、文字评价、可选图片 |
| 每周菜谱 | 按日期范围展示菜谱图片，支持展开、收起和放大；具备上传与删除权限控制 |
| 账号系统 | 用户名注册与登录、密码哈希、令牌认证、分级角色权限 |
| 学生认证 | 提交新生号、班级、真实姓名和补充信息；有效邀请码直接通过，否则等待人工审核 |
| 个人中心 | 修改头像、昵称、签名和密码；设置默认页面、地图楼层及菜谱页面 |
| 网站管理 | 发布更新公告、设置全站横幅、审核学生认证、管理邀请码和每周菜谱 |

## 技术组成

| 部分 | 实现 |
| --- | --- |
| 运行环境 | Node.js，数据库使用内置 `node:sqlite` 的 `DatabaseSync` |
| 服务端 | Express 5、`cors`、`dotenv` |
| 认证 | `bcrypt` 密码哈希、JSON Web Token（JWT，签名登录令牌） |
| 文件上传 | `multer`，图片保存在本地 `uploads/` |
| 前端 | 原生 HTML、CSS、JavaScript，使用 `fetch` 请求后端接口 |
| 地图 | Leaflet 1.9.4，使用 `L.CRS.Simple` 平面坐标模式 |

## 快速开始

### 1. 准备环境

使用 **Node.js 24.x** 和 npm，在项目根目录执行后续命令。项目直接依赖内置 `node:sqlite`，无需另外安装 `sqlite3` 或部署独立数据库服务。

可以先检查运行环境：

```bash
node --version
npm --version
node -e "console.log(typeof require('node:sqlite').DatabaseSync)"
```

最后一条命令应输出 `function`。如果提示找不到模块，请更换支持该模块的 Node.js 版本。

### 2. 安装依赖

解压项目并进入含有 `package.json` 的目录，例如：

```bash
cd szzx-info-main
npm ci
```

`npm ci` 根据 `package-lock.json` 安装锁定的依赖。前端没有额外的构建步骤。

### 3. 配置环境变量

在项目根目录创建 `.env`：

```dotenv
PORT=3000
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
```

将 `JWT_SECRET` 替换为随机密钥。可用以下命令生成，然后把输出填入 `.env`：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| 变量 | 作用 | 未设置时的值 |
| --- | --- | --- |
| `PORT` | 服务监听端口 | `3000` |
| `JWT_SECRET` | 登录令牌的签名密钥 | `dev_secret_change_me`，仅适合本地开发 |
| `JWT_EXPIRES_IN` | 登录令牌有效期 | `7d`，即 7 天 |

当前注册流程不需要邮箱验证码，无需配置邮件服务。数据库与上传目录的路径在 `server.js` 中固定，不能通过上述环境变量更改。

### 4. 启动服务

```bash
npm start
```

打开 [http://localhost:3000/](http://localhost:3000/)。按 `Ctrl+C` 停止前台服务。

如果 Windows PowerShell 提示禁止执行 `npm.ps1`，可改用：

```powershell
npm.cmd ci
npm.cmd start
```

启动时会自动创建缺失的数据库表和上传目录，并执行代码内置的旧数据结构迁移。已有数据会继续使用。

### 5. 初始化管理账号

**仅当 `users` 表为空时，第一个注册的账号会自动获得 `developer` 角色；之后注册的账号默认是 `user`。** 初始化新站点时，应先由维护者完成首次注册，再开放访问。

本项目提供的数据库已包含账号，直接使用现有 `data.db` 时，新注册账号不会自动成为开发者。请使用已有管理账号；若要建立独立的新站点，应先备份现有数据，再在服务停止后将 `data.db` 移出项目根目录，下次启动会创建新数据库。这会使新站点不再使用原有账号和业务记录。

管理账号登录后访问 [http://localhost:3000/admin.html](http://localhost:3000/admin.html)。当前没有网页端角色分配功能，也没有预设的通用管理员密码。

## 页面入口

以下路径均相对于网站根地址：

| 路径 | 页面 |
| --- | --- |
| `/`、`/index.html` | 首页；访问 `/` 时可按个人设置跳转到默认页面 |
| `/map.html` | 校园地图 |
| `/forum.html` | 交流论坛 |
| `/recipe.html` | 菜谱评价与每周菜谱 |
| `/announcements.html` | 更新公告 |
| `/about.html` | 关于项目 |
| `/register.html`、`/login.html` | 注册、登录 |
| `/student_verify.html` | 学生认证 |
| `/profile.html` | 个人资料、账号安全与网站设置 |
| `/admin.html` | 管理后台 |

## 角色与权限

后端角色权重由低到高为：

```text
guest < user < student < admin < super_admin < developer
```

| 角色 | 当前权限 |
| --- | --- |
| `guest`（游客） | 浏览地图、论坛帖子与回复、菜谱、公告和横幅 |
| `user`（普通用户） | 登录后发布帖子、回复和菜谱评价，维护个人资料，提交学生认证 |
| `student`（认证学生） | 已通过学生认证；当前业务接口未额外设置仅学生可用的功能 |
| `admin`（管理员） | 具有较低角色的权限，并可删除他人帖子、编辑地图弹窗、上传每周菜谱 |
| `super_admin`（超级管理员） | 具有管理员权限，并可进入管理后台、发布公告、修改横幅、审核认证、管理邀请码及删除任意每周菜谱 |
| `developer`（开发者） | 当前权限检查中包含超级管理员的全部权限 |

具体操作还受所有权规则约束：帖子作者可以删除自己的帖子；每周菜谱的上传者可以删除自己的图片。删除帖子时，其回复一并删除。

`/admin.html` 页面仅允许 `super_admin` 和 `developer` 进入；每周菜谱上传接口的最低要求则是 `admin`。不能把所有 `/api/admin/*` 接口统一理解为同一个权限等级。

角色写入登录令牌。认证通过或角色调整后，重新登录可取得包含新角色的令牌；修改密码不会立即使已签发的令牌失效。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `server.js` | 服务入口、数据表初始化与迁移、认证、权限和业务接口 |
| `public/` | 各功能页面与前端逻辑 |
| `public/auth.js` | 共享导航、登录状态、头像、横幅及菜单折叠逻辑 |
| `data.json` | 校园地图几何、图层、配色、文字标签与地点介绍 |
| `data.db` | SQLite 数据库，保存账号、论坛、评价、公告和设置等 |
| `uploads/` | 头像、菜谱评价图片 |
| `uploads/weekly/` | 每周菜谱图片 |
| `package.json` | 项目信息、依赖与 npm 命令 |
| `package-lock.json` | 依赖版本锁定文件 |
| `progress.md` | 开发进度与历史说明，可能与当前代码存在差异 |
| `LICENSE` | 许可证文本 |

## 维护校园地图

地图数据位于根目录 `data.json`，由三个部分组成：

| 字段 | 用途 |
| --- | --- |
| `meta` | 画布宽高、参考轴、缩放范围等参数 |
| `style` | 轮廓色、标签色、填充透明度和分类调色板 |
| `features` | 地图要素数组，每个条目描述几何图形或标签 |

地图采用自定义平面坐标，`points` 中的点写作 `[x, y]`，绘制时转换为 Leaflet 的 `[y, x]`。这些数值不是经纬度。

### 图层与要素

- `layers: ["base"]`：始终显示的底图。
- `layers: [1]`：仅在一楼显示；也可使用 `[2, 3, 4]` 等多楼层组合。
- `type: "polygon"`：区域或建筑多边形。
- `type: "polyline"`：道路、轮廓等线条。
- `type: "label"`：文字标签，使用 `text`、`x1`、`y1`、`x2`、`y2`、`scale` 等字段。
- `cat`：对应 `style.palette` 中的分类，如 `building`、`green`、`water`、`white`、`none`。
- `popup`：地点弹窗内容；当前按纯文本显示。

例如，可向 `features` 数组加入以下建筑条目，坐标应按实际布局调整：

```json
{
  "layers": [1],
  "type": "polygon",
  "name": "示例教学楼",
  "popup": "示例教学楼一楼介绍",
  "cat": "building",
  "points": [[100, 100], [220, 100], [220, 180], [100, 180]],
  "fill": true,
  "stroke": true,
  "weight": 1
}
```

管理员在地图弹窗中点击「编辑」可修改地点介绍。后端按 `name` 匹配，并更新所有同名要素；需要分别维护介绍的要素应使用不同名称。现有前端只为非空 `popup` 建立可点击弹窗，空介绍可先直接编辑 `data.json`。

服务端每次请求地图接口时读取 `data.json`，修改后刷新地图页面即可，无需重启服务。修改 `server.js` 或 `.env` 后需要重启；修改前端页面后刷新浏览器即可。

## 接口概览

API（应用程序编程接口）统一位于 `/api/` 下。需要认证的请求携带：

```http
Authorization: Bearer <token>
```

登录接口返回 `{ token, user }`。除图片上传外，写入接口主要使用 JSON 请求体；上传使用 `multipart/form-data`，由浏览器或上传客户端生成请求边界。

| 方法与路径 | 用途 | 权限 |
| --- | --- | --- |
| `POST /api/register` | 注册；字段为 `username`、`nickname`、`password` | 公开 |
| `POST /api/login` | 登录；字段为 `username`、`password` | 公开 |
| `GET /api/me` | 返回令牌解析后的身份；无有效令牌时为游客 | 公开 |
| `GET /api/user/profile` | 获取个人资料与偏好 | 登录 |
| `PUT /api/user/settings` | 保存 `default_page`、`default_floor`、`recipe_default_view` | 登录 |
| `PUT /api/user/nickname`、`/api/user/signature`、`/api/user/password` | 修改昵称、签名或密码 | 登录 |
| `POST /api/user/avatar` | 上传头像，文件字段为 `avatar` | 登录 |
| `POST /api/student/apply` | 提交学生认证 | 登录 |
| `GET /api/map-data` | 获取地图 JSON 数据 | 公开 |
| `PUT /api/admin/map-popup` | 更新同名要素的 `popup`；请求字段为 `name`、`popup` | `admin` 及以上 |
| `GET /api/forum/posts` | 帖子列表，可使用 `category=讨论` 或 `category=提问` 筛选 | 公开 |
| `POST /api/forum/posts` | 发布帖子；字段为 `category`、`title`、`content` | 登录 |
| `DELETE /api/forum/posts/:id` | 删除帖子及回复 | 作者或 `admin` 及以上 |
| `GET /api/forum/posts/:id/replies` | 获取回复 | 公开 |
| `POST /api/forum/posts/:id/replies` | 发布回复；字段为 `content` | 登录 |
| `GET /api/recipes`、`GET /api/recipes/weekly` | 获取全部评价或 `is_weekly=1` 的评价 | 公开 |
| `POST /api/recipes` | 发布评价；字段为 `name`、`rating`、可选 `comment`、`is_weekly`、`image` | 登录 |
| `GET /api/weekly-menu` | 获取按日期范围记录的菜谱图片 | 公开 |
| `POST /api/admin/weekly-menu/upload` | 上传每周菜谱；字段为 `menu_start_date`、`menu_end_date`、`image` | `admin` 及以上 |
| `DELETE /api/admin/weekly-menu/:id` | 删除每周菜谱记录和文件 | 上传者或 `super_admin` 及以上 |
| `GET /api/announcements` | 获取更新公告 | 公开 |
| `POST /api/admin/announcements` | 发布公告；字段为 `title`、`content`、可选 `publish_date` | `super_admin` 及以上 |
| `GET /api/settings/banner` | 获取横幅与版本号 | 公开 |
| `PUT /api/admin/settings/banner` | 更新横幅；传入 `value`，空字符串取消横幅 | `super_admin` 及以上 |
| `GET /api/admin/student-applications` | 获取待审核的学生认证申请 | `super_admin` 及以上 |
| `PUT /api/admin/student-applications/approve` | 批准认证；字段为申请 `id` | `super_admin` 及以上 |
| `GET /api/admin/invite-codes` | 获取邀请码列表 | `super_admin` 及以上 |
| `POST /api/admin/invite-codes` | 创建邀请码；字段为 `code`、`max_uses`，次数为 `0` 时不限使用次数 | `super_admin` 及以上 |
| `DELETE /api/admin/invite-codes/:id` | 删除邀请码 | `super_admin` 及以上 |

`/api/recipes/weekly` 返回标记为每周的评价记录，与 `/api/weekly-menu` 的菜谱图片不是同一类数据。当前菜谱页面的「每周菜谱」使用后者。旧版单邀请码接口 `/api/admin/settings/invite-code` 仍保留兼容，新管理页面使用邀请码列表接口。

个人设置中，默认页面支持 `index.html`、`map.html`、`forum.html`、`recipe.html`；楼层范围为 1—4；菜谱默认视图为 `all` 或 `weekly`。

上传仅接受声明为 JPEG 或 PNG 的图片：头像和评价图片最大为 2 MiB，每周菜谱图片最大为 5 MiB（1 MiB = 1,048,576 字节）。

## 部署与数据备份

部署环境需要支持长时间运行的 Node.js 进程，并允许项目根目录中的 `data.db`、`data.json` 和 `uploads/` 写入及持久化。服务端没有前端构建产物，也不提供 `npm run build` 命令。

部署时配置正式的 `JWT_SECRET`，先完成管理账号初始化，并按运行平台配置 `PORT`。通过 HTTPS 提供公开访问，可在 Node.js 服务前使用反向代理。JWT 密钥应保持稳定；更换密钥会使原有登录令牌无法通过验证。

需要备份的内容：

| 内容 | 保存的数据 |
| --- | --- |
| `data.db` | 账号与密码哈希、帖子和回复、评价、公告、邀请码、认证申请、设置及图片索引 |
| `uploads/`（含 `weekly/`） | 头像、评价图片和每周菜谱原文件 |
| `data.json` | 地图布局、配色与在线编辑的地点介绍 |
| `.env` | 部署端口、令牌密钥和有效期，需保密保存 |

简单可靠的完整备份方式是先停止服务，再将上述文件及目录一起复制；恢复时使用同一批次的数据文件与图片。仅备份数据库不能恢复图片，反之也不能恢复账号和业务记录。

公开分享源码前，应移除真实业务数据库、用户上传文件和密钥配置。`data.db` 可能包含学生认证个人信息。当前 `about.html` 的联系方式为示例内容，正式使用前应替换。

## 开发与当前实现说明

- 前端没有框架或打包流程，共享页面逻辑位于 `public/auth.js`；接口与数据表变更集中在 `server.js`。
- 地图的 Leaflet 脚本和样式通过 `unpkg.com` 加载；地图运行依赖这些外部资源可访问。需要独立运行时，可将对应资源保存到本地并调整引用。
- 首页当前主要提供导航和默认页面跳转，未设置独立的信息展示内容。
- 当前没有邮箱验证、密码找回或网页端用户角色分配功能。
- `npm test` 仍是返回失败的占位脚本，尚未提供自动化测试套件。验证改动时应按功能检查登录、地图加载、内容发布及相关权限。
- `progress.md` 用于记录开发历史；出现差异时，以实际代码和依赖文件为准。

## 许可证

仓库的 [LICENSE](LICENSE) 文件包含 GNU Affero 通用公共许可证第 3 版（GNU Affero General Public License version 3，AGPLv3）文本。

当前 `package.json` 的 `license` 字段为 `ISC`，与 `LICENSE` 不一致。发布或复用前，项目维护者应确认授权方式并统一许可证标识。
