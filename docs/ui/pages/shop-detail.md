# 店铺详情 · shop-detail.md（#7/#8：shop.html?id=）

## 当前视觉与布局 · 2026-10-17

店铺详情与添加店铺页统一白底、细边框、小圆角、绿色主按钮和中文顶栏。详情仍支持纵向/双栏、点赞、评价、地图及权限校验；添加店铺表单与地址测算行为不变。动态网页标题使用拾光酥糕。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：新功能 ｜ 优先级：P1 ｜ issue：#7、#8、#22、#23（依赖 #5/#6）｜ 依赖：阶段 0；#7/#8 数据与接口 ｜ 壳：默认 ｜ data-nav：`shops` ｜ 容器：`container`

## 需求对照表（PLAN #7/#8 → 本文档）

| 需求 | 满足位置 |
| --- | --- |
| 店铺大致信息区（六要素） | §1 店铺头部 |
| 样式一：纵向 + 横向导航（菜品/评价）+ 吸顶 + 联动高亮 + 连续滚动 | §2 |
| 样式二：左右两栏同时查看 + 窄屏不破 | §3 |
| 用户设置（手动/自动，选择/保存/再次进入自动应用） | §4 |
| #22 手动切换或按屏幕宽度自动切换（纯 CSS） | §3、§4 |
| #8 菜品展示/添加（学生）/图片限制/失败提示/管理员删除 | §5 |
| 依赖 #6 | shops.md |

## 用途与目标

店铺详情页 shop.html?id=：两种可切换布局（纵向/双栏），并支持「手动 / 自动」样式——自动时由纯 CSS 按屏幕宽度切换；含菜品浏览与学生上传 + 评价；覆盖 PLAN #7/#8 与 #22 全部需求与验收标准。

新页面：无旧代码钩子，「JS 钩子清单 / 需要修改的脚本行为」不适用；HTML 骨架分段给出（§1/§2/§3/§5/§6）。

## 1. 店铺头部（店铺大致信息）

```html
<article class="card shop-hero">
  <div class="row row--between row--top">
    <div class="grow">
      <div class="row row--sm" style="margin-bottom:var(--sp-2)"><span class="tag" data-hue="{{typeHue}}">{{type}}</span></div>
      <h1 class="shop-hero__title">{{name}}</h1>
    </div>
    <div class="segmented" role="group" aria-label="店铺详情页布局" id="layoutSwitch">
      <button type="button" class="segmented__item" data-layout="stacked" aria-pressed="true"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-rows"></use></svg>纵向</button>
      <button type="button" class="segmented__item" data-layout="split" aria-pressed="false"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-columns"></use></svg>双栏</button>
    </div>
  </div>
  <div class="shop-hero__line"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-map-pin"></use></svg><span>{{address}}<small>{{location_note}}</small></span></div>
  <div class="shop-hero__stats">
    <div class="stat-block"><span class="stat-block__num">{{distance_m}}<small>米</small></span><span class="stat-block__label"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-route"></use></svg>距苏州中学</span></div>
    <div class="stat-block"><span class="stat-block__num">{{walk_min}}<small>分钟</small></span><span class="stat-block__label"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-walk"></use></svg>预计步行</span></div>
  </div>
</article>
```

stat-block 数字直接用原始数值（420 米 / 1.2 公里换算：**≥1000 用 formatDistance 换算显示**，num=1.2 unit=公里；步行始终分钟）。

## 2. 样式一 · 纵向（默认手机友好）

```html
<nav class="subnav" aria-label="店铺分区" style="margin-top:var(--sp-4)">
  <div class="tabs" role="tablist" aria-label="内容分区">
    <button type="button" class="tab" role="tab" data-target="shopDishes" aria-selected="true">菜品<span class="tab__count">8</span></button>
    <button type="button" class="tab" role="tab" data-target="shopReviews" aria-selected="false">评价<span class="tab__count">23</span></button>
  </div>
</nav>

<div class="shop-layout" id="shopBody">
  <section class="shop-section" id="shopDishes">
    <div class="shop-section__head"><h2 class="section__title">菜品</h2><span id="dishAddSlot"></span></div>
    <div id="dishArea">…</div>
  </section>
  <section class="shop-section" id="shopReviews">
    <div class="shop-section__head"><h2 class="section__title">评价</h2><span id="reviewAddSlot"></span></div>
    <div id="reviewArea">…</div>
  </section>
</div>
```

行为：`UI.scrollSpy(导航 tabs, [shopDishes, shopReviews])` 联动高亮；点击 tab 平滑滚动（UI.scrollSpy 内置）；页面自然连续滚动（不是 iframe/内滚）。subnav 吸顶（CSS 内置 sticky top=header-h）。

## 3. 样式二 · 双栏（电脑友好）

容器换类：`<div class="shop-layout shop-layout--split" id="shopBody">`，并把两个 section 包进列：

```html
<div class="shop-layout shop-layout--split" id="shopBody">
  <section class="shop-section shop-col--sticky" id="shopDishes">…菜品…</section>
  <section class="shop-section" id="shopReviews">…评价…</section>
</div>
```

- ≥900px：左菜品（可独立滚动 sticky）右评价，两栏同时可见；subnav 隐藏（CSS `.shop-wrap--split .subnav{display:none}`——外层容器加 `shop-wrap--split` 类或直接 `subnav[hidden]`，由脚本切换）。
- <900px：grid 回单列（CSS 自动，`.shop-layout--split` 未命中断点即单列）+ **subnav 恢复显示** + 提示：切换到双栏但屏窄时 toast.info「屏幕较窄，已使用纵向布局」。
- **自动模式（#22）**：容器类为 `.shop-layout shop-layout--auto`，同样的两 section 结构；不显示 segmented。CSS 在 `@media (min-width:900px)` 下套用双栏 + sticky + `.shop-wrap--auto .subnav{display:none}`，窄屏自动纵向并显示 subnav。纯 CSS 实现，窗口缩放不触发页面重渲染。

## 4. 布局样式（手动 / 自动）与持久化

账号字段 `shop_layout_mode` 决定详情页使用哪种方式（设置 → 网站设置 → 店铺详情页样式）：

| 模式 | 详情页表现 |
| --- | --- |
| `manual`（手动，默认） | 头部显示「纵向 / 双栏」segmented（`#layoutSwitch`）；初始值取账号 `shop_layout`（'stacked'/'split'）→ 无则 localStorage `shopLayout` → 都无则按屏宽：<900 stacked，≥900 split |
| `auto`（自动） | 隐藏 segmented；容器使用 `.shop-layout--auto` + `shop-wrap--auto`，由 CSS `@media (min-width: 900px)` 决定双栏/纵向 |

| 步骤 | 规则 |
| --- | --- |
| 手动切换 | 点 segmented：`setManualLayout(mode)`（换类/藏 subnav）+ localStorage 写 `shopLayout` + 登录则 PUT `/api/user/settings`（字段 `shop_layout`，失败仅 toast 不阻塞本地）；下次同账号进入保持上次选择 |
| 自动切换 | 纯 CSS：≥900px 套用与双栏相同的两列/`sticky` 规则，<900px 回落到单列；subnav 仅在窄屏显示。窗口宽度变化时只由媒体查询重算，不重渲染页面、不丢输入内容 |
| profile 同步 | 详情页经 `GET /api/user/profile` 读取 `shop_layout_mode` 与 `shop_layout` |
| 未登录 | 固定手动模式，仅 localStorage；下次进入应用 |

设置页「店铺详情页样式」只提供手动/自动二选一，不再直接选择纵向/双栏；保存网站设置不会覆盖详情页记录的 `shop_layout`。

## 5. 菜品区（#8）

### 5.1 展示

- 菜品网格（样式一纵向里用 `.grid`（3+ 列 `--grid-min:14rem`），双栏左列用 `.dish-list` 行式）：
  - 卡：`card--flush card--interactive dish`（dish__media 4:3 / dish__placeholder）+ 名称（链接 dish.html?id=）+ rating-line + 「评价 N」。
  - 行：dish-row（thumb 56 + 名称 + meta）。
- 空态：`empty--card`「这家店还没有菜品」/「等你来添加第一道菜。」+（学生及以上）「添加菜品」。

### 5.2 添加菜品（对话框）

入口：菜品区头部 `添加菜品`（btn primary；仅 student 及以上可见——`UI.session.isAtLeast(UI.config.dishCreateMinRole)`；访客不显示；普通用户不显示〔待产品确认：同 #6 默认 student〕）。

```html
<dialog class="dialog dialog--sheet dialog--wide" id="dishDialog" aria-labelledby="dishDialog-t">
  <form class="dialog__form" id="dishForm" novalidate>
    <div class="dialog__head"><h2 class="dialog__title" id="dishDialog-t">添加菜品</h2><button type="button" class="icon-btn icon-btn--sm" data-dialog-close aria-label="关闭">close</button></div>
    <div class="dialog__body stack">
      <div class="field"><label class="field__label" for="dishName">菜名</label><input class="input" id="dishName" data-counter="20" enterkeyhint="next"><div class="field__hint">和店铺菜单写法一致更容易被搜到</div></div>
      <div class="field" data-upload data-max-mb="2" data-types="image/jpeg,image/png">
        <span class="field__label">菜品图片</span>
        <label class="upload">…upload 骨架（必填）…<input type="file" id="dishImage" accept="image/jpeg,image/png"></label>
        <div class="upload-preview-slot"></div>
        <div class="field__hint">JPG / PNG，不超过 2 MB</div>
      </div>
    </div>
    <div class="dialog__foot"><button type="button" class="btn" data-dialog-close>取消</button><button type="submit" class="btn btn--primary" id="dishSubmit">添加</button></div>
  </form>
</dialog>
```

- 提交：FormData（name/image/shop_id）→ busy → 201 toast「已添加」+ 关框 + 菜品区重载；409（同名）→ 字段内联「这家店已有同名菜品」+（返回 existing id 时）错误下附 `<a href="dish.html?id=…">查看已有菜品</a>`；403 → toast「你没有权限添加菜品」；图片缺失 → 字段错误「请先选择图片」（UI.upload 场景外必填校验：提交时 `UI.upload.get(root)` 为 null 即报）。
- 去重预检（可选体验，P2）：输入菜名失焦时前端比对当前列表同名 → 输入框下 hint 变为「已有同名菜品，仍可提交或直接查看」+链接。

### 5.3 管理菜品（admin 及以上）

菜品卡/行 `⋯` 菜单（menu 组件，card__action 层）：`编辑`（同对话框预填，PUT）、`删除`（UI.confirm「删除菜品「{{name}}」？」「相关图片与评价将一并删除。」→ DELETE → toast「已删除」+ 重载）。学生发布的异常菜品由此处理（需求「必要时预留管理员删除/修改错误菜品的能力」）。

## 6. 评价区

- 评价列表 `.review`（user-line + stars + `点了：{{dish}}` + text + thumbs）+ 评价间分割线（内置）。
- 头部汇总：`rating-line`（均分 + 人数）——接口提供 `rating_avg/review_count` 时显示。
- 「写评价」：登录即可；学生及以上才能点赞与提交评价。入口在评价区头部（primary）与表单 `#reviewForm`；评分控件 `#shopRating1..5`（DOM 5→1，`row-reverse` 呈现 1→5），选中值即上传值，选中星及其左侧一起点亮。
- **收藏（#23）**：点赞按钮右侧有「收藏」按钮（`.btn.btn--sm.btn--collect`，已收藏用主色高亮）；点击由 `ui.js` 全局委托打开统一收藏夹弹窗（列出 `GET /api/collections?section=shops`，可新建，确认后 `POST /api/collections/:id/items`）。所有登录用户可收藏，不受学生点赞门槛限制；未登录提示先登录。
- **删除本人评价**：`my_review` 存在时，自己的评价卡显示删除按钮（`data-delete-my-review`），危险确认后 `DELETE /api/shops/:id/reviews/me`，重置表单并刷新列表。
- 空：empty「暂无评价」/「还没有人评价这家店，来写第一条吧。」+ 写评价（登录时）。

## 7. 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 加载店铺 | 首次 | shop-hero 区骨架（skeleton text×3）+ 两区骨架 |
| 店铺 404 | id 无效 | 整页 empty「店铺不存在或已被删除」+ 返回必吃榜 |
| 缺 id | 无 ?id= | empty「缺少店铺 id」+ 返回必吃榜 |
| 加载失败 | 网络 | loadError + 重试 |
| 菜品空/评价空 | — | 各区 empty |
| 添加菜品对话框 | 见 §5.2 | |
| 布局切换 | 账号 `manual` | segmented（§4） |
| 自动布局 | 账号 `auto` | 隐藏 segmented；纯 CSS 按宽度切换 |
| 窄屏手动双栏 | <900 且选 split | stacked 呈现 + 一次性 toast.info「屏幕较窄，已使用纵向布局」 |

## 8. 响应式

- 360：hero 数字块换行；菜品网格 1–2 列；subnav 吸顶；无横向滚动。
- 768：2 列菜品。
- 900：手动选双栏或自动模式在宽屏生效；左栏 sticky 内滚。
- 自动模式：<900 纵向、≥900 双栏，均由 CSS 媒体查询决定；窗口缩放不重渲染、不丢表单内容。
- 双栏下菜品行式列表（dish-list）。

## 9. 边界场景

- 双栏下评价很多 → 右栏整页滚动（非内滚），左栏 sticky 跟随；左栏内容也超屏 → 左栏内滚（`shop-col--sticky` overflow-y 已设）+ `overscroll-behavior:contain`。
- id 为非数字 → 404 处理。
- 布局值非法（localStorage 手改）→ 回退屏宽默认。
- 评价/菜品的配图 404 → thumb 占位。
- 店铺 distance_m 缺 → stat-block 整块不渲染。
- 添加菜品时掉线 → toast + 表单保留（dialog 内数据不丢）。
- 学生认证过期后入口隐藏 → `UI.shell.refreshAuth` 后重算（页面监听 storage/visibilitychange 可 P2）。

## 10. 无障碍

- subnav tabs + scrollSpy aria-selected；布局 segmented aria-pressed；添加/编辑/删除按钮有文字；dish 图链接 alt=菜名。
- 双栏内滚区 `tabindex="0"` + `aria-label="菜品列表（可滚动）"` 以便键盘滚动（加在 shop-col--sticky 元素上）。

## 11. 验收清单

- [ ] 头部六要素齐全（含 location_note 可选行）。
- [ ] 样式一（手动 · 纵向）：吸顶 subnav + 点击滚动 + 滚动联动高亮 + 连续浏览不受阻。
- [ ] 样式二（手动 · 双栏）：两栏同时可见；窄屏自动纵向 + 提示；无横向滚动。
- [ ] 自动：≥900 双栏、<900 纵向；隐藏 segmented；缩放时输入不丢。
- [ ] 手动/自动模式与上次纵向/双栏选择持久化（localStorage + 账号同步）。
- [ ] 添加菜品（权限、必填图、2MB、409 同名、成功重载）；管理员编辑/删除。
- [ ] 评价列表 + 写评价 + 空态；评分控件选中值与上传一致、左侧星同亮；作者可删除本人评价。
- [ ] 点赞按钮右侧收藏按钮：未登录提示；弹窗列出/新建收藏夹并确认写入；已收藏时高亮（#23）。
- [ ] 404/缺 id/失败态正确。
- [ ] 360/900/1280 正常；axe=0；零报错。

> 2026-10-17 共享加载状态修正：本页使用的 `UI.html.skeleton` 已补齐 `role="status"`，保留加载名称与 `aria-busy`，避免加载过程中的无障碍属性违规；外观与业务流程不变。
