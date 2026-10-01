# 全部菜品 · dishes.md（#5）

> 状态：新功能 ｜ 优先级：P1 ｜ issue：#5（#8 依赖）｜ 依赖：阶段 0；#5 数据与接口 ｜ 落点：recipe.html 第一个 Tab 的目录形态 + 新页 dish.html

## 需求对照表（PLAN #5 → 本文档）

| 需求 | 满足位置 |
| --- | --- |
| 建立全部菜品页面 | recipe.html「全部菜品」Tab（目录形态）+ dish.html 详情 |
| 按菜品名称 A–Z 排序 | §3 排序与分组 |
| 支持关键词搜索 | §4 搜索 |
| 数据来源及存储格式 | §2 数据契约 |
| Python 预处理 | §2（产出 initial；环境说明属后端文档，UI 不涉） |
| 无搜索结果提示 | §4.4 |
| 手机/电脑适配 | §7 响应式 |

## 用途与目标

把 recipe.html 的「全部菜品」从评价卡网格升级为带搜索与 A–Z 分组的菜品目录，并提供菜品详情页 dish.html；覆盖 PLAN #5 全部需求与验收标准。

新页面：无旧代码钩子，「JS 钩子清单 / 需要修改的脚本行为」不适用；交互与状态在各节内给出。

## 布局（要点）与 HTML 骨架

- 目录 = recipe.html Tab 内：page-head + 吸顶搜索条（§4.1）+ A–Z 分组列表（§3）+ 右缘字母索引（§5）；dish.html 线框见 §6。
- 各区块骨架直接组装进 recipe.md 的标准页面模板（data-nav="recipe"、container）。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 加载中 | 首次/切搜索 | dish-row 骨架 ×3（`UI.html.skeleton('row',3)`） |
| 空目录 | 0 菜品 | empty（utensils）「还没有菜品目录」/「等第一道菜被上传或评价后出现在这里。」 |
| 搜索无结果 | §4.4 | empty「没有找到「q」」+ 清除搜索 |
| 加载失败 | 网络 | loadError + 重试 |
| 缺 initial | 数据回退 | 不分组、隐藏索引（§2） |
| 详情 404 | dish.html id 无效 | empty「菜品不存在或已被删除」+ 返回菜谱 |
| 未开放 | features.dishes=false | system-pages §8.1 未开放态 |

## 1. 两种形态与开关

- `UI.config.features.dishes === false`（#5 未上线）：recipe.html「全部菜品」= P0 评价卡网格（见 recipe.md）。
- `=== true`：recipe.html「全部菜品」Tab 渲染**目录**（本文）；评价卡网格移入 dish.html。
- 落地步骤（UI 侧）：在 recipe.html 脚本加 `if (UI.config.features.dishes) { 目录渲染 } else { 评价卡渲染 }`；dish.html 仅在开关 true 后可访问（否则走 system-pages §8.1 的未开放态）。

## 2. 数据契约

`GET /api/dishes`（建议路径 〔接口以实现为准〕）返回：

```json
{ "dishes": [ { "id": 12, "name": "红烧牛腩面", "initial": "H", "image_url": "/uploads/x.jpg", "rating_avg": 4.6, "review_count": 23, "shops": [{ "id": 3, "name": "老字号朱氏面馆" }] } ] }
```

| 字段 | 缺失时回退 |
| --- | --- |
| `initial` | 不分组：仅按 `Intl.Collator('zh-Hans-CN-u-co-pinyin')` 排序并**隐藏字母索引**（`az-rail` 不渲染） |
| `image_url` | 分类色占位（`dish__placeholder`，hue 按 `UI.hueFor(id)`） |
| `rating_avg` | 不显示评分行（只显示「N 条评价」或「暂无评价」） |
| `review_count` | 显示「暂无评价」 |
| `shops` | dish.html 不显示「在哪些店铺」行 |

`initial` 规则（后端 Python 产出）：英数字取首字母大写；中文按拼音首字母；非 A–Z 一律 `#`。

## 3. 排序与分组

- 分组键序列：`A→Z`，`#` 在最后。
- 组内排序：`Intl.Collator('zh-Hans-CN-u-co-pinyin').compare(name)`，同名按 id。
- 组标题：`<h2 class="az-group__letter">B<span class="az-group__count">2 道</span></h2>`（计数 = 该组菜品数）。
- 分组容器：

```html
<section class="az-group" id="g-b">
  <h2 class="az-group__letter">B<span class="az-group__count">2 道</span></h2>
  <div class="card card--flush"><ul class="dish-list">{{dish-row…}}</ul></div>
</section>
```

## 4. 搜索

### 4.1 骨架

```html
<div class="search-bar">
  <div class="input-group">
    <span class="input-group__icon"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-search"></use></svg></span>
    <input class="input input--icon input--end" type="search" id="dishSearch" placeholder="搜索菜品…" aria-label="搜索菜品" enterkeyhint="search">
    <span class="input-group__end" id="searchClear" hidden><button type="button" class="icon-btn icon-btn--sm" aria-label="清除搜索"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-close"></use></svg></button></span>
  </div>
  <span class="sr-only" aria-live="polite" id="searchLive"></span>
</div>
```

### 4.2 行为

- 输入防抖 250ms（`UI.debounce`）；`compositionstart/compositionend` 期间不触发。
- 匹配：`name.includes(q)`（大小写不敏感：两侧 toLowerCase 比较）；后端若提供拼音字段则同时匹配（以实现为准）。
- 命中词高亮：`<mark class="hl">`——渲染时对匹配段做替换（先 esc 再替换，注意对 esc 后文本做替换时关键词也要 esc）。
- 清除按钮：有输入时显示；点击清空并恢复全量、焦点回输入框。
- URL 同步：`?q=<关键词>`（`history.replaceState`）；载入时读取并回填。
- 结果播报：`searchLive.textContent = '找到 N 道菜品'`。

### 4.3 搜索结果呈现

命中时仍按 A–Z 分组（命中项的组）+ 索引条；单组时可省略组标题（仅一组且命中 >0 时显示组标题亦可，统一保留组标题）。

### 4.4 无结果

```js
UI.html.empty({ icon: "search", title: "没有找到「" + q + "」", desc: "换个关键词试试，或清除搜索查看全部。", actions: [{ label: "清除搜索", id: "clearSearch" }] })
```

## 5. 菜品行 / 菜品卡

- 目录用 **dish-row**（紧凑列表，见 components.md「Dish Row」）：缩略 56px（无图占位）+ 名称（命中高亮）+ meta（`UI.stars(avg)` + `N 条评价`）+ chevron。
- 名称链接 → `dish.html?id={{id}}`；行本身不做整行可点（名称链接即可，行 hover 灰底）。
- #8 后 dish-row 可显示所属店铺：meta 追加 `· {{shop.name}}`（取 shops[0]）。

## 6. dish.html（菜品详情，〔待产品确认〕推荐形态）

```text
手机 360                     桌面 1280
┌──────────────────┐   ┌──────────────────────────────┐
│ ← 返回菜谱         │   │ ← 返回菜谱                      │
│ ┌──────────────┐ │   │ ┌──────────┬─────────────────┐│
│ │ [封面 4:3]     │ │   │ │ [封面]    │ 红烧牛腩面  H     ││
│ │ 红烧牛腩面     │ │   │ │          │ 4.6 星 · 23 条评价  ││
│ │ 4.6 星 · 23 条  │ │   │ │          │ 老字号朱氏面馆 →   ││
│ │ 在售店铺：…→   │ │   │ │          └─────────────────┘│
│ ├──────────────┤ │   │ │ 评价（review 列表）            │
│ │ 评价          │ │   │ │ [写评价]                      │
│ │ review…      │ │   │ └──────────────────────────────┘
│ │ [写评价]      │ │   └──────────────────────────────┘
└──────────────────┘
```

- 结构：`container--prose`；返回 `dish.html` ← `recipe.html`；h1=菜名（page-head 或卡内）；封面 `.card__media`（无图占位）；统计行 `rating-line`；「在售店铺」= `.row` 内店铺链接（`.tag tag--outline` 或纯链接）。
- 评价列表 = `.review`（`.review__head` user-line + stars；`.review__text`；`.thumbs`）。评价源：`GET /api/dishes/:id/reviews`（建议路径）或 recipes 过滤（以实现为准）。
- 「写评价」= recipe.md 的对话框复用（菜名预填且锁定；无菜名输入）。入口：page-head 右侧 primary「写评价」；未登录/无权限规则同 recipe.md。
- 空评价：empty「暂无评价」「还没有人评价这道菜，来写第一条吧。」+ 写评价。
- 404：empty「菜品不存在或已被删除」+ 返回菜谱。

## 7. 响应式

- 360：dish-row 全宽；索引条贴右缘（`az-rail` fixed right 4px）；列表右内边距 28px 防遮挡。
- 768：目录仍单列（行式列表优于网格）。
- 1100：`az-rail` 外移到容器右外侧（CSS 已内置）。
- dish.html：768+ 双列（封面 5fr / 内容 7fr——用 `.shop-layout--split` 同款 grid：`grid-template-columns: minmax(0,5fr) minmax(0,7fr)`；直接复用 `shop-layout--split` 类）。

## 8. 边界场景

- 1000+ 菜品 → 分组后一次渲染可接受（<1500 DOM 节点）；索引条 `overflow-y:auto`（CSS 已设 max-height）。
- 全部命中同一字母 → 单组。
- q 含正则特殊字符 → 用 includes（非正则）无风险。
- initial 为小写/多字符 → `toUpperCase()[0]` 规范化后再分组。
- 搜索时 ABORT：切关键词 abort 旧请求（forum.md 同款 controller）。
- dish.html 被分享（无登录）→ 可读；写评价引导登录。

## 9. 无障碍

- 索引条 `aria-label="字母索引"`；无数据字母非链接（`is-empty` 无 href）；当前组 `is-active` 由 scrollSpy 维护（`UI.scrollSpy(list, groups, {offset:140})`）。
- 搜索框 aria-label；结果播报 aria-live。
- 组标题 h2；菜品名内链接文本完整（含 mark）。

## 10. 验收清单

- [ ] A–Z 分组正确（# 在最后）；组内拼音序。
- [ ] 搜索：防抖、IME、高亮、清除、URL 同步、结果播报、无结果空态。
- [ ] 缺 initial 时回退（不分组、隐藏索引）。
- [ ] dish.html：封面/统计/店铺/评价/写评价/404。
- [ ] 360/1280 正常；索引不遮挡内容；axe=0。
