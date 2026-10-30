# 个人中心 · profile.html

## 2026-10-25 · 导航行为同步

资料、收藏及相关正文页面入口支持意图预加载；同页个人中心标签保持局部切换，不触发整页横滑。正文外账户/导航入口采用栏目上下文规则。 共同规则见 [导航与加载规范](../../navigation.md)，实际验证见根目录 MAP 与 UI 验收记录。

## 当前 React 实现 · 2026-10-25

实现位于 `apps/web/src/pages/`：ProfilePage.tsx、../components/Collections.tsx、../layouts/ProfileLayout.tsx。本人资料、编辑确认、头像、店铺收藏和头衔拆为组件；hash 面板由 Router 管理。隐私默认和已有收藏不互相覆盖。

视觉令牌和资源位于 `apps/web/public/`；共享站点壳、弹窗、上传、主题和用户展示见 [组件规范](../components.md)。本页 HTML/CSS 示例用于说明最终 DOM 与视觉约束，旧 `UI.*` 或页面脚本示例属于迁移前实现，不是当前可调用 API。当前请求由 TanStack Query、路径/查询/hash 由 TanStack Router 管理，后端为 Hono + Drizzle。最新验证见根目录 [MAP.md](../../../MAP.md) 与 [验收记录](../acceptance.md)。


## 收藏夹默认公开 · 2026-10-24（#29）

在 [网站设置](settings.md) 的「收藏默认页」下，可即时保存「新建收藏夹默认公开」。之后在必吃榜主动新建的收藏夹按默认值及当次选择生成，本页展示实际公开状态；已有收藏夹不随账号偏好改变，仍可用原有公开开关单独调整。自动补建的「默认收藏夹」仍私密，本页不新增创建入口。

## 当前视觉与布局 · 2026-10-17

资料头部采用简洁白底与底边线，头像左对齐；页签为绿色下划线、吸顶且手机可横滚。本人资料编辑、头像、头衔与设置入口保持原逻辑。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：现有改版（P0），#10 头衔（P1），#20 重做（资料头部 + 下划线吸顶菜单栏）｜ issue：#4、#10、#19、#20、#21 ｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：无 ｜ 容器：`container`

## 用途与目标

个人资料与头衔的集中页，采用类 简洁资料样式：页头（站点导航）下方是**资料头部**（头像 + 用户名 / 权限等级 / 昵称 + 个性签名），再下方是**吸顶横向菜单栏**（主页 / 收藏 / 头衔 / 设置），菜单栏下方区域随所选按钮切换。分区（URL hash 深链）：`#home` 主页、`#favorites` 收藏、`#titles` 头衔（#10）、`settings.html` 设置（直接跳转）。

> #19/#20：原「账号安全、网站设置、工单、消息通知、退出登录」在[设置](settings.md)；本页保留资料头部、收藏与头衔内容。`主页` 目前为空页面，`收藏` 按 #23 展示收藏夹。
>
> #21：站内头像可点击进入用户主页——点击**本人**头像回到本页，点击**他人**头像进入[用户主页](user-home.md)（只读；权限足够时可管理）。

## 布局

```text
桌面                              手机
┌───────────────────────────────┐  ┌──────────────────────┐
│ 页头（站点导航，sticky）         │  │ 页头                  │
├───────────────────────────────┤  ├──────────────────────┤
│ ⬤ 头像  用户名  [权限等级] 昵称  │  │ ⬤ 头像  用户名 [等级] │
│         个性签名                │  │         昵称 / 签名    │
├───────────────────────────────┤  ├──────────────────────┤
│ [主页] [收藏] [头衔] [设置]  ← 吸顶│  │[主页][收藏][头衔][设置]←吸顶
├───────────────────────────────┤  ├──────────────────────┤
│ 所选分区内容（主页为空页面）       │  │ 所选分区内容（单列）    │
└───────────────────────────────┘  └──────────────────────┘
```

- **资料头部**：头像在最左（与容器左缘留一段间距，右下角为编辑按钮）；头像右侧上下两行——上行 `用户名 + 权限等级标签 + 昵称`，下行 `个性签名`。用户名、权限等级只读；昵称、个性签名**点击即可编辑**。
- **横向菜单栏**：`position: sticky; top: var(--header-h)`，滚动时贴在上方站点导航之下停驻；项为 `主页 / 收藏 / 头衔 / 设置`，当前项 `aria-current="page"`。菜单栏左右负 margin 取满容器宽度，背景毛玻璃 + 下边线。

## 编辑交互（昵称 / 个性签名）

`昵称`、`个性签名` 为 `contenteditable`（优先 `plaintext-only`，不支持则退回 `true` 并过滤粘贴 HTML），点击进入编辑：

1. 回车提交、Esc 放弃并还原；输入超过上限（昵称 20 / 签名 80 字）时截断。
2. 失焦（点击页面其他位置）时，若内容有变化则弹出确认框「是否保存昵称 / 个性签名的修改？」：
   - 保存：`PUT /api/user/nickname` / `PUT /api/user/signature`，成功 toast（「昵称修改成功」/「个性签名已保存」）；昵称改动后同步刷新头像首字与页头。
   - 不保存：还原为原值。
3. 昵称必填，空则提示「昵称不能为空」并还原。

## HTML 骨架（结构级）

```html
<body>
…页头…
<main id="main" class="main container">
  <div id="profileStatus"></div>
  <header class="profile-hero">
    <span class="avatar-edit profile-hero__avatar"><span id="avatarBox"></span>
      <button type="button" class="avatar-edit__btn" id="chooseAvatar" aria-label="更换头像">…</button>
      <input type="file" id="avatarFile" accept="image/jpeg,image/png" hidden></span>
    <div class="profile-hero__info">
      <div class="profile-hero__row">
        <h1 class="profile-hero__username" id="heroUsername">—</h1>
        <span id="heroRole"></span>
        <span class="profile-hero__edit" id="heroNickname" contenteditable="true" role="textbox" aria-label="昵称，点击编辑" data-placeholder="设置昵称"></span>
      </div>
      <div class="profile-hero__row">
        <span class="profile-hero__edit profile-hero__edit--sig" id="heroSignature" contenteditable="true" role="textbox" aria-label="个性签名，点击编辑" data-placeholder="填写个性签名"></span>
      </div>
    </div>
  </header>
  <nav class="profile-tabs" aria-label="个人中心分区" id="profileNav">
    <a class="side-nav__item" href="#home" data-panel="home">主页</a>
    <a class="side-nav__item" href="#favorites" data-panel="favorites">收藏</a>
    <a class="side-nav__item" href="#titles" data-panel="titles" id="titlesNav">头衔</a>
    <a class="side-nav__item" href="settings.html">设置</a>
  </nav>
  <div class="shell__main">
    <section class="view" id="view-home" hidden></section>       <!-- UI.html.empty：个人主页 -->
    <section class="view" id="view-favorites" hidden></section>  <!-- UI.collectionsBrowser：我的收藏（#23） -->
    <section class="view" id="view-titles" hidden>…我的头衔…</section>
  </div>
</main>
…页脚…
```

### #view-titles 我的头衔

见 [titles.md](titles.md) §2。侧栏项 `#titlesNav` 在 `features.titles` 关闭时 `hidden`。

### #view-favorites 我的收藏（#23）

首次切到「收藏」时调用 `UI.collectionsBrowser(#view-favorites, { mode: "owner" })`（`apps/web/src/components/Collections.tsx`），只复用 `site.css` 的 `.shell` / `.side-nav` / `.breadcrumb` / `.switch-row` / `.grid` / `.card` / `.pager`。

- **左右分栏**：`.shell`（桌面 15rem + 内容；窄屏单列）。左侧 `.shell__nav` 为双层菜单：
  - 第一层 `.side-nav`：必吃榜；点击切换版块。
  - 第二层 `.side-nav`：当前版块的收藏夹名 + 条目数；点击刷新右侧。当前项用 `.is-active` / `aria-current="page"`。
- **右侧顶部**：`.breadcrumb` 显示「版块 · 收藏夹」；右侧 `.switch-row` 的 `.switch` 控制 `is_public`（`PUT /api/collections/:id/public`）。
- **内容**：`.grid`（`--grid-min:20rem`）网格，每页 20 条，`.pager` 分页。
  - 店铺卡片：直接复用必吃榜列表的 `UI.shopCard()`（不显示收藏按钮）。
- **移动端（UA 识别）**：`UI.isMobile` 为真时隐藏左右侧栏，顶部显示「选择收藏夹」下拉（`optgroup` 按版块分组），切换后刷新内容。
- **默认**：进入时默认必吃榜；若账号设置了 `default_collection_shops` 则选中它，否则选中第一个（自动创建的「默认收藏夹」）。
- 加载/空/错误：骨架 / `UI.html.empty` / callout + 重试；公开切换失败回滚开关。

## 脚本行为

1. 分区切换由 `UI.page.panels(#profileNav)` 统一处理：`data-panel` 点击 → 切 `.view.is-active` + `history.replaceState(null,'','#<name>')`；初始按 `location.hash` 选择，否则 `home`。**「设置」为普通链接**（无 `data-panel`），点击直接跳转 `settings.html`，无返回键。
2. 进页 `P.requireLogin()`；`GET /api/user/profile` 载入后填充用户名（`<h1>`）、权限等级标签、头像、昵称与签名编辑框。
3. 昵称 / 签名：`bindInlineEdit`（见上）。所有 fetch → `UI.api`；错误 → `UI.errorText`。
4. 头像上传：`#chooseAvatar` → `#avatarFile`，校验 2 MB / 类型后 `POST /api/user/avatar`（multipart），成功刷新头像与页头。
5. 「头衔」分区进入时拉取 `GET /api/user/titles`；「收藏」分区首次进入时构建 `UI.collectionsBrowser`（拉取必吃榜收藏夹及当前收藏夹内容）；「主页」显示 `UI.html.empty` 空状态。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 未登录 | 无 token | `UI.goLogin()`（进页即检查） |
| 加载资料 | 首次 | `#profileStatus` 载入中；出错 → `P.error` 可重试 |
| 昵称/签名编辑 | 点击 → 失焦 | 有变化弹确认（保存/不保存）；无变化静默还原 |
| 昵称空 | 保存时 | toast「昵称不能为空」+ 还原 |
| 头像上传中/成功/失败 | 选文件 | busy/toast 三态 |
| 头衔加载 | 切到「头衔」 | skeleton → 列表 / 空 / loadError |
| 头衔佩戴保存 | 保存佩戴 | busy → toast「佩戴已更新」 |
| 主页 | 切换 | 空状态卡片 |
| 收藏加载 | 切到「收藏」 | 骨架 → 双层菜单 + 卡片网格；空 → 空状态；失败 → 重试 |
| 收藏公开切换 | 拨动开关 | busy → toast「已设为公开 / 已设为私密」；失败回滚 |
| 收藏分页 | 点击页码 | 重新拉取当前页（每页 20） |
| 手机 UA | 进入「收藏」 | 隐藏左侧菜单，顶部下拉选择收藏夹 |
| 无 titles 分区 | features 关 | 菜单项 `#titlesNav` hidden |

## 接口与存储（保留清单）

- 接口：`GET /api/user/profile`；`POST /api/user/avatar`；`PUT /api/user/nickname`；`PUT /api/user/signature`；`GET /api/user/titles`、`PUT /api/user/title`（#10）。
- 收藏（#23）：`GET /api/collections?section=shops`；`GET /api/collections/:id/items?page=`；`PUT /api/collections/:id/public`。
- localStorage：token、user。

## 响应式

- 360：头部头像与文字并排单行，空间不足自动换行；菜单栏吸顶横向可滚动；面板单列。
- 768+：头部留白加大；菜单栏吸顶于 64px 页头之下。

## 边界场景

- hash 非法（#xxx 不存在）→ 回退 `#home`（replaceState 修正）。
- 昵称/签名超上限 → 编辑时截断；提交前比较差异，无变化不弹确认。
- 头像上传中断网 → toast 网络错误，头像保持旧图。
- 设置页返回：浏览器后退可用；页面本身不提供返回键。

## 无障碍要点

- 全页仅 1 个可见 `<h1>`（用户名）；面板与收藏卡片标题用 `<h2>`；版块/收藏夹菜单当前项 `aria-current="page"`。
- 昵称 / 签名为 `role="textbox"` + `aria-label`，可键盘聚焦与编辑；菜单栏当前项 `aria-current="page"`。
- 头像上传按钮 `aria-label="更换头像"`；收藏公开开关为原生 checkbox + `.switch`。

## 验收清单

- [ ] 头部：头像（含编辑按钮）、用户名、权限等级、昵称、签名正确显示。
- [ ] 昵称/签名点击编辑，失焦弹确认；保存写入后端、取消还原。
- [ ] 横向菜单栏滚动时吸顶，当前项高亮。
- [ ] 主页为空页面；头衔为原「我的头衔」；设置跳转 `settings.html`。
- [ ] 收藏：左右分栏 + 双层菜单（必吃榜、收藏夹）；切换版块/收藏夹刷新右侧。
- [ ] 收藏顶部显示「版块 · 收藏夹」路径与公开开关；切换公开写入账号。
- [ ] 收藏网格每页 20 条，分页器可用；手机 UA 降级为单列 + 顶部下拉。
- [ ] hash 深链 `#home/#favorites/#titles` 刷新保持。
- [ ] 360/768+ 正常；无 alert/confirm；axe=0；零报错。


### 2026-10-19 · 共享标识与运营声明

浏览器图标改为 `brand-lime.svg` 青柠切面；共享顶栏、抽屉、页脚及登录/注册卡片复用该图形，首页链接名称仍为「拾光酥糕 首页」。有页脚的页面展示完整学生自主运营、与校方无隶属关系、知识产权和信息参考声明，勘误邮箱可点击。地图应用壳与极简 404 页继续不显示页脚。完整文字见 [文案规范](../copy.md)。
