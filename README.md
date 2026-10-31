# 拾光酥糕

当前代码仓库为 [szzxai/sytime](https://github.com/szzxai/sytime)，保留原项目的提交历史；历史需求和验收记录中的原仓库问题链接继续保留。

一个面向苏州中学、由学生维护的全中文校园信息平台；品牌为 **拾光酥糕**，以 **Berkeleytime 的布局与视觉风格**重制，采用源自 VC 团队橙子切面的青柠绿色图标、本地可变字重 Noto Sans SC 中文字形、绿色主题与维护者提供的范仲淹像插画，集成了交互式校园地图、三元坊必吃榜、菜谱评价、更新公告、消息箱、学生认证、个人中心与设置，并配套一套完整的账号系统与后台管理。

本站由学生自主运营，与江苏省苏州中学官方无隶属关系；共享页脚说明相关标识的权利归属，资讯以学校官方渠道为准，提供 [勘误邮箱](mailto:baimoqilin@gmail.com)。品牌与浏览器图标使用 `apps/web/public/img/brand-lime.svg`，首页团队区保留原橙色标志。

当前运行栈为 **React 19 + TanStack Router/Query + Hono + Drizzle** 的 npm workspaces Monorepo；SQLite 由 better-sqlite3 提供，生产入口加载已构建的 API 与 Web 资源。

---

## 功能特性

### 账号与权限
- 注册 / 登录（JWT），首个注册用户自动成为 `developer`
- 角色体系（按权重）：`developer(6) > super_admin(5) > admin(4) > student(3) > user(2) > guest(1)`
- **展示 ID（display_id）**：注册时自动生成
- 用户封禁 / 解封（可附封禁理由与图片）+ 封禁申诉
- **特殊权限系统**：可在角色之外给单个用户授予细粒度权限（编辑横幅、发布公告、学生审核、邀请码管理、地图弹窗编辑、用户管理、申诉处理）

### 校园地图
- 默认展示北向上的 SVG 校园导览，按校园位置参考图补齐 31 个地点，涵盖教学区、园林、运动场、南部校园及文庙区域。按新版参考图校准相对位置与建筑轮廓，补充政道楼（原墨子馆）、府学碑廊、泮池与泮桥，并细化水面、庭院、林地、竹林与运动场。建筑为示意插画。
- 地点搜索（含「校史馆」别名）、分类筛选、点选介绍、键盘操作和回到全景；拖动或双指滚动平移，捏合或 Ctrl / ⌘ + 滚轮连续缩放；适配手机与明暗主题。
- 点选保持建筑绘制顺序及当前缩放；仅在地标离屏或被详情遮挡时做最小缓动平移。31 个地点提供实际用途、历史背景与分段介绍，目录支持按「面档」「宿舍」等用途查找；可查阅的校方来源及校内补充口径见 [地点资料来源](./docs/map-sources.md)。
- 只保留完整校园地图，移除旧楼层平面、视图切换和默认楼层设置。篮球场与操场均为大面积 SVG 场地；地点数据在 `apps/web/src/maps/places.ts`，插画在 `apps/web/public/img/map/campus.svg`。旧 `data.json` 与相关后端接口仅保留兼容。

### 拾光酥糕 · 全站重制
- 苏州中学校徽图标、可变字重 Noto Sans SC 中文字体、白色工作区与绿色主色（`#218653`），支持浅色、深色、跟随系统，并保存外观选择。
- 首页按参考站的布局重建：通栏渐变与维护者提供的透明范仲淹像插画、关于介绍、开发团队介绍、参与折叠区、校园寄语和三列页脚。`about.html` 是独立关于页。
- 菜谱、必吃榜采用左侧控制区与右侧内容的布局；手机控制区在上。账户、消息、公告、详情、后台与地图目录使用同一套组件。
- 原有功能与权限、后端接口、数据库、URL 和根路径默认页行为保留。源码开发使用 Vite 构建；生产由 Hono 提供构建后的 SVG、CSS 与页面资源。
- 桌面首屏根据公告和顶栏实际高度填满窗口；导航悬停、顶栏静止的横向页面切换、主题切换和参与区展开与收起均有平滑过渡，兼容减少动态效果设置。Inter 与 Noto 字体许可证位于 `apps/web/public/fonts/`。
- 样式入口 `apps/web/public/css/site.css`，首页插画 `apps/web/public/img/fan-zhongyan-user.png`，新版规范见 [UI.md](./UI.md)。验证记录见 [MAP.md](./MAP.md) 与 [验收记录](./docs/ui/acceptance.md)。

### 三元坊必吃榜
- 高德地图支持拖动、滚轮/双指缩放和回到姑苏区全域；附近店铺自动聚合成带数量的点，点击后以该簇为中心放大。地图按店铺类型筛选；支持拼音 A–Z、店名/道路/商场搜索、距本部步行距离/时间过滤；适配手机与电脑
- 店铺地址、分类、高德 GCJ-02 坐标；记录距苏州中学本部主校区参考坐标，以及最近地铁站出口的**步行距离与预计时间**
- 店铺类型支持预设与自定义；可从本部参考坐标测算步行路线，或手工查询后录入；添加店铺时可选填大众点评商户链接（后端仅允许 `dianping.com` HTTPS 链接）
- 学生及以上角色可点赞和评价；每人每店一条可更新评价，须选 1–5 星，评价作者可删除自己的评价。评价可选带一张实拍图（JPG / PNG，≤2 MB），可选填就餐人数与总价，自动计算并在评价中显示人均价。卡片/详情显示点赞、评价数和平均评分/评分数；可按点赞、评价、评分排序及范围筛选。
- 店铺列表分页展示（每页 20 条，含首页/末页与当前页 ±2、上一页/下一页；筛选、排序或搜索后回到第 1 页）；详情页样式可在设置中选择**手动**（页面内切换纵向 / 双栏，并记住该账号上次选择）或**自动**（按屏幕宽度自动切换，宽屏双栏、窄屏纵向）。
- 姑苏区范围来自高德行政区 adcode `320508` 的 323 点 GCJ-02 边界，地图与服务端围栏共用；截至 2026-10-03，已分块检索 5,942 条区内高德餐饮 POI，补全并校验后导入 5,567 家，另有 62 条因同名去重。另有 313 条候选未导入（地址/路线/停业标记/名称限制等原因，原因有重叠）。这代表高德可检索 POI，不保证覆盖所有实际营业店铺。
- 默认学生及以上可上传；后台同时校验权限，可通过 `SHOP_CREATE_MIN_ROLE` 调整最低角色

### 菜品与食谱
- 学校官网每周食谱自动抓取，由 Gemini 读取图片并结构化，周末定时检查，周一补查。
- 默认每周食谱，按周次、日期、地点、餐次和菜名/拼音筛选；卡片显示价格、辣椒、真实星级和评价数。
- 菜品详情展示近期供应与学校原文，登录后可选 1–5 星并发表图文评价；评价与菜单更新相互独立。
- 管理员可查看任务和失败诊断、补图或手动 JSON 恢复；未通过校验的菜单不发布，保留上一版。
- 上线前旧菜单测试数据由一次迁移清空；新库不再导入历史种子。
- 开发者首次可在后台保存、测试并启用 Gemini，或设置 GEMINI_API_KEY / MENU_KEY_FILE 后执行 `npm run menu:setup`。详见 [同步运维](docs/menu-sync.md)。

### 头衔系统
- 头衔是全站徽章：店铺评价、个人中心等位置统一由用户信息组件渲染佩戴中的头衔；缺少头衔数据时不显示徽章也不报错
- 个人中心「头衔」可查看全部头衔、选择一个佩戴或选择不佩戴；未达成的自动头衔以锁定卡片显示条件与当前进度
- 后台「头衔管理」（`title_manage`，默认 super_admin）维护头衔目录（名称 1–8 字、8 种颜色、描述）并授予/撤销；撤销佩戴中的头衔会自动取消佩戴并发送一条系统消息；系统内置的头衔不可删除
- 超管还可以为**单个账号**颁发专属自定义头衔（名称 1–8 字 + 8 色任选）：只在该账号出现，不进公共目录，撤销时目录行一并删除；专属头衔不能与公共头衔重名
- 成就头衔按实际行为自动发放（只增不减）：三元坊老饕（推荐 10 家店铺）、夜读星（连续 7 天登录）、闲者爱上网（连续 3 个周末登录）、校园老吃家（10 篇菜品评价）；达成条件的当下即会获得，无需等待下次登录；由规则自动发放的头衔不可手动撤销
- 不再设置「角色等级」头衔：用户角色改由界面上的「权限等级」标签体现（见「其他」），头衔只保留成就与手动授予两类
- 自动条件由可扩展的规则注册表提供；新增条件只需注册表加一项并为目录行指定规则
- 「师者」不绑定角色，由管理员手动授予在职教职员工

### 其他
- **更新公告**：左侧列表 + 右侧详情；有发布权限的用户可删除公告（二次确认），管理后台「更新公告」面板列出已发布公告并可逐条删除
- **消息箱**：集中展示管理员系统通知与头衔授予消息，支持分类筛选、仅看未读与分页；导航栏铃铛显示未读数量
- **权限等级标签**：评价等处显示用户角色，所有角色均可展示；可在设置中自行选择是否显示，普通用户（`user`）的等级标签始终展示、不可关闭
- **学生认证**：邀请码 / 管理员审核（支持通过、拒绝并填写原因）
- **个人中心**：类 B 站布局——资料头部（头像 + 用户名 / 权限等级 / 昵称 + 个性签名，昵称与签名点击即可编辑）与吸顶横向菜单栏（主页 / 收藏 / 头衔 / 设置）
- **设置**：账号安全、网站设置（默认进入界面 / 菜品与食谱默认页 / 必吃榜默认排序与餐食类型 / 店铺详情页样式（手动 / 自动）/ 收藏默认页 / 显示权限等级）、消息通知、工单、退出登录
- **用户主页**：评价等处的头像可点击进入主页——点自己的头像进入个人中心，点他人的进入其主页（同版式、只读、按其设置显示权限等级、可查看其头衔）；权限足够的管理员可在主页「管理」中修改该用户的权限等级、特殊权限、头衔或封号
- **收藏夹**：必吃榜店铺卡片与店铺详情页的点赞旁有「收藏」按钮——弹窗内可选择或新建必吃榜收藏夹，确认后按钮高亮为「已收藏」；个人中心「收藏」按版块 / 收藏夹分栏浏览并分页，公开后可在他人主页只读查看；设置中可选择必吃榜的默认收藏夹，并在其下设置「新建收藏夹默认公开」，切换即保存。新建时重新读取账号偏好，可用「公开」开关单独调整；读取失败默认私密，已有收藏夹不变。
- **全站横幅**：可由管理员配置，用户可关闭
- **页面切换**：站内链接在悬停、聚焦或触摸表达意图时提前准备页面；慢网保留当前内容并延迟显示顶部细提示条。正文外导航按顶栏栏目位置横滑，内部详情按父子关系进入/返回，返回恢复筛选与列表位置。详见 [导航规范](docs/navigation.md)。运行 `npm run test:navigation` 验证导航专项。
- **导航栏**：Logo 点击回首页、手机全屏展开导航与账户菜单（个人中心 / 设置 / 管理后台）
- **统一交互**：表单校验、提交状态、确认对话框、图片查看器、加载与错误重试
- **工单**：设置页提交与查看，后台按权限批复文字和图片

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 工作区 | npm workspaces，Node.js ≥22.13，推荐 24 LTS |
| 前端 | React 19、TypeScript 严格模式、Vite、TanStack Router / Query |
| 后端 | Hono、原生 Node HTTP、JWT / bcrypt、基于 FormData 的上传 |
| 数据 | Drizzle ORM + better-sqlite3；保留 SQLite 数据、稳定 ID 与原有业务约束 |
| 菜单识别 | 独立 Node worker、sharp、cheerio、Ajv、pinyin-pro |
| 地图与视觉 | 原有 CSS 令牌、本地字体/图片/Leaflet、SVG 校园图；React 管理挂载与卸载 |

架构边界、数据库升级与回退见 [架构说明](./docs/architecture.md)，完整接口及数据模型见 [项目地图](./MAP.md)。

## 目录结构

```text
apps/
  web/                  React 应用、Vite 入口与构建
    src/pages/          页面组件，保留原有 .html 地址
    src/components/     站点壳、表单、对话框、收藏、地图、评价及后台组件
    src/layouts/        复杂页面的展示结构，属性按具体 HTML 元素类型约束
    src/lib/            API、登录态、主题、URL 状态与表单 Hook
    src/maps/           地图交互与地点数据
    public/             原有 CSS、字体、品牌图片、SVG 与本地 Leaflet
  api/
    src/index.ts        Node 入口、静态资源、404 与优雅退出
    src/app.js          Hono 组装与业务服务初始化
    src/routes/         账号、公告、资料、消息、工单、认证等路由
    src/domain/         菜单、店铺、菜品、头衔、收藏及历史迁移
packages/
  db/src/               Drizzle 类型化表结构、参数绑定及迁移入口
  db/migrations/        可接入旧库的 SQL 基线及迁移元数据
  shared/src/           共享 DTO、角色等级与标签
server.js               生产入口，加载 apps/api/dist/index.cjs
scripts/shops/          店铺数据整理工具
skills/szzx-menu/        独立菜单读图技能源文件
szzx-menu.skill          可导入的技能包
menu-json-rules.md      八字段 JSON 与完整读图约定
data.db                 运行数据库，保留历史快照
uploads/                上传图片，必须持久化
.private/               私有密钥、原图、诊断和缓存，禁止公开
data/                   菜单种子和店铺范围配置
data.json               旧地图兼容数据
tools/                  API/worker 构建、开发进程管理、技能构建
tests/                  后端、迁移、部署和浏览器回归
docs/                   架构、菜单运维、逐页规范及历史验收
```

---

## 快速开始

### 1. 环境要求

- Node.js **24 LTS**（推荐），最低 **22.13**；npm 支持 workspaces。
- 无需独立数据库服务。better-sqlite3、bcrypt、sharp 使用平台原生模块，优先安装预编译版本；缺少预编译包的平台需要本机编译工具。

### 2. 安装依赖

```bash
npm ci
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
npm run build
npm start
# 生产入口：node server.js，提供已构建页面与 API
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

生产从源码部署需先执行 `npm ci`、`npm run build`，再按需执行 `npm prune --omit=dev` 后 `npm start`。不能在尚无构建产物时只安装生产依赖。不需要 Python 或第二台菜单服务器。登录 developer 后进入「管理后台 → 菜单自动同步」，保存并测试模型，开启周末同步（上海时间周六/日 08–22 点每小时，周一 08/12 点补查）。详细说明见 [菜单同步运维](./docs/menu-sync.md)。

三种管理角色均可使用「管理后台 → 菜单手动导入」，无需 AI Key。支持新建批次、编辑已发布 JSON、载入已结束任务的识图候选并对照原图补全。已有来源会整篇替换，发布记录可追溯；编辑版本冲突或同步运行中会阻止发布。格式约定与流程见 [JSON 详细规则](./menu-json-rules.md)。

将 [szzx-menu.skill](./szzx-menu.skill) 导入支持技能的 AI 客户端，附带完整图片和年份，即可直接生成八字段 JSON。也可解压读取 `SKILL.md`；技能不启动额外服务。修改规则后用 `npm run build:menu-skill` 重新打包，`npm run test:menu-skill` 验证；这两个开发命令使用 Python 标准库，生产网站不需要 Python。

### 开发与数据库

```bash
npm run dev             # Vite 5173 + Hono 3000，前后端独立热更新
npm run typecheck       # TypeScript 严格检查
npm run lint
npm run format:check
npm run db:generate     # 根据 packages/db/src/schema.ts 生成下一次迁移
```

Vite 将 API 和上传请求代理到 3000；若改变 API 端口，同时调整 `apps/web/vite.config.ts`。API 与菜单 worker 的源码变更会重新打包并重启 API，停止开发主进程会同时关闭两者。生产静态文件修改后需要重新构建。

Claude Code 浏览器预览可使用 `.claude/launch.json` 中的 `sytime-dev` 配置：从根目录通过 Node 导入 `tools/dev.mjs` 前显式设置 API 的 `PORT=3000`，避免预览工具注入的前端端口影响 API，同时启动上述前后端；访问 <http://localhost:5173/>。首次使用先执行 `npm ci` 安装包括 Vite 在内的开发依赖；停止预览复用现有子进程清理逻辑。

首次接入旧库会登记 Drizzle 基线，再执行幂等历史升级，保留账号、内容、收藏夹、菜品和 ID。升级前停止旧服务，成套备份 `data.db`、`uploads/`、`.private/`、`data/` 与配置。不要同时启动新旧服务写同一库；回退需要恢复旧版本及整套备份。详见 [架构说明](./docs/architecture.md)。

店铺开发脚本使用 `node --import tsx scripts/shops/collect-pois.mjs`、`node --import tsx scripts/shops/enrich-candidates.mjs`；它们会调用外部服务或写入目标数据，先核对各脚本参数。

### 回归验证

先执行一次 `npm run build`，再运行需要的回归组。

运行 `npm test`，依次执行架构迁移、菜单、菜品详情及选菜、头衔、店铺、收藏、用户主页、全站与地图回归；不会改动项目的 `data.db` 或 `uploads/`。可分别运行 `npm run test:menu`、`npm run test:dishes`、`npm run test:dishes:ui`、`npm run test:ui` 和 `npm run test:map`（校园导览搜索、筛选、选点、触控、键盘、响应式与明暗主题）。Windows 默认使用已安装的 Microsoft Edge，其他平台先运行 `npx playwright install chromium`。

收藏默认公开可单独运行 `npm run test:collections`（含旧账号迁移、数值校验、两版块及账号隔离）和 `npm run test:collections:ui`（既有收藏交互 + 默认公开专项，覆盖手机/桌面、明暗主题、键盘及请求失败）。本轮结果与全量回归的已知限制见根目录 `MAP.md` 最新记录。

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

**特殊权限**（可单独授予任意用户）：`banner_edit`、`announcement_publish`、`student_review`、`invite_manage`、`weekly_menu_upload`、`map_popup_edit`、`user_manage`、`ban_appeal_review`、`shop_create`（添加店铺）、`title_manage`（头衔管理）。

所有受保护请求重新读取数据库中的角色和账号状态；封禁、降权和权限撤销立即约束已有登录凭据。改密后旧凭据的有效期沿用原有约定。

`shop_create` 默认要求 `student` 及以上角色，也可在角色外单独授权。通过 `SHOP_CREATE_MIN_ROLE` 调整默认最低角色；后端每次创建请求都会重新核验。

---

## 数据与部署注意

- 这是一个**动态站点**（Node 后端 + `/api/*`），**不能**直接部署到 GitHub Pages。
- 可部署到 Render / Railway / Fly.io 等支持 Node 的平台。
- 需持久化 `data.db`、`uploads/` 与 `.private/`。数据库和菜单加密主密钥必须配套备份；丢失主密钥后需要重新保存 API Key 并测试。
- `.gitignore` 忽略 `.env`、`.private/`、`node_modules/`、SQLite 临时文件和浏览器测试产物；`data.db` 与 `uploads/` 保留历史初始快照。不要将生产密钥或保存模型凭据后的生产数据库提交 Git。
- 源码更新后执行 `npm run build` 并重启生产服务；开发用 `npm run dev`。`data.json` 每次请求实时读取。构建产物为 `apps/api/dist/` 与 `apps/web/dist/`，迁移文件必须随部署保留。

---

## 主要接口（节选）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/register` / `/api/login` | 注册 / 登录 |
| GET | `/api/user/profile` | 当前用户信息（含角色、权限及数值 `collection_default_public`，默认 0） |
| PUT | `/api/user/settings` | 部分更新网站设置；`collection_default_public` 只接受数字 0/1，省略则保留原值 |
| GET | `/api/menu` | 已发布周次、供应和真实评分 |
| GET | `/api/dishes` | 独立菜品目录和统一拼音排序 |
| GET | `/api/dishes/:id` | 菜品详情、评价数和平均评分；没有评价时评分为 null |
| GET | `/api/dishes/:id/reviews?offset=0` | 当前菜品的非每周评价，按时间及编号倒序，每页 20 条 |
| GET | `/api/recipes` | 原有全站评价列表，保留无法关联的历史记录 |
| POST | `/api/recipes` | 登录后以 `dish_id` 选择已有目录菜品；服务端确定菜名，评分为 0–5 整数，可选评论和图片 |
| GET | `/api/shops` | 公开店铺列表，可按 `type`、`q`、本部距离/步行时间、点赞数、评价数、评分范围过滤；可按本部/地铁/点赞/评价/评分/最新排序（拼音 A–Z 由前端完成） |
| GET | `/api/shops/meta` | 店铺类型、地图配置、覆盖范围和当前用户上传权限 |
| GET | `/api/shops/:id` | 公开店铺详情与互动计数 |
| GET | `/api/shops/:id/reviews` | 公开评价列表 |
| POST | `/api/shops/:id/like` | 学生及以上点赞/取消点赞 |
| POST | `/api/shops/:id/reviews` | 学生及以上提交或更新 1–5 星评价 |
| DELETE | `/api/shops/:id/reviews/me` | 学生及以上撤销自己的评价 |
| GET | `/api/messages` | 当前用户消息列表（分类筛选、仅未读、游标分页） |
| PUT | `/api/messages/:id/read`、`/api/messages/read-all` | 标记单条 / 全部消息已读 |
| GET | `/api/user/titles` | 我的头衔（含佩戴状态）与未达成自动头衔的进度 |
| PUT | `/api/user/title` | 佩戴 / 不佩戴头衔 |
| — | `/api/collections*` | 收藏夹（#23）：列表 / 新建、收藏与取消、分页详情、公开状态；写操作需登录，公开收藏内容可匿名读取 |
| POST | `/api/collections` | `{section, name, is_public?}`；明确的 `is_public` 只接受数字 0/1，省略时读取当前登录用户最新默认公开偏好；响应仍为布尔公开状态 |
| GET | `/api/users/:id/collections` | 指定用户的公开收藏夹（他人主页只读，公开收藏内容可匿名读取） |
| PUT | `/api/user/settings/collection` | 保存必吃榜默认收藏夹 |
| — | `/api/admin/titles*`、`/api/admin/users/:id/titles*` | 头衔目录维护、授予撤销与专属头衔颁发（`title_manage`，默认 super_admin） |
| POST | `/api/shops` | 创建店铺（默认 student 及以上或显式 `shop_create`）；可选 `dianping_url` 仅接受安全的 `dianping.com` HTTPS 链接 |
| — | `/api/admin/menu-sync/settings`、`test`、任务写操作 | active developer 配置与自动同步管理 |
| — | `/api/admin/menu-sync/imports*`、任务详情和资料读取 | active developer / super_admin / admin 手动导入、编辑及原图核对 |
| POST | `/api/student/apply` | 提交学生认证 |
| POST | `/api/user/appeal` | 提交封禁申诉 |
| POST/DELETE | `/api/admin/announcements`、`/api/admin/announcements/:id` | 发布 / 删除公告（`announcement_publish`） |
| POST | `/api/admin/notifications` | 发布系统通知（`announcement_publish`） |
| — | `/api/admin/*` | 后台接口（按角色 / 权限校验） |

`users.collection_default_public` 为 `INTEGER NOT NULL DEFAULT 0`，旧账号启动迁移后默认私密；偏好只影响之后主动新建的收藏夹，不批量修改已有收藏夹。首次读取版块时自动补建的「默认收藏夹」仍为私密；单个收藏夹后续的公开切换与所有权校验保持不变。

功能更新记录（面向使用者，日常用语）见 [CHANGELOG.md](./CHANGELOG.md)。

菜品详情入口为 `/dish.html?id=<菜品编号>`。启动时在菜单目录初始化之后，为评价表补充可空的 `dish_id` 外键和查询索引；旧非每周评价仅按同一名称归一规则补关联，不改写原文、不删除无法匹配的记录。旧的仅传菜名发布方式不再接受，新请求必须选择已有菜品；客户端上传的菜名不能覆盖目录名称。详情不虚构价格、供应信息或图片，店铺关联不在本次范围。字段与迁移详见 [项目地图](./MAP.md)，交互见 [菜品详情规范](./docs/ui/pages/dish-detail.md)。

## 配套离线地图编辑器

同级 [szzx-mapeditor](../szzx-mapeditor/README.md) 可直接打开 HTML 编辑旧楼层数据，再下载 JSON，不修改网站数据库。旧楼层页面已移除，替换 `data.json` 不再改变当前校园地图；当前地图由静态地点目录与 SVG 维护。编辑器和归档数据的范围见 [项目地图](./MAP.md#721-配套离线地图编辑器)。

每次代码更新必须同步相关文档并实质修改最新的根目录 `MAP.md`；规则见 [AGENTS.md](./AGENTS.md)，[agent.md](./agent.md) 提供兼容入口。

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

完整许可文本见根目录 [LICENSE](./LICENSE)，或访问 <https://www.gnu.org/licenses/agpl-3.0.html>。

## 2026-10-23 · 论坛移除与升级

论坛页面、帖子详情、接口、前端脚本和专属样式已删除。收藏仅支持 `shops` / `shop`；消息箱保留系统通知和头衔授予消息。自动头衔移除「论坛催化剂」「高赞校友」，目录现有 7 项。

启动时依次运行头衔、收藏与 `lib/migrations/remove-forum.js` 迁移：删除论坛帖子、回复、点赞表，清除论坛收藏、旧互动消息、相关头衔拥有/佩戴关系及默认收藏和通知偏好字段。店铺收藏 ID、公开状态与默认选择保留；默认进入论坛的账号回到首页。迁移使用事务并支持重复执行，本次开发使用临时数据库验证，保留工作区原有 data.db 改动。

验证命令为 `npm test`，其中收藏后端包含旧库迁移与论坛接口移除检查；最新结果见根目录 MAP.md。

2026-10-24 合并验证：论坛移除与菜品详情、选菜追加、店铺收藏默认公开已共同通过 `npm test` 全量回归。升级保留店铺收藏及默认公开偏好；当前结果与测试数量见 [MAP.md](./MAP.md) 最新合并记录。

## 食谱双栏与历史版式验证 · 2026-10-25

默认菜谱以“今天我吃了…”和“明天吃什么？”展示，左上可选日期、星期和校区，两栏独立选餐，默认午餐。同菜多地点合并，风味不显示重复标签；右上可切换周视图或跨全部已发布周的高级筛选。一次偏好迁移不删除既有菜单或评价。

识别按每张图片重新检测浅色网格和实际日期列，不假设列宽/行高相同；无法确定时整表读取，保留全图复核。新增前两周真实图片测试及非等宽网格回归，详见 docs/menu-validation.md。运行 node --import tsx tests/menu-daily-ui.mjs 验证双栏和交互，npm run test:dishes:ui 保留周视图及评价回归。


### 2026-10-30 · 移动导航与团队署名

手机/平板顶栏在 992px 及以下展开覆盖正文的纯文字菜单，保留顶栏工具，背景淡入、链接逐项出现；支持关闭动画、Esc、循环键盘焦点、减少动态效果、短屏滚动和切换桌面自动收起。首页开发团队为「软开人工智能部」（原图标不变），页脚版权为「© 2026 苏州中学软件开发社人工智能部」。实现及验证详见 docs/navigation.md 与根目录 MAP 最新记录。


## 2026-10-30 · 团队简称与移动导航闪烁修复

首页开发团队首项改为「软开人工智能部」，沿用原有橙子图标；页脚版权仍为「© 2026 苏州中学软件开发社人工智能部」。点击移动菜单的普通站内链接时，先同步提交关闭状态并完成菜单及按钮的关闭动画，再由 Router 捕获页面转场快照，避免把尚在淡出的导航重新显示到下一页。点击关闭按钮和 Esc 仍播放原有 200ms 淡出，修饰键打开新标签保留当前菜单；账户链接与主栏目使用相同处理，不增加等待定时器。
