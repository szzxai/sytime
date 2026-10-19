# 实施路线 · implementation.md

> 给实施者的操作手册：从零到全部完成的步骤、每步验收、自检工具、常见错误。改代码前先读当前 UI.md。
>
> #4 已按本路线完成；当前实现位于 `public/`，验证结果见 [acceptance.md](./acceptance.md)。下文迁移阶段是 #4 的历史实施记录，不作为 v2 的复制步骤；日常复验使用仓库内的 `npm test`。

## 2026-10-17 · v2 当前维护方式

直接维护 `public/` 中的运行资产，遵循根目录 UI.md 的 SHSTime 中文绿色设计、通栏首页和工作区布局。`docs/ui/assets/` 为 #4 历史样张，不再复制到运行目录。功能 ID 和页面脚本契约保持；所有页面文档、文案、README、MAP、progress 和用户更新日志同步。验证包括 `npm test` 及新增首页 360/768/1440px 字体、键盘、主题、页面切换、空间避让和工作区断点检查。

## 阶段 0 · 基建（#4 历史记录）

1. 复制参考实现到项目：
   - `docs/ui/assets/site.css` → `public/css/site.css`
   - `docs/ui/assets/ui.js` → `public/js/ui.js`
   - `docs/ui/assets/icons.svg` → `public/img/icons.svg`
   - `docs/ui/assets/favicon.svg` → `public/img/favicon.svg`
2. 新建 `public/404.html`（内容见 pages/system-pages.md）。
3. `server.js` 在静态服务之后、API 404 之前加兜底（仅示例，按现有代码风格放置）：
   ```js
   // express.static 之后：
   app.use(function (req, res, next) {
     if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/uploads") && path.extname(req.path) === "") {
       res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
       return;
     }
     next();
   });
   ```
   注意：必须放在 `app.use(express.static(...))` 与 `/uploads` 之后、`/api/*` 路由之前或之后皆可（但要在兜底里排除 api/uploads）。
4. 启动 `npm start`，浏览器打开 `/`：页头/页脚暂未出现（页面还是旧 HTML），先只验证 `css/site.css`、`js/ui.js`、`img/icons.svg` 可被访问（直接打开三个 URL 均 200）。
5. 打开 `docs/ui/assets/specimen.html` 对照：这是唯一认可的视觉基准。

**阶段 0 验收**：四个资产文件可访问；404 页对未知路径生效；API 正常不受影响。

## 阶段 1 · 逐页改骨架（2–3 天）

按此顺序做（每页一个提交，做完即验）：

1. **login.html → register.html → student_verify.html**（最简单，练手）
2. **announcements.html**
3. **index.html**（并废弃 about.html，见 pages/home.md）
4. **recipe.html**
5. **forum.html → post.html**
6. **profile.html**
7. **admin.html**（最大，最后做）
8. **map.html**（含 data.json style 修改与 Leaflet 本地化，见 pages/map.md）

每页的操作模板：

1. 读 `docs/ui/pages/<页>.md` 全文。
2. 备份旧文件（`git` 里已有历史即可，无需手动备份）。
3. 用该页「HTML 骨架」替换整个文件；把旧 `<script>` 里**未在「需要修改的脚本行为」中列出**的逻辑原样搬入新骨架的页面脚本区。
4. 逐条执行「需要修改的脚本行为」（旧 → 新），包括：删除 alert/confirm/prompt、`.active` 改 aria/新类、错误文案接 `UI.errorText`、登录跳转接 `UI.goLogin/nextUrl`、`innerHTML` 拼接补 `UI.esc`。
5. 对照「JS 钩子清单」确认每个钩子的去向。
6. 打开页面过「验收清单」；控制台必须零报错。
7. 开发者工具切 360px 与 1280px 各走一遍。

**阶段 1 验收**：每个页面在其文档验收清单上全勾；全站无内联 `<style>`；无 alert/confirm/prompt；无 emoji 图标。

## 阶段 2 · 精修与深色（1 天）

1. 过 UI.md「有品味自检」10 条（逐页截图灰度检查）。
2. axe 扫描（见「自检工具」）：light + dark 两个主题，violations 必须为 0。
3. 键盘走查：只用键盘完成 每页主要操作。
4. 慢网与离线走查（Network 面板：Slow 3G、Offline）。
5. `UI.config.features` 保持全 false（新功能页面 P1 阶段再开）。

## 阶段 3 · 新功能（随各 issue）

| Issue | 页面/改动 | features 开关 | 顺序 |
| --- | --- | --- | --- |
| #5 全部菜品 | recipe.html 三页签、A–Z 目录与搜索；developer 同步面板，见 issue-5-plan.md | dishes（已开启） | 1 |
| #6 必吃榜 | shops.html + shop-new.html | shops | 2 |
| #7 店铺详情 | shop.html + profile 设置项 + shopLayout 持久化 | shops | 3 |
| #8 菜品上传 | shop.html 添加菜品对话框 + 权限 | shops | 4 |
| #9 消息箱 | inbox.html + 页头铃 + profile 通知设置 + admin 发送面板 | inbox（已开启） | 5 |
| #10 头衔 | UI.userLine 全站接入 + profile 头衔区 + admin 头衔面板；实现见 [issue-10-plan.md](../issue-10-plan.md) | titles（已开启） | 6 |

每个功能上线：先建数据/接口（不在本手册范围），再把 `UI.config.features.xxx` 改 true，然后按对应页面文档实现，最后跑该页验收清单 + axe。

## 自检工具

### 仓库回归

在项目根目录运行：

```powershell
npm.cmd ci
npm.cmd test
```

Windows 使用已安装的 Microsoft Edge；其他平台先运行 `npx playwright install chromium`，再用 `npm test`。

[tests/ui-smoke.mjs](../../tests/ui-smoke.mjs) 启动临时后端，覆盖现有页面、后台面板、业务弹窗及主要表单流程，扫描 360px/1280px 和 light/dark 的布局与 axe 违规。结果和截图位于 `output/playwright/`，测试不会改写仓库的数据库、地图数据或上传目录。

### 静态与人工检查

- 类名以 `public/css/site.css` 和本手册组件骨架为准；新增页面不要自造组件类。
- 搜索页面中的 `<style`、`style="` 及原生 `alert/confirm/prompt`；除允许的动态自定义属性外应无残留。
- 使用 `node --check` 检查改动的 JavaScript，并运行 `git diff --check`。
- 对照 [assets/specimen.html](./assets/specimen.html) 抽查至少三个页面；通过浏览器切换主题，检查颜色、间距与交互状态。
- 只用键盘核对主要操作、对话框、账户菜单与手机抽屉；慢网和离线时核对加载与重试。

实施阶段的参考组件套件已通过 101 项检查，详见 [验收记录](./acceptance.md)。原设计阶段使用的本机临时工具不属于项目依赖；后续开发应使用上述仓库入口复验。

## 常见错误（检查自己的提交）

| 错误 | 后果 | 纠正 |
| --- | --- | --- |
| 页面里写 `<style>` | 深色模式失效、样式漂移 | 全部并入 site.css；确需动态值用 `style="--x:…"` |
| 用旧类名 `.active`/`.submit`/`.msg`/`.field label` 等 | 样式不存在，界面裸奔 | 查 components.md 换新类 |
| 保留 `renderAuth()` 旧调用但没有引入 ui.js | 控制台报错 | ui.js 兼容了 `window.renderAuth`，确认 `js/ui.js` 已引入且在页面脚本**之前** |
| `innerHTML` 里漏 `UI.esc` | XSS | 逐变量检查；测试：发一帖内容 `<img src=x onerror=alert(1)>` 应原样显示 |
| 删除了 hooks.json 里的 ID 但没改脚本 | 功能静默失效 | 对照每页「JS 钩子清单」 |
| 图标写成 `<use href="#i-x">`（页内没有 sprite） | 图标空白 | 用 `UI.icon()` 或 `href="img/icons.svg#i-x"` |
| 在深色模式下手写白色背景 | 深色下刺眼 | 用 `--surface` |
| Toast 嵌在关闭中的对话框里报错 | 控制台报错 | ui.js 已处理（toast-host 挂在最上层打开的 dialog）；不要自己 append toast |
| 忘记 `data-nav` | 页头没有当前高亮 | 每页 body 加对应键 |
| Leaflet CSS 放在 site.css 之后 | 地图控件被覆盖 | map.md 已规定顺序：leaflet.css 先，site.css 后 |

## 完成定义（DoD）

菜单自动同步与 JSON 人工导入的实现和权限见 [同步运维](../menu-sync.md)及[后台规范](./pages/admin.md)。回归入口为 `npm run test:menu`（18 项）、`npm run test:titles`（14 项）、`npm run test:shops`（14 项）、`npm run test:shops:ui`（64 项）、`npm run test:ui`（363 项）、`npm run test:menu-skill`（便携包/16 个非法样例）及 `npm run test:deploy`（全新生产安装），均通过。真实模型三图的完整导入和局部抽样结果见 [验证记录](../menu-validation.md)，不由界面或格式测试推导识图准确率。

- [ ] 阶段 0–2 全部验收项通过。
- [ ] 12 个现有页面 + 404 全部完成并逐页验收。
- [ ] 全站 axe（light/dark）= 0 违规；ui.js 测试 101 通过。
- [ ] `docs/ui/assets/specimen.html` 与线上页面抽查 3 页截图对比，无明显偏差。
- [ ] README「功能特性」里的「黑白极简风格」表述更新为「宣纸·黛青·朱印 极简风格」；目录结构小节补上 `css/ js/ img/ 404.html`。

## 2026-10-17 追加实施记录：首屏与交互精校

从参考页面的实际 CSS 和浏览器布局核对字体、导航控件、首屏断点、折叠与页脚；先完成视口填充、白色范仲淹像、字体/圆角/团队间距，再校准 100ms 导航淡入、200ms 单项折叠、连续渐变和手机正文尺寸。字体随站点提供，中文回退到本机字体。桌面首屏以顶栏和横幅实际尺寸计算，不依赖固定公告高度。展开内容保留键盘语义、关闭后 inert，允许动画反转。

本轮测试覆盖参考时序、动画中间帧、减少动态效果、渐变像素连续性、公告异步加载/关闭/换行、五组桌面宽高和窄屏布局；同时修复中性灰应用到地图与公告选中底色后的对比度，展开段落链接保留细下划线。最终结果见根目录 MAP 的精校记录与 acceptance 追加记录。
