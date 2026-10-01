# 三元坊必吃榜 · shops.md（#6：shops.html 与 shop-new.html）

> 状态：新功能 ｜ 优先级：P1 ｜ issue：#6（#7/#8 依赖）｜ 依赖：阶段 0；#6 数据与接口 ｜ 壳：默认 ｜ data-nav：`shops` ｜ 容器：`container` / `container--form`

## 需求对照表（PLAN #6 → 本文档）

| 需求 | 满足位置 |
| --- | --- |
| 店铺字段（必填：名称/地址/类型/距离/步行） | §4 添加店铺表单 |
| 选填：补充位置描述 | §4 |
| 预设类型 + 其他/自定义 | §4 类型 |
| 上传权限（最低角色 + 后端再校验） | §1 权限；§5 边界 |
| 地图查询后录入距离/步行 | §4 提示 |
| 店铺列表五要素展示 + 整卡可点 | §3 店铺卡 |
| 手机/电脑适配 | §6 响应式 |

## 用途与目标

为「三元坊必吃榜」提供浏览列表页 shops.html 与添加店铺页 shop-new.html；覆盖 PLAN #6 全部需求与验收标准。

新页面：无旧代码钩子，「JS 钩子清单 / 需要修改的脚本行为」不适用；状态与文案在各节内给出。

## 1. shops.html · 列表页

### 1.1 page-head

```html
<div class="page-head">
  <div class="page-head__main">
    <span class="page-head__eyebrow">Sanyuanfang · Must-Eat</span>
    <h1 class="page-head__title">三元坊必吃榜</h1>
    <p class="page-head__desc">同学们推荐的学校周边美食，距离和步行时间以高德/百度步行路线为准。</p>
  </div>
  <div class="page-head__actions" id="createAction"></div>
</div>
```

`createAction` 由脚本按权限填充（§1.4）。

### 1.2 筛选与排序

```html
<div class="row row--between" style="margin-bottom:var(--sp-5)">
  <div class="filter-bar" role="group" aria-label="店铺类型筛选">
    <label class="chip"><input class="chip__input" type="radio" name="type" value="" checked><span class="chip__face">全部</span></label>
    <label class="chip"><input class="chip__input" type="radio" name="type" value="面馆"><span class="chip__face">面馆</span></label>
    <!-- 小吃/饮品/快餐/甜点/正餐/其他：value=其它/自定义 时 value="其他" -->
  </div>
  <div class="row row--sm">
    <label class="u-fs-sm u-muted" for="sortSelect">排序</label>
    <select class="select select--sm" id="sortSelect" aria-label="排序">
      <option value="distance">距离最近</option>
      <option value="walk">步行最短</option>
      <option value="new">最新添加</option>
    </select>
  </div>
</div>
```

- 筛选/排序写入 URL：`?type=面馆&sort=walk`（`history.replaceState`）；载入读取，非法值回退默认（全部 / distance）。
- 排序实现：distance = `distance_m` 升序；walk = `walk_min` 升序；new = `created_at` 降序；tie-break id。**榜单序号 `.rank` 仅在 `sort=rank` 或接口提供 `rank` 字段时显示**（默认无 rank 字段则不显示）。

### 1.3 店铺卡（整卡可点）

```js
function shopCard(s) {
  return '<article class="card card--interactive shop">' +
    '<div class="shop__top">' +
      (s.rank ? '<span class="rank' + (s.rank <= 3 ? ' rank--top' : '') + '">' + s.rank + '</span>' : '') +
      '<h2 class="card__title"><a class="card__link" href="shop.html?id=' + s.id + '">' + UI.esc(s.name) + '</a></h2>' +
      '<span class="tag" data-hue="' + typeHue(s.type) + '">' + UI.esc(s.type) + '</span>' +
    '</div>' +
    '<p class="shop__addr">' + UI.icon('map-pin') + '<span>' + UI.esc(s.address) + (s.location_note ? '<small>' + UI.esc(s.location_note) + '</small>' : '') + '</span></p>' +
    '<div class="shop__stats">' +
      '<span class="stat">' + UI.icon('route') + '<b>' + UI.esc(UI.formatDistance(s.distance_m)) + '</b><small>距苏中</small></span>' +
      '<span class="stat">' + UI.icon('walk') + '<b>' + UI.esc(UI.formatMinutes(s.walk_min)) + '</b><small>步行</small></span>' +
      (s.rating_avg !== undefined ? '<span class="stat">' + UI.stars(s.rating_avg) + '</span>' : '') +
    '</div></article>';
}
```
`typeHue`：固定映射（面馆 teal / 小吃 ochre / 饮品 wisteria / 快餐 indigo / 甜点 rose / 正餐 vermilion / 其它 stone）——写在页面脚本顶部常量；自定义类型 → stone。

### 1.4 权限与创建入口

| 访问者 | createAction |
| --- | --- |
| guest | 空（列表页不显示登录引导；浏览无需登录） |
| user（未达 student） | 空（不上传流程给普通用户；**不在列表页放认证引导**，避免干扰浏览） |
| student 及以上（或有对应显式权限） | `<a class="btn btn--primary" href="shop-new.html">add 图标 添加店铺</a>` |

后端必须再校验（PUT 前后端一致：`UI.config.shopCreateMinRole`）。〔待产品确认：是否允许 user 上传；默认 student〕

### 1.5 列表状态

- 骨架：`UI.html.skeleton('card', 6)`（网格中）。
- 空：`UI.html.empty({icon:'store', title:'三元坊还没有店铺', desc:'第一个推荐周边美食的人就是你。', actions: 有权限 ? [添加店铺] : []})`。
- 失败：loadError + 重试。
- 加载更多：20/批（`已显示 X / Y`）。
- 类型筛选空结果：`empty`（icon 'filter'，title「没有{{类型}}类的店铺」，desc「换个分类看看，或切换回全部。」，action「查看全部」重置筛选）。

## 2. shops.html 页面骨架（简）

同标准页面模板：`data-nav="shops"`、`container`、main 内 = page-head + 筛选排序行 + `<div class="grid" id="shopGrid">` + loadMore。数据源 `GET /api/shops`（建议路径）。

## 3. shop-new.html · 添加店铺

### 3.1 布局

```text
手机 360                     桌面 1280
┌──────────────────┐   ┌──────────────────────────────┐
│ ← 返回必吃榜       │   │ ← 返回必吃榜                    │
│ 添加店铺           │   │   添加店铺（576px 卡）           │
│ 名称 ____        │   │   名称 ____                     │
│ 地址 ____ (提示)  │   │   地址 ____                      │
│ 补充描述 ____     │   │   补充描述 ____                   │
│ 类型 [面馆][小吃]… │   │   类型 chips + 其他→输入框         │
│ 距离 ____ 米      │   │   距离 ____ 米 / 步行 ____ 分钟    │
│ 步行 ____ 分钟    │   │   [保存]（sticky 底栏）           │
│ [保存]           │   └──────────────────────────────┘
└──────────────────┘
```

### 3.2 HTML 骨架

```html
<main id="main" class="main container container--form">
  <a class="back-link" href="shops.html"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-arrow-left"></use></svg>返回必吃榜</a>
  <h1 class="page-head__title" style="font-size:var(--fs-2xl)">添加店铺</h1>
  <form id="shopForm" class="form form__group" novalidate>
    <div class="field">
      <label class="field__label" for="sName">店铺名称</label>
      <input class="input" id="sName" data-counter="30" enterkeyhint="next">
      <div class="field__foot"><span class="field__hint"></span><span class="field__counter"></span></div>
    </div>
    <div class="field">
      <label class="field__label" for="sAddr">店铺地址</label>
      <input class="input" id="sAddr" placeholder="例如：三元路 12 号" enterkeyhint="next">
      <div class="field__hint">需要包含「XX路XX号」，例如三元路 12 号</div>
    </div>
    <div class="field">
      <label class="field__label" for="sNote">补充位置描述 <span class="field__opt">（选填）</span></label>
      <input class="input" id="sNote" data-counter="40" placeholder="例如：XX路口的XX" enterkeyhint="next">
    </div>
    <div class="field">
      <span class="field__label" id="typeLabel">店铺类型</span>
      <div class="chips" role="radiogroup" aria-labelledby="typeLabel">
        <!-- 6 个预设 chip（radio name=shopType value=面馆…）+ 其他 -->
        <label class="chip"><input class="chip__input" type="radio" name="shopType" value="__other"><span class="chip__face"><svg class="icon icon--sm" aria-hidden="true"><use href="img/icons.svg#i-plus"></use></svg>其他 / 自定义</span></label>
      </div>
      <input class="input" id="customType" data-counter="8" placeholder="自定义类型，8 字以内" hidden aria-label="自定义店铺类型">
    </div>
    <div class="form-grid form-grid--2">
      <div class="field">
        <label class="field__label" for="sDist">距离苏州中学</label>
        <div class="input-group"><input class="input input--unit" id="sDist" type="number" min="1" max="20000" step="1" inputmode="numeric" enterkeyhint="next"><span class="input-group__unit">米</span></div>
        <div class="field__hint">在高德或百度地图用步行路线查询后填写</div>
      </div>
      <div class="field">
        <label class="field__label" for="sWalk">预计步行时间</label>
        <div class="input-group"><input class="input input--unit" id="sWalk" type="number" min="1" max="240" step="1" inputmode="numeric" enterkeyhint="done"><span class="input-group__unit">分钟</span></div>
      </div>
    </div>
    <div class="form__actions form__actions--sticky">
      <button type="submit" class="btn btn--primary btn--lg" id="shopSubmit">保存</button>
    </div>
  </form>
</main>
```

### 3.3 校验与提交

```js
// 类型取值：chip radio；__other 时取 customType 输入（trim，1–8 字）
// 校验顺序：名称(必填,≤30) → 地址(必填, /^.+路.+号/) → 补充(≤40) → 类型(必选；other 时自定义 1–8 字) → 距离(1–20000 整数) → 步行(1–240 整数)
// 错误文案（内联）：
//  「请输入店铺名称」「店铺名称不能超过 30 字」
//  「请输入店铺地址」「地址格式应包含「XX路XX号」」
//  「请选择店铺类型」「请输入自定义类型（8 字以内）」
//  「请输入距离（1–20000 米）」「请输入步行时间（1–240 分钟）」
// 提交：UI.form.busy → POST /api/shops（建议路径）
//   201 → toast「已添加」→ location.href = 'shop.html?id=' + data.shop.id
//   409（重复）→ 内联错误于名称字段：「已有同名店铺」+ 返回体带 existing id 时在错误下附链接（UI 渲染：'<a href="shop.html?id='+id+'">查看已有店铺</a>'）
//   403 → toast「你没有权限添加店铺」
//   422 类校验错误 → 字段内联（后端 message 中文直显）
UI.guardUnsaved(document.getElementById("shopForm"));
```

### 3.4 权限

- 脚本开头：`if (!UI.session.can('shop_create', UI.config.shopCreateMinRole))` → 整页 `UI.html.empty({tone:'lock', icon:'lock', title:'需要学生认证', desc:'认证为学生后才能添加店铺，只需一分钟。', actions:[{label:'去认证', primary:true, href:'student_verify.html'},{label:'返回必吃榜', href:'shops.html'}]})`（替换 main 内容）。
- 无 token → `UI.goLogin()`。

## 4. 数据契约

`POST /api/shops`（建议）body：`{name, address, location_note?, type, distance_m, walk_min}` → 201 `{shop:{id,…}}`；409 `{error, existing_id}`（若无 existing_id 则仅文案）。`GET /api/shops` → `{shops:[{id,name,address,location_note?,type,distance_m,walk_min,created_at,rank?,rating_avg?}]}`。字段缺失回退：rank 缺→不显示序号；rating_avg 缺→不显示星。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 列表加载中/空/失败 | §1.5 | 骨架 / empty（store）/ loadError |
| 筛选无结果 | 类型下 0 家 | empty（filter）「没有X类的店铺」+ 查看全部 |
| 创建入口 | §1.4 | guest/user 无按钮；student 及以上见「添加店铺」 |
| 添加页无权限 | §3.4 | 整页 empty--lock |
| 表单校验失败 | §3.3 | 内联错误 + 聚焦首个 |
| 409 重复店铺 | 提交 | 名称字段错误 + 查看已有店铺链接 |
| 提交成功 | 201 | toast「已添加」→ shop.html?id= |
| 离开未保存 | beforeunload | UI.guardUnsaved 拦截 |
| 限流 / 离线 | — | copy.md §6 / 顶部黄条 |

## 5. 边界场景

- 双击提交 → busy 防重；成功前二次点击无效。
- 提交中断网 → toast 网络文案；表单内容保留（不清空）；离开有 guardUnsaved。
- 名称/类型含特殊字符 → esc 渲染。
- 距离=0 → 输入校验拦（min=1）；若后端出现 0 → 显示「0 米 · 校内」（scenarios §8.10）。
- 类型列表后端可扩展 → 前端 chips 由常量渲染，后端未知类型显示 stone 色 tag 原文。
- 自定义类型超 8 字 → 计数红 + 提交拦。
- URL ?type=非法值 → 回退全部。
- 手机键盘遮挡提交 → sticky 底栏 + safe-bottom。

## 6. 响应式

- 360：表单单列；chips 换行；sticky 保存栏。
- 768：距离/步行双列（form-grid--2 ≥640）。
- 列表：360 一列 / 768 两列 / 1100 三列（`grid` auto-fill 16rem）。

## 7. 无障碍

- chips radiogroup + aria-labelledby；自定义类型 input 有 aria-label；sticky 保存栏不遮内容（form 有 padding-bottom）；错误内联 + focusFirstInvalid。
- 排序 select 有可见 label（「排序」）。

## 8. 验收清单

- [ ] 列表：骨架/空/失败/分批；筛选与排序 + URL 同步 + 非法回退。
- [ ] 店铺卡五要素 + 整卡可点 + 类型色正确；rank 规则正确。
- [ ] 权限：student 可见入口；user/guest 不可见；后端 403 有文案。
- [ ] 添加页全字段校验（含地址正则、数字范围、自定义类型）；409 处理。
- [ ] 未保存离开提醒；提交 busy；成功跳详情。
- [ ] 360/1280 正常；axe=0；控制台零报错。
