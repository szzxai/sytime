# 校园信息网

一个采用**宣纸·黛青·朱印 极简风格**的校园信息网站，集成了交互式校园地图、论坛、菜谱评价、更新公告、学生认证与个人中心，并配套一套完整的账号系统与后台管理。

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

### 菜品与食谱
- 全部菜品 / 菜品评价 / 每周食谱三个页签
- 1,243 道历史菜品、A–Z 索引，搜索菜名、拼音和首字母
- 网站内直接获取学校菜单并用视觉模型转为八字段 JSON；developer 配置提供商、API Key、模型与每日同步时间
- developer、super_admin、admin 可粘贴 JSON 手动导入、修改已发布菜单或失败识图候选；校验后整篇发布并记录操作者
- 图文评价（菜名 / 评分 / 评论 / 图片）
- 每周食谱：按日期范围展开 / 收起菜谱大图，支持缩放查看

### 其他
- **更新公告**：左侧列表 + 右侧详情
- **学生认证**：邀请码 / 管理员审核（支持通过、拒绝并填写原因）
- **个人中心**：个人资料、账号安全、网站设置（默认进入界面 / 默认楼层 / 菜谱默认页）
- **全站横幅**：可由管理员配置，用户可关闭
- **导航栏**：Logo 点击回首页、手机导航抽屉与账户菜单
- **统一交互**：表单校验、提交状态、确认对话框、图片查看器、加载与错误重试
- **工单**：个人中心提交与查看，后台按权限批复文字和图片

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 运行时 | Node.js（建议 **24+**，最低 22.5，见下） |
| 后端 | Express 5、jsonwebtoken、bcrypt、multer、cors、dotenv |
| 菜单识别 | Node worker、sharp、cheerio、Ajv、pinyin-pro |
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
│   ├── recipe.html      # 菜品目录、评价与每周食谱
│   ├── announcements.html
│   ├── admin.html       # 管理后台
│   ├── student_verify.html
│   ├── profile.html     # 个人中心
│   ├── about.html       # 旧关于页入口，跳转到首页关于区
│   ├── 404.html         # 未知路径提示
│   ├── css/site.css     # 全站设计令牌、组件与响应式样式
│   ├── js/              # 共享 UI、页面工具与各页业务脚本
│   ├── img/             # 图标库与网站图标
│   ├── vendor/leaflet/  # 本地 Leaflet 1.9.4 与许可证
│   └── auth.js          # 旧共享脚本的兼容入口
├── uploads/             # 上传目录（随仓库提交）
│   ├── weekly/          # 每周菜谱图片
│   └── bans/            # 封禁图片
├── data.json            # 地图几何与配色数据
├── data.db              # SQLite 数据库（随仓库提交）
├── server.js            # Express 后端与菜单模块接入
├── lib/menu/            # 来源、模型、分块、校验、配置、存储、调度、任务及路由
├── data/menu-bootstrap.json # 十篇历史菜单种子，启动自动导入
├── tools/build-menu-seed.py # 开发时离线重建种子，Python 标准库
├── menu-json-rules.md    # 八字段 JSON 及图片读取的完整约定
├── szzx-menu.skill       # 可导入 AI 客户端的图片转 JSON 技能包
├── skills/szzx-menu/     # 技能源文件、规则引用及离线校验器
├── tools/build-menu-skill.py # 同步规则并重新打包技能，开发时使用
├── .private/            # 运行时密钥、原图、诊断和缓存（忽略，不公开）
├── package.json
├── .env.example         # 环境变量模板
├── .gitignore           # 依赖、密钥、临时数据和测试产物忽略规则
├── tests/ui-smoke.mjs    # 浏览器、布局与无障碍回归
├── tests/menu.test.cjs   # 调度、数据、识别、任务和权限测试
├── docs/menu-sync.md     # 配置、备份、故障处理及接口
├── docs/issue-5-plan.md  # 用户确认的 Issue #5 实施范围
├── docs/ui/             # 组件、逐页规范、场景、文案、参考资产与验收记录
├── UI.md                # UI 设计总纲
├── MAP.md               # 当前项目结构、数据流与完整接口索引
├── PLAN_2026-10-01.md    # 国庆里程碑原始需求快照
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

首次启动会自动创建数据库、数据表、迁移与 `uploads/` 目录，并导入菜单种子。**第一个注册的账号自动成为 developer。**

生产只需 Node 和 npm 运行依赖，可使用 `npm ci --omit=dev`。不需要 Python 或第二台菜单服务器。登录 developer 后进入「管理后台 → 菜单自动同步」，保存并测试模型，再自行设置每日同步时间（默认北京时间 08:00）并开启自动同步。详细说明见 [菜单同步运维](./docs/menu-sync.md)。

三种管理角色均可使用「管理后台 → 菜单手动导入」，无需 AI Key。支持新建批次、编辑已发布 JSON、载入已结束任务的识图候选并对照原图补全。已有来源会整篇替换，发布记录可追溯；编辑版本冲突或同步运行中会阻止发布。格式约定与流程见 [JSON 详细规则](./menu-json-rules.md)。

将 [szzx-menu.skill](./szzx-menu.skill) 导入支持技能的 AI 客户端，附带完整图片和年份，即可直接生成八字段 JSON。也可解压读取 `SKILL.md`；技能不启动额外服务。修改规则后用 `npm run build:menu-skill` 重新打包，`npm run test:menu-skill` 验证；这两个开发命令使用 Python 标准库，生产网站不需要 Python。

### 回归验证

运行 `npm test`，先验证菜单后端，再在临时目录启动独立后端，验证页面布局、无障碍、权限与主要表单操作；不会改动项目的 `data.db` 或 `uploads/`。可分别运行 `npm run test:menu` 和 `npm run test:ui`。Windows 默认使用已安装的 Microsoft Edge，其他平台先运行 `npx playwright install chromium`。

截图与扫描结果保存到 `output/playwright/`。设计总纲见 [UI.md](./UI.md)，参考样张见 `docs/ui/assets/specimen.html`。

全新生产安装可用 `npm run test:deploy` 验证；复杂菜单的真实模型实验与局限见 [菜单验证记录](./docs/menu-validation.md)。

需求 #4 已完成 12 个现有页面与新增 404 的改版。验收范围、结果及复验方式见 [UI 验收记录](./docs/ui/acceptance.md)；完整项目结构和接口索引见 [MAP.md](./MAP.md)。

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
- 需持久化 `data.db`、`uploads/` 与 `.private/`。数据库和菜单加密主密钥必须配套备份；丢失主密钥后需要重新保存 API Key 并测试。
- `.gitignore` 忽略 `.env`、`.private/`、`node_modules/`、SQLite 临时文件和浏览器测试产物；`data.db` 与 `uploads/` 保留历史初始快照。不要将生产密钥或保存模型凭据后的生产数据库提交 Git。
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
| GET | `/api/dishes` | 独立菜品目录和统一拼音排序 |
| — | `/api/admin/menu-sync/settings`、`test`、任务写操作 | active developer 配置与自动同步管理 |
| — | `/api/admin/menu-sync/imports*`、任务详情和资料读取 | active developer / super_admin / admin 手动导入、编辑及原图核对 |
| POST | `/api/student/apply` | 提交学生认证 |
| POST | `/api/user/appeal` | 提交封禁申诉 |
| — | `/api/admin/*` | 后台接口（按角色 / 权限校验） |

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

完整许可文本见根目录 [LICENSE](./LICENSE)，或访问 <https://www.gnu.org/licenses/agpl-3.0.html>。
