# AGENTS.md · AI 协作须知

本文件适用于所有在本仓库工作的 AI 助手（opencode、Codex、Cursor、GitHub Copilot、Aider 等）。

**核心要求：改代码时，必须一并更新相关的 `.md` 文档，不要只改代码。**

---

## 一、总则

1. **改代码 = 同步改文档。** 任何功能、接口、数据库、页面、权限、文案的改动，都要在同一次改动里更新「文档地图」列出的相关 `.md`。
2. 文档与实现不一致时，**以代码为准更新文档**，不要保留过时的描述。
3. 面向使用者的变化写进 `CHANGELOG.md`：用日常用语，**不要出现接口路径或代码标识**。
4. 完成一项功能或修复后，在 `progress.md` 末尾**追加一条编号条目**（沿用既有格式）。
5. 改动后运行相应测试（见「五、验证」），并在文档中体现验证结果。

---

## 二、文档地图（改哪里 → 更新哪些 `.md`）

| 改动位置 | 必须同步更新的文档 |
| --- | --- |
| `public/<页面>.html`、`public/js/pages/<页面>.js` | `docs/ui/pages/<页面>.md` |
| 共享组件、导航、页脚、账户菜单、站点壳（`public/js/ui.js`） | `docs/ui/components.md`、`UI.md`、受影响的 `docs/ui/pages/*.md` |
| 文案、提示、错误信息 | `docs/ui/copy.md` |
| 设计令牌、颜色、组件样式（`public/css/site.css`） | `UI.md`、`docs/ui/components.md`、相关 `docs/ui/pages/*.md` |
| 后端接口、数据库表 / 迁移、权限（`server.js`、`lib/**`） | `MAP.md`（接口索引 + 数据表结构）、受影响的 `docs/ui/pages/*.md`、`README.md` |
| 角色 / 权限体系 | `README.md`（角色与权限说明）、`MAP.md`、`docs/ui/pages/profile.md`、`docs/ui/pages/admin.md` |
| 菜单同步与识别（`lib/menu/**`、`menu-json-rules.md`） | `docs/menu-sync.md`、`docs/ui/pages/recipe.md`、`skills/szzx-menu/**`、`MAP.md` |
| 三元坊必吃榜（`lib/shops/**`、`public/*shops*`） | `docs/ui/pages/shops.md`、`docs/ui/pages/shop-detail.md`、`MAP.md`、`README.md` |
| 头衔系统（`lib/titles/**`） | `docs/ui/pages/titles.md`、`docs/ui/pages/profile.md`、`docs/ui/pages/admin.md`、`MAP.md`、`README.md` |
| 消息箱 / 通知（消息接口、`public/inbox.html`） | `docs/ui/pages/inbox.md`、`MAP.md`、`README.md` |
| 测试（`tests/**`） | `docs/ui/acceptance.md`、`progress.md` |
| 目录结构、脚本、部署 | `README.md`、`MAP.md` |

无法确定对应文档时，**至少要更新 `README.md`、`MAP.md`、`progress.md`**，并在 `CHANGELOG.md` 补一条使用者可读的说明。

---

## 三、各类文档定位

- `README.md`：面向用户与开发者的总览（功能特性、快速开始、角色权限、目录结构、接口节选、部署）。
- `MAP.md`：当前项目结构、数据流、**完整接口索引**与**数据表结构**。
- `progress.md`：按编号追加的开发进度日志（历史 + 待办）。
- `CHANGELOG.md`：面向使用者的更新日志，日常用语，不含接口与代码。
- `UI.md` 与 `docs/ui/**`：设计总纲、逐页规范、组件、场景、文案、验收与实施记录。
- `docs/issue-*-plan.md`、`PLAN_2026-10-01.md`、`docs/menu-validation.md`、`docs/ui/acceptance.md`：实施范围、里程碑快照与验收记录，**属历史记录，默认不改写**；除非明确要求，可在其中追加「变更说明」。

---

## 四、逐页文档对应

`public/` 下的页面在 `docs/ui/pages/` 有对应规范：

| 页面 | 规范 |
| --- | --- |
| `index.html`、`about.html` | `docs/ui/pages/home.md` |
| `map.html` | `docs/ui/pages/map.md` |
| `forum.html` | `docs/ui/pages/forum.md` |
| `post.html` | `docs/ui/pages/post.md` |
| `recipe.html` | `docs/ui/pages/recipe.md`（菜品目录见 `docs/ui/pages/dishes.md`） |
| `shops.html` | `docs/ui/pages/shops.md` |
| `shop.html`、`shop-new.html` | `docs/ui/pages/shop-detail.md` |
| `announcements.html` | `docs/ui/pages/announcements.md` |
| `inbox.html` | `docs/ui/pages/inbox.md` |
| `profile.html` | `docs/ui/pages/profile.md` |
| `admin.html` | `docs/ui/pages/admin.md` |
| `login.html` | `docs/ui/pages/login.md` |
| `register.html` | `docs/ui/pages/register.md` |
| `student_verify.html` | `docs/ui/pages/student-verify.md` |
| 头衔（跨页） | `docs/ui/pages/titles.md` |
| 404 等系统页 | `docs/ui/pages/system-pages.md` |

---

## 五、验证

```bash
npm test                 # 全量回归
npm run test:menu        # 菜单后端
npm run test:titles      # 头衔后端
npm run test:shops       # 店铺后端
npm run test:shops:ui    # 店铺页面浏览器回归
npm run test:ui          # 全站浏览器回归
```

Windows PowerShell 下若 `npm` 被拦截，使用 `npm.cmd`。

---

## 六、提交前检查清单

- [ ] 代码改动对应的相关 `.md` 已更新。
- [ ] 接口 / 数据表变化已写入 `MAP.md`。
- [ ] 面向使用者的变化已写入 `CHANGELOG.md`（不含接口与代码）。
- [ ] `progress.md` 已追加条目。
- [ ] 相关测试已通过，并核对了键盘、手机布局与明暗主题（如涉及 UI）。

> 兼容说明：本文件是文档同步规则的**唯一来源**。若某工具只识别其他文件名（如 `CLAUDE.md`、`.cursorrules`、`.github/copilot-instructions.md`），请让该文件指向并遵循本文件，不要另立一套冲突规则。
