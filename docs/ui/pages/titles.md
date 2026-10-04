# 头衔系统 · titles.md（#10）

> 状态：已实现 ｜ 优先级：P1 ｜ issue：#10 ｜ 依赖：阶段 0；#10 数据与接口 ｜ 落点：统一用户组件 + profile.html#titles + admin.html#titles-mgmt
>
> 实施范围与验收见 [issue-10-plan.md](../../issue-10-plan.md)，变更记录见 [progress.md](../../progress.md) 第 59 条。

## 需求对照表（PLAN #10 → 本文档）

| 需求 | 满足位置 |
| --- | --- |
| 超管授予/撤销 | §3 后台头衔管理 |
| 自动获得（条件可扩展） | §3 规则展示（初始条件〔待产品确认〕） |
| 查看全部/佩戴一个/不佩戴/保存状态 | §2 个人中心 |
| 展示位置（论坛/评论区/店铺评价/其它） | §1 统一接入清单 |
| 统一用户信息组件 | §1（UI.userLine） |
| 多头衔拥有、单佩戴、撤销佩戴中 | §2 状态 |

## 用途与目标

头衔系统：徽章视觉、全站统一用户组件接入、个人佩戴管理、后台授予/撤销；覆盖 PLAN #10 全部需求与验收标准。

新页面：无旧代码钩子，「JS 钩子清单 / 需要修改的脚本行为」不适用。

## 布局与 HTML 骨架（要点）

无独立整页：复用 profile.html（#titles 分区）与 admin.html（#titles-mgmt 面板）布局；HTML 骨架见 §2、§3；全站徽章由 UI.userLine 输出（§1）。

## 1. 统一用户展示接入清单

所有展示用户信息的位置**必须**走 `UI.userLine(user, opts)`（components.md「User Line」），头衔徽章来自 `user.title`（=佩戴中的头衔 `{name, hue}`；无则省略）。

| 页面 | 位置 | 现状接入点（改造时替换） | 数据缺口与回退 |
| --- | --- | --- | --- |
| forum.html | 帖子卡头 / 回复 meta | forum.md 的 userLine/首字头像 | 后端补 `nickname/avatar_url/role/title`；缺 → 首字占位、无徽章 |
| post.html | 详情作者行 / 回复 | post.md 同上 | 同上 |
| recipe.html | 评价卡 foot | recipe.md userLine（user 对象可带 title） | recipes 无 title → 不显示 |
| shop.html | 店铺评价 review__head | shop-detail.md | 同上 |
| profile.html | 资料头部 | profile.md（user-line--lg 规格展示自己的头衔） | 自己无佩戴 → 无徽章 |
| admin.html | 队列项提交人（可选） | 文本即可，不强制徽章 | — |
| inbox.md | 消息 actor | msg__lead 头像 | — |

**回退铁律**：任何位置缺 `title` 字段都不报错、不占位渲染空徽章。

## 2. 个人中心 · 我的头衔（profile.html#titles）

```html
<section class="view" id="view-titles" hidden>
  <h1 class="page-head__title" style="font-size:var(--fs-2xl)">我的头衔</h1>
  <div class="panel">
    <div class="panel__head"><h2 class="panel__title">选择佩戴</h2><p class="panel__desc">同一时间只能佩戴一个头衔；也可以不佩戴。</p></div>
    <div class="panel__body stack">
      <div class="title-preview">
        <span class="title-preview__label">预览</span>
        {{UI.userLine(me, {size:'md', meta:'', href:false}) ← 佩戴变化实时预览}}
      </div>
      <div class="choice-group choice-group--2" id="titleChoices">
        <label class="choice"><input class="choice__input" type="radio" name="wear" value="" checked><span class="choice__body"><span class="choice__title">不佩戴<svg class="icon choice__check" aria-hidden="true"><use href="img/icons.svg#i-check-circle"></use></svg></span><span class="choice__desc">不显示任何头衔</span></span></label>
        <label class="choice" data-hue="ochre"><input class="choice__input" type="radio" name="wear" value="12"><span class="choice__body"><span class="choice__badge-row"><span class="title-badge" data-hue="ochre">…三元坊老饕</span><svg class="icon choice__check" aria-hidden="true"><use href="img/icons.svg#i-check-circle"></use></svg></span><span class="choice__desc">累计推荐 10 家店铺</span><span class="choice__meta">自动获得 · 2026-09-30</span></span></label>
        <!-- 未获得的自动头衔（可选展示）：-->
        <label class="choice choice--locked" data-hue="wisteria"><input class="choice__input" type="radio" name="wear" value="" disabled><span class="choice__body"><span class="choice__badge-row"><span class="title-badge" data-hue="wisteria">…夜读星</span><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-lock"></use></svg></span><span class="choice__desc">连续 7 天登录</span><span class="choice__meta">未获得 · 已连续 3 天</span></span></label>
      </div>
    </div>
    <div class="panel__foot"><span class="status-text" id="wearMsg"></span><button type="button" class="btn btn--primary" id="wearSubmit" disabled>保存佩戴</button></div>
  </div>
</section>
```

行为：
- 初始：radio checked = 当前佩戴（无佩戴 → 「不佩戴」）；「保存佩戴」在**选择变化后**才可用（脏检测）。
- 保存：PUT `/api/user/title`（body `{title_id: 12}` 或 `{title_id: null}` 不佩戴；未拥有的头衔 403）→ toast「佩戴已更新」→ `UI.session.patch({title})` + `UI.shell.refreshAuth()`（页头头像区同步）。
- 撤销佩戴中的头衔（管理员撤销）：下次进入本区该选项消失；若当前佩戴被撤销 → 自动回「不佩戴」+ 系统消息告知（后端职责，UI 只呈现）。
- 空态（无任何头衔且无锁定项展示）：empty「暂无头衔」「继续使用网站，可能会获得头衔。」。
- 未获得锁定项**只列出进度 > 0 的**（已经着手的），按完成度从高到低排；完全没开始的留白太多，不渲染。接口仍返回完整 locked 列表（含 `met` / `progress`），由前端筛选。

## 3. 后台 · 头衔管理（admin.html#titles-mgmt，super_admin）

### 3.1 头衔目录

```html
<h1 …>头衔管理</h1>
<div class="panel">
  <div class="panel__head"><h2 class="panel__title">头衔目录</h2><p class="panel__desc">头衔是全站徽章；删除头衔会同时移除所有用户的拥有与佩戴。</p></div>
  <div class="panel__body"><div class="table-wrap"><table class="table table--stack" id="titleTable">…</table></div></div>
  <div class="panel__foot"><button type="button" class="btn btn--primary" id="titleAdd">新建头衔</button></div>
</div>
```
表列：徽章（预览 `title-badge`）/ 名称 / 颜色 / 来源（grant/auto）/ 持有人数 / 操作（编辑、删除）。

### 3.2 新建/编辑对话框（#titleDialog）

字段：名称（1–8 字，`data-counter="8"`）、颜色（8 个 `.chip` radio，值 = hue 名，默认 stone）、描述（≤40 字，`choice__desc` 同文案）、获得方式（只读：手动授予 / 自动规则名）。校验内联；保存 PUT → toast「已保存」+ 重载。

### 3.3 授予/撤销

- 入口：用户管理表格操作列加「头衔」按钮（btn--sm）→ 打开 `#grantDialog`（dialog--sheet）：
  - 目标用户（只读显示用户名）。
  - 头衔选择：`.chips`（该用户尚未拥有的头衔；无则显示「该用户已拥有全部头衔」）。
  - 确认（primary）→ POST grant → toast「已授予」+ 重载。
- 权限边界（与改角色/封号一致）：后端对每个针对具体账号的写操作校验目标权重 —— **不能给自己或权重不低于自己的人授予、撤销头衔**（返回 403，目标不存在返回 404）。前端也只在权重低于自己的用户行显示「头衔」按钮。
- 撤销：用户管理表格显示该用户头衔（徽章列表，每枚可点 ×）或 grantDialog 内「已拥有」区每枚「撤销」（UI.confirm「撤销 {{user}} 的「{{title}}」？」「其佩戴状态将一并清除。」→ 确认「撤销」）→ toast「已撤销」。
- 自动头衔：目录表来源=auto 的行无手动授予按钮（接口返回 409）；规则字段只读展示（后端注册表）。
- 专属头衔：授予对话框底部的「专属头衔（只发给该账号）」输入名称并选色后点「颁发」→ `POST /api/admin/users/:id/titles/custom`；成功后在「已拥有」区出现，可像其他头衔一样撤销。

## 4. 初始头衔（已定稿）

**管理等级头衔**：每个角色恰好一枚身份徽章，彼此不重叠（`user` / `guest` 无）。

| 名称 | hue | 来源 | 对应角色 |
| --- | --- | --- | --- |
| 开发者 | rose 绛红 | 自动 `role_developer` | `developer` |
| 超级管理员 | vermilion 朱印 | 自动 `role_super_admin` | `super_admin` |
| 管理员 | teal 黛青 | 自动 `role_admin` | `admin` |
| 学子 | bamboo 竹青 | 自动 `student_verified` | `student` |

**成就头衔（行为类，只增不减，`user` / `guest` 也可获得）**

| 名称 | hue | 规则 | 条件 |
| --- | --- | --- | --- |
| 三元坊老饕 | ochre 赭石 | `shop_contributor` | 累计推荐 10 家店铺 |
| 夜读星 | wisteria 紫藤 | `login_streak` | 连续 7 天登录 |
| 论坛催化剂 | vermilion 朱印 | `forum_catalyst` | 3 篇帖子各获得 ≥5 条评论 |
| 闲者爱上网 | wisteria 紫藤 | `weekend_regular` | 连续 3 个周末登录 |
| 高赞校友 | rose 绛红 | `top_liked` | 发帖累计获得 30 个赞 |
| 校园老吃家 | ochre 赭石 | `canteen_veteran` | 发布 10 篇食堂菜品评价（每周食谱不计） |

**手动授予**

| 名称 | hue | 说明 |
| --- | --- | --- |
| 师者 | indigo 靛蓝 | 教职员工标识；不绑定角色，由管理员发给真正的老师 |
| 创站元老 | teal 黛青 | 早期用户 |
| 官方 | vermilion 朱印 | 管理团队标识 |

共 14 个头衔。种子写在 `lib/titles/store.js` 的 `SEED_TITLES`，启动幂等写入；结构支持后续增删（后端规则注册表），后台新建自动头衔时从 `/api/admin/titles/rules` 读取可用规则。

**等级头衔互斥、成就头衔只增不减**：角色变化时自动换发等级徽章（管理员升为超级管理员会收回「管理员」并发放「超级管理员」），成就与手动头衔不受影响；任何头衔都可由管理员撤销。

> 口径说明：`guest`（未登录）没有账号与 `user_titles` 记录，因此无法持有头衔，不设访客头衔；`user` 角色对应「同窗」。
> 「闲者爱上网」按北京时间的自然日去重记录在 `user_login_days`（登录时写入）。该表从本次上线开始积累，之前的登录历史无法回填；「连续 3 个周末」指从最近一个已到来的周六起，往前连续 3 个周末（周六或周日任一有登录即可）。

> 历史说明：早期版本把「师者」作为自动头衔发给 `admin` 及以上。管理等级改为独立头衔后，`migrate()` 会把已存在的「师者」目录行从自动改为手动（`source = 'grant'`、清空 `rule`），已发放的拥有关系保留，自然降级为手动授予。

### 4.1 账号专属头衔

除公共目录外，超管可在「用户管理 → 头衔 → 专属头衔」为**单个账号**颁发自定义头衔（名称 1–8 字 + 8 色任选）：

- 存 `titles.owner_user_id = 该账号`，**不进公共目录**，「头衔目录」表格与 `/api/admin/titles` 都不列出；
- 只在该账号的「已拥有」列表与「我的头衔」出现，其他账号看不到也无法佩戴；
- 该账号内同名重复颁发沿用同一行，不会产生重复目录项；
- **撤销时目录行一并删除**（专属头衔只在被拥有期间存在）；
- 公共目录的同名唯一性不受影响（公共头衔按名称全站唯一，专属头衔按「账号 + 名称」唯一）。

## 5. 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 无头衔 | 目录空 | empty「暂无头衔」 |
| 有头衔未选 | 默认 | 「不佩戴」选中；保存禁用 |
| 选择变化 | 点选 | 预览更新 + 保存可用 |
| 保存成功 | PUT | toast + 页头同步 |
| 保存失败 | 网络/403 | 回滚选择 + toast |
| 佩戴中被撤销 | 下次加载 | 自动回不佩戴 +（消息） |
| 锁定项 | 进度 > 0 | 灰化卡 + lock + 条件与进度；零进度的不显示 |
| 后台目录空 | — | 表格空态「暂无头衔」 |
| 新建重名 | 409 | 内联「头衔名称已存在」 |
| 撤销确认 | UI.confirm | — |

## 6. 响应式

- 360：choice-group 单列；预览条换行；后台表格转卡片（table--stack）。

## 边界场景

- 名称 8 字上限（徽章 max-width 11em 已截断兜底）；颜色 chip 全部可选（预览即时变色：`data-hue` 挂在选择卡外层容器上即可生效）。
- grantDialog 用户无头衔可选 → 文案；保存按钮禁用。

## 无障碍要点

- choice/radio 原生；预览区 `aria-live="polite"`（佩戴变化播报）；后台徽章仅视觉，名称列有文本。

## 7. 验收清单

- [x] UI.userLine 全站接入且缺字段不崩、不显示空徽章。
- [x] 我的头衔：预览、选择、脏保存、不佩戴、锁定项、撤销后回退。
- [x] 后台：目录 CRUD、授予、撤销（confirm）、自动规则只读。
- [x] 每个角色恰好一枚等级徽章：开发者 / 超级管理员 / 管理员 / 学子 / 同窗，按角色互斥换发；「师者」为手动授予。
- [x] 四个成就头衔（论坛催化剂 / 闲者爱上网 / 高赞校友 / 校园老吃家）按实际数据发放。
- [x] 未达成的头衔只列出进度 > 0 的，按完成度从高到低排列。
- [x] 超管可为单个账号颁发专属自定义头衔，且不进公共目录、撤销后目录行删除。
- [x] 论坛/详情/评价三处显示佩戴头衔（有数据时）。
- [x] 保存后页头/菜单同步；360/1280 正常；axe=0。

复验入口：`npm run test:titles`（后端 14 项）、`npm run test:ui`（浏览器回归，含头衔面板与专属头衔颁发的 360/1280 布局与 axe 扫描）。
