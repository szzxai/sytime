# 校园地图 · map.html

> 2026-10-09 配套编辑器说明：`../szzx-mapeditor` 已同步当前地图数据并修复离线编辑流程。本站继续使用现有 Leaflet 渲染器，支持基本几何、楼层、弹窗、分类配色及基础线型；编辑器单独颜色、分段边线、字体样式与手动层级当前不在本站显示。详见根目录 [MAP.md](../../../MAP.md#721-配套离线地图编辑器) 及 [编辑器项目地图](../../../../szzx-mapeditor/MAP.md)。本次没有改动本页生产代码，原验收记录保持历史口径。

> 状态：现有改版 ｜ 优先级：P0 ｜ issue：#4 ｜ 依赖：阶段 0 ｜ 壳：**应用**（`data-shell="app"` + `data-page="map"`）｜ data-nav：`map` ｜ 容器：全屏

> 本页方案已在真实浏览器验证过（测试页结构、弹窗参数、fitBounds、minZoom=-2）。改动同时涉及 `data.json`。

## 用途与目标

全屏 Leaflet 地图（CRS.Simple 自绘平面图），楼层 1F–4F 切换、缩放/平移（滚轮/拖拽/WASD/方向键/双指）、建筑弹窗（有权限者可编辑弹窗文本）。页头保留（可收起导航的手机端有抽屉），地图画布占据其余全部高度。页头折叠功能取消（navCollapsed 废弃）。

## 布局

```text
桌面 1280                       手机 390
┌────────────────────────┐    ┌──────────────────┐
│ 页头（横幅之上可能还有横幅）  │    │ 页头（含抽屉按钮）    │
├────────────────────────┤    ├──────────────────┤
│              ┌────┐    │    │            ┌───┐ │
│              │楼层 │    │    │            │楼层│ │
│              │ 4F │    │    │  地图画布   │ 4F│ │
│    地图画布   │ 3F │    │    │            │…  │ │
│              │ 2F │    │    │            │ 1F│ │
│              │ 1F●│    │    │ ┌────┐     └───┘ │
│              └────┘    │    │ │弹窗│            │
│ (?)                     │    │ └────┘   (?)      │
│                    [+]  │    │              [+]  │
│                    [−]  │    │              [−]  │
└────────────────────────┘    └──────────────────┘
楼层=右上竖排卡片；? =左下帮助；[+][−]=右下 Leaflet 缩放
```

## HTML 骨架

**Leaflet CSS 必须在 site.css 之前**（site.css 的 leaflet 皮肤覆盖它）。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F5F3EE">
<title>校园地图 · 校园信息网</title>
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="vendor/leaflet/leaflet.css">
<link rel="stylesheet" href="css/site.css">
</head>
<body data-nav="map" data-shell="app" data-page="map">
<a class="skip-link" href="#map">跳到地图</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<h1 class="sr-only">校园地图</h1>
<main class="map-page" id="main">
  <div id="map" class="map-canvas" role="application" aria-label="校园地图，可用方向键或 W A S D 移动"></div>

  <div class="map-ui map-ui--tr">
    <div class="floor-switch" role="group" aria-label="切换楼层">
      <span class="floor-switch__label">楼层</span>
      <button type="button" class="floor-switch__btn" id="floor4Btn" aria-pressed="false" onclick="setFloor(4)">4F</button>
      <button type="button" class="floor-switch__btn" id="floor3Btn" aria-pressed="false" onclick="setFloor(3)">3F</button>
      <button type="button" class="floor-switch__btn" id="floor2Btn" aria-pressed="false" onclick="setFloor(2)">2F</button>
      <button type="button" class="floor-switch__btn" id="floor1Btn" aria-pressed="true" onclick="setFloor(1)">1F</button>
    </div>
  </div>

  <div class="map-ui map-ui--bl">
    <button type="button" class="icon-btn map-help-btn" id="helpBtn" aria-label="操作提示" aria-expanded="false"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-help"></use></svg></button>
  </div>
  <div class="map-ui map-ui--bl" id="helpPanel" style="bottom:calc(var(--sp-3) + 3.25rem + var(--safe-bottom))" hidden>
    <div class="map-help">
      <h2 class="map-help__title">操作提示</h2>
      <ul>
        <li>滚轮 / 双指：缩放</li>
        <li>拖动：移动地图</li>
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键：移动</li>
        <li>点击建筑：查看介绍</li>
      </ul>
    </div>
  </div>

  <div class="map-ui map-ui--center" id="mapStatusWrap"><div class="map-status" id="mapStatus"><span class="spinner spinner--lg"></span><span>地图加载中…</span></div></div>
</main>
<script src="vendor/leaflet/leaflet.js"></script>
<script src="js/ui.js"></script>
<script>
document.getElementById('helpBtn').addEventListener('click', function () {
  var p = document.getElementById('helpPanel');
  p.hidden = !p.hidden;
  this.setAttribute('aria-expanded', String(!p.hidden));
});
/* ……原地图逻辑脚本，按下方「脚本改动」逐条修改后放此处…… */
</script>
</body>
</html>
```

## Leaflet 本地化（必须）

unpkg 在国内不稳定；把 Leaflet 1.9.4 下载到本地：

```text
public/vendor/leaflet/
├── leaflet.js
├── leaflet.css
└── images/
    ├── marker-icon.png
    ├── marker-icon-2x.png
    ├── marker-shadow.png
    └── layers.png、layers-2x.png   （本站基本不用 marker，仍一并放置）
```

引用：`vendor/leaflet/leaflet.css` 与 `vendor/leaflet/leaflet.js`（相对路径）。获取方式：从 `https://unpkg.com/leaflet@1.9.4/dist/` 下载同名文件（构建者执行一次）。兜底：CDN 仍可作为 `<script>` 的 fallback（本地失败时）——不做双源复杂逻辑，本地文件存在即用本地。

## data.json 修改（同一次提交）

```json
"style": {
  "outline": "#55656B",
  "labelColor": "#66747B",
  "fillOpacity": 0.75,
  "palette": { "building": "#E4DFD3", "green": "#CFE0CC", "water": "#BBD7DF", "white": "#FFFFFF", "none": null }
}
"meta": { …原值…, "minZoom": -2 }
```
原因：新线色/底色与新 UI 协调；`minZoom=-2` 让手机竖屏能完整显示校园（1200×700 的平面图在 390px 宽下需要更远的初始视野）；弹窗宽度参数（下）配合。**禁止**改 rectW/rectH/axisY 与任何 feature。

## JS 钩子清单与需要修改的脚本行为（旧 → 新）

| 旧 | 新 | 原因/说明 |
| --- | --- | --- |
| `<script src="auth.js">` | `js/ui.js` | 页头接管 |
| `L.map("map", { minZoom:-1, … })` | `L.map("map", { zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, minZoom: data.meta.minZoom, … })` | 细粒度缩放手感；minZoom 从数据读（=-2） |
| `map.fitBounds([[0,0],[RECT_H,RECT_W]])` | `map.fitBounds(contentBounds(data), { padding: [16, 16] })`，`contentBounds` 计算除「地图边界」外全部 feature 的几何包围盒 | 初始视野贴合校园内容，四周白边不再占屏 |
| 弹窗 `shape.bindPopup(buildPopupContent(feat))` | `bindPopup(content, { minWidth: 140, maxWidth: 260, autoPanPaddingTopLeft: [16, 72], autoPanPaddingBottomRight: [72, 16] })`（两处 bindPopup 都加） | Leaflet 以 nowrap 测宽而内容是 pre-wrap，无 minWidth 时弹窗会被压成竖条；padding 防止被页头/浮层遮挡 |
| `openEditPrompt` 用 `prompt()/confirm()` | `UI.prompt({ title:'修改弹窗内容', label: name||'', value: current, multiline: true, confirmText:'保存' })`；取消(null)静默；成功后本地更新 + toast「已保存」+ `refreshMapData()` | 铁律 4 |
| `alert("修改失败：…")` | `UI.toast.error("修改失败：" + UI.errorText(r))`；`feature not found` → 「没有找到该地图对象」 | 文案中文 |
| `loadError` 裸 div | `#mapStatus`：加载中 = `.map-status`（spinner + 「地图加载中…」）；失败 = `UI.html.loadError({status:0}, '地图加载失败')` 塞进同一容器；成功后整个 `#mapStatusWrap` 隐藏 | 状态有设计 |
| `classList.toggle("active", …)` 楼层 | `setAttribute("aria-pressed", …)` | 铁律/ARIA |
| `.tip-box` 常驻提示 | `helpBtn` + `#helpPanel`（默认隐藏） | 减少常驻视觉 |
| `.top-right` 旧样式 | `.map-ui--tr` | 新结构 |
| 键盘 WASD/方向键 pan | 保留；**加输入框聚焦判断**：`if (e.target.matches('input,textarea,select')) return;` | 不干扰输入 |
| `.map-popup-text/.map-popup-edit` | `.map-popup__text` / `.map-popup__edit`（`btn btn--sm map-popup__edit`） | 新类名 |
| `closePopupOnClick` 等 map 选项 | 保留 | 行为不变 |
| createPane/labelsPane/updateLineWeights/refreshMapData 等 | 原样保留 | 与 UI 无关 |

## 脚本与数据接入（保留清单）

- 接口（全部保留）：GET /api/map-data（首载与 refreshMapData 重取）、GET /api/me（判定弹窗编辑权）、GET /api/user/profile（default_floor，回退 localStorage defaultFloor）、PUT /api/admin/map-popup（保存弹窗，同名对象批量更新）。
- localStorage：defaultFloor（读，回退 1）；token / user（经 UI.session）；navCollapsed 废弃。
- DOM 钩子：#map、#floor1Btn–#floor4Btn（aria-pressed）、#helpBtn / #helpPanel、#mapStatus；全局函数 setFloor() 保留（楼层按钮 onclick 引用）。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 加载中 | 首次 | 居中 `.map-status`「地图加载中…」 |
| 加载失败 | fetch 失败 | `.map-status` 内 `UI.html.loadError`（含重试，重试=重新 fetch map data 并 build） |
| 正常 | build 完成 | 地图 + 浮层 |
| 无权限者点建筑 | popup | 只读弹窗（无编辑按钮） |
| 有权限者点建筑 | popup | 弹窗 + 「编辑」按钮 |
| 编辑取消 | prompt null | 无任何变化 |
| 编辑保存成功 | PUT 200 | toast「已保存」+ 本地即时更新 + 数据重取（打开同名弹窗保持） |
| 编辑保存失败 | 4xx/5xx | toast「修改失败：中文原因」 |
| 帮助面板 | ? 按钮 | 左上面板展开/收起（aria-expanded） |
| 楼层切换 | 楼层钮 | aria-pressed 切换 + 图层组切换（无动画，保持原样） |
| 横幅存在 | loadBanner | 地图顶随 `--banner-h` 下移（ui.js 的 `#map` 规则保留在新 CSS 中） |

## 响应式

- 360：楼层条保持右上竖排（宽 56）；帮助按钮左下；弹窗 maxWidth 260 在 390 内安全；`autoPanPadding` 保证弹窗不被楼层条遮。
- 768+：同结构，无变化。
- **横屏手机**：地图全高正常；弹窗 padding 已适配页头。
- 触屏：楼层钮 44px 高（已达标）；双指缩放 Leaflet 原生。

## 边界场景

- 数据里 feature 缺 type/cat → 渲染函数已容错（原逻辑）。
- 227 个 feature 首次渲染 ~ <300ms（无需骨架外的处理）。
- 弹窗文本超长（>260px 宽）→ `map-popup__text` `pre-wrap` 自动换行、弹窗高度自适应。
- 同名对象批量更新（如多个「校园围墙」）→ PUT 更新全部同名；保存后弹窗重开的是其中一个（原 lastEditedName 逻辑保留）。
- 用户缩放后刷新 → 回初始视野（无持久化；〔可接受，P2 可加 last view〕）。
- 弹窗打开时按 WASD → 键盘被 Leaflet popup 聚焦？——地图 keyboard:false 且我们的 keydown 在 document 上；弹窗内按钮聚焦时按 WASD 会移动地图——**必须**做输入聚焦判断（上文脚本改动已含：`e.target.matches('button,input,textarea,select')` 也 return，避免按钮聚焦时移动）。
- CDN 加载失败（leaflet.js 404）→ 白屏；本地化后消除。构建者务必完成本地化。

## 无障碍要点

- `#map` `role="application"` + aria-label；楼层按钮 aria-pressed；帮助按钮 aria-expanded；弹窗内容为 DOM 文本（读屏可读）；编辑按钮有文字。
- 地图交互对键盘用户可用（WASD + 缩放按钮可聚焦）。

## 验收清单

- [ ] 本地 Leaflet 生效（无 unpkg 请求）。
- [ ] 初始视野贴合校园内容（四周无大片空白）；手机竖屏能看全。
- [ ] 楼层 4F→1F 竖排、aria-pressed 正确、切换图层正确。
- [ ] 弹窗不被楼层条遮挡；窄屏不被压扁。
- [ ] 有权限编辑弹窗：UI.prompt 全流程（取消/成功/失败文案）；无权限无按钮。
- [ ] 帮助面板开关；加载/失败状态正确。
- [ ] WASD/方向键/滚轮/拖拽/双指；输入聚焦时不移动。
- [ ] data.json 新配色生效（线 #55656B、building #E4DFD3 等）。
- [ ] 页头横幅存在时地图不被遮挡。
- [ ] axe=0（地图画布 role=application 豁免大部分规则）；控制台零报错。
