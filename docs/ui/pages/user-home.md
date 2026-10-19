# 用户主页 · user.html

## 当前视觉与布局 · 2026-10-17

用户主页与新版个人中心共用简洁资料头部和下划线页签，继承全站主题。只读资料、按权限展示的管理分区和头像跳转规则不变。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：新功能（#21）｜ 优先级：P1 ｜ issue：#21 ｜ 依赖：阶段 0；#20 个人中心版式 ｜ 壳：默认 ｜ data-nav：无 ｜ 容器：`container`

## 用途与目标

展示**其他用户**的主页，版式与[个人中心](profile.md)（#20）相同：资料头部 + 吸顶横向菜单栏。区别：

- **只读**：用户名、权限等级、昵称、个性签名均不可编辑；头像无编辑按钮。
- 权限等级仅在**该用户勾选显示**（`show_role`）时展示（复用 `UI.roleTag`）。
- 无「设置」入口。
- 「头衔」分区只列出该用户**已拥有的全部头衔**（只读，无佩戴/撤销）。
- 若**当前访问者**权限足够（且目标权重低于自己、非本人），横向菜单栏追加**「管理」**项，内容与[管理后台](admin.md)一致：修改权限等级、发放特殊权限、发放头衔、封号/解封。

## 入口（头像跳转，全站）

论坛列表 / 帖子详情 / 帖子回复、菜谱评价、必吃榜店铺评价等处的头像由 `UI.avatarLink(user)` 渲染：

- 点击**自己的**头像 → `profile.html`（个人中心）。
- 点击**他人的**头像 → `user.html?id=<id>`。
- 未登录访问者点击他人头像 → `user.html?id=<id>`（只读）。

链接生成见 `public/js/ui.js` 的 `UI.userHref(user)`（本人 → `profile.html`；有 id 的他人 → `user.html?id=`；无 id 则不可点击）。`UI.userLine` 在整行为链接（`opt.href`）时不再嵌套头像链接。

## 布局

```text
桌面                              手机
┌───────────────────────────────┐  ┌──────────────────────┐
│ 页头（站点导航，sticky）         │  │ 页头                  │
├───────────────────────────────┤  ├──────────────────────┤
│ ⬤ 头像  用户名 [权限等级] 昵称   │  │ ⬤ 头像 用户名 [等级]  │
│         个性签名（只读）          │  │        昵称 / 签名     │
├───────────────────────────────┤  ├──────────────────────┤
│ [主页][收藏][头衔][管理*] ← 吸顶 │  │[主页][收藏][头衔][管理]│
├───────────────────────────────┤  ├──────────────────────┤
│ 所选分区内容                     │  │ 所选分区内容（单列）    │
└───────────────────────────────┘  └──────────────────────┘
* 仅当前访问者有足够权限时出现
```

## HTML 骨架（结构级）

```html
<main id="main" class="main container">
  <div id="userStatus"></div>
  <header class="profile-hero" id="userHero" hidden>
    <span class="profile-hero__avatar" id="heroAvatar"></span>
    <div class="profile-hero__info">
      <div class="profile-hero__row">
        <h1 class="profile-hero__username" id="heroUsername">—</h1>
        <span id="heroRole"></span>
        <span class="profile-hero__nickname" id="heroNickname"></span>
      </div>
      <div class="profile-hero__row"><span class="profile-hero__signature" id="heroSignature"></span></div>
    </div>
  </header>
  <nav class="profile-tabs" aria-label="用户主页分区" id="userNav" hidden>
    <a class="side-nav__item" href="#home" data-panel="home">主页</a>
    <a class="side-nav__item" href="#favorites" data-panel="favorites">收藏</a>
    <a class="side-nav__item" href="#titles" data-panel="titles">头衔</a>
    <a class="side-nav__item" href="#manage" data-panel="manage" id="manageNav" hidden>管理</a>
  </nav>
  <section class="view" id="view-home" hidden></section>       <!-- 空页面 -->
  <section class="view" id="view-favorites" hidden></section>  <!-- 空页面 -->
  <section class="view" id="view-titles" hidden><div class="panel"><div class="panel__body" id="userTitles"></div></div></section>
  <section class="view" id="view-manage" hidden><div id="manageBox"></div></section>
</main>
```

分区切换复用 `UI.page.panels(#userNav)`；hash `#home/#favorites/#titles/#manage`。访问 `user.html?id=<自己的 id>` 自动 `location.replace("profile.html")`。

### #view-titles 头衔（只读）

拉取 `GET /api/users/:id/titles`，以徽章列出（佩戴中的额外标「佩戴中」）。空 → `UI.html.empty({icon:'award', ...})`。

### #view-manage 管理

仅当 `当前用户.id !== 目标.id` 且当前用户权重 > 目标权重，且满足 `user_manage` 或 `title_manage` 时显示。按权限渲染三个/四个面板：

- **权限等级**（`user_manage`）：`<select>`（仅列出权重低于自己的角色）+ 保存 → `PUT /api/admin/users/role`（改前 `UI.confirm`）。
- **特殊权限**（`user_manage`）：来自 `GET /api/admin/permissions` 的复选清单 + 保存 → `PUT /api/admin/users/permissions`。
- **账号状态**（`user_manage`）：显示状态徽标；正常时可填封禁原因、是否允许申诉 → `PUT /api/admin/users/ban`（multipart）；已封禁 → `PUT /api/admin/users/unban`。
- **头衔**（`title_manage`）：已拥有头衔（非自动可撤销）→ `DELETE /api/admin/users/:id/titles/:titleId`；授予 → `POST /api/admin/users/:id/titles`；专属头衔（名称 1–8 字 + 8 色）→ `POST /api/admin/users/:id/titles/custom`。

当前用户的角色与权限来自 `GET /api/me`；目标用户资料来自 `GET /api/users/:id/profile`；管理态数据来自 `GET /api/admin/users/:id`。

## 脚本行为

1. 读取 `?id=`；非数字 → 404 空状态。
2. 登录时先 `GET /api/me` 判定是否本人（本人 → 跳转个人中心）；再 `GET /api/users/:id/profile`（公开）渲染头部与菜单。
3. 头衔、管理面板懒加载（进入对应分区时请求）。
4. 所有写操作经 `UI.api`；错误 → `UI.errorText` + toast；与改角色/封号一致，不能操作自己或权重不低于自己的人（后端二次校验，前端仅相应隐藏/禁用）。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 无 id / 用户不存在 | 参数缺失或 404 | `empty--error`「用户不存在」+ 返回首页 |
| 访问本人 | `?id=` 为当前用户 | `location.replace("profile.html")` |
| 加载中 | 请求中 | `#userStatus` 载入中；加载后隐藏头部/菜单占位 |
| 头衔空 | 目标无头衔 | 空状态卡片 |
| 有管理权限 | 见上 | 追加「管理」项与面板 |
| 无管理权限 / 匿名 | — | 无「管理」项，只读 |

## 接口与存储

- 公开：`GET /api/users/:id/profile`（id/display_id/username/nickname/avatar_url/signature/role/show_role/status/title）、`GET /api/users/:id/titles`（已拥有头衔）。
- 登录：`GET /api/me`（角色 + 权限）。
- 管理（`user_manage`）：`GET /api/admin/users/:id`、`GET /api/admin/permissions`、`PUT /api/admin/users/role`、`PUT /api/admin/users/permissions`、`PUT /api/admin/users/ban`、`PUT /api/admin/users/unban`。
- 管理（`title_manage`）：`GET /api/admin/titles`、`POST /api/admin/users/:id/titles`、`POST /api/admin/users/:id/titles/custom`、`DELETE /api/admin/users/:id/titles/:titleId`。

## 响应式

- 360：头部并排可换行；菜单栏吸顶横向滚动；管理面板单列。
- 768+：头部留白加大；菜单栏吸顶于页头之下。

## 无障碍要点

- 全页仅 1 个可见 `<h1>`（目标用户名）。
- 头像链接 `aria-label="查看用户主页"`；菜单栏当前项 `aria-current="page"`；管理表单标签齐全。

## 验收清单

- [ ] 论坛 / 评价处点击他人头像进入其主页，点击自己头像进入个人中心。
- [ ] 他人主页只读，权限等级按 `show_role` 显示，无「设置」。
- [ ] 头衔分区只读，列出全部已拥有头衔。
- [ ] 有权限者出现「管理」并可用（改等级 / 权限 / 封号 / 发头衔）。
- [ ] 访问本人 id 跳转个人中心；匿名只读。
- [ ] 360/1280 正常；axe=0；零报错。回归：`npm run test:user`。

> 2026-10-17 共享加载状态修正：本页使用的 `UI.html.skeleton` 已补齐 `role="status"`，保留加载名称与 `aria-busy`，避免加载过程中的无障碍属性违规；外观与业务流程不变。
