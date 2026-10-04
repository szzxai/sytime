# 个人中心 · profile.html

> 状态：现有改版（P0），#7/#9/#10 增量（P1）｜ issue：#4、#7、#9、#10 ｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：无 ｜ 容器：`container` + `.shell`

## 用途与目标

个人设置与个人事务的集中页。分区（URL hash 深链）：`#profile` 个人资料、`#security` 账号安全、`#site` 网站设置、`#messages` 消息通知（#9）、`#titles` 我的头衔（#10）、`#tickets` 工单。侧栏 ≥900 竖排 sticky；<900 吸顶横条（可横向滚动）。

## 布局

```text
桌面 ≥900                              手机 <900
┌───────────────────────────────┐  ┌──────────────────────┐
│ 页头                            │  │ 页头                  │
│ ┌──────┬────────────────────┐ │  │ [资料|安全|设置|消息|头衔|工单] 吸顶横条
│ │个人中心│ 个人资料              │ │  │ ┌──────────────────┐│
│ │──────│ ┌────────────────┐ │ │  │ │头像编辑  名字       ││
│ │资料    │ │头像编辑  名字    │ │ │  │ │权限等级…           ││
│ │安全    │ │权限等级 学生      │ │ │  │ └──────────────────┘│
│ │设置    │ └────────────────┘ │ │  │ 面板…（单列）          │
│ │消息(9) │ ┌────────────────┐ │ │  └──────────────────────┘
│ │头衔(10)│ │昵称 ____ [保存]  │ │ │
│ │工单    │ └────────────────┘ │ │
│ │        │ …面板…              │ │
│ │[退出登录]│                   │ │
│ └──────┴────────────────────┘ │
└───────────────────────────────┘
```

## HTML 骨架（结构级）

```html
<body>
…页头…
<main id="main" class="main container">
  <div class="shell">
    <nav class="side-nav" aria-label="个人中心">
      <a class="side-nav__item" href="#profile" data-panel="profile" aria-current="page"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-user"></use></svg>个人资料</a>
      <a class="side-nav__item" href="#security" data-panel="security"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-lock"></use></svg>账号安全</a>
      <a class="side-nav__item" href="#site" data-panel="site"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-settings"></use></svg>网站设置</a>
      <a class="side-nav__item" href="#messages" data-panel="messages" hidden><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-bell"></use></svg>消息通知</a>
      <a class="side-nav__item" href="#titles" data-panel="titles" hidden><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-award"></use></svg>我的头衔</a>
      <a class="side-nav__item" href="#tickets" data-panel="tickets"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-clipboard"></use></svg>工单</a>
    </nav>

    <div class="shell__main">
      <section class="view is-active" id="view-profile">…</section>
      <section class="view" id="view-security" hidden>…</section>
      <section class="view" id="view-site" hidden>…</section>
      <section class="view" id="view-messages" hidden><!-- #9：见 inbox.md §消息设置 --></section>
      <section class="view" id="view-titles" hidden><!-- #10：见 titles.md --></section>
      <section class="view" id="view-tickets" hidden>…</section>
    </div>
  </div>
</main>
…页脚…
```

### #view-profile 个人资料

```html
<h1 class="page-head__title" style="font-size:var(--fs-2xl)">个人资料</h1>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">账号信息</h2></div>
  <div class="panel__body">
    <div class="profile-head">
      <span class="avatar-edit">
        {{UI.avatar(user,'xl')（id=avatarBox 由脚本填充）}}
        <button type="button" class="avatar-edit__btn" id="chooseAvatar" aria-label="更换头像"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-pencil"></use></svg></button>
        <input type="file" id="avatarFile" accept="image/jpeg,image/png" class="u-hidden">
      </span>
      <div class="profile-head__main">
        <span class="profile-head__name" id="profileName">—</span>
        <span class="row row--sm"><span class="u-muted u-fs-sm">权限等级</span><span id="infoRole" class="u-fs-sm">—</span></span>
        <span class="row row--sm"><span class="u-muted u-fs-sm">特殊权限</span><span id="infoPerms" class="u-fs-sm">—</span></span>
        <span class="row row--sm"><span class="u-muted u-fs-sm">ID</span><span id="infoId" class="mono u-fs-sm">—</span></span>
      </div>
    </div>
  </div>
</div>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">用户名</h2><p class="panel__desc">用户名不可修改</p></div>
  <div class="panel__body"><input class="input" id="username" readonly aria-label="用户名（不可修改）"></div>
</div>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">昵称</h2></div>
  <div class="panel__body"><div class="field"><label class="field__label" for="nickname">昵称</label><input class="input" id="nickname" data-counter="20"></div></div>
  <div class="panel__foot"><span class="status-text" id="nicknameMsg"></span><button type="button" class="btn btn--primary" id="nicknameSubmit">保存</button></div>
</div>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">个性签名</h2></div>
  <div class="panel__body"><div class="field"><label class="field__label" for="signature">个性签名</label><textarea class="textarea" id="signature" data-counter="80" placeholder="介绍一下自己…"></textarea><div class="field__foot"><span class="field__hint"></span><span class="field__counter"></span></div></div></div>
  <div class="panel__foot"><span class="status-text" id="signatureMsg"></span><button type="button" class="btn btn--primary" id="signatureSubmit">保存</button></div>
</div>
<div class="field" data-upload data-max-mb="2" data-types="image/jpeg,image/png" hidden id="avatarUploadRoot">
  <!-- 头像上传用 UI.upload 的校验逻辑但走 /api/user/avatar multipart：
       做法：保留 #avatarFile 隐 input，由 #chooseAvatar 触发；选择后页面脚本自行校验（复用文案）并 FormData 上传 -->
</div>
```

头像上传不走 `data-upload` 组件（接口是 multipart `/api/user/avatar`，字段 avatar）：页面脚本在 `avatarFile.change` 里校验（>2MB → toast「图片不能超过 2 MB（当前 X）」；类型不符 → toast「仅支持 JPG / PNG 格式的图片」）→ busy「上传中…」→ 成功 `setAvatar(url + '?t=' + Date.now())` + `UI.session.patch({avatar_url})` + `UI.shell.refreshAuth()` + toast「头像更新成功」；失败 toast（UI.errorText）；401 自动处理。

### #view-site 网站设置

```html
<h1 …>网站设置</h1>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">默认进入界面</h2><p class="panel__desc">访问网站首页时会自动跳转到所选界面</p></div>
  <div class="panel__body"><select class="select" id="defaultPage" aria-label="默认进入界面">
    <option value="index.html">首页</option><option value="map.html">校园地图</option><option value="forum.html">论坛</option><option value="recipe.html">菜谱评价</option>
    <option value="shops.html">三元坊必吃榜</option>   <!-- features.shops 时由脚本追加 -->
  </select></div>
</div>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">校园地图默认楼层</h2><p class="panel__desc">进入校园地图模块后默认显示的楼层</p></div>
  <div class="panel__body"><select class="select" id="defaultFloor" aria-label="默认楼层"><option value="1">1F</option>…<option value="4">4F</option></select></div>
</div>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">菜品与食谱默认页</h2><p class="panel__desc">进入菜品与食谱页时默认显示的标签</p></div>
  <div class="panel__body"><select class="select" id="recipeDefaultView" aria-label="菜品与食谱默认页"><option value="all">全部菜品</option><option value="reviews">菜品评价</option><option value="weekly">每周食谱</option></select></div>
</div>
<!-- P1 #7：必吃榜偏好与店铺详情页样式（features.shops 时由脚本显示） -->
<div class="panel" id="shopSortPanel" hidden>
  <div class="panel__head"><h2 class="panel__title">必吃榜默认排序</h2><p class="panel__desc">进入三元坊必吃榜时默认使用的排序</p></div>
  <div class="panel__body"><select class="select" id="shopDefaultSort" aria-label="必吃榜默认排序">
    <option value="campus">距苏州中学本部最近</option><option value="az">A–Z</option><option value="metro">距地铁最近</option>
    <option value="likes">按点赞数</option><option value="reviews">按评价数</option><option value="rating">按评分</option><option value="new">最新添加</option>
  </select></div>
</div>
<div class="panel" id="shopTypePanel" hidden>
  <div class="panel__head"><h2 class="panel__title">必吃榜默认餐食类型</h2><p class="panel__desc">进入三元坊必吃榜时默认筛选的店铺类型</p></div>
  <div class="panel__body"><select class="select" id="shopDefaultType" aria-label="必吃榜默认餐食类型"><option value="">全部</option></select></div>
</div>
<div class="panel" id="shopLayoutPanel" hidden>
  <div class="panel__head"><h2 class="panel__title">店铺详情页样式</h2><p class="panel__desc">浏览三元坊必吃榜店铺详情时使用的布局</p></div>
  <div class="panel__body">
    <div class="choice-group choice-group--2">
      <label class="choice"><input class="choice__input" type="radio" name="shopLayout" value="stacked"><span class="choice__body"><span class="choice__title"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-rows"></use></svg>样式一 · 纵向<svg class="icon choice__check" aria-hidden="true"><use href="img/icons.svg#i-check-circle"></use></svg></span><span class="choice__preview"><i class="is-strong"></i><i></i><i style="width:60%"></i></span><span class="choice__desc">手机友好，菜品与评价上下排列</span></span></label>
      <label class="choice"><input class="choice__input" type="radio" name="shopLayout" value="split"><span class="choice__body"><span class="choice__title"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-columns"></use></svg>样式二 · 双栏<svg class="icon choice__check" aria-hidden="true"><use href="img/icons.svg#i-columns"></use></svg></span><span class="choice__preview"><span class="cols"><i class="is-strong"></i><i class="is-strong"></i></span><span class="cols"><i></i><i></i></span></span><span class="choice__desc">电脑友好，左右并排查看</span></span></label>
    </div>
  </div>
</div>
<!-- P2：外观（features.theme 时显示） -->
<div class="panel" id="themePanel" hidden>
  <div class="panel__head"><h2 class="panel__title">外观</h2></div>
  <div class="panel__body"><div class="segmented"><button type="button" class="segmented__item" data-theme-set="light" aria-selected="true">sun 图标 浅色</button><button type="button" class="segmented__item" data-theme-set="dark" aria-selected="false">moon 图标 深色</button></div></div>
</div>
<div class="panel__foot"><span class="status-text" id="siteMsg"></span><button type="button" class="btn btn--primary" id="siteSubmit">保存</button></div>
```

设置保存：请求体 `{default_page, default_floor, recipe_default_view}` +（#7 时）`shop_default_sort`、`shop_default_type`、`shop_layout`；后端按传入字段部分更新。成功后同步 localStorage 键（defaultPage/defaultFloor/recipeDefaultView/shopDefaultSort/shopDefaultType/shopLayout）+ toast「网站设置已保存到账号」。必吃榜偏好与样式面板在 `features.shops` 时显示；`shopDefaultType` 的选项由 `/api/shops/meta` 的分类动态填充。

### #view-security 账号安全

```html
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">修改密码</h2></div>
  <div class="panel__body">
    <div class="field"><label class="field__label" for="oldPassword">旧密码</label>
      <div class="input-group"><input class="input input--end" id="oldPassword" type="password" autocomplete="current-password"><div class="input-group__end"><button class="icon-btn icon-btn--sm" data-password-toggle aria-label="显示密码">eye</button></div></div></div>
    <div class="field"><label class="field__label" for="newPassword">新密码</label><div class="input-group">… autocomplete="new-password" …</div></div>
    <div class="field"><label class="field__label" for="confirmPassword">确认新密码</label><div class="input-group">… new-password …</div></div>
  </div>
  <div class="panel__foot"><span class="status-text" id="passwordMsg"></span><button type="button" class="btn btn--primary" id="passwordSubmit">保存</button></div>
</div>
```

校验：旧/新空 → 内联；两次不一致 → 「两次输入的新密码不一致」；旧密码错误（后端）→ 「旧密码不正确」（`UI.errorText` 已映射）；成功 → toast「密码修改成功」+ 清空三框。

### #view-tickets 工单

```html
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">新建工单</h2></div>
  <div class="panel__body">
    <div class="field"><label class="field__label" for="ticketTitle">标题</label><input class="input" id="ticketTitle" data-counter="40" placeholder="简要描述问题"></div>
    <div class="field"><label class="field__label" for="ticketContent">内容</label><textarea class="textarea" id="ticketContent" data-counter="1000" placeholder="详细描述你的问题或诉求…"></textarea></div>
    <div class="field"><label class="field__label" for="ticketVisibility">可见范围</label>
      <select class="select" id="ticketVisibility" aria-label="可见范围"><option value="admin">管理员及以上</option><option value="super_admin">超级管理员及以上</option><option value="developer">仅开发者</option></select>
      <div class="field__hint">工单将提交给所选权限及以上的管理人员处理。</div></div>
  </div>
  <div class="panel__foot"><button type="button" class="btn btn--primary" id="ticketSubmit">提交工单</button></div>
</div>
<h2 class="section__title" style="font-size:var(--fs-lg)">我的工单</h2>
<div id="myTicketList" class="stack stack--md" aria-live="polite"></div>
```

工单项渲染（每条）：

```js
function ticketHtml(t) {
  var resolved = t.status === "resolved";
  return '<article class="card">' +
    '<div class="card__head"><h3 class="card__title">' + UI.esc(t.title) + '</h3>' +
      (resolved ? '<span class="badge badge--ok">已批复</span>' : '<span class="badge badge--pending">待处理</span>') + '</div>' +
    '<div class="u-muted u-fs-xs">可见范围：' + UI.esc(TICKET_VIS_LABELS[t.visibility] || t.visibility) + ' · ' + UI.formatTime(t.created_at) + '</div>' +
    '<div class="prose" style="margin-top:var(--sp-2)">' + UI.esc(t.content) + '</div>' +
    (resolved ? '<div class="queue-item__reply"><b>批复（' + UI.esc(t.reply_by || "管理员") + (t.replied_at ? ' · ' + UI.formatTime(t.replied_at) : '') + '）：</b><br>' + UI.esc(t.reply_content) +
      (t.reply_image ? '<span class="thumb" style="margin-top:var(--sp-2)" data-zoom="' + UI.safeUrl(t.reply_image) + '" data-caption="批复图片"><img src="' + UI.safeUrl(t.reply_image) + '" alt="批复图片"></span>' : '') + '</div>' : '') +
  '</article>';
}
```
空：`UI.html.empty({icon:'clipboard', title:'暂无工单', desc:'遇到问题可以提交工单。'})`；提交成功 toast「工单已提交，请等待处理」+ 清空 + 重载。

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| #settingsToggle / #settingsSubmenu / .menu-title/.menu-arrow/.submenu | 旧侧栏折叠 | `.side-nav`（无折叠） | 删除 |
| `[data-panel]` ×4 + `.view`/`.view.active` | 分区切换 | 同属性（6 个）+ `.view.is-active` + hash 同步 | 迁移 |
| #infoId/#infoRole/#infoPerms | 账号信息 | 同 ID（在 profile-head 内） | 保留 |
| #username（readonly） | 用户名展示 | 同 ID | 保留 |
| #avatarBox/#chooseAvatar/#avatarFile/#avatarMsg | 头像 | avatar-edit 结构；#avatarMsg → toast/status-text | 迁移 |
| #nickname/#nicknameSubmit/#nicknameMsg | 昵称 | 同 ID（nicknameMsg → status-text） | 保留 |
| #signature/#signatureSubmit/#signatureMsg | 签名 | 同 ID | 保留 |
| #oldPassword/#newPassword/#confirmPassword/#passwordSubmit/#passwordMsg | 密码 | 同 ID + 显隐按钮 | 保留 |
| #defaultPage/#defaultFloor/#recipeDefaultView/#siteSubmit/#siteMsg | 网站设置 | 同 ID | 保留 |
| #shopDefaultSort/#shopDefaultType/#shopLayoutChoices | 必吃榜偏好与店铺详情页样式 | 同 ID（features.shops 时显示） | 新增 |
| #ticketTitle/#ticketContent/#ticketVisibility/#ticketSubmit/#ticketSubmitMsg/#myTicketList | 工单 | 同 ID（SubmitMsg → toast） | 保留 |
| #logoutBtn | 退出 | 侧栏底部 `data-logout` 按钮（ui.js 委托） | 迁移 |
| ROLE_LABELS/ROLE_WEIGHTS/PERMISSION_* | 工具 | `UI.ROLE_* / UI.session` | 替换 |
| `handleStatus(401)` | 过期处理 | `UI.api` 自动 | 删除 |

## 需要修改的脚本行为

1. 分区切换：`data-panel` 点击 → 切 `.view.is-active` + `history.replaceState(null,'','#<name>')`；初始按 `location.hash`（合法值域内）选择，否则 profile。
2. 所有 fetch → `UI.api`；错误 → `UI.errorText` + toast / status-text（`status-text.is-ok/is-error`）。
3. confirm/alert：无旧残留；退出登录走 `data-logout`。
4. 资料头部渲染：`UI.userLine` 不适用（无时间），直接 avatar + 名字；特殊权限列表渲染沿用原逻辑（超出角色默认等级的显式权限才显示，名称用 `UI.PERMISSION_LABELS`）。
5. 头像上传按上文规则（toast 化）。
6. 设置保存：并发保存三类设置一次请求（现接口同 PUT）；shopLayout/theme 面板按开关显示。
7. 工单提交：busy + toast + 重载列表。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 未登录 | 无 token | `UI.goLogin()`（进页即检查） |
| 加载资料 | 首次 | 各输入框先留空 + `aria-busy` 于 main（可选）；出错 → toast |
| 资料加载失败 | 网络 | toast「网络连接失败…」 |
| 头像上传中/成功/失败 | 选文件 | busy/toast 三态 |
| 昵称保存 | 保存 | busy → toast「昵称修改成功」 |
| 昵称为空 | 前端 | 字段错误「昵称不能为空」 |
| 签名保存 | 保存 | busy → toast「个性签名已保存」 |
| 密码修改 | 保存 | 校验/成功/失败三态（见上） |
| 网站设置保存 | 保存 | busy → toast「网站设置已保存到账号」 |
| 工单提交 | 提交 | busy → toast「工单已提交，请等待处理」 |
| 工单空/加载失败 | — | empty / loadError |
| 无 messages/titles 分区 | features 关 | 对应侧栏项 hidden（脚本控制） |

## 接口与存储（保留清单）

- 接口：GET /api/user/profile；PUT /api/user/settings；POST /api/user/avatar；PUT /api/user/nickname；PUT /api/user/signature；PUT /api/user/password；POST /api/tickets；GET /api/tickets/mine；GET /api/user/preferences、PUT /api/user/preferences（#9）；GET /api/user/titles、PUT /api/user/title（#10）。
- localStorage：token、user、defaultPage、defaultFloor、recipeDefaultView（保存成功后同步写入）；P1 增加 shopDefaultSort、shopDefaultType、shopLayout。

## 响应式

- 360：侧栏 → 吸顶横条（自动）；面板单列；profile-head 换行。
- 768：无 shell（仍横条）。
- 900：双列（15rem + 内容 ≤44rem）。

## 边界场景

- 昵称/签名超计数上限 → 提交阻止 + 字段错误（「昵称不能超过 20 字」）。
- 头像上传中断网 → toast 网络错误；box 保持旧图。
- hash 非法（#xxx 不存在）→ 回退 #profile（replaceState 修正）。
- 工单可见范围选项在后端被限制 → 前端不限制（三选一固定）。
- 用户无特殊权限 → infoPerms 显示「无」。
- display_id 缺失 → 显示数字 id（原逻辑保留）。

## 无障碍要点

- 侧栏当前项 `aria-current="page"`；hash 切换后焦点移到该 view（`view.tabIndex=-1; view.focus()`）。
- 只读用户名 input 有 aria-label；上传按钮 aria-label「更换头像」。
- status-text 不用 aria-live（保存有 toast 播报）。

## 验收清单

- [ ] 六分区切换 + hash 深链 + 刷新保持。
- [ ] 头像上传全流程（2MB/类型/成功刷新页头）。
- [ ] 昵称/签名/密码/网站设置保存全部正确文案与错误。
- [ ] 工单提交 + 列表（状态徽标、批复块、批复图 viewer）。
- [ ] messages/titles 分区按开关出现（P1 验证）。
- [ ] 退出登录回首页。
- [ ] 360/900 正常；无 alert/confirm；axe=0；零报错。
