# 头衔系统 · titles.md（#10）

> 状态：新功能 ｜ 优先级：P1 ｜ issue：#10 ｜ 依赖：阶段 0；#10 数据与接口 ｜ 落点：统一用户组件 + profile.html#titles + admin.html#titles-mgmt

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
- 保存：PUT `/api/user/title`（建议路径；body `{title_id: 12}` 或 `{title_id: null}` 不佩戴）→ toast「佩戴已更新」→ `UI.session.patch({title})` + `UI.shell.refreshAuth()`（页头头像区同步）。
- 撤销佩戴中的头衔（管理员撤销）：下次进入本区该选项消失；若当前佩戴被撤销 → 自动回「不佩戴」+ 系统消息告知（后端职责，UI 只呈现）。
- 空态（无任何头衔且无锁定项展示）：empty「暂无头衔」「继续使用网站，可能会获得头衔。」。
- 未获得锁定项**可选**（接口提供 locked 列表才显示；不给就不渲染该卡）。

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
- 撤销：用户管理表格显示该用户头衔（徽章列表，每枚可点 ×）或 grantDialog 内「已拥有」区每枚「撤销」（UI.confirm「撤销 {{user}} 的「{{title}}」？」「其佩戴状态将一并清除。」→ 确认「撤销」）→ toast「已撤销」。
- 自动头衔：目录表来源=auto 的行无手动授予按钮；规则字段只读展示（后端注册表）。

## 4. 初始头衔（示例，〔待产品确认〕）

| 名称 | hue | 来源 | 条件/说明 |
| --- | --- | --- | --- |
| 创站元老 | teal | 授予 | 早期用户（手动） |
| 三元坊老饕 | ochre | 自动 | 累计推荐 10 家店铺（示例条件） |
| 夜读星 | wisteria | 自动 | 连续 7 天登录（示例条件） |
| 官方 | vermilion | 授予 | 管理团队标识 |

此表为**示例**；上线前由产品定稿；结构支持后续增删（后端规则注册表）。

## 5. 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 无头衔 | 目录空 | empty「暂无头衔」 |
| 有头衔未选 | 默认 | 「不佩戴」选中；保存禁用 |
| 选择变化 | 点选 | 预览更新 + 保存可用 |
| 保存成功 | PUT | toast + 页头同步 |
| 保存失败 | 网络/403 | 回滚选择 + toast |
| 佩戴中被撤销 | 下次加载 | 自动回不佩戴 +（消息） |
| 锁定项 | 接口提供 | 灰化卡 + lock + 条件与进度 |
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

- [ ] UI.userLine 全站接入且缺字段不崩、不显示空徽章。
- [ ] 我的头衔：预览、选择、脏保存、不佩戴、锁定项、撤销后回退。
- [ ] 后台：目录 CRUD、授予、撤销（confirm）、自动规则只读。
- [ ] 论坛/详情/评价三处显示佩戴头衔（有数据时）。
- [ ] 保存后页头/菜单同步；360/1280 正常；axe=0。
