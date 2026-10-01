# 校园信息网

一个**黑白极简风格**的校园信息网站，集成了交互式校园地图、论坛、菜谱评价、更新公告、学生认证与个人中心，并配套一套完整的账号系统与后台管理。

后端基于 **Node.js + Express**，数据库使用 Node 内置的 **`node:sqlite`**（零额外依赖），前端为**原生 JavaScript**（无框架、无构建工具）。

---

## 功能特性

### 账号与权限
- 注册 / 登录（JWT），首个注册用户自动成为 `developer`
- 角色体系（按权重）：`developer(6) > super_admin(5) > admin(4) > student(3) > user(2) > guest(1)`
- **展示 ID（display_id）**：注册时自动生成
- 用户封禁 / 解封（可附封禁理由与图片）+ 封禁申诉
- **特殊权限系统**：可在角色之外给单个用户授予细粒度权限（编辑横幅、发布公告、学生审核、邀请码管理、菜谱上传、地图弹窗编辑、用户管理、申诉处理）

### 校园地图
- 基于 **Leaflet**（`CRS.Simple`）的交互式校园地图
- 多楼层切换（1F–4F），几何数据抽离为 `data.json`，前端 `fetch` 动态绘制
- 低饱和度实景配色，支持在线编辑建筑弹窗

### 论坛
- 讨论 / 提问分类
- 发帖、回复、**点赞**（含帖子详情页 `post.html`）
- 帖子卡片整体可点击进入详情；作者或管理员可删除帖子

### 菜谱评价
- 全部（A–Z）/ 每周食谱切换
- 图文评价（菜名 / 评分 / 评论 / 图片）
- 每周食谱：按日期范围展开 / 收起菜谱大图，支持缩放查看

### 其他
- **更新公告**：左侧列表 + 右侧详情
- **学生认证**：邀请码 / 管理员审核（支持通过、拒绝并填写原因）
- **个人中心**：个人资料、账号安全、网站设置（默认进入界面 / 默认楼层 / 菜谱默认页）
- **全站横幅**：可由管理员配置，用户可关闭
- **导航栏**：Logo 点击回首页、菜单栏可折叠

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 运行时 | Node.js（建议 **24+**，最低 22.5，见下） |
| 后端 | Express 5、jsonwebtoken、bcrypt、multer、cors、dotenv |
| 数据库 | SQLite（Node 内置 `node:sqlite`，无需编译） |
| 前端 | 原生 HTML / CSS / JavaScript + Leaflet |
| 地图数据 | `data.json` |

---

## 目录结构

```
项目文件夹/
├── public/              # 前端静态页面
│   ├── index.html       # 首页（关于我们）
│   ├── map.html         # 校园地图
│   ├── login.html       # 登录（含封禁申诉）
│   ├── register.html    # 注册
│   ├── forum.html       # 论坛列表
│   ├── post.html        # 帖子详情（点赞 + 回复）
│   ├── recipe.html      # 菜谱评价
│   ├── announcements.html
│   ├── admin.html       # 管理后台
│   ├── student_verify.html
│   ├── profile.html     # 个人中心
│   └── auth.js          # 全站共享脚本（登录态 / 导航 / 横幅）
├── uploads/             # 上传目录（运行时自动创建，勿提交）
│   ├── weekly/          # 每周菜谱图片
│   └── bans/            # 封禁图片
├── data.json            # 地图几何与配色数据
├── data.db              # SQLite 数据库（运行时自动创建，勿提交）
├── server.js            # Express 后端（全部接口）
├── package.json
├── .env.example         # 环境变量模板
└── progress.md          # 开发进度文档
```

---

## 快速开始

### 1. 环境要求

- Node.js **24+**（推荐）。若使用 Node 22.5–23.x，启动时可能需要附加 `--experimental-sqlite`。
- 无需安装数据库；SQLite 由 Node 内置模块提供。

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并按需修改：

```env
PORT=3000
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
```

> `JWT_SECRET` 请务必改成足够长的随机字符串。

### 4. 启动

```bash
npm start
# 等价于 node server.js
```

Windows PowerShell 若拦截 `npm.ps1`，可使用：

```powershell
npm.cmd start
```

启动成功后访问 <http://localhost:3000/>。

首次启动会自动创建数据库、数据表、迁移与 `uploads/` 目录。**第一个注册的账号自动成为 developer。**

---

## 角色与权限说明

| 角色 | 权重 | 说明 |
| --- | --- | --- |
| developer | 6 | 最高权限 |
| super_admin | 5 | 后台管理（可在角色外授予部分权限） |
| admin | 4 | 菜谱上传、地图弹窗编辑 |
| student | 3 | 通过学生认证 |
| user | 2 | 普通用户 |
| guest | 1 | 未登录 |

**特殊权限**（可单独授予任意用户）：`banner_edit`、`announcement_publish`、`student_review`、`invite_manage`、`weekly_menu_upload`、`map_popup_edit`、`user_manage`、`ban_appeal_review`。

---

## 数据与部署注意

- 这是一个**动态站点**（Node 后端 + `/api/*`），**不能**直接部署到 GitHub Pages。
- 可部署到 Render / Railway / Fly.io 等支持 Node 的平台。
- 需持久化 `data.db` 与 `uploads/`（建议挂载持久卷，或改用外部存储）。
- `.env`、`data.db`、`uploads/` 已加入 `.gitignore`，不会提交到仓库。
- 修改 `server.js` 需重启；修改 `data.json` 无需重启（每次请求实时读取）；`public/` 下的静态资源改动刷新即可。

---

## 主要接口（节选）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/register` / `/api/login` | 注册 / 登录 |
| GET | `/api/user/profile` | 当前用户信息（含角色、权限） |
| GET | `/api/forum/posts` | 帖子列表（含 `like_count`、`is_liked`） |
| GET | `/api/forum/posts/:id` | 帖子详情 |
| POST/DELETE | `/api/forum/posts/:id/like` | 点赞 / 取消点赞 |
| GET | `/api/weekly-menu` | 每周菜谱列表 |
| POST | `/api/student/apply` | 提交学生认证 |
| POST | `/api/user/appeal` | 提交封禁申诉 |
| — | `/api/admin/*` | 后台接口（按角色 / 权限校验） |

---

## License

ISC
