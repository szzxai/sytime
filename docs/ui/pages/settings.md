# 设置 · settings.html

## 当前视觉与布局 · 2026-10-17

设置页采用 220px 左侧导航与细边框面板，手机横向分区导航；表单使用 4px 圆角。全站外观选择入口位于顶栏及页脚，不依赖登录；账号安全、默认页、工单及通知设置仍按原权限运行。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：新功能（#19 从个人中心拆分）｜ 优先级：P1 ｜ issue：#19 ｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：无 ｜ 容器：`container` + `.shell`

## 用途与目标

账号与站点偏好的集中设置页，采用与[个人中心](profile.md)相同的左侧菜单栏形式。分区（URL hash 深链）：`#security` 账号安全、`#site` 网站设置、`#tickets` 工单、`#messages` 消息通知（#9）；侧栏底部为「退出登录」。侧栏 ≥900 竖排 sticky；<900 吸顶横条（可横向滚动）。

> #19：本页承接从 `profile.html` 迁出的「账号安全、网站设置、工单、消息通知、退出登录」。个人资料与我的头衔仍留在[个人中心](profile.md)。

## 入口

- 页头账户下拉菜单：`个人中心 · 设置 · [学生认证] · [管理后台] · 退出登录`（`public/js/ui.js` 的 `accountLinks()`；设置位于个人中心与管理后台之间）。
- 手机抽屉同样列出；页脚「提交工单」指向 `settings.html#tickets`。

## 布局

```text
桌面 ≥900                              手机 <900
┌───────────────────────────────┐  ┌──────────────────────┐
│ 页头                            │  │ 页头                  │
│ ┌──────┬────────────────────┐ │  │ [安全|设置|工单|消息] 吸顶横条
│ │设置   │ 账号安全              │ │  │ ┌──────────────────┐│
│ │──────│ ┌────────────────┐ │ │  │ │修改密码…           ││
│ │账号安全│ │旧密码/新密码…    │ │ │  │ └──────────────────┘│
│ │网站设置│ └────────────────┘ │ │  │ 面板…（单列）          │
│ │工单    │ ┌────────────────┐ │ │  └──────────────────────┘
│ │消息(9) │ │站点偏好 ____     │ │ │
│ │        │ └────────────────┘ │ │
│ │[退出登录]│ …面板…              │ │
│ └──────┴────────────────────┘ │
└───────────────────────────────┘
```

## HTML 骨架（结构级）

```html
<body>
…页头…
<main id="main" class="main container">
  <div class="page-head"><h1 class="page-head__title">设置</h1></div>
  <div id="settingsStatus"></div>
  <div class="shell">
    <nav class="side-nav" aria-label="设置" id="settingsNav">
      <a class="side-nav__item" href="#security" data-panel="security"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-lock"></use></svg>账号安全</a>
      <a class="side-nav__item" href="#site" data-panel="site"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-settings"></use></svg>网站设置</a>
      <a class="side-nav__item" href="#tickets" data-panel="tickets"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-clipboard"></use></svg>工单</a>
      <a class="side-nav__item" href="#messages" data-panel="messages"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-bell"></use></svg>消息通知</a>
      <button type="button" class="side-nav__item" data-logout><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-logout"></use></svg>退出登录</button>
    </nav>
    <div class="shell__main">
      <section class="view" id="view-security" hidden>…</section>
      <section class="view" id="view-site" hidden>…</section>
      <section class="view" id="view-tickets" hidden>…</section>
      <section class="view" id="view-messages" hidden>…</section>
    </div>
  </div>
</main>
…页脚…
<input id="showRole">… 见下
```

默认分区为 `#security`（侧栏首个未隐藏项）。

### #view-security 账号安全

```html
<form id="passwordForm" novalidate>
  <div class="panel">
    <div class="panel__head"><h2 class="panel__title">修改密码</h2></div>
    <div class="panel__body form">
      <div class="field"><label class="field__label" for="oldPassword">旧密码</label>
        <div class="input-group"><input class="input input--end" id="oldPassword" type="password" autocomplete="current-password"><div class="input-group__end"><button class="icon-btn icon-btn--sm" data-password-toggle aria-label="显示密码">eye</button></div></div></div>
      <div class="field"><label class="field__label" for="newPassword">新密码</label><div class="input-group">… autocomplete="new-password" …</div></div>
      <div class="field"><label class="field__label" for="confirmPassword">确认新密码</label><div class="input-group">… new-password …</div></div>
    </div>
    <div class="panel__foot"><span class="status-text" id="passwordMsg" role="status"></span><button type="submit" class="btn btn--primary" id="passwordSubmit">保存</button></div>
  </div>
</form>
```

校验：旧/新空 → 内联；两次不一致 → 「两次输入的新密码不一致」；旧密码错误（后端）→ 「旧密码不正确」（`UI.errorText` 已映射）；成功 → toast「密码修改成功」+ 清空三框。

### #view-site 网站设置

```html
<form id="siteForm" novalidate>
  <div class="panel">
    <div class="panel__head"><h2 class="panel__title">网站设置</h2></div>
    <div class="panel__body form">
      <div class="field"><label class="field__label" for="defaultPage">默认进入界面</label><select class="select" id="defaultPage" name="defaultPage"><option value="index.html">首页</option><option value="map.html">校园地图</option><option value="forum.html">论坛</option><option value="recipe.html">菜品与食谱</option></select><span class="field__hint">访问网站首页时会自动跳转到所选界面</span></div>
      <div class="field"><label class="field__label" for="recipeDefaultView">菜品与食谱默认页</label><select class="select" id="recipeDefaultView" name="recipeDefaultView"><option value="all">全部菜品</option><option value="reviews">菜品评价</option><option value="weekly">每周食谱</option></select></div>
      <div id="shopPrefFields" hidden><!-- features.shops：必吃榜默认排序 / 默认餐食类型 / 店铺详情页样式（手动 / 自动） --></div>
      <div class="field" id="collectionDefaultFields">
        <span class="field__label">收藏默认页</span>
        <div class="stack stack--sm">
          <div class="field"><label class="field__label" for="defaultCollectionForum">论坛默认收藏夹</label><select class="select" id="defaultCollectionForum" name="defaultCollectionForum"></select></div>
          <div class="field"><label class="field__label" for="defaultCollectionShops">必吃榜默认收藏夹</label><select class="select" id="defaultCollectionShops" name="defaultCollectionShops"></select></div>
        </div>
        <span class="field__hint">进入个人中心「收藏」时默认打开的收藏夹</span>
      </div>
      <div class="switch-row">
        <div class="switch-row__text">
          <label class="switch-row__title" for="collectionDefaultPublic">新建收藏夹默认公开</label>
          <span class="switch-row__desc" id="collectionDefaultPublicHint">仅影响之后新建的收藏夹，新建时仍可单独调整；已有收藏夹不变。</span>
        </div>
        <input type="checkbox" class="switch" role="switch" id="collectionDefaultPublic" name="collectionDefaultPublic" aria-describedby="collectionDefaultPublicHint" disabled>
      </div>
      <div class="field">
        <span class="field__label">显示权限等级</span>
        <label class="check-row"><input class="check" type="checkbox" id="showRole" name="showRole"><span class="check-row__text">在论坛、评价等位置显示我的权限等级标签</span></label>
        <span class="field__hint" id="showRoleHint"></span>
      </div>
    </div>
    <div class="panel__foot"><span class="status-text" id="siteMsg" role="status"></span><button type="submit" class="btn btn--primary" id="siteSubmit">保存</button></div>
  </div>
</form>
```

「店铺详情页样式」（`#shopLayoutModeChoices`，`#22`）为 **手动 / 自动** 二选一：`input[name="shopLayoutMode"]` 值 `manual` / `auto`，复用 `.choice` 组件（原生 radio 视觉隐藏，点击整块 label 选中）。两块 label 带 `title` 悬停提示：手动「手动切换样式」、自动「根据屏幕宽度自动切换」。

- **手动**：店铺详情页显示「纵向 / 双栏」分段开关，用户在该页选择后写入账号（`shop_layout`），下次进入详情页保持上次选择。
- **自动**：详情页不显示纵向/双栏开关，由纯 CSS 按屏幕宽度自动切换（≥900px 双栏，否则纵向）。

「收藏默认页」（`#collectionDefaultFields`，`#23`）：两个 `.select` 分别对应 `default_collection_forum` / `default_collection_shops`。加载设置页时并行请求 `GET /api/collections?section=forum|shops`（无收藏夹时后端会自动创建「默认收藏夹」），用返回的收藏夹名称填充选项；若账号未设置某版块默认收藏夹，则回退选中该版块的「默认收藏夹」（首个收藏夹）。保存时先提交网站设置，再调用 `PUT /api/user/settings/collection` 写入两个默认收藏夹；成功后统一 toast「网站设置已保存到账号」。收藏夹列表加载失败时对应下拉禁用并显示「收藏夹加载失败」。

设置保存：请求体 `{default_page, recipe_default_view, shop_default_sort, shop_default_type, shop_layout_mode, show_role}`；后端按传入字段部分更新。**本表单不再提交 `shop_layout`**，因此保存网站设置不会覆盖详情页记录的「纵向 / 双栏」选择。随后提交 `PUT /api/user/settings/collection`，请求体 `{default_collection_forum, default_collection_shops}`。成功后同步 localStorage 键（defaultPage/recipeDefaultView/shopDefaultSort/shopDefaultType/shopLayoutMode/showRole）+ toast「网站设置已保存到账号」。必吃榜偏好与样式面板（`#shopPrefFields`）在 `features.shops` 时显示；`shopDefaultType` 选项由 `/api/shops/meta` 动态填充。

「新建收藏夹默认公开」（2026-10-24，`#29`）：位于「收藏默认页」下、显示权限等级上，`#collectionDefaultPublic` 为原生 `.switch`。`GET /api/user/profile` 回填数值 `collection_default_public`，只在等于 1 时勾选，旧账号默认 0。加载时禁用；`change` 立即单独调用 `PUT /api/user/settings`，只发送 `{collection_default_public: 0|1}`，无需按「保存」，也不提交其他未保存的表单字段。保存期间禁用并标记 `aria-busy`，成功更新会话与状态提示，失败恢复上次已保存状态并提示。底部普通保存不提交这个字段，后端省略时保留原值；仅影响之后主动新建的收藏夹，已有收藏夹不变。

2026-10-17 起移除「校园地图默认楼层」，不再读取、提交或写入本地楼层偏好。后端 `default_floor` 字段保留兼容，当前校园地图不使用此字段。

「显示权限等级」开关（`#showRole`）：控制论坛/评价等处是否显示自己的角色标签；**普通用户（`user`）强制勾选并禁用**，其余角色可自由开关。默认展示。

### #view-tickets 工单

```html
<form id="ticketForm" novalidate>
  <div class="panel">
    <div class="panel__head"><h2 class="panel__title">新建工单</h2></div>
    <div class="panel__body form">
      <div class="field"><label class="field__label" for="ticketTitle">标题</label><input class="input" id="ticketTitle" data-counter="40"></div>
      <div class="field"><label class="field__label" for="ticketContent">内容</label><textarea class="textarea" id="ticketContent" data-counter="1000"></textarea></div>
      <div class="field"><label class="field__label" for="ticketVisibility">可见范围</label>
        <select class="select" id="ticketVisibility"><option value="admin">管理员及以上</option><option value="super_admin">超级管理员及以上</option><option value="developer">仅开发者</option></select>
        <div class="field__hint">工单将提交给所选权限及以上的管理人员处理。</div></div>
    </div>
    <div class="panel__foot"><button type="submit" class="btn btn--primary" id="ticketSubmit">提交工单</button></div>
  </div>
</form>
<h2 class="section__title u-mb-4">我的工单</h2>
<div id="myTicketList" class="stack stack--md" aria-live="polite"></div>
```

每条工单由 `UI.page.ticket(t,false)` 渲染；空 → `UI.html.empty({icon:'clipboard',title:'暂无工单',desc:'遇到问题可以提交工单。'})`；提交成功 toast「工单已提交，请等待处理」+ 清空 + 重载。

### #view-messages 消息通知

见 [inbox.md](inbox.md) §5。系统消息开关常显且禁用；`prefComment/prefReply/prefLike` 三个 switch，变更即 `PUT /api/user/preferences`（成功 toast「偏好已保存」，失败回滚）。

## 脚本行为

1. 进页 `P.requireLogin()`；`GET /api/user/profile` 载入后回填网站设置与 `#showRole`，期间提交按钮暂禁、`#settingsStatus` 显示载入中，失败可重试。
2. 分区切换由 `UI.page.panels(#settingsNav)`：`data-panel` 点击 → 切 `.view.is-active` + `history.replaceState(null,'','#<name>')`；初始按 `location.hash` 选择，否则 `security`。切到 `tickets` 拉 `GET /api/tickets/mine`，切到 `messages` 拉 `GET /api/user/preferences`。
3. 所有 fetch → `UI.api`；错误 → `UI.errorText` + toast / status-text。
4. 退出登录：侧栏底部 `data-logout` 按钮（`ui.js` 事件委托），回首页。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 未登录 | 无 token | `UI.goLogin()`（进页即检查） |
| 加载设置 | 首次 | `#settingsStatus` 载入中；出错 → `P.error` 可重试 |
| 密码修改 | 保存 | 校验/成功/失败三态（见上） |
| 网站设置保存 | 保存 | busy → toast「网站设置已保存到账号」 |
| 默认公开加载 | 读取账号设置 | 开关禁用；成功回填，失败保持禁用并允许重试加载 |
| 默认公开即时保存 | 切换开关或键盘空格 | 开关禁用及 busy → 单字段保存；成功提示，失败恢复已保存值 |
| 工单提交 | 提交 | busy → toast「工单已提交，请等待处理」 |
| 工单空/加载失败 | — | empty / loadError |
| 消息偏好保存 | 切换 switch | toast「偏好已保存」；失败回滚 |
| 退出登录 | 侧栏按钮 | 清会话 + toast「已退出登录」+ 回首页 |

## 接口与存储（保留清单）

- 接口：`GET /api/user/profile`；`PUT /api/user/settings`；`PUT /api/user/password`；`POST /api/tickets`、`GET /api/tickets/mine`；`GET /api/user/preferences`、`PUT /api/user/preferences`（#9）；`GET /api/shops/meta`（必吃榜类型，features.shops）；`GET /api/collections?section=forum|shops`、`PUT /api/user/settings/collection`（#23 收藏默认页）。
- localStorage：token、user；defaultPage、recipeDefaultView、shopDefaultSort、shopDefaultType、shopLayoutMode、showRole（保存成功后同步写入）。`shopLayout`（详情页上次手动选择）只由详情页写入，设置表单不改动。

## 响应式

- 360：侧栏 → 吸顶横条（自动）；面板单列。
- 768：无 shell（仍横条）。
- 900：双列（15rem + 内容 ≤44rem）。

## 边界场景

- hash 非法（#xxx 不存在）→ 回退 `#security`（replaceState 修正）。
- 工单可见范围选项固定三选一（前端不限制）。
- `show_role` 缺失 → 回退 localStorage（非 "0" 视为开启）。
- `shop_layout_mode` 缺失或非 `auto` → 一律按 `manual` 处理。
- 消息偏好请求失败 → switch 回滚到原值 + toast。

## 无障碍要点

- 侧栏当前项 `aria-current="page"`；hash 切换后焦点移到该 view。
- 密码显隐按钮 aria-label「显示密码」；switch 有可见文案与 aria-label。
- status-text 不用 aria-live（保存有 toast 播报）。

## 验收清单

- [ ] 账户菜单出现「设置」（个人中心与管理后台之间），可进入。
- [ ] 四分区切换 + hash 深链 + 刷新保持；默认账号安全。
- [ ] 密码 / 网站设置（含 show_role、必吃榜偏好）保存文案与错误正确。
- [ ] 收藏默认页：两个下拉列出对应版块收藏夹；未设置时选中「默认收藏夹」；保存写入账号并显示成功提示（#23）。
- [ ] 工单提交 + 列表（状态徽标、批复块、批复图 viewer）。
- [ ] 消息偏好三开关保存与回滚。
- [ ] 退出登录回首页。
- [ ] 360/900 正常；无 alert/confirm；axe=0；零报错。

> 2026-10-17 共享加载状态修正：本页使用的 `UI.html.skeleton` 已补齐 `role="status"`，保留加载名称与 `aria-busy`，避免加载过程中的无障碍属性违规；外观与业务流程不变。

> 2026-10-17 地图设置精简验证：`npm run test:ui` 370 项通过，确认默认楼层字段已移除，默认进入界面及菜品与食谱默认页仍可保存。


### 2026-10-19 · 共享标识与运营声明

浏览器图标改为 `brand-lime.svg` 青柠切面；共享顶栏、抽屉、页脚及登录/注册卡片复用该图形，首页链接名称仍为「拾光酥糕 首页」。有页脚的页面展示完整学生自主运营、与校方无隶属关系、知识产权和信息参考声明，勘误邮箱可点击。地图应用壳与极简 404 页继续不显示页脚。完整文字见 [文案规范](../copy.md)。
