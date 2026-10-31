# 全栈 Monorepo 架构

更新：2026-10-31。当前实现为 React 19 + TanStack Router/Query + Hono + Drizzle；此前技术研究中的 Fastify、PostgreSQL、服务端会话与其他候选不代表已经部署。

## 工作区与边界

- `apps/web` 负责 React 页面、交互、路由、请求缓存和已有地图适配。`pages` 组合领域组件；`layouts` 保留复杂页面原有 DOM 与 CSS 类，类型化的 slot / bind 仅承担展示结构。没有运行旧 HTML 或执行旧页面脚本。
- `apps/api` 负责 Hono 路由、鉴权、上传、权限和领域服务。`app.js` 组装服务；路由按账号、资料、认证、公告、消息、工单分拆；菜单、店铺、菜品、头衔和收藏各自封装规则与存储。既有成熟算法在新领域目录继续使用 JavaScript；入口、鉴权、上传及共享数据库使用 TypeScript。
- `packages/db` 唯一负责数据库驱动、Drizzle 表结构与版本迁移。应用 SQL 通过 Drizzle 参数绑定执行，不拼接用户值；复杂聚合和历史升级保留 SQL 表达，以保持原来排序、约束、错误语义和事务边界。
- `packages/shared` 提供用户、菜品、店铺、评价 DTO 与角色等级，供两端导入；没有引入浏览器端数据库驱动。

依赖方向为 web → shared；api → db / shared。生产打包解析本地工作区源码，外部运行依赖由 npm 安装。TypeScript 严格检查覆盖 TS/TSX；领域 JavaScript 不在严格类型检查范围，ESLint 与业务回归覆盖其运行行为。

## React、路由和数据

`apps/web/src/main.tsx` 建立 QueryClientProvider、登录态、主题及 TanStack Router。每个旧 `.html` URL 对应 React 路由，页面按路由懒加载；详情按 ID 重新挂载。搜索参数保持普通 URL 编码，旧链接与刷新可直接进入。

Router 负责路径、hash 面板和搜索参数；Query 负责服务端数据及 mutation 成功后的失效刷新。筛选、分页和浏览器前进后退读取同一份 URL 状态。输入法组合期间保留本地草稿，组合结束后提交搜索。登录态与公共查询分开缓存，退出会清空缓存。受保护请求返回 401 时清除当前失效凭据和账号缓存，受保护页面返回带 next 的登录入口；旧请求不能清除之后新登录的凭据。

站点壳持久挂载，站内页面使用 Router Link 的意图预加载，不注册 document 点击拦截；路由组件可提前加载，主要查询与实际页面共享缓存，就绪后一次提交 View Transition。正文外按栏目位置、正文内按父子关系判断方向，历史前进后退沿导航边处理，显示位置不随尚未提交的目标 URL 提前变化。正文维持视口高度，超过 200ms 的等待才显示顶部提示条；导航栏与公告无需每次重建。导航抽屉、原生 dialog、焦点恢复、图片查看器、toast、收藏、上传和评价选择器均为 React 组件。未保存表单使用 Hook 管理离开提醒并在成功后清除；原生表单字段的字数统计由组件订阅并随卸载清理。

CSS 令牌、响应式规则、字体、图像、SVG 和本地 Leaflet 原样迁入 `apps/web/public`。校园地图与店铺地图的绘制算法由组件 effect 挂载和清理，不通过注入 HTML 页面运行。地图坐标、围栏和步行距离规则保留。

## HTTP、权限和文件

Hono 业务接口以根目录 MAP 的当前全量索引为准。账号统一由 domain/accounts 处理：五级角色、学生唯一绑定、审核、会话、限流及审计。浏览器使用 HttpOnly/SameSite=Strict Cookie，localStorage 仅存会话标记；API 客户端支持 Bearer。JWT 必须匹配数据库会话、版本和当前账号状态。退出撤销当前会话，改密、封禁、角色变更及解绑撤销全部会话；写请求检查来源。无邀请码或个人特殊权限。登录不检查密码强度；注册与新密码执行共享策略。

JSON 与 multipart 限额由 Hono 和领域校验控制。公开资料、菜品评价、推荐店铺及店铺评价进入统一私有审核队列；审核批准才写公开表。待审图片实际解码、限制像素与大小、去元数据转 PNG，批准后写入 uploads/approved 随机文件，终态清理私有字节。通知、审计和公开发布在同一事务中处理。公开上传只从 uploads 提供，.private、.env 和数据库不在静态根目录。菜单同步仅由服务器环境变量配置，网页管理、上传、手动导入及地图写接口已删除。

生产入口 `server.js` 加载 `apps/api/dist/index.cjs`。API、worker、服务器 operator CLI 各自产生 CJS bundle；前端由 Vite 构建。未知 API（含 `/api` 本身）返回 JSON 404；已有页面地址返回 React 入口，其他页面返回带同样站点壳的 404。静态文件和 SPA 均由同一 Hono 服务提供。

## SQLite 接入与迁移

继续使用 SQLite 是为了保留现有数据、主键和单实例部署方式。驱动改为 better-sqlite3，所有业务读写进入 Drizzle。类型化 schema 与账号幂等升级对应当前 29 张业务表、默认值、复合键、外键、CHECK 和索引；内部还包括 SQLite 自增序列和 Drizzle journal。

启动顺序：打开库 → 执行 `packages/db/migrations` → 幂等历史字段/数据升级 → 菜单种子与既有内容关联 → 领域初始化 → 接收请求与启动调度。首个基线使用 `CREATE TABLE IF NOT EXISTS` 接入没有 Drizzle journal 的旧库。不会为已有行重排 ID 或清空业务内容；账号升级映射旧管理角色，旧学生回到 user 重新认证，删除邀请码/个人权限/旧每周图片表。旧认证与申诉表只读保留，不自动并入新队列；六张新表管理会话、学号绑定、审核、审计、限流和升级标记。详情见 account-rebuild.md。

后续修改 `packages/db/src/schema.ts`，运行 `npm run db:generate`，审查生成 SQL 与 snapshot，再在临时旧库上验证升级。生产启动自动应用已提交迁移，不在运行中执行生成命令。历史库中原有约束差异不会仅因登记基线而被强行重建。

菜单任务仍使用原有持久租约、取消、重试、定时和 fencing。worker 使用同一驱动/schema 与独立 bundle，私有目录与任务诊断保留，旧数据库菜单凭据和主密钥管理入口移除，识别凭据来自环境变量。API 停止前先关闭菜单服务和 worker，再关闭 HTTP 与数据库。

## 开发、生产和回退

开发：`npm ci`、`npm run dev`。Node >=22.13，推荐 24 LTS。Vite 默认 5173，API 默认 3000；开发进程管理器直接管理 Node 子进程，源码改动后重新打包 API/worker，优雅停止旧服务再重启，收到退出信号同时关闭前后端。`APP_ROOT` 可将运行数据定位到隔离目录；它不是前端资源的单独配置。

源码部署：`npm ci --include=dev` → `npm run build` → 可选 `npm prune --omit=dev` → `npm start`。显式包含构建依赖，避免 `NODE_ENV=production` 时 npm 默认省略开发依赖而无法构建。必须保留根入口、构建目录、迁移目录、workspace manifests、运行依赖与种子。先安装仅生产依赖不能完成源码构建；不要跨操作系统直接复制原生模块。生产不依赖 Python、Playwright、tsx 或 Vite。构建后的 npm run account:operator 可在裁剪依赖后创建运营账号，命令先备份且拒绝覆盖同名账号；生产禁止测试清理选项。

部署前停写并备份 `data.db`、`uploads/`、`.private/`、`data/`、`data.json` 与本机配置，再在相同平台构建和启动。只使用一个 API 调度入口；不要将应用目录当临时容器层丢弃运行数据。先检查页面、登录、目录、私有文件保护与任务状态，再恢复流量。

回退时停止新进程，恢复旧版本代码与升级前整套数据备份，并使用对应依赖启动；不能只恢复数据库而保留更新后的上传/任务目录。业务数据库和私密目录不纳入本次重构提交。

## 验证策略

测试均使用临时数据库、端口与上传目录。`test:architecture` 专门验证无 journal 的旧库接入、重复启动和 ID/收藏/头衔/评价保留，以及旧 JWT 在角色变更与封禁后的即时权限。`test:backend` 覆盖既有领域合同；浏览器组覆盖原 URL、手机/桌面、明暗主题、键盘、地图、输入法、收藏、评价和后台。

`test:deploy` 在临时源码副本安装完整依赖、构建、移除开发依赖并启动，核对种子和私有文件保护。构建、typecheck、lint 与 format:check 属于源码门禁。实际执行结果和复验范围记录在根目录 MAP 与 UI 验收记录中，不将分组通过描述成未执行的整条 npm test 结果。

导航细节及地图链接接入见 [导航规范](navigation.md)。

## 2026-10-31 通知与上传交互补充

账号领域 notifications 模块复用 messages 已有 target_kind/target_id，按当前身份生成安全的站内跳转目标；审核与工单事务同步结清旧待办，消息读取按本人补偿已处理状态。新结果通知保留未读，前端等待标已读请求成功再跳转。旧消息幂等关联仅处理可唯一匹配的系统文案。公开评价接口允许资源内单独查找目标评论，保持普通分页不变；私人申请过滤始终限定本人。

前端 imageUpload 统一进行超限图片本机压缩，后端继续真实解码与限额校验。个人与公开主页使用昵称和用户名，展示 ID 为辅助字段；后台铺满宽度、认证桌面双栏、审核单弹窗分步，移动输入最终字号至少 16px。详细行为及测试以 MAP 最新记录为准。

## 2026-10-31 公开源码边界

运行库、uploads、私有配置、日志与生成技能包不再跟踪，所有本地可达历史中的旧运行数据已在外部备份后清除。公开地图配置和菜单测试来源保留；数据分类、历史处理、检查命令和远端发布阻塞项见 [公开仓库准备](public-release.md)。新增 public:check / public:check:history、三项门禁回归与只读 CI。生产部署测试只复制 Git 可发布文件，隔离本机环境，在 production 下显式安装构建依赖，构建并裁剪后验证空目录、私有文件 404 和 operator 登录。

本地预览另可使用 `.claude/launch.json` 的 `sytime-dev`，固定 API 3000、Web 5173，复用开发进程退出清理。生产构建仍按前述部署流程执行。
