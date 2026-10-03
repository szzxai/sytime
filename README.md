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

### 全站品牌主题与首页入口
- 品牌主色统一为 `#085628`，深浅状态色按可读性调整；浏览器主题色和 favicon 与主色同步。
- 首页“功能入口”新增绿色“必吃榜”卡片，直达 `/shops.html`。

### 三元坊必吃榜
- 高德地图支持拖动、滚轮/双指缩放和回到姑苏区全域；附近店铺自动聚合成带数量的点，点击后以该簇为中心放大。地图按店铺类型筛选；支持拼音 A–Z、店名/道路/商场搜索、距本部步行距离/时间过滤；适配手机与电脑
- 店铺地址、分类、高德 GCJ-02 坐标；记录距苏州中学本部主校区参考坐标，以及最近地铁站出口的**步行距离与预计时间**
- 店铺类型支持预设与自定义；可从本部参考坐标测算步行路线，或手工查询后录入；添加店铺时可选填大众点评商户链接（后端仅允许 `dianping.com` HTTPS 链接）
- 仅认证学生可点赞和评价；每人每店一条可更新评价，须选 1–5 星。卡片/详情显示点赞、评价数和平均评分/评分数；可按点赞、评价、评分排序及范围筛选。
- 姑苏区范围来自高德行政区 adcode `320508` 的 323 点 GCJ-02 边界，地图与服务端围栏共用；截至 2026-10-03，已分块检索 5,942 条区内高德餐饮 POI，补全并校验后导入 5,567 家，另有 62 条因同名去重。另有 313 条候选未导入（地址/路线/停业标记/名称限制等原因，原因有重叠）。这代表高德可检索 POI，不保证覆盖所有实际营业店铺。
- 默认学生及以上可上传；后台同时校验权限，可通过 `SHOP_CREATE_MIN_ROLE` 调整最低角色

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
│   ├── shops.html       # 三元坊必吃榜地图与店铺列表
│   ├── shop.html        # 单店详情
│   ├── shop-new.html    # 添加店铺（权限保护）
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
├── server.js            # Express 后端、菜单与店铺路由
├── lib/menu/            # 来源、模型、分块、校验、配置、存储、调度、任务及路由
├── lib/shops/           # 店铺数据校验、SQLite 存储与权限 API
├── data/shops-config.json # 高德地图中心、校门锚点及覆盖范围多边形（GCJ-02）
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
├── tests/shops.test.cjs # 店铺接口、校验、角色权限与范围测试
├── tests/shops-ui.mjs   # 店铺页面端到端与无障碍回归
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
AMAP_SERVICE_KEY=server_only_key
AMAP_JS_KEY=separate_web_js_key
AMAP_SECURITY_CODE=optional_js_security_code
SHOP_CREATE_MIN_ROLE=student
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

#### 三元坊必吃榜地图配置

1. 本机 `.env` 的 `AMAP_SERVICE_KEY` 仅供服务器端调用，绝不下发浏览器；地图使用同源静态图代理按当前中心/缩放取景，前端支持拖动、滚轮/双指缩放与店铺近邻聚合，无需配置或暴露 `AMAP_JS_KEY`。地图代理只允许姑苏区边界外扩范围内的中心点，并缓存近期视图。
2. 学校参考点为高德 POI「江苏省苏州中学本部」（GCJ-02：120.622380, 31.295509）。范围为整个姑苏区，边界来自高德行政区 adcode 320508（323 个顶点），已写入 `data/shops-config.json` 并供地图与服务端围栏共用。店铺数据来自高德可检索 POI，可能不包含未被高德收录或检索返回的实际店铺。
3. 配好多边形后，后端会拒绝覆盖范围外的店铺坐标；边界点视为范围内。首次启动不预置虚构店铺、路线距离或坐标。
4. 上传权限默认 `student`，可把 `SHOP_CREATE_MIN_ROLE` 设为 `user` / `student` / `admin` / `super_admin` / `developer` 之一。普通浏览无需登录。

店铺页：`/shops.html`；详情：`/shop.html?id=<编号>`；上传：`/shop-new.html`。路线步行距离/时间由高德步行路线测算或查询后录入。店铺接口和权限测试：`npm run test:shops`；店铺页面浏览器测试：`npm run test:shops:ui`。

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

**特殊权限**（可单独授予任意用户）：`banner_edit`、`announcement_publish`、`student_review`、`invite_manage`、`weekly_menu_upload`、`map_popup_edit`、`user_manage`、`ban_appeal_review`、`shop_create`（添加店铺）。

`shop_create` 默认要求 `student` 及以上角色，也可在角色外单独授权。通过 `SHOP_CREATE_MIN_ROLE` 调整默认最低角色；后端每次创建请求都会重新核验。

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
| GET | `/api/shops` | 公开店铺列表，可按 `type`、`q`、本部距离/步行时间、点赞数、评价数、评分范围过滤；可按本部/地铁/点赞/评价/评分/最新排序（拼音 A–Z 由前端完成） |
| GET | `/api/shops/meta` | 店铺类型、地图配置、覆盖范围和当前用户上传权限 |
| GET | `/api/shops/:id` | 公开店铺详情与互动计数 |
| GET | `/api/shops/:id/reviews` | 公开评价列表 |
| POST | `/api/shops/:id/like` | 认证学生点赞/取消点赞 |
| POST | `/api/shops/:id/reviews` | 认证学生提交或更新 1–5 星评价 |
| DELETE | `/api/shops/:id/reviews/me` | 认证学生撤销自己的评价 |
| POST | `/api/shops` | 创建店铺（默认 student 及以上或显式 `shop_create`）；可选 `dianping_url` 仅接受安全的 `dianping.com` HTTPS 链接 |
| — | `/api/admin/menu-sync/settings`、`test`、任务写操作 | active developer 配置与自动同步管理 |
| — | `/api/admin/menu-sync/imports*`、任务详情和资料读取 | active developer / super_admin / admin 手动导入、编辑及原图核对 |
| POST | `/api/student/apply` | 提交学生认证 |
| POST | `/api/user/appeal` | 提交封禁申诉 |
| — | `/api/admin/*` | 后台接口（按角色 / 权限校验） |

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

完整许可文本见根目录 [LICENSE](./LICENSE)，或访问 <https://www.gnu.org/licenses/agpl-3.0.html>。
