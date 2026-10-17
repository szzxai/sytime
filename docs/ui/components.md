# 组件规范 · components.md

> 事实来源：[assets/site.css](./assets/site.css)（类名、变体、状态、数值）与 [assets/ui.js](./assets/ui.js)（脚本 API）。本文与之逐字一致；发现不一致以这两个文件为准，并回改本文。视觉基准：[assets/specimen.html](./assets/specimen.html)。

## 组件使用总则

1. **一类事物只用一个组件。** 确认=Dialog；待办=Queue Item；用户+时间=User Line；空=Empty。
2. **颜色只来自令牌**；组件内禁止写十六进制（`--rating`、`--p` 等动态自定义属性除外）。
3. **组件内部不写 `style` 属性**（动态值除外）；页面不得重写组件的响应式。
4. 状态类一律 `is-` 前缀；选中/展开/按下用 ARIA 属性（`aria-selected` / `aria-expanded` / `aria-pressed` / `aria-current`），CSS 按属性匹配。
5. 图标：`<svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-名称"/></svg>`；JS 里用 `UI.icon('名称', '附加类')`。尺寸：默认 20、`icon--sm` 16、`icon--lg` 24、`icon--xl` 32。
6. 新增组件流程：先查「组件选择决策表」→ 组合现有组件 → 确实不够，向设计负责人申请，同步更新 site.css、ui.js、specimen.html 与本文件。
7. 所有组件在 360px 正常、触控目标 ≥44px、键盘可达——这是组件的一部分，不是可选项。

组件选择决策表（常见需求 → 组件）：

| 需求 | 用 |
| --- | --- |
| 确认危险操作 / 确认常规操作 | Dialog（UI.confirm） |
| 让用户输入一小段文字 | Dialog（UI.prompt） |
| 告知操作结果 | Toast（UI.toast） |
| 展示一条用户（头像/名字/时间/头衔） | User Line |
| 展示状态（待处理/已通过/已驳回） | Badge |
| 给内容分类打标 | Tag（data-hue） |
| 切换两个视图/分类 | Segmented（≤3 项）或 Tabs（更多/带计数） |
| 吸顶的区块跳转 | Subnav + UI.scrollSpy |
| 折叠一段内容 | Collapse |
| 列表为空 | Empty |
| 加载列表 | Skeleton |
| 展示大图 | Thumb + UI.viewer |
| 设置开关 | Switch |
| 二选一设置（如布局） | Choice |
| 一组选项里选一个 | Chip（单选 radio） |
| 展示用户并带头衔 | User Line（features.titles） |
| 管理后台的一行待办 | Queue Item |
| 整卡可点进入详情 | Card（card--interactive + card__link） |

---

# 基础

### Icon 图标

**用途**：全站唯一图标来源。**不用**：emoji、字符图标、自画 SVG。

骨架（页面静态写法）：
```html
<svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-search"></use></svg>
```
JS 写法：`UI.icon('search')`、`UI.icon('search', 'icon--sm')`。

类与变体：`icon`（20×20，线性 1.75，描边继承 `currentColor`）；`icon--sm` 16；`icon--lg` 24；`icon--xl` 32；`icon--fill`（实心，仅 `i-star`、`i-heart` 已赞态等）。

状态：颜色随 `currentColor`；无需 hover 样式（由父按钮负责）。

可访问性：装饰图标必须 `aria-hidden="true"`；含义性图标由父元素的 `aria-label` 表达。

脚本接入：无（静态使用即可）。

常见错误：① 写 `<use href="#i-x">`（页内没有 sprite）→ 图标空白；② 给 icon 本身加点击事件 → 应加在按钮上。

可用图标名（77 个，见 assets/icons.svg）：menu, close, search, chevron-down, chevron-up, chevron-left, chevron-right, arrow-left, arrow-right, arrow-up, external, plus, minus, check, more, more-v, copy, refresh, link, fullscreen, filter, sort, send, upload, download, pencil, trash, eye, eye-off, lock, check-circle, x-circle, alert-circle, alert-triangle, info, help, ban, wifi-off, image-off, home, map, map-pin, layers, message, utensils, megaphone, bell, mail, inbox, user, users, settings, logout, login, shield, shield-check, graduation, clipboard, calendar, clock, image, book, compass, columns, rows, sun, moon, store, tag, route, walk, star, heart, award, trophy, flag；品牌 `brand-mark`（朱底白「中」印章，颜色由 `--seal`/`--ink-inverse` 提供）、`brand-glyph`（仅笔画的透明底版本，用于 Hero 水印）。

### Button 按钮

**用途**：所有点击动作。**不用**：跳转页面时若视觉上就是链接则直接 `<a class="btn" href>`（btn 支持在 a 上使用）。

骨架：
```html
<button type="button" class="btn btn--primary"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-plus"></use></svg>发布帖子</button>
```

类与变体：
| 类 | 作用 |
| --- | --- |
| `btn` | 次要（白底 + 灰线） |
| `btn--primary` | 主按钮（黛青实心）；**每视图最多 1 个** |
| `btn--ghost` | 无边框灰字（工具栏、卡片角落） |
| `btn--danger` | 危险实心（对话框内的确认删除/封禁） |
| `btn--danger-quiet` | 危险幽灵（列表内的删除入口） |
| `btn--link` | 文字链接样 |
| `btn--sm` / `btn--lg` | 高 32 / 48 |
| `btn--block` | 整行（表单主按钮） |
| `btn--icon` | 正方形 40（配图标） |
| `is-loading` | 加载中（前置转圈；配合 `aria-busy="true"` 与 disabled） |

状态：默认 → hover（底 `--surface-2`、线加深）→ active（下移 1px）→ focus-visible（黛青描边）→ disabled（`--sunken` 底 `--ink-3` 字）。触屏下 min-height 自动 44。

尺寸：高 40（默认）、字 15；sm 32/13；lg 48/16；圆角 `--r-2`（sm 为 8px）；图标与文字间距 `--sp-2`。

可访问性：`<button type="button">`（表单提交才用 submit）；禁用加 `disabled`；加载中加 `aria-busy="true"`。

脚本接入：busy 用 `UI.form.busy(btn, true/false)`。

常见错误：① 一屏多个 primary；② 用 `<a class="btn">` 但没写 `href`；③ 成功后把按钮文字改成「已提交」——成功用 Toast；④ 在 ghost 按钮上叠加彩色。

### Icon Button 图标按钮

**用途**：无文字的圆形操作（页头汉堡、关闭、更多）。骨架：
```html
<button type="button" class="icon-btn" aria-label="更多操作"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-more"></use></svg></button>
```
变体：`icon-btn--sm`（32）；触屏自动 44。状态：hover/展开（`--sunken` 底）。**必须有 `aria-label`**；圆形焦点环自带。常见错误：漏 aria-label；用它做提交（应该用 btn--icon）。

### Link 链接

规则：行内文本里的链接（无 class 的 `<a>` 或 `.link`）**必须带下划线**（base.css 已实现）；带组件样式的链接（按钮、卡片标题、菜单项）不带下划线。链接色 `--primary`，hover 下划线加粗。外链可加 `i-external` 小图标。禁止 `target="_blank"` 不加 `rel="noopener"`（本站基本无外链）。

---

# 表单

### Field 表单字段

**用途**：任何输入控件的容器；负责 label、提示、错误、计数的排版与状态。

骨架：
```html
<div class="field">
  <label class="field__label" for="nickname">昵称</label>
  <input class="input" id="nickname" value="{{…}}">
  <div class="field__hint">注册后不可修改</div>
</div>
```

子元素：`field__label`（13px 次要灰，字重 500；内可放 `field__opt`「（选填）」）；`field__hint`（12px 辅助灰）；`field__error`（12px 红 + 警示图标；默认 display:none）；`field__foot`（hint 与 counter 左右分布，counter 加 `field__counter`，超限 `is-over` 变红）。

变体：`.field--full`（在 `form-grid--2` 里占满行）；`.field.is-invalid`（显示 error、隐藏 hint、控件变红）。

状态脚本：`UI.form.fieldError(input, '消息')` / `UI.form.clearField(input)`；输入时自动清错（ui.js 全局委托）；`aria-invalid` 与 `aria-describedby` 由脚本维护。

常见错误：① 错误文案写在 hint 里而不切 error；② label 没有 for；③ 用 `.is-invalid` 但没填 error 文案。

### Input 输入框

```html
<input class="input" id="x" type="text" placeholder="{{提示}}" autocomplete="off">
```
规格：高 44、圆角 `--r-2`、边 `--line-strong`（hover 加深，focus 黛青 + `--ring`）、字 **16px**、底 `--surface`；disabled（`--sunken` 底灰字）与 `readonly`（`--surface-2` 底）。错误态由 `.field.is-invalid` 或 `aria-invalid="true"` 驱动。**禁止**改字号（防 iOS 聚焦缩放）。带图标/单位/尾部按钮用 `input--icon / input--unit / input--end` + `input-group__icon / input-group__unit / input-group__end`（见 components.md「Search 搜索框」「Password 密码框」）。

### Textarea 多行输入

```html
<textarea class="textarea" id="x" data-counter="2000" placeholder="{{提示}}"></textarea>
```
同 input 外观；min-height 104、可纵向 resize；正文行高 1.6。计数器放 `field__foot` 里（`.field__counter`）。计数初始化：`UI.qsa('[data-counter]').forEach(UI.form.counter)`（ui.js 自动）。

### Select 下拉选择

```html
<select class="select" id="x" aria-label="{{用途}}"><option>…</option></select>
```
同 input 外观 + 右侧 CSS 三角；`select--sm`（36 高，用于表格/工具条）。**表格内或无可见 label 时必须有 `aria-label`**（axe 强制）。

### Checkbox 与 Radio

```html
<label class="check-row">
  <input type="checkbox" class="check" checked>
  <span class="check-row__text">允许申请解封<span class="check-row__desc">被封用户可在登录页提交申诉</span></span>
</label>
```
`check`（方 20px 圆角 6）与 `radio`（圆 20px）；选中实心黛青 + 白勾/白点；行内文字 15px、辅助说明 `check-row__desc` 12px。触点整行（label 包裹）。键盘：空格切换；焦点环 2px 黛青。

### Switch 开关

```html
<div class="switch-row">
  <div class="switch-row__text"><span class="switch-row__title">评论通知</span><span class="switch-row__desc">有人评论你的帖子时提醒我</span></div>
  <input type="checkbox" class="switch" role="switch" checked aria-label="评论通知">
</div>
```
44×26 轨道，选中黛青；开关行之间用 1px 分割线（自动）。**必须有 `role="switch"` 与可读的 label**（title 即说明时也要 `aria-label`）。

### Chip 胶囊选项

```html
<label class="chip"><input class="chip__input" type="radio" name="type" value="面馆" checked><span class="chip__face">面馆</span></label>
```
36 高胶囊；选中黛青浅底+黛青字；组容器 `.chips`；触屏 44。单选用 radio、多选用 checkbox + `[]` 命名。键盘：radio 组内方向键。常见错误：input 不包在 label 里（无法点）。

### Choice 选择卡片

```html
<label class="choice" data-hue="ochre">
  <input class="choice__input" type="radio" name="wear" checked>
  <span class="choice__body">
    <span class="choice__title">{{标题}}<svg class="icon choice__check" aria-hidden="true"><use href="img/icons.svg#i-check-circle"></use></svg></span>
    <span class="choice__desc">{{描述}}</span>
    <span class="choice__meta">{{来源与时间}}</span>   <!-- 可选 -->
  </span>
</label>
```
容器 `.choice-group`（`.choice-group--2` 双列，≥560px 生效）；选中黛青描边 + 浅底 + 右上角勾（`.choice__check` 默认隐藏）；`.choice--locked`（未获得的头衔）：灰化 + 锁图标 + 禁用 input。预览小图用 `.choice__preview`（内放 `<i>` 灰条，`i.is-strong` 深条，`.cols` 两列）。键盘：focus 环在卡片上。

### Segmented 分段控件

```html
<div class="segmented" role="tablist" aria-label="{{视图}}">
  <button type="button" class="segmented__item" role="tab" aria-selected="true">讨论</button>
  <button type="button" class="segmented__item" role="tab" aria-selected="false">提问</button>
</div>
```
`--sunken` 轨道 + 白色选中块（`aria-selected="true"`，字重 700）；`segmented--block` 占满行。仅用于 **2–3 个互斥视图**；更多或带计数用 Tabs。键盘：`UI.tabs` 或方向键委托已支持。

### Upload 图片上传

骨架（root = 带 `data-upload` 的元素）：
```html
<div class="field" data-upload data-max-mb="2" data-types="image/jpeg,image/png">
  <span class="field__label">图片 <span class="field__opt">（选填）</span></span>
  <label class="upload">
    <span class="upload__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="img/icons.svg#i-image"></use></svg></span>
    <span class="upload__title">点击选择或拖入图片</span>
    <span class="upload__hint">JPG / PNG，不超过 2 MB</span>
    <input type="file" accept="image/jpeg,image/png">
  </label>
  <div class="upload-preview-slot"></div>
</div>
```
初始化：`UI.upload.bind(root)`（页面有 `data-upload` 时 ui.js 自动绑定）。选中后 `.upload` 隐藏、`upload-preview-slot` 显示 `.upload-preview`（56px 预览 + 文件名/大小 + 移除按钮）。校验自动：类型/大小错误 → 字段级红色错误（文案见 copy.md 5.6）。取文件：`UI.upload.get(root)`；清空：`UI.upload.clear(root)`。拖入支持已内置。**禁止**页面再写 onchange 校验。

### Rating Input 星级输入

```html
<div class="rating-input" role="radiogroup" aria-label="评分">
  <input type="radio" name="rating" id="r5" value="5"><label for="r5" title="5 分"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-star"></use></svg></label>
  <input type="radio" name="rating" id="r4" value="4"><label for="r4" title="4 分">…</label>
  <!-- 5→1 倒序书写，CSS 用 row-reverse 呈现正序 -->
</div>
```
36px 触点、实心星；hover 预选、checked 金色（`--star`）、未选 `--star-empty`。取值：`form.querySelector('input[name=rating]:checked')?.value`。

### Search 搜索框

```html
<div class="input-group">
  <span class="input-group__icon"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-search"></use></svg></span>
  <input class="input input--icon input--end" type="search" placeholder="搜索菜品、店铺…" aria-label="搜索">
  <span class="input-group__end"><button type="button" class="icon-btn icon-btn--sm" aria-label="清除搜索"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-close"></use></svg></button></span>
</div>
```
行为：防抖 250ms；IME 组合期间不触发；结果数 `aria-live="polite"`（可放隐藏 span）；命中词 `<mark class="hl">`；清空恢复全量。吸顶用 `.search-bar`（sticky 于 `top: var(--header-h)`）。

### Password 密码框

```html
<div class="input-group">
  <input class="input input--end" id="pw" type="password" autocomplete="current-password">
  <div class="input-group__end"><button type="button" class="icon-btn icon-btn--sm" data-password-toggle aria-label="显示密码"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-eye"></use></svg></button></div>
</div>
```
显隐由 ui.js 委托（`data-password-toggle`），切换后 aria-label 与图标同步。autocomplete 按场景：登录 current-password，注册/修改 new-password。

---

# 展示

### Card 卡片

```html
<article class="card">
  <div class="card__head">
    <h3 class="card__title">{{标题}}</h3>
    <span class="tag" data-hue="teal">{{标签}}</span>
  </div>
  <p class="card__body">{{正文}}</p>
  <div class="card__foot">{{脚注：stat、按钮、时间}}</div>
</article>
```
变体：`card--flush`（去内边距+裁圆角，配媒体/表格）；`card--soft`（次级底）；`card--tint`（黛青浅底强调块，每页 ≤2 张）；`card--interactive`（hover 抬升，仅可点卡片）；整卡可点 = 标题内 `<a class="card__link">`（伪元素铺满）+ 其它可点元素加 `.card__action`。内边距 16（手机）/20（桌面）；圆角 14；边 1px `--line`。**静止无阴影**。媒体区 `.card__media`（4:3，内描边自动）。

常见错误：① 整卡可点但没加 `card__link`（键盘不可达）；② 卡内可点元素没加 `card__action`（被伪元素挡住）；③ 用卡片装「设置分组」（应该用 Panel）。

### Panel 设置面板

```html
<section class="panel">
  <div class="panel__head"><h2 class="panel__title">昵称</h2><p class="panel__desc">说明一句</p></div>
  <div class="panel__body">…field…</div>
  <div class="panel__foot"><span class="status-text is-ok">已保存</span><button class="btn btn--primary">保存</button></div>
</section>
```
个人中心/后台的分组块；foot 可省；`panel--danger`（红边，用于危险设置区）。面板间距 20（`.panel + .panel`）。

### List 分隔列表

```html
<div class="list">
  <a class="list__item" href="{{href}}">
    <span class="avatar avatar--sm" data-hue="teal">{{首字}}</span>
    <span class="list__main"><span class="list__title">{{标题}}</span><span class="list__sub">{{副行}}</span></span>
    <svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-chevron-right"></use></svg>
  </a>
</div>
```
一行 44+；hover 次级底；`a` 或 `button` 均可。用于设置入口、简单行列表。

### KV 键值行

```html
<div class="kv">
  <div class="kv__row"><span class="kv__k">ID</span><span class="kv__v mono">10086</span></div>
</div>
```
键列宽 6.5rem、键 13px 辅助灰、值可断行；行间分割线。用于账号信息、详情字段。

### Table 表格

```html
<div class="table-wrap">
  <table class="table table--stack">
    <thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>
      <tr>
        <td data-label="ID" class="mono">1</td>
        <td data-label="用户名">xiaoming</td>
        <td data-label="角色"><select class="select" aria-label="角色">…</select></td>
        <td data-label="状态"><span class="badge badge--ok">正常</span></td>
        <td data-label="操作"><div class="table__actions"><button class="btn btn--sm">权限</button></div></td>
      </tr>
    </tbody>
  </table>
</div>
```
表头次级底 + 13px 灰字；行 hover；**每个 td 必须 `data-label`**（手机 `table--stack` 转卡片：th 藏、td 变键值行）；表格内控件必须有 `aria-label`；操作列用 `.table__actions`（btn--sm 群）。

### Tag 标签

```html
<span class="tag" data-hue="ochre">小吃</span>
```
12px、圆角 6、tint 底 ink 字；`tag--outline`（描边中性）、`tag--primary`（品牌浅底）。**不用 data-hue 时为中性灰**。用途：分类、内容类型；状态用 Badge 不用 Tag。

### Badge 状态徽标

```html
<span class="badge badge--pending">待处理</span>
```
自带前置圆点（currentColor）；变体 pending（琥珀）/ok（绿）/danger（红）/info（品牌）/默认灰。**必须有文字**（颜色不是唯一信息）。

### Role Tag 角色小标

```html
<span class="role-tag">管理员</span>
```
仅 admin/super_admin/developer 显示（`UI.roleTag(role)` 自动处理，user/student 不显示）。

### Title Badge 头衔徽章

```html
<span class="title-badge" data-hue="ochre"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-award"></use></svg><span class="title-badge__text">三元坊老饕</span></span>
```
胶囊、tint 底、奖杯图标；超 8 字省略（max-width 11em）。JS：`UI.titleBadge({name, hue})`。**colors 一律 data-hue**，不手写。

### Avatar 头像

```html
<span class="avatar avatar--md" data-hue="teal">小</span>
<span class="avatar avatar--md" data-hue="teal"><img src="{{url}}" alt=""></span>
```
尺寸 xs 24 / sm 32 / md 40 / lg 64 / xl 96；圆形；无图 = 底色 + 首字（白）；内描边自动。hue 由 `UI.hueFor(id或name)` 生成（只用 7 彩色）；页面静态写死也允许。JS：`UI.avatar(user, size)`。

`UI.avatarLink(user, size)` 把头像包成链接（#21）：本人 → `profile.html`，他人 → `user.html?id=<id>`（`UI.userHref`）；user 无 id 时退化为不可点击的 `span`。论坛、帖子、评价等处的头像由它渲染，`a.user-avatar--link` 有 hover/focus 态。

### User Line 用户信息行

**全站统一的用户展示**（论坛、评价、消息、后台都用它，不允许页面另写）。

```html
<a class="user-line" href="profile.html">
  <span class="avatar avatar--sm" data-hue="teal">小</span>
  <span class="user-line__body">
    <span class="user-line__top"><span class="user-line__name">小苏</span><span class="title-badge" data-hue="ochre">…</span><span class="role-tag">管理员</span></span>
    <span class="user-line__meta">3 小时前</span>
  </span>
</a>
```
JS：`UI.userLine(user, {size, meta, href, large, showRole})`；meta 传 HTML 字符串（如 `UI.timeEl(sec)`）。名字 14px 中灰粗、meta 12px 辅助灰；`user-line--lg` 用于资料头部。宽度溢出自动省略。**头像默认可点击进入用户主页（#21）**；当传入 `href`（整行为链接）时不再嵌套头像链接。

### Stars 评分展示

```html
<span class="stars" style="--rating:4.3" role="img" aria-label="评分 4.3 分，满分 5 分">
  <span class="stars__row stars__base"><svg class="icon">…star×5…</span>
  <span class="stars__fill"><span class="stars__row">…star×5…</span></span>
</span>
```
双层实现支持小数；JS：`UI.stars(rating, {large})`。带数值时包 `.rating-line`（星 + `rating-line__num` + 括号计数）。

### Rank 榜单序号

```html
<span class="rank rank--top">1</span>
```
28px 方块；前三 `rank--top` 朱印底白字；其余 `--sunken` 底。**只用于榜单排序场景**（必吃榜综合排序）。

### Thumb 缩略图

```html
<span class="thumb" data-zoom="{{url}}" data-caption="{{说明}}"><img src="{{url}}" alt="{{说明}}" loading="lazy"></span>
```
80px 圆角 10、`cursor:zoom-in`；`thumb--lg` 120。点击放大由 ui.js 委托（`data-zoom`）。加载失败自动占位（`is-broken` + `media-fallback`）。

### Stat 统计小块

```html
<span class="stat"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-route"></use></svg><b>420 米</b><small>距苏中</small></span>
<div class="stat-block"><span class="stat-block__num">420<small>米</small></span><span class="stat-block__label">…距苏州中学</span></div>
```
行内小统计用 `.stat`（图标+粗体值+灰说明）；大数字块 `.stat-block`（24px 粗体 + 标签行）。数字格式经 `UI.formatDistance/formatMinutes`。

### Prose 长文本

```html
<div class="prose">{{正文（已 esc，保留换行）}}</div>
```
手机 15 / ≥768 16px、行高 1.85、`pre-wrap`、`anywhere` 断行。帖子正文、公告正文、工单内容用它。

---

# 反馈

### Toast

由 `UI.toast(message, {type, duration, action})` 全权管理；**禁止页面自建**。

变体与默认时长：success 3s（check-circle 绿）、error 5s（alert-circle 红，`role=alert`）、warning 4.5s（alert-triangle 琥珀）、info 3s（info 青）。深色胶囊（`--toast-bg`）、白字、圆角 14、阴影 `--sh-3`；顶部居中（页头下方）；同屏最多 3；相同文案 1.2s 去重；带 `action`（如「撤销」）时青色加粗；hover 暂停自动关闭。在打开的对话框内调用时自动挂到该对话框顶部。

骨架（仅静态展示用，见样张）：
```html
<div class="toast toast--success" role="status">
  <svg class="icon toast__icon" aria-hidden="true"><use href="img/icons.svg#i-check-circle"></use></svg>
  <span class="toast__text">昵称修改成功</span>
  <button type="button" class="icon-btn icon-btn--sm toast__close" aria-label="关闭">…</button>
</div>
```

常见错误：① 用 toast 显示需要用户阅读的长说明（改 Dialog）；② 错误没经 `UI.errorText`（显示英文）；③ 自己 setTimeout 移除导致动画缺失。

### Dialog 对话框

原生 `<dialog>`。三类：`UI.confirm`（图标 + 标题 + 说明 + 取消/确认）、`UI.prompt`（标题 + label + 控件 + 取消/确认）、`UI.alert`（图标 + 标题 + 说明 + 单按钮）。自定义表单对话框骨架：

```html
<dialog class="dialog dialog--sheet dialog--wide" id="banDialog" aria-labelledby="banDialog-t">
  <form class="dialog__form" method="dialog">
    <div class="dialog__head">
      <h2 class="dialog__title" id="banDialog-t">封禁用户 {{name}}</h2>
      <button type="button" class="icon-btn icon-btn--sm" data-dialog-close aria-label="关闭">…</button>
    </div>
    <div class="dialog__body">
      <div class="field">…</div>
    </div>
    <div class="dialog__foot">
      <button type="button" class="btn" data-dialog-close>取消</button>
      <button type="submit" class="btn btn--danger">确认封禁</button>
    </div>
  </form>
</dialog>
```

打开/关闭：`UI.dialog.open(id)` / `UI.dialog.close(id)`；声明式 `data-dialog-open="id"` / `data-dialog-close`。遮罩点击：confirm/alert 可关（dismissible），表单类默认不可（防误触丢输入）——`wireBackdrop` 内部处理，页面无需关心。宽 `dialog--wide` 40rem；`dialog--confirm` 带图标头（`dialog__icon`，danger 变红）；手机端 `dialog--sheet` 变底部面板（把手条 + 底部安全区；确认对话框按钮变整行、确认在上）。动画由 CSS 类 `is-closing` 驱动（ui.js 处理）。滚动锁：ui.js 在 open/close 时统一处理页面 padding 补偿。焦点：打开自动聚焦（confirm 危险时聚焦取消；prompt 聚焦输入框并全选）；Esc 关闭。

**禁止**：dialog 内再嵌 dialog（用 toast 或先关再开）；把长流程表单塞进 confirm。

### Collection 收藏按钮与选择弹窗（#23）

- 按钮：`UI.collections.button(section, itemId, { variant, className })`；`section` 为 `forum` / `shops`，生成 `[data-collect][data-section][data-item-id]` 按钮。列表 / 帖子用 `.action-btn.action-btn--collect`；店铺详情操作区传 `{variant:"btn"}` 用 `.btn.btn--sm.btn--collect`。已收藏时 `aria-pressed="true"`，用主色 `--primary` 高亮（区别于点赞的红色）。
- 弹窗：点击任意 `[data-collect]` 由 `ui.js` 全局委托调用 `UI.collections.open({section, itemId, button})`，使用 `dialog dialog--sheet dialog--wide`：列出 `GET /api/collections?section=` 的收藏夹（单选 `.choice`），可展开「新建收藏夹」（`.field` + `.input` + `.btn`），底部「取消 / 确认收藏」；确认调用 `POST /api/collections/:id/items`，成功后高亮触发按钮并 toast。
- 未登录：toast「请先登录后再收藏」，不打开弹窗。收藏状态在浏览器 localStorage 按账号缓存（`collected:<userId>:<section>:<itemId>`），用于页面加载时恢复高亮。

### Collections Browser 收藏浏览（#23）

`UI.collectionsBrowser(container, { mode, userId, defaultSection })`（`public/js/collections-view.js`），个人中心与用户主页共用：

- `mode: "owner"`：拉取当前用户两个版块的收藏夹（`GET /api/collections?section=`），右侧公开开关可写；`mode: "public"`：拉取目标用户的公开收藏夹（`GET /api/users/:id/collections`），只读并显示「公开」徽章。
- 结构复用 `.shell`（左 15rem 侧栏 + 右内容）、`.side-nav`（版块 + 收藏夹双层菜单）、`.breadcrumb`、`.switch-row`、`.grid`、`.pager`；不新增 CSS 类。
- 论坛卡片：`card` + `card__link`，标题 `var(--fs-lg)`，作者/时间 `u-muted u-fs-xs`，正文开头 `prose u-fs-sm`；固定高 `12rem`、最大宽 `20rem`。店铺卡片复用 `UI.shopCard()`（不显示收藏按钮）。
- 移动端（`UI.isMobile`）隐藏侧栏，顶部改用 `.select` 下拉（按版块分组）。

### Sheet 底部面板

即 `dialog--sheet` 在手机端的形态（同一元素，桌面自动居中圆角浮层）。宽度全屏、底部对齐；把手条自动渲染。用于发帖、写评价、添加菜品、封禁等表单。

### Drawer 抽屉

```html
<dialog class="dialog dialog--drawer" id="navDrawer" aria-label="站点导航">
  <div class="drawer__head">{{brand}}<button class="icon-btn" data-dialog-close aria-label="关闭菜单">…</button></div>
  <nav class="drawer__body" aria-label="主导航">
    <a class="drawer-link" href="map.html" aria-current="page"><svg class="icon">…</svg>校园地图</a>
    <div class="drawer-sep"></div>
    …
  </nav>
  <div class="drawer__foot">校园信息网 · AGPL-3.0</div>
</dialog>
```
左滑入 320px；由 ui.js 页头汉堡触发（`data-dialog-open="navDrawer"`）；≥768 窗口自动关闭。

### Alert 提示条

```html
<div class="alert alert--danger" role="alert">
  <svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-alert-circle"></use></svg>
  <div class="alert__body"><span class="alert__title">账号已被封禁</span>封禁理由：发布违规内容。</div>
</div>
```
变体 info（默认品牌）/success/warning/danger；标题可省；`role="alert"` 仅 danger/error 用，其余静默。用途：表单内聚提示、封禁理由、限流倒计时。**与 Toast 的分工**：会随表单提交而消失的提示用 Alert；与位置无关的结果用 Toast。

### Empty 空状态

```html
<div class="empty">
  <div class="empty__icon"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-inbox"></use></svg></div>
  <div class="empty__title">暂无消息</div>
  <div class="empty__desc">有新的互动或通知时会出现在这里。</div>
  <div class="empty__actions"><a class="btn btn--primary" href="forum.html">去论坛</a></div>
</div>
```
变体：`empty--card`（虚线卡底，用于列表区中央）、`empty--compact`（小）、`empty--error`（红图标）、`empty--lock`（琥珀锁，权限不足）。JS：`UI.html.empty({icon,title,desc,actions,card,compact,tone})`；加载失败用 `UI.html.loadError(r)`（自带重试按钮，页面监听 `[data-retry]` 点击重新加载）。文案必须来自 copy.md 文案库。

### Skeleton 骨架屏

`UI.html.skeleton(kind, n)` 生成；kind：post（头像+三行）/card（媒体+两行）/row（56px 方+两行）/text。样式 `skeleton` + 变体（`--text/--title/--avatar/--block/--media/--short`），微光动画；容器 `role="status" aria-busy="true" aria-label="加载中"`（2026-10-17 补齐状态角色，避免给普通 div 命名造成无障碍违规）。**禁止**整页骨架；列表首屏才用。

### Spinner 与进度条

`.spinner`（20px 黛青弧）/`.spinner--lg`（36）；居中块 `.loading-block`（spinner + 一句「正在加载…」）。`.progress > .progress__bar`（`style="--p:62%"`）仅上传等有进度的场景（当前未用，保留）。

### Callout 行动提示条

```html
<div class="callout">
  <span class="callout__text">登录后才能参与讨论、点赞和回复。</span>
  <span class="callout__actions"><a class="btn btn--sm" href="login.html">登录</a><a class="btn btn--primary btn--sm" href="register.html">注册</a></span>
</div>
```
虚线框 + 次级底；用于「缺权限但可一步获得」的引导（未登录、未认证）。每个区块最多一条 callout。

### Banner 站点横幅

`<div class="site-banner" role="region" aria-label="站点公告"><div class="container container--wide site-banner__inner">icon + .site-banner__text + 关闭 icon-btn</div></div>`；黛青浅底、13px、可多行；由 `UI.shell.loadBanner()` 自动插入与记忆关闭（`bannerDismissed:<用户名>` + 版本号）。

### Offline Bar 离线条

`<div class="offline-bar" role="status">网络已断开，部分功能暂不可用</div>`；ui.js 在 offline 事件自动插入/移除；sticky 于页头之上。

---

# 导航

### Site Header 页头

由 `UI.shell.mount()` 生成，页面只放 `<div id="siteHeader"></div>`。结构（生成的）：

```html
<header class="site-header">
  <div class="site-header__inner container container--wide">
    <button class="icon-btn site-header__menu" data-dialog-open="navDrawer" aria-label="打开菜单">…</button>
    <a class="brand" href="index.html" aria-label="校园信息网 首页">
      <svg class="brand__mark"><use href="img/icons.svg#brand-mark"></use></svg>
      <span class="brand__text"><span class="brand__name">校园信息网</span><span class="brand__sub">SZZX · INFO</span></span>
    </a>
    <nav class="site-nav" aria-label="主导航">…site-nav__link…</nav>
    <div class="site-header__actions" id="authArea">…</div>
  </div>
</header>
```

规格：sticky 顶部、高 56/64、毛玻璃（`--header-bg` + blur）、1px 下边；z 40。汉堡仅 <768；`site-nav` 仅 ≥768（当前项黛青浅底 `aria-current="page"`）；品牌字标 17px 粗 + 「SZZX · INFO」小字（<768 隐藏）。右侧：未登录=登录(ghost)+注册(primary) 小按钮；登录=消息铃(开关)+头像按钮。**禁止**页面自写页头。

### Site Nav 主导航

`site-nav__link`：圆角胶囊 hover 灰底；当前项 `aria-current="page"` 黛青浅底粗体。项：地图/论坛/菜谱/必吃榜(开关)/公告；文案用短词（全称在 title 属性）。

### Menu 下拉菜单

```html
<div class="menu" data-menu>
  <button type="button" class="icon-btn" data-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">…</button>
  <div class="menu__panel" role="menu" hidden>
    <div class="menu__head"><div class="menu__head-name">{{昵称}}</div><div class="menu__head-sub">{{角色}} · ID {{id}}</div></div>
    <a class="menu__item" role="menuitem" href="profile.html"><svg class="icon">…</svg>个人中心</a>
    <a class="menu__item" role="menuitem" href="settings.html"><svg class="icon">…</svg>设置</a>
    <div class="menu__sep"></div>
    <button type="button" class="menu__item menu__item--danger" role="menuitem">退出登录</button>
  </div>
</div>
```
白底圆角 14 阴影 `--sh-3`；右对齐（`menu__panel--left` 左对齐）；动效 pop-in 120ms。行为由 ui.js 委托：点击触发器开/关、外部点击关、Esc 关并还焦点、↑↓ 移动焦点。触屏项 44。**删除等危险项加 `menu__item--danger`（红字红底 hover）**。

### Tabs 标签页

```html
<div class="tabs" role="tablist" aria-label="{{视图}}">
  <button type="button" class="tab" role="tab" id="tab-all" data-tab="all" aria-controls="panel-all" aria-selected="true">全部<span class="tab__count">24</span></button>
</div>
```
下划线式：底 1px 线 + 选中 2px 黛青；可横向滚动（隐藏滚动条）；`tab__count` 灰胶囊计数、告警数 `tab__count--alert`（红底白字）。JS：`UI.tabs(list, {onChange})`（自动切换面板 hidden + 方向键）。吸顶版 = 包一层 `.subnav`。

### Subnav 吸顶二级导航

`<div class="subnav"><div class="tabs">…</div></div>`；sticky 于 `top: var(--header-h)`、毛玻璃、下边线；z 20。用于店铺详情（菜品/评价）与任何区块跳转。联动高亮用 `UI.scrollSpy(list, sections)`（tab 加 `data-target="区块id"`）。

### Side Nav 侧栏导航

```html
<nav class="side-nav" aria-label="后台分类">
  <span class="side-nav__group">内容</span>
  <a class="side-nav__item" href="#" aria-current="page"><svg class="icon">…</svg>学生认证<span class="side-nav__count">3</span></a>
</nav>
```
双形态：桌面（≥900）静置于 `.shell` 左列（分组标题 `side-nav__group` 12px 灰、项 44 圆角 hover、当前黛青浅底）；手机（<900）自动变吸顶横向滚动条（毛玻璃）。待办计数 `side-nav__count` 红胶囊（>99 显示 99+）。个人中心/设置/后台共用。

### Profile Tabs 个人中心头部与吸顶横向菜单栏

`#20` 个人中心专用结构：页头（站点导航）之下为资料头部 `.profile-hero`（头像含右下编辑按钮 + 上行 用户名/权限等级标签/昵称 + 下行 个性签名；昵称与签名 `contenteditable`，点击即可编辑、失焦弹确认保存），再下为 `.profile-tabs`（`position: sticky; top: var(--header-h)`，横向可滚动，项复用 `.side-nav__item`，当前项 `aria-current="page"`）。分区 `.view`（`#view-home` / `#view-favorites` / `#view-titles`）由 `UI.page.panels` 切换；「设置」为普通链接。详见 [pages/profile.md](./pages/profile.md)。

### Collapse 折叠面板

```html
<div class="collapse">
  <button type="button" class="collapse__trigger" aria-expanded="false">
    <span>{{标题（如日期范围）}}</span>
    <svg class="icon collapse__chevron" aria-hidden="true"><use href="img/icons.svg#i-chevron-down"></use></svg>
  </button>
  <div class="collapse__panel"><div class="collapse__inner"><div class="collapse__content">{{内容}}</div></div></div>
</div>
```
展开态类 `is-open`；ui.js 委托点击切换（`aria-expanded` 同步）；收起时 `collapse__inner` 加 `inert`（内容不可聚焦）。grid-rows 动画 320ms。周食谱、长说明用它。

### Back Link 与面包屑

```html
<a class="back-link" href="forum.html"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-arrow-left"></use></svg>返回论坛</a>
<nav class="breadcrumb" aria-label="面包屑"><a href="shops.html">必吃榜</a><svg class="icon icon--sm">chevron-right</svg><span>{{店铺名}}</span></nav>
```
详情页二选一：单级返回用 back-link；两级以上用面包屑。

### Load More 加载更多

```html
<div class="load-more"><button type="button" class="btn">加载更多</button><span>已显示 20 / 48</span></div>
```
全部加载完 → 只留 `<span>已显示全部</span>`。每次 20 条（`UI.config.pageSize`）。

### Site Footer 页脚

由 ui.js 生成（`<div id="siteFooter"></div>` 占位）：品牌行 + 链接（关于我们/更新公告/提交工单）+ 版权行（AGPL-3.0）。应用壳自动不渲染。

### Filter Bar 筛选条

`<div class="filter-bar">`（横向滚动、隐藏滚动条）内放 `.chip` 群（首项「全部」）。用于店铺类型、消息类型筛选；选中态由 radio checked 驱动。

### A–Z Rail 字母索引

```html
<nav class="az-rail" aria-label="字母索引">
  <a href="#g-b" class="{{'is-active' 若当前组}}">B</a>
  <a class="is-empty">C</a>   <!-- 无数据的字母：非链接 -->
</nav>
```
右缘竖排胶囊浮层（毛玻璃）；每项 ≥24px；当前项黛青实底。仅桌面/平板显示有意义的字母；缺 `initial` 数据时整个隐藏。配合 `.az-group`（标题 `.az-group__letter` 大字母 + 计数 + 右延伸线）与 `.az-layout/.az-list`（右内边距 28px 防遮挡）。

---

# 领域组件

### Post 帖子卡

```html
<article class="card card--interactive post">
  <header class="post__head">
    {{UI.userLine(user, {meta: UI.timeEl(p.created_at)})}}
    <span class="tag tag--primary">讨论</span>
    <button class="icon-btn icon-btn--sm card__action" aria-label="更多操作" data-menu-trigger>…</button>  <!-- 仅作者/管理员 -->
  </header>
  <h3 class="post__title"><a class="card__link" href="post.html?id={{p.id}}">{{p.title}}</a></h3>
  <p class="post__excerpt">{{p.content}}</p>
  <footer class="post__foot">
    <button type="button" class="action-btn card__action" aria-pressed="{{is_liked}}" data-like>{{heart icon}}<span>{{like_count}}</span></button>
    <button type="button" class="action-btn card__action" aria-expanded="false" data-replies-toggle>{{message icon}}<span>{{reply_count}}</span></button>
  </footer>
  <div class="post__replies" hidden>…reply-list + composer…</div>
</article>
```
摘要 3 行截断；`post__foot` 左右贯通（负外边距对齐卡片内边距）。整卡点击进详情（card__link），点赞/回复/菜单在 `card__action` 层。

### Reply 回复

```html
<li class="reply" id="reply-{{r.id}}">
  {{avatar sm}}
  <div class="reply__body">
    <div class="reply__meta"><span class="user-line__name">{{name}}</span>{{titleBadge}}{{roleTag}}<span>{{UI.timeEl}}</span><span class="reply__floor">{{n}} 楼</span></div>
    <div class="reply__content">{{content}}</div>
    <div class="reply__actions">…（预留：删除）</div>
  </div>
</li>
```
容器 `.reply-list`（间距 20）；hash 定位 `#reply-{{id}}` 时琥珀高亮（CSS `:target` 已内置）；楼层号右侧灰。**回复只支持平铺一层**。

### Composer 发布框

```html
<form class="composer">
  <textarea class="textarea" data-counter="1000" placeholder="写下你的回复…"></textarea>
  <div class="composer__foot"><span class="field__counter"></span><button type="button" class="btn btn--primary btn--sm">发布回复</button></div>
</form>
```
未登录替换为 callout（登录引导）。发帖用对话框承载，不用 composer 常驻。

### Action Button 操作按钮

```html
<button type="button" class="action-btn" aria-pressed="false">heart 图标 <span>12</span></button>
```
胶囊 36 高；按压态（`aria-pressed="true"`）红色实心心形；展开态（回复区开）黛青浅底；弹跳动画 `is-popping`（点赞瞬间加一次）；触屏 44。

### Review Card 评价卡

见样张「现有评价卡」：`card--flush card--interactive review-card` + `card__media`（无图用 `dish__placeholder`）+ `review-card__body`（名称+stars、文本 4 行截断）+ `review-card__foot`（user-line xs）。

### Dish Card 菜品卡 / Dish Row 菜品行

```html
<article class="card card--flush card--interactive dish">
  <div class="dish__media">{{img 或 dish__placeholder}}</div>
  <div class="dish__body">
    <h3 class="dish__name"><a class="card__link" href="dish.html?id={{id}}">{{name}}</a></h3>
    <div class="rating-line">{{UI.stars(4.6)}}<span class="rating-line__num">4.6</span><span>(23)</span></div>
    <span class="dish__meta">{{店铺名}}</span>
  </div>
</article>

<li class="dish-row">
  <span class="dish-row__thumb">{{img 或占位}}</span>
  <div class="dish-row__main"><span class="dish-row__name"><a href="dish.html?id={{id}}">{{name}}</a></span><span class="dish-row__meta">{{stars}} · {{n}} 条评价</span></div>
  <svg class="icon icon--sm">chevron-right</svg>
</li>
```
卡用于网格（店铺详情菜品区）、行用于目录（A–Z）。占位底色：按店铺类型/名称 `UI.hueFor` 取 tint。

### Shop Card 店铺卡

```html
<article class="card card--interactive shop">
  <div class="shop__top"><span class="rank rank--top">1</span><h3 class="card__title"><a class="card__link" href="shop.html?id={{id}}">{{name}}</a></h3><span class="tag" data-hue="teal">面馆</span></div>
  <p class="shop__addr">map-pin 图标<span>{{address}}<small>{{location_note}}</small></span></p>
  <div class="shop__stats"><span class="stat">route 图标<b>420 米</b><small>距苏中</small></span><span class="stat">walk 图标<b>6 分钟</b><small>步行</small></span></div>
</article>
```
`shop__stats` 顶部分割线 + `margin-top:auto`（卡片等高时统计贴底）；rank 仅综合排序显示。

### Shop Hero 店铺头部

```html
<div class="card shop-hero">
  <div class="tag" data-hue="teal">面馆</div>
  <h1 class="shop-hero__title">{{name}}</h1>
  <div class="shop-hero__line">map-pin 图标<span>{{address}}<small>{{location_note}}</small></span></div>
  <div class="shop-hero__stats">
    <div class="stat-block"><span class="stat-block__num">420<small>米</small></span><span class="stat-block__label">route 图标 距苏州中学</span></div>
    <div class="stat-block"><span class="stat-block__num">6<small>分钟</small></span><span class="stat-block__label">walk 图标 预计步行</span></div>
  </div>
</div>
```
数字 24px 粗、单位小字；下分割线；布局切换控件（segmented）放卡片右上角。

### Review 评价

```html
<div class="review">
  <div class="review__head">{{UI.userLine(user, {meta})}}{{UI.stars(r)}}</div>
  <p class="review__dish">点了：{{dish}}</p>   <!-- 可选 -->
  <p class="review__text">{{content}}</p>
  <div class="thumbs">{{thumb…}}</div>
</div>
```
列表内上下分割线（自动）；文本 1.7 行高。

### Message 消息条目

```html
<li class="msg is-unread" data-hue="{{消息类型色}}">
  <a class="msg__link" href="{{target.url}}">
    <span class="msg__lead">{{actor avatar}}<span class="msg__kind">{{类型小图标}}</span></span>
    <span class="msg__main">
      <span class="msg__text"><b>{{actor}}</b> 回复了你的评论</span>
      <span class="msg__quote">{{引用片段}}</span>       <!-- 评论/回复类 -->
      <span class="msg__title">{{系统消息标题}}</span>   <!-- 系统类 -->
      <span class="msg__time">{{UI.timeEl}}</span>
    </span>
    <span class="msg__dot" aria-label="未读"></span>
  </a>
</li>
```
未读 = 黛青浅底 + 红点（is-unread）；系统类不用头像，用 `msg__icon`（megaphone 等）；kind 小徽章指明类型（评论 message 青 / 点赞 heart 朱 / 系统 megaphone 赭黄）。**点击即已读**（页面脚本）。

### Hero 首页主视觉

```html
<section class="hero">
  <svg class="hero__mark" aria-hidden="true"><use href="img/icons.svg#brand-glyph"></use></svg>
  <div class="hero__inner">
    <span class="hero__eyebrow">苏州中学 · 三元坊</span>
    <h1 class="hero__title">校园里的信息，<br>收进一个干净的地方</h1>
    <p class="hero__lead">校园地图、论坛、食堂菜谱、三元坊必吃榜——少一点打扰，多一点有用的内容。</p>
    <div class="hero__actions"><a class="btn btn--primary btn--lg" href="map.html">map 图标 打开校园地图</a><a class="btn btn--lg" href="forum.html">逛逛论坛</a></div>
  </div>
</section>
```
黛青渐变浅底、右上 12% 透明度印章水印（brand-glyph）、眉标带朱红短划。字阶：手机 30 / ≥768 40 / ≥1100 52。

### Tile 入口方块

```html
<article class="card card--interactive tile" data-hue="teal">
  <span class="tile__icon">map 图标 icon--lg</span>
  <h2 class="tile__title"><a class="card__link" href="map.html">校园地图</a><svg class="icon">arrow-right</svg></h2>
  <p class="tile__desc">探索校园，点击地点查看介绍</p>
</article>
```
图标 44 圆角 10 tint 底；hover 箭头右移 3px 变黛青。

### Master-Detail 主从视图

```html
<div class="master-detail">
  <div class="master-list" role="list">
    <button type="button" class="master-item" aria-current="true">
      <span class="master-item__date">2026-10-01 <span class="tag tag--primary">最新</span></span>
      <span class="master-item__title">{{标题}}</span>
    </button>
  </div>
  <article class="detail-pane">
    <h2 class="detail-pane__title">{{标题}}</h2>
    <div class="detail-pane__meta">calendar 图标 发布于 2026-10-01</div>
    <div class="prose">{{正文}}</div>
  </article>
</div>
```
≥900 双列（列表 20rem sticky）；<900 单列二选一：容器加 `is-detail` 显示详情（隐藏列表），否则显示列表。当前项左侧 3px 黛青竖条。

### Queue Item 待办项

```html
<article class="card queue-item">
  <div class="queue-item__main">
    <div class="queue-item__title">{{主标题}}<span class="badge badge--pending">待批复</span></div>
    <div class="queue-item__fields"><span><b>新生号</b>20260312</span>…</div>
    <div class="queue-item__meta">提交于 10 分钟前</div>
  </div>
  <div class="queue-item__actions"><button class="btn btn--primary btn--sm">通过</button><button class="btn btn--sm">拒绝</button></div>
  <div class="queue-item__reply">…批复内容…</div>   <!-- 可选，全宽 -->
</article>
```
左信息右操作（<520 操作换行到下方）；`queue-item__fields` 的 `<b>` 是字段名（灰色常规字重）。

### Viewer 图片查看器

`UI.viewer.open(url, caption)` 全权管理（页面禁止自建）。全屏黑底（`--viewer-bg`）、中置图片（96vw/82vh 内、圆角 10）、顶部标题居中、右上关闭、底部胶囊工具条（缩小/百分比/放大/适应屏幕）。交互：滚轮/双指缩放 50%–800%、拖动平移（>100% 才可）、双击 100%↔250%、空白单击关闭、`+ - 0` 键盘。字号百分比 `aria-live=polite`。

### Map Controls 地图控件

校园地图的当前规范见 [pages/map.md](./pages/map.md)。`public/css/map.css` 为页面专用样式，不影响必吃榜地图。

- `.campus-search` + `.campus-filters`：关键词与分类联合过滤，按钮 `aria-pressed`，数量 `role=status`；无结果可重置。
- `.campus-place-row`：SVG 缩略图、名称、分类或别名；选中背景和左侧细线同时提示状态。
- 单一地图无需视图切换器；旧楼层图及相关前端控件已移除。
- `.campus-controls`：放大、缩小、回到全景；地图画布形成独立层叠上下文，不能覆盖这些按钮或详情。
- `.campus-detail`：插画、分类、名称、说明、位置，带关闭按钮；打开后焦点进入标题，关闭后返回来源。
- `.campus-places-panel`：桌面独立滚动，手机可折叠；`placesToggle` 的 `aria-expanded` 与显示状态一致。
- `.campus-map-place`：SVG 地点组可点击与键盘激活；非搜索结果淡化、退出焦点顺序。标签随缩放调整以保证全景可读。地点可指定独立 `height`，篮球场和操场使用大面积场地插画。
- 普通滚轮/双指滚动双轴平移，捏合或 Ctrl / ⌘ + 滚轮围绕指针连续缩放；Safari 手势期间抑制重复滚轮事件。自由平移配合全景复位，避免固定边界导致宽屏回弹。Leaflet 公共皮肤仍在 `site.css`。
