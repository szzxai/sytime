# 校园信息网 UI 设计手册

> 版本 1.0 · 2026-10-01 · 适用于里程碑「2026国庆开发计划」#4（修改 UI），并为 #5–#10 的新页面预先设计。
> 设计名：**宣纸 · 黛青 · 朱印**。本手册**全新设计，不沿用旧站任何视觉与布局**；功能范围以 [MAP.md](./MAP.md) 和 [PLAN_2026-10-01.md](./PLAN_2026-10-01.md) 为准，本手册只规定“怎么呈现、怎么交互”。
> 设计文档与参考资产现已用于需求 #4 的全站改版；页面实现位于 `public/`，验证方式见 README，实施范围与结果见 [验收记录](./docs/ui/acceptance.md)。
> #5 当前实现为三个菜品页签、developer 专属菜单同步设置及三种管理角色可用的手动 JSON 导入，详见 [菜品目录](./docs/ui/pages/dishes.md)、[菜品与食谱](./docs/ui/pages/recipe.md)、[后台设计](./docs/ui/pages/admin.md)及[同步运维](./docs/menu-sync.md)。该范围以用户确认的[实施计划](./docs/issue-5-plan.md)为准。

> 2026-10-17 地图更新：校园地图采用独立的简约导览视觉，页面局部令牌位于 `public/css/map.css`，使用系统字体、近白/深绿灰底色和柔和 SVG 建筑插画；目录、详情与地图均适配手机和暗色主题。只保留单一地图，移除旧楼层平面与视图切换；双指滚动平移，捏合或 Ctrl / ⌘ + 滚轮连续缩放。篮球场与操场均采用大面积场地插画。共享站点壳维持现有规范，当前行为以 [地图页面规范](./docs/ui/pages/map.md) 为准。

> 同日位置校准：按维护者的新参考图调整建筑、地块与水面轮廓，采用建筑插画结合地块平面细节的表达方式；教学区保留建筑意象，三元楼、科学楼、文庙与南部生活区展示长条、院落及组合轮廓。绿地、屋面、水体、园路与运动标线均有明暗主题令牌；标签可配置偏移与相对字号，避免压住邻近建筑。未命名粉色地块只绘制轮廓。

> 同日名称与标签修正：墨子馆更名政道楼，保留旧名搜索，并按维护者确认更新寓意和用途；篮球场标签放回自身地块底部，避免被操场遮挡或点击时误选操场。

> 同日点选优化：所有光晕统一放在建筑下方，选中不改变建筑绘制顺序。点选保留缩放及上下文，只在必要时做最小缓动平移。详情改为实际用途与文化介绍，提供来源链接，长文在卡内滚动；减少动态效果模式关闭镜头动画。

---

## 先读这里

### 这份手册是什么

这是给“按图施工的人”准备的：每个颜色、尺寸、类名、文案、状态都有明确规定，实施者**不需要做设计决定**，只需要照做、勾验收清单。即使实施者是能力较弱的模型或新手，只要按本手册的顺序和模板，也能做出一致且有品味的界面。

### 文件地图

| 文件 | 内容 | 什么时候读 |
| --- | --- | --- |
| **UI.md**（本文） | 总纲：设计定位、铁律、令牌、布局、页头导航、状态与反馈、表单、文案、图片、无障碍、深色模式、页面清单、实施路线、验收 | 开工前必读前半部分；之后当字典查 |
| [docs/ui/components.md](./docs/ui/components.md) | 全部组件：用途、HTML 骨架、变体、状态、可访问性、常见错误 | 做任何页面时按需查 |
| [docs/ui/pages/](./docs/ui/pages/) | 逐页规范（12 个现有页面 + 新功能页面 + 系统页面） | 改/建某一页时必读对应文件 |
| [docs/ui/scenarios.md](./docs/ui/scenarios.md) | 场景手册：页面文档没覆盖的各种情形怎么处理 | 遇到边界情况时查 |
| [docs/ui/copy.md](./docs/ui/copy.md) | 文案规范、统一词汇、错误提示映射 | 写任何文字前查 |
| [docs/ui/implementation.md](./docs/ui/implementation.md) | 实施路线、逐页迁移步骤、测试方法、常见错误 | 开工时必读 |
| [docs/ui/acceptance.md](./docs/ui/acceptance.md) | #4 实施范围、验证结果和复验命令 | 检查交付与后续回归时读 |
| [docs/ui/assets/](./docs/ui/assets/) | 参考实现：`site.css`、`ui.js`、`icons.svg`、`favicon.svg`、`specimen.html`（样张） | 直接复制使用；用浏览器打开样张看最终外观 |

**先看一眼样张**：双击打开 `docs/ui/assets/specimen.html`（无需服务器）。样张就是本手册描述的最终外观，页内按钮可操作（Toast、对话框、抽屉、图片查看器等），右上角“深色”按钮可预览深色主题。

### 怎么用

1. 读完本页「十二条铁律」「设计令牌」「页面骨架与布局」「页头与导航」（约 15 分钟）。
2. 读 `docs/ui/implementation.md`，按「阶段 0 → 阶段 3」顺序做。
3. 做某一页时：读 `docs/ui/pages/<该页>.md`，复制它的 HTML 骨架，按“JS 钩子清单”和“需要修改的脚本行为”改脚本，最后逐条勾它的“验收清单”。
4. 用到组件时：在 `components.md` 找对应小节，复制 HTML 骨架，不要自己拼类名。
5. 提交前：勾本手册末尾「验收清单」。

### 任务 → 必读文件

| 我要做 | 必读 |
| --- | --- |
| 建立共享资产（CSS、JS、图标） | implementation.md「阶段 0」 |
| 改页头、导航、页脚、横幅 | 本文「页头与导航」+ components.md「Site Header 页头」 |
| 改某个现有页面 | pages/ 下对应文件 |
| 做新功能页面（店铺、消息箱、头衔、菜品目录） | pages/ 下对应文件 + 本文「页面骨架与布局」 |
| 写按钮文字、提示、错误信息 | copy.md |
| 处理空数据、超长内容、断网、权限不足 | 本文「状态与反馈」+ scenarios.md |
| 做深色主题 | 本文「深色模式」 |
| 想加一个新组件或新颜色 | 本文「遇到手册未覆盖的情形」——先别加 |

### 遇到手册未覆盖的情形

按顺序判断，**第一条能解决就停**：

1. 现有组件能表达吗？→ 用它（components.md 末尾有「组件选择决策表」）。
2. 有相似页面吗？→ 照抄它的结构和状态处理。
3. 需要新类、新颜色、新阴影？→ **禁止自己造**。用现有类组合；确实不行，在提交说明里写“缺少：xxx”，并停下来问设计负责人。
4. 涉及权限或数据规则尚未确定？→ 取**最保守**的呈现（隐藏而不是误导），代码里留 `TODO 〔待产品确认〕`。
5. 仍不确定 → 选“更安静”的方案：更少的颜色、更少的动效、更少的装饰。

### 术语

| 术语 | 含义 |
| --- | --- |
| 令牌（token） | 命名的设计常量，如 `--primary`、`--sp-4`，定义在 `site.css` 第 1 节 |
| 组件 | 一组固定类名 + 固定 HTML 结构，如 `.btn`、`.card`，见 components.md |
| 壳（shell） | 页面外框：默认壳（页头 + 内容 + 页脚）和应用壳（页头 + 满高内容，无页脚） |
| 钩子（hook） | 现有 JavaScript 依赖的元素 ID、`data-*` 属性、类名；改 HTML 时必须保留或同步修改脚本 |
| 状态类 | 以 `is-` 开头的类，如 `is-loading`、`is-open` |
| P0 / P1 / P2 | P0 = #4 改版必须完成；P1 = 对应新功能 issue 落地时完成；P2 = 可选增强 |
| 〔待产品确认〕 | 需求尚未定稿，手册给出了默认方案，可直接按默认落地，定稿后再调整 |

---

## 设计定位

### 一句话

**一张摊开在书桌上的校园手账**——安静、清爽、有书卷气，让信息自己说话。

气质关键词：**安静 · 克制 · 清晰 · 可信 · 有温度**。

### 视觉母题（整站只有这七件事）

| 母题 | 做法 | 体现在 |
| --- | --- | --- |
| 宣纸底 | 暖白灰 `#F5F3EE` 做页面底，纯白做卡片，层次靠“纸与纸”的差别，不靠阴影 | `--bg` / `--surface` |
| 黛青 | 粉墙黛瓦的“黛”：`#24606F`。**唯一品牌色**，用于主按钮、链接、选中态、焦点环 | `--primary` 系列 |
| 朱印 | 一枚小小的红印章：`#B8372B`。只出现在 Logo、榜单前三序号、首页水印 | `--seal` |
| 发丝线 | 1px 暖灰线分隔内容，取代粗黑框 | `--line` |
| 柔和圆角 | 控件 10px、卡片 14px、对话框 20px；不用直角，也不用大圆球 | `--r-*` |
| 留白 | 页边 16/24/32，区块间 32–48，不挤 | `--sp-*` |
| 系统字体 | 不加载网络字体；靠字号、字重、颜色分层级 | `--font-sans` |

### 五条设计原则

1. **内容为主，装饰为辅。** 界面是纸，内容是墨。任何不帮助用户理解或操作的元素都删掉。
2. **一个视图一个重点。** 每屏最多一个实心主按钮，最多一种强调色（黛青）。
3. **同类同形。** 同一种事物在全站只有一种长相：一种按钮、一种卡片、一种用户行、一种空状态。页面不得自创变体。
4. **手机优先。** 先在 360px 宽度上设计和验收，再放大到桌面。触控目标 ≥ 44px。
5. **每个状态都有界面。** 加载、空、错误、无权限、离线、提交中——都必须有设计过的呈现，不能留白或弹原生框。

**取舍顺序**（原则冲突时）：可访问性 > 一致性 > 清晰 > 美观 > 新颖。

### “有品味”自检（10 条，做完每一页都过一遍）

- [ ] 整页只有一种强调色（黛青）；红色只出现在错误、危险、未读数、已点赞和朱印。
- [ ] 一屏最多一个实心主按钮。
- [ ] 所有间距是 4px 的倍数且来自令牌。
- [ ] 卡片静止时没有阴影；没有双层边框；没有彩色阴影。
- [ ] 文字层级不超过 4 级：标题 / 正文 / 次要 / 辅助。
- [ ] 图标全部来自图标库，同一行图标尺寸一致，没有 emoji。
- [ ] 没有渐变按钮、没有发光、没有循环动画（骨架与转圈除外）。
- [ ] 空状态、错误状态、加载状态都做了。
- [ ] 手机 360px 无横向滚动；主要按钮都在拇指够得着的位置。
- [ ] 把页面截图转成灰度，层级依然清楚。

### 反面清单（出现即返工）

纯黑 `#000` 的文字或边框 · 2px 以上的粗边框 · 直角方块按钮 · 渐变、发光、玻璃拟态（页头的轻微模糊除外） · 同页混用多种圆角 · 多种蓝色 · 全大写英文标题 · 居中对齐的长文 · 两端对齐 · 字重小于 400 · 灰字配灰底 · 只靠颜色传达信息 · 原生 `alert/confirm/prompt` · 右键菜单作为唯一入口 · 只有鼠标悬停才出现的关键操作 · 在页面里写十六进制颜色。

---

## 十二条铁律

> 这 12 条是全站底线。每条后面写了**为什么**和**怎么检查**。违反任何一条，该页面视为未完成。

1. **颜色、间距、圆角、阴影、动效、字号只能来自令牌**（`var(--…)`）。页面和组件里禁止写十六进制色值、`rgb()`、自拟的 `px` 字号。
   *为什么*：换主题（含深色）只改令牌。 *检查*：全文搜索 `#[0-9a-fA-F]{3,6}` 和 `rgb(`，除 `site.css` 令牌定义和图标文件外必须为 0 条。
2. **禁止新增页面内联 `<style>` 或大段页面 CSS。** 所有样式都在 `site.css`。动态数值（如评分 `--rating`、进度 `--p`）允许用 `style="--x:…"`。
   *检查*：搜索 `<style`、`style="`，只允许出现上述自定义属性。
3. **只使用 `site.css` 中存在的类；禁止自造类，禁止修改 `site.css`。** 需要新类，走「遇到手册未覆盖的情形」。
   *检查*：运行类名核对脚本（见 implementation.md「自检工具」）。
4. **禁止原生 `alert` / `confirm` / `prompt`。** 结果反馈用 `UI.toast`，确认用 `UI.confirm`，输入用 `UI.prompt`，只需告知用 `UI.alert`。
   *检查*：搜索 `alert(`、`confirm(`、`prompt(` 为 0。
5. **图标只用图标库，禁止 emoji 和字符图标**（✓ ★ ☆ × ▼ 👍 等）。
   *检查*：搜索上述字符为 0；图标写法统一为 `<svg class="icon"><use href="img/icons.svg#i-名称"/></svg>`。
6. **所有拼进 `innerHTML` 的动态值必须 `UI.esc()`；图片地址必须 `UI.safeUrl()`。**
   *为什么*：论坛、评价、工单都是用户输入。 *检查*：逐个 `innerHTML =` 看每个变量。
7. **保留 JS 钩子。** 改 HTML 结构前先看该页文档的“JS 钩子清单”；被删除的钩子必须同步修改脚本。
   *检查*：页面打开后控制台无报错，且该页所有交互走一遍。
8. **每个控件都能用键盘操作并有可见焦点；图标按钮必须有 `aria-label`。**
   *检查*：只用 Tab / Shift+Tab / Enter / Space / Esc / 方向键把页面功能走一遍。
9. **每个异步区域必须有 加载 / 空 / 错 三态；每个提交必须有 busy 状态和失败提示。**
   *检查*：用浏览器开发者工具把网络调为“离线”和“慢速 3G”各走一遍。
10. **手机 360px 起不得出现横向滚动；触控目标 ≥ 44px。**
    *检查*：开发者工具切到 360×740，页面上不能出现水平滚动条。
11. **一个视图最多一个主按钮；危险操作一律二次确认；确认按钮写具体动词。**（“删除”“封禁”，不写“确定”）
    *检查*：数 `btn--primary`；找所有删除/封禁/覆盖操作确认它们走了 `UI.confirm({danger:true})`。
12. **文案对用户称“你”，用 copy.md 的统一词汇；后端错误必须经 `UI.errorText` 转成中文。**
    *检查*：界面上不得出现英文错误原文（如 `title and content are required`）。

---

## 设计令牌

> 令牌定义在 `site.css` 第 1 节（浅色）与第 17 节（深色）。本节表格由 CSS 自动生成，与文件一致。**只允许通过 `var(--…)` 使用。**

### 使用规则

1. 颜色：界面元素的颜色一律取语义令牌；**禁止**把 `--ink` 系列当背景、把背景色当文字。
2. 间距：相邻元素间距从 `--sp-2 / --sp-3 / --sp-4` 里选，区块间距从 `--sp-6 / --sp-8` 里选；**禁止**出现 4px 序列之外的值（图标内微调可用 `--sp-1`）。
3. 圆角：控件一律 `--r-2`，卡片一律 `--r-3`，对话框/面板一律 `--r-4`；标签用 `--r-1`，胶囊用 `--r-pill`。
4. 阴影：只给浮层（菜单、对话框、Toast、地图控件）和悬停中的可点卡片用；**静止的卡片没有阴影**。
5. 动效：时长用 `--t-fast/base/slow`，缓动用 `--ease-out`（进）/ `--ease-in-out`（出）；只有 opacity/transform 参与过渡。

### 颜色令牌

#### 纸与墨

| 令牌 | 浅色值 | 深色值 | 用途 | 禁止 |
| --- | --- | --- | --- | --- |
| `--bg` | `#F5F3EE` | `#101517` | 页面背景（宣纸） | 用作卡片内部背景 |
| `--surface` | `#FFFFFF` | `#171D20` | 卡片、输入框、对话框、菜单等“纸面” | 直接铺满整页 |
| `--surface-2` | `#FAF8F4` | `#1C2327` | 次级面板：面板底栏、行动提示条、上传区底、悬停底 | 与 `--surface` 在同屏大面积交替 |
| `--sunken` | `#ECE9E1` | `#0C1012` | 凹陷：分段控件轨道、骨架、默认标签底、禁用控件底 | 做按钮悬停色 |
| `--line` | `#E3DFD4` | `#27313A` | 发丝线：卡片边框、分割线、表格线 | 做控件边框（太淡） |
| `--line-strong` | `#C9C3B3` | `#3A4651` | 控件边框：输入框、按钮、胶囊、开关关闭轨道 | 做分割线（太重） |
| `--ink` | `#1B2326` | `#E8ECEA` | 正文与标题 | 做大面积底色 |
| `--ink-2` | `#46535A` | `#B5C0C3` | 次要文字：说明、引用、列表副行 | 做占位符 |
| `--ink-3` | `#5B6872` | `#8E9BA0` | 辅助文字：时间、提示、占位符、计数 | 用在比 `--sunken` 更深的底上 |
| `--ink-inverse` | `#FFFFFF` | `#0B1A1F` | 实色底（主按钮、红徽标、头像）上的文字 | 用在浅色底上 |

#### 品牌

| 令牌 | 浅色值 | 深色值 | 用途 | 禁止 |
| --- | --- | --- | --- | --- |
| `--primary` | `#24606F` | `#6FB3C2` | 主按钮底、链接、选中边框与图标、焦点环 | 大面积铺底 |
| `--primary-hover` | `#1D4C59` | `#8CC5D1` | 主按钮悬停 | — |
| `--primary-press` | `#163B46` | `#A6D3DC` | 主按钮按下 | — |
| `--primary-50` | `#EDF5F6` | `#16262B` | 浅底：当前导航项、选中项、站点横幅、info 提示条 | 用作文字色 |
| `--primary-100` | `#DCEBEE` | `#1B3138` | 浅底的边线与更深一级的浅底（徽标、悬停） | — |
| `--primary-200` | `#BFD9DE` | `#24444D` | 角色小标边框 | — |
| `--primary-ink` | `#1D4C59` | `#9CCDD8` | 浅色底（primary-50/100）上的品牌色文字 | 在白底上做链接（链接用 `--primary`） |
| `--seal` | `#B8372B` | `#E5736A` | 朱印：Logo、榜单前三序号、首页水印 | 做按钮色、做错误色 |

#### 语义

| 令牌 | 浅色值 | 深色值 | 用途 | 禁止 |
| --- | --- | --- | --- | --- |
| `--red` | `#B8372B` | `#E5736A` | 错误文字、危险按钮、未读数、已点赞 | 装饰 |
| `--red-tint` | `#FBECE9` | `#2F1B19` | 错误/危险提示条底 | — |
| `--red-ink` | `#9A2D22` | `#F0958D` | 红色浅底上的文字 | — |
| `--red-line` | `#E8B9B2` | `#5A2E2A` | 红色提示条边线、危险幽灵按钮边线 | — |
| `--green` | `#2F7D4F` | `#6CC08B` | 成功图标与文字 | — |
| `--green-tint` | `#E7F3EC` | `#16261D` | 成功提示条/徽标底 | — |
| `--green-ink` | `#1F6B3F` | `#8ED2A6` | 绿色浅底上的文字 | — |
| `--green-line` | `#BFDFCB` | `#264A33` | 成功提示条边线 | — |
| `--amber` | `#8A5A00` | `#E3A93B` | 警告/锁定图标 | — |
| `--amber-tint` | `#FBF1DC` | `#2B2210` | 警告提示条/待处理徽标底、搜索高亮、被定位的回复高亮 | — |
| `--amber-ink` | `#7A5200` | `#EBBE6A` | 琥珀浅底上的文字 | — |
| `--amber-line` | `#EAD39D` | `#55421C` | 警告提示条边线 | — |
| `--star` | `#C98400` | `#E3A93B` | 评分实心星 | — |
| `--star-empty` | `#D8D2C4` | `#3A4651` | 评分空心星 | — |

#### 分类色（`data-hue`）

| `data-hue` | 中文名 | solid（头像底，配 ink-inverse 文字） | tint（标签底） | ink（标签字） | 典型用途 |
| --- | --- | --- | --- | --- | --- |
| `teal` | 黛青 | `#24606F` | `#E3EFF1` | `#1D4C59` | 地图、面馆 |
| `vermilion` | 朱 | `#B8372B` | `#FBE8E4` | `#9A2D22` | 提问、官方、川湘 |
| `ochre` | 赭黄 | `#8A5A00` | `#F8EBCF` | `#7A5200` | 老饕、小吃、公告 |
| `bamboo` | 竹青 | `#2F7D4F` | `#E2F0E5` | `#215A36` | 轻食、成就类头衔 |
| `wisteria` | 藤紫 | `#5E4FA2` | `#ECE8F5` | `#4D3F8A` | 论坛、饮品 |
| `indigo` | 靛蓝 | `#3B5BA5` | `#E6EBF5` | `#2F4A8A` | 快餐、通知 |
| `rose` | 胭脂 | `#A8365F` | `#F8E6EE` | `#8E2C57` | 甜点 |
| `stone` | 石 | `#5B6468` | `#ECE9E1` | `#4A4F52` | 中性默认（头像不使用） |

用法：给元素加 `data-hue="ochre"`，其内部即可使用 `--hue-solid / --hue-tint / --hue-ink`（标签、头衔徽章、头像、消息图标已内置支持）。**头像底色只用前 7 种**（`UI.hueFor` 已排除 stone），同一用户永远同色。

#### 覆盖层与其它颜色类令牌

| 令牌 | 浅色值 | 用途 |
| --- | --- | --- |
| `--scrim` | `rgba(20, 28, 31, 0.48)` | 对话框遮罩 |
| `--header-bg` | `rgba(255, 255, 255, 0.88)` | 页头半透明底（配 backdrop-filter） |
| `--toast-bg` | `#1B2326` | Toast 底（深色胶囊） |
| `--toast-ink` | `#F5F3EE` | Toast 文字 |
| `--toast-ok` | `#7ED6A0` | Toast 成功图标 |
| `--toast-err` | `#FF9F94` | Toast 错误图标 |
| `--toast-warn` | `#F2C467` | Toast 警告图标 |
| `--toast-info` | `#8FD0DE` | Toast 信息图标与操作文字 |
| `--img-edge` | `rgba(27, 35, 38, 0.08)` | 图片/头像内描边 |
| `--map-bg` | `#F2EFE8` | Leaflet 公共皮肤默认底色；校园地图使用 atlas 局部令牌覆盖 |
| `--viewer-bg` | `rgba(14, 19, 21, 0.92)` | 图片查看器背景 |
| `--viewer-ink` | `#F5F3EE` | 图片查看器文字与图标 |
| `--viewer-chip` | `rgba(255, 255, 255, 0.14)` | 查看器浮层按钮底 |
| `--viewer-chip-hover` | `rgba(255, 255, 255, 0.24)` | 查看器浮层按钮悬停底 |

### 文字与背景的允许组合

> 全部组合已按 WCAG 计算。**只允许下表出现的“文字色 + 背景色”搭配**；新搭配必须先达到同等对比度。

| 文字/图形 | 背景 | 对比度 | 等级 | 允许用于 |
| --- | --- | --- | --- | --- |
| `--ink` | `--bg` | 14.40 : 1 | AAA | 正文、标题 |
| `--ink` | `--surface` | 15.97 : 1 | AAA | 卡片内正文 |
| `--ink-2` | `--bg` | 7.16 : 1 | AAA | 次要文字 |
| `--ink-2` | `--surface` | 7.94 : 1 | AAA | 卡片内次要文字 |
| `--ink-2` | `--sunken` | 6.54 : 1 | AA | 凹陷底上的次要文字 |
| `--ink-3` | `--bg` | 5.16 : 1 | AA | 时间、提示、占位符 |
| `--ink-3` | `--surface` | 5.73 : 1 | AA | 卡片内辅助文字 |
| `--ink-3` | `--sunken` | 4.72 : 1 | AA | 凹陷底上的辅助文字（下限） |
| `--primary` | `--bg` | 6.36 : 1 | AA | 页面底上的链接 |
| `--primary` | `--surface` | 7.05 : 1 | AAA | 卡片内的链接 |
| `--ink-inverse` | `--primary` | 7.05 : 1 | AAA | 主按钮文字 |
| `--ink-inverse` | `--primary-hover` | 9.42 : 1 | AAA | 主按钮悬停文字 |
| `--primary-ink` | `--primary-50` | 8.52 : 1 | AAA | 当前导航项、选中项 |
| `--primary-ink` | `--primary-100` | 7.69 : 1 | AAA | 徽标 |
| `--red` | `--surface` | 5.80 : 1 | AAA | 错误文字、危险文字 |
| `--ink-inverse` | `--red` | 5.80 : 1 | AAA | 危险按钮、未读数 |
| `--red-ink` | `--red-tint` | 6.59 : 1 | AAA | 错误提示条 |
| `--green-ink` | `--green-tint` | 5.70 : 1 | AAA | 成功提示条 |
| `--amber-ink` | `--amber-tint` | 6.17 : 1 | AAA | 警告提示条、高亮 |
| `--star` | `--surface` | 3.10 : 1 | 仅图形/大字 | 实心星（图形，需 ≥3:1） |

分类色 tint+ink 组合全部 ≥ 4.5:1；solid+白字全部 ≥ 4.5:1（生成时已验证）。

### 字号 / 行高 / 字重

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--fs-xs` | 12px | 时间、计数、徽标文字、表单提示与错误 |
| `--fs-sm` | 13px | 次要说明、小按钮、标签页计数、表头 |
| `--fs-md` | 15px | 正文默认、按钮、列表、菜单 |
| `--fs-lg` | 17px | 卡片标题、对话框标题、品牌字标 |
| `--fs-xl` | 20px | 区块标题(h2)、关于页小标题 |
| `--fs-2xl` | 24px | 手机页面标题(h1)、认证页标题 |
| `--fs-3xl` | 30px | 桌面页面标题(h1)、Hero(手机) |
| `--fs-4xl` | 40px | Hero(≥768) |
| `--fs-5xl` | 52px | Hero(≥1100) |
| `--lh-tight` | 1.25 | 标题 |
| `--lh-snug` | 1.4 | 卡片标题、紧凑行 |
| `--lh-normal` | 1.6 | UI 文本默认 |
| `--lh-relaxed` | 1.85 | 长文阅读（帖子、公告） |
| `--fw-regular` | 400 | 正文 |
| `--fw-medium` | 500 | 控件标签（微软雅黑无 500，回落 400） |
| `--fw-bold` | 700 | 标题、强调 |

标题字号阶梯：手机 h1 = `--fs-2xl`，桌面 h1 = `--fs-3xl`；h2 = `--fs-xl`；h3 = `--fs-lg`。**禁止跳级**（h2 下不能直接 h4）。

### 间距

| 令牌 | 值 | 典型用途 |
| --- | --- | --- |
| `--sp-1` | 4px | 图标与文字微调、紧贴元素 |
| `--sp-2` | 8px | 行内元素间距、标签间距 |
| `--sp-3` | 12px | 表单控件之间的紧凑间距、卡片内小块 |
| `--sp-4` | 16px | 卡片内边距(手机)、卡片之间、标签与控件 |
| `--sp-5` | 20px | 卡片内边距(桌面)、表单字段之间 |
| `--sp-6` | 24px | 页面标题下方(手机)、区块内大分组 |
| `--sp-8` | 32px | 页面标题下方(桌面)、两栏间距 |
| `--sp-10` | 40px | 区块之间(桌面) |
| `--sp-12` | 48px | 空状态上下内边距 |
| `--sp-16` | 64px | 页面底部留白(手机) |
| `--sp-20` | 80px | 页面底部留白(桌面) |

### 圆角

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--r-1` | 6px | 标签、键帽、小块 |
| `--r-2` | 10px | 按钮、输入框、菜单项、缩略图 |
| `--r-3` | 14px | 卡片、面板、提示条、菜单 |
| `--r-4` | 20px | 对话框、底部面板、Hero |
| `--r-pill` | 999px | 胶囊：芯片、徽标、头像、开关 |

### 阴影与焦点环

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--sh-1` | `0 1px 2px rgba(27,35,38,.06)` | 极轻：开关滑块、分段控件选中项 |
| `--sh-2` | `0 4px 14px …, 0 1px 3px …` | 中：可点卡片悬停、地图控件、认证卡(桌面) |
| `--sh-3` | `0 16px 40px …, 0 2px 8px …` | 重：对话框、菜单、Toast、浮层 |
| `--ring` | `0 0 0 3px rgba(36,96,111,.28)` | 焦点环（输入框聚焦） |
| `--ring-danger` | `0 0 0 3px rgba(184,55,43,.25)` | 错误态聚焦环 |

### 动效

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.22,.61,.36,1)` | 进入、展开（默认） |
| `--ease-in-out` | `cubic-bezier(.4,0,.2,1)` | 退出、关闭 |
| `--t-fast` | 120ms | 悬停、按压、颜色变化 |
| `--t-base` | 200ms | 菜单、对话框、折叠图标 |
| `--t-slow` | 320ms | 抽屉、底部面板、折叠展开 |

页面必须响应 `prefers-reduced-motion`（`site.css` 已全局处理，无需额外代码）。

### 层级

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--z-sticky` | 20 | 吸顶二级导航、字母索引、搜索条 |
| `--z-header` | 40 | 页头、离线条 |
| `--z-drop` | 60 | 下拉菜单 |
| `--z-toast` | 90 | Toast 容器（原生 dialog 在顶层，不受 z-index 影响） |

### 布局常量

| 令牌 | 值 | 说明 |
| --- | --- | --- |
| `--header-h` | 页头高度：<768 为 56px(3.5rem)，≥768 为 64px(4rem) | 吸顶偏移的基准 |
| `--page-pad` | 页面左右内边距：<768 为 16px，≥768 为 24px，≥1200 为 32px | |
| `--w-narrow` | 400px | 登录、注册 |
| `--w-form` | 576px | 表单页 |
| `--w-prose` | 720px | 阅读页(论坛、详情、消息) |
| `--w-page` | 1088px | 默认列表与网格页 |
| `--w-wide` | 1280px | 后台 |
| `--tap` | 44px | 最小触控尺寸 |
| `--safe-top` | 刘海屏顶部安全区 | |
| `--safe-bottom` | 底部安全区 | 吸底栏、抽屉、面板必加 |

断点：**640**（双列表单）/ **768**（导航切换、页头 64、桌面间距）/ **900**（侧栏布局、店铺双栏）/ **1100**（Hero 最大字号、字母索引外移）/ **1200**（页边 32）。

---

## 页面骨架与布局

### 页面模板

每个页面的固定骨架（除了应用壳页面，见下）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F5F3EE">
<title>页面名 · 校园信息网</title>
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/site.css">
</head>
<body data-nav="forum">            <!-- 当前导航键，见下表；无对应项则省略 -->
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>        <!-- 横幅挂载点（ui.js 填充） -->
<div id="siteHeader"></div>        <!-- 页头挂载点（ui.js 填充） -->
<main id="main" class="main container">
  <!-- 页面内容 -->
</main>
<div id="siteFooter"></div>        <!-- 页脚挂载点（ui.js 填充） -->
<dialog class="dialog dialog--sheet dialog--wide" id="someDialog">…</dialog>  <!-- 页面对话框 -->
<script src="js/ui.js"></script>
<script>/* 页面脚本 */</script>
</body>
</html>
```

规则：

- `<main>` 上同时给 `.main`（上下留白）和容器类（见下表）；`id="main"` 供跳转链接。
- 页面**禁止**再写自己的页头/页脚 HTML；由 `UI.shell.mount()` 填充（ui.js 在 DOMContentLoaded 自动执行，条件是页面有 `#siteHeader` 或 `<body data-nav>`）。
- `<body data-shell="app">` 时页脚不渲染（地图、后台使用）。
- 每页恰好一个 `h1`（在 `main` 内；地图页标题显示在地点目录头部）。
- `<noscript>` 内放一条提示：`<div class="alert alert--warning">…</div>`，文案见 copy.md。
- 图标库不需要每个页面引入：`ui.js` 通过 `img/icons.svg` 外链引用。

### 容器与留白速查

| 页面 | 容器 | 备注 |
| --- | --- | --- |
| 首页、必吃榜列表、菜谱、菜品目录 | `container` | 1088px |
| 论坛列表、帖子详情、消息箱 | `container--prose` | 720px |
| 登录、注册 | `container--narrow` + `.auth` 居中布局 | 400px |
| 学生认证、添加店铺 | `container--form` | 576px |
| 个人中心 | `container`（资料头部 + 吸顶横向菜单栏） | 内容列 ≤ 44rem |
| 设置 | `container` + `.shell`（15rem 侧栏） | 内容列 ≤ 44rem |
| 后台 | `container--wide` + `.shell` | 1280px |
| 公告 | `container` + `.master-detail` | |
| 地图 | 全屏 `.campus-page`（地点目录 + 导览舞台） | 应用壳 |

`.main` 自带上下留白（手机 24/64，桌面 40/80），**不要再加** padding。

### 页头与导航

页头、抽屉、用户菜单、页脚、横幅全部由 `ui.js` 生成，页面代码不写。行为规格：

- **页头**（sticky，高 56/64）：手机 = 汉堡按钮 + 品牌 + （铃铛）+ 头像/登录注册；≥768 = 品牌 + 主导航 + 右侧操作。毛玻璃底 `--header-bg`，发丝线下边。
- **主导航项**（≥768）：地图 · 论坛 · 菜谱 · 必吃榜(开关) · 公告。当前页 `aria-current="page"`（黛青浅底）。新功能未上线时由 `UI.config.features` 隐藏。
- **手机抽屉**：汉堡打开 `<dialog class="dialog--drawer">`，含完整导航（带图标、当前高亮）、账户区（登录态：个人中心/设置/学生认证/管理后台/退出登录；未登录：登录/注册）、页脚协议行。Esc / 遮罩 / 关闭按钮均可关；≥768 窗口时自动关。
- **用户菜单**（头像按钮）：下拉面板，头部显示昵称/角色/ID，菜单项：个人中心、设置、我的消息(开关)、学生认证(仅未达 student)、管理后台(admin 或有显式权限)、退出登录（红色）。键盘 ↑↓ 移动、Esc 关闭并还焦点。
- **消息铃**（features.inbox）：`UI.inbox` 每 60 秒轮询未读数，红点徽标 1–99，>99 显示 99+；`aria-label="消息，N 条未读"`。
- **退出登录**：清 token/user → toast「已退出登录」→ 0.5s 后回 `index.html`。
- **横幅**：`UI.shell.loadBanner()` 读接口；黛青浅底条，关闭按钮记录 `bannerDismissed:<用户名>` 与版本号；版本变化重新显示。多行文本自动换行。
- **登录态刷新**：任何页面改了头像/昵称后调用 `UI.shell.refreshAuth()`（或兼容别名 `renderAuth()`）。
- 旧页头的“折叠菜单栏”功能（`navCollapsed`）**取消**：页头本身已很矮，且手机有抽屉。

### 页脚

默认壳显示：品牌行（Logo+名称）、链接行（关于我们 / 更新公告 / 提交工单）、版权行（`© <年> 校园信息网 · 以 AGPL-3.0 协议开源`）。应用壳不显示。

---

## 状态与反馈

> 每个异步区域必须有四态：**加载 / 空 / 错误 / 成功**；每个操作必须有 **busy** 与**失败反馈**。详细规格见 components.md 对应组件。

### 状态选择器

| 情况 | 用什么 | 一句话规格 |
| --- | --- | --- |
| 首次加载列表 | 骨架屏 `UI.html.skeleton(kind, 3)` | kind: post/card/row/text；必须 `aria-busy` |
| 首次加载整块内容 | `loading-block` + `spinner` | 仅地图等无法预估形状的场景 |
| 提交/按钮动作中 | `UI.form.busy(btn, true)` | 按钮转圈 + disabled；结束必须恢复 |
| 没有数据 | `UI.html.empty({icon,title,desc,actions})` | 图标圆 + 标题 + 一句说明 + 0–1 个动作 |
| 加载失败 | `UI.html.loadError(r)` | 自动带「重试」按钮（`data-retry`，页面脚本监听后重新加载） |
| 无权限访问 | `UI.html.empty({tone:'lock', …})` | 说明原因 + 唯一 CTA（去登录/去认证/返回首页） |
| 操作成功 | `UI.toast.success('…')` | 深色胶囊，3s 自动消失 |
| 操作失败 | `UI.toast.error(UI.errorText(r))` | 5s；相同文案 1.2s 内去重 |
| 需要用户注意（留在页面） | `UI.alert({title, message})` | 对话框，单按钮 |
| 危险/不可逆操作 | `UI.confirm({danger:true})` | 焦点默认在「取消」 |
| 字段填写错误 | `UI.form.fieldError(input, msg)` | 字段内红字 + `aria-invalid` |
| 限流 429 | `alert--warning` + 按钮倒计时 | `UI.countdown` + `UI.formatCountdown`，见 copy.md |
| 网络断开 | `.offline-bar`（ui.js 自动） | 顶部黄条；恢复时 toast「网络已恢复」 |
| 登录过期 | `UI.session.expired()` | 清会话 → toast「登录已过期，请重新登录」→ 回登录页（带 next） |

### 空状态文案库

| 场景 | icon | 标题 | 说明 | 动作 |
| --- | --- | --- | --- | --- |
| 论坛无帖子 | message | 还没有帖子 | 来发第一帖吧，分享一下你在校园里的发现。 | 发布帖子 |
| 无回复 | （行内 `empty-sm` 用 `u-muted`）— | 还没有回复 | — | — |
| 菜谱无评价 | utensils | 暂无菜谱评价 | 食堂的菜好不好吃，你来告诉大家。 | 写评价（登录时）/ 去登录 |
| 每周食谱无图 | calendar | 暂未上传本周食谱 | 请等待管理员上传。 | — |
| 公告无内容 | megaphone | 暂无公告 | 有新动态时会第一时间发布在这里。 | — |
| 店铺列表空 | store | 三元坊还没有店铺 | 第一个推荐周边美食的人就是你。 | 添加店铺（有权限时） |
| 店铺无菜品 | utensils | 这家店还没有菜品 | 等你来添加第一道菜。 | 添加菜品（学生及以上） |
| 菜品搜索无结果 | search | 没有找到「{{关键词}}」 | 换个关键词试试，或清除搜索查看全部。 | 清除搜索 |
| 消息箱空 | inbox | 暂无消息 | 有新的互动或通知时会出现在这里。 | — |
| 工单空 | clipboard | 暂无工单 | 遇到问题可以提交工单。 | 提交工单 |
| 后台队列空 | check-circle | 暂无待处理{{事项}} | 全部处理完毕。 | — |
| 404 | compass | 页面不存在或已被删除 | 地址可能输入有误，或内容已被移除。 | 返回首页 / 去论坛 |
| 加载失败 | wifi-off / alert-circle | 加载失败 | UI.errorText(r) | 重试 |
| 需要登录 | lock | 请先登录 | 登录后才能{{动作}}。 | 去登录 |
| 需要认证 | graduation | 需要学生认证 | 认证为学生后才能{{动作}}，只需一分钟。 | 去认证 |

（`empty-sm` 为旧类：迁移后小空态直接用 `<div class="u-muted u-fs-sm">还没有回复</div>`。）

### 反馈的音量

反馈强度从弱到强：**行内字段错误 < Toast < 对话框 < 整页状态**。能用 Toast 就不用对话框；只有阻断流程的信息才用对话框。**禁止**为成功反馈用对话框。

### 表单规范

完整组件规格见 components.md「Field 表单字段」等小节。页面级规则：

1. 结构：`form.form`（可加 `novalidate`，由 JS 校验并显示中文错误）> `.field`（label + 控件 + hint/error/counter）。
2. 每个 `<input>` 都有 `<label for>`；一行一个字段；两列仅用于短字段（用 `.form-grid form-grid--2` + `.field--full`）。
3. 必填用 `required`；选填在 label 后加 `<span class="field__opt">（选填）</span>`。
4. 提示层级：label（13px 深灰）→ 控件 → hint（12px 辅助灰，正常时）或 error（12px 红，出错时，二选一显示）。
5. 输入框 16px 字号（防 iOS 缩放）；`autocomplete/inputmode/enterkeyhint` 按 copy.md「输入属性表」。
6. 长文本 `textarea` 带 `data-counter="上限"`；页面初始化时 `UI.qsa('[data-counter]').forEach(UI.form.counter)`。
7. 提交按钮：主按钮，文案=动作（「登录」「发布」）；请求期间 `UI.form.busy(btn,true)`；**禁止**把按钮文字改成「已…」当成功提示（成功用 toast）。
8. 校验时机：提交时校验全部；字段输入时清除该字段错误；不实时打断输入。
9. 出错后 `UI.form.focusFirstInvalid(form)`。
10. 图片上传用 `.upload`（label 包裹 input）+ `.upload-preview-slot`，初始化 `UI.upload.bind(root)`；约束文案写进 `upload__hint`；超限错误由 `UI.upload` 自动内联显示。
11. 长表单手机端底部操作栏用 `form__actions--sticky`。
12. 未保存离开提醒：内容型表单（店铺、工单、评价）用 `UI.guardUnsaved(form)`。
13. 表单成功后：清空表单 → toast → 列表刷新/跳转。

### 图片规范

| 场景 | 尺寸呈现 | 交互 |
| --- | --- | --- |
| 头像 | `.avatar`（xs–xl），`object-fit:cover`，内描边 | 点击 → 个人中心 |
| 评价/菜品封面 | `.card__media`（4:3）或 `.dish-row__thumb`(56px) | 无图显示分类色占位（`utensils`/`image` 图标） |
| 评价配图缩略 | `.thumb`（80px，`cursor:zoom-in`） | 点击 `UI.viewer` |
| 每周食谱大图 | `.card__media` 或流式宽度 | 点击 `UI.viewer` |
| 后台列表缩略 | `.thumb` | 点击 `UI.viewer` |

统一规则：`<img>` 一律带 `alt`（装饰 `alt=""`）、`loading="lazy" decoding="async"`（首屏主图除外）、容器用 `aspect-ratio` 占位防跳动；加载失败由 ui.js 自动换成占位（禁止页面自己写 onerror）；图片地址必须经 `UI.safeUrl()`。上传限制：JPG/PNG；头像/评价/菜品 ≤2MB，每周食谱/封禁图/工单图 ≤5MB（与后端一致，前端先校验并给中文错误）。

### 无障碍基线

- 焦点：全局 `:focus-visible` 2px 黛青描边；**禁止** `outline:none` 去焦点。
- 图标按钮：必须 `aria-label`（如「更多操作」「关闭」）。
- 状态：选中用 `aria-selected`/`aria-pressed`/`aria-checked`，展开用 `aria-expanded`，当前页用 `aria-current="page"`；颜色不是唯一信息（徽标有文字、开关有文字标签）。
- 反馈：Toast 成功= `role=status`、错误= `role=alert`（ui.js 自动）；列表结果数 `aria-live="polite"`。
- 对话框：原生 `<dialog>` + `aria-labelledby`；打开自动聚焦，Esc 关闭，焦点不外泄。
- 标签页：`role=tablist/tab` + `aria-controls` 指向面板 + 方向键（ui.js 的 `UI.tabs`）。
- 表格：表头 `<th scope="col">`（th 默认即 col，可不写）；表格内控件必须有 `aria-label`。
- 骨架屏：容器 `aria-busy="true" aria-label="加载中"`。
- 目标尺寸：触控 ≥44px（`.btn`、`.icon-btn`、菜单项已内置；自写元素必须遵守）。
- 验收：用 axe（implementation.md「自检工具」）跑 light/dark 两主题，violations 必须为 0。

### 深色模式（P2）

- 仅 `<html data-theme="dark">` 生效；**禁止**按系统偏好自动切换，直到「外观」设置上线（`UI.theme` 已备好）。
- 所有颜色经令牌自动适配（17-dark.css）；**深色下禁止**新增任何十六进制值。
- 校园地图随主题使用浅色或深色 atlas 局部令牌，地面、道路、文字与浮层同步适配；图片查看器始终深底。
- 切换入口（P2）：个人中心「网站设置 → 外观」`choice-group`：浅色 / 深色（`UI.theme.set`）。
- 验收：dark 下跑 axe = 0；检查 Toast、对话框、地图、图片查看器四类浮层。

---

## 文案（速查）

> 完整规范与映射表见 [docs/ui/copy.md](./docs/ui/copy.md)。要点：

- 对用户称**你**，不称「您」（系统级警示可保留「您已被封禁」原句式）；按钮用动词短语；确认按钮写具体动作。
- 数字：距离 `UI.formatDistance`（420 米 / 1.2 公里），时长 `UI.formatMinutes`（6 分钟 / 1 小时 15 分钟），文件 `UI.formatBytes`。
- 时间：列表相对时间（`UI.timeEl`），公告/后台绝对时间 `YYYY-MM-DD HH:mm`。
- 后端英文错误必须经 `UI.errorText` 映射为中文；未知错误兜底「操作失败，请稍后再试」。
- 标点：界面用中文标点；数字与英文两侧留空格（「红烧牛腩面 12 元」）；省略号用 `…`。

---

## 页面清单

> 每页的详细规范在 [docs/ui/pages/](./docs/ui/pages/)。P0 = #4 改版范围；P1 = 新功能上线时。

| 文件 | 状态 | 优先级 | 壳 | data-nav | 容器 | 文档 |
| --- | --- | --- | --- | --- | --- | --- |
| index.html | 现有改版 | P0 | 默认 | home | container | [pages/home.md](./docs/ui/pages/home.md) |
| about.html | 废弃 | P0 | — | — | — | [pages/home.md](./docs/ui/pages/home.md)（含替换文件全文） |
| map.html | 现有改版 | P0 | 应用 | map | 全屏 | [pages/map.md](./docs/ui/pages/map.md) |
| forum.html | 现有改版 | P0 | 默认 | forum | container--prose | [pages/forum.md](./docs/ui/pages/forum.md) |
| post.html | 现有改版 | P0 | 默认 | forum | container--prose | [pages/post.md](./docs/ui/pages/post.md) |
| recipe.html | 现有改版 | P0（#5 扩展） | 默认 | recipe | container | [pages/recipe.md](./docs/ui/pages/recipe.md) |
| announcements.html | 现有改版 | P0 | 默认 | announce | container | [pages/announcements.md](./docs/ui/pages/announcements.md) |
| login.html | 现有改版 | P0 | 默认 | — | container--narrow | [pages/login.md](./docs/ui/pages/login.md) |
| register.html | 现有改版 | P0 | 默认 | — | container--narrow | [pages/register.md](./docs/ui/pages/register.md) |
| student_verify.html | 现有改版 | P0 | 默认 | — | container--form | [pages/student-verify.md](./docs/ui/pages/student-verify.md) |
| profile.html | 现有改版 | P0（#7/#9/#10 扩展，#19 拆分，#20 重做） | 默认 | — | container | [pages/profile.md](./docs/ui/pages/profile.md) |
| settings.html | 新建 | P1（#19） | 默认 | — | container | [pages/settings.md](./docs/ui/pages/settings.md) |
| user.html | 新建 | P1（#21） | 默认 | — | container | [pages/user-home.md](./docs/ui/pages/user-home.md) |
| admin.html | 现有改版 | P0（#9/#10 扩展） | 应用 | — | container--wide | [pages/admin.md](./docs/ui/pages/admin.md) |
| 404.html | 新建 | P0 | 默认 | — | container--narrow | [pages/system-pages.md](./docs/ui/pages/system-pages.md) |
| shops.html | 新建 | P1（#6） | 默认 | shops | container | [pages/shops.md](./docs/ui/pages/shops.md) |
| shop-new.html | 新建 | P1（#6） | 默认 | shops | container--form | [pages/shops.md](./docs/ui/pages/shops.md) |
| shop.html | 新建 | P1（#7/#8） | 默认 | shops | container | [pages/shop-detail.md](./docs/ui/pages/shop-detail.md) |
| dish.html | 新建 | P1（#5，〔待产品确认〕） | 默认 | recipe | container--prose | [pages/dishes.md](./docs/ui/pages/dishes.md) |
| inbox.html | 新建 | P1（#9） | 默认 | — | container--prose | [pages/inbox.md](./docs/ui/pages/inbox.md) |

CSS/JS/图标落位：`public/css/site.css`、`public/js/ui.js`、`public/img/icons.svg`、`public/img/favicon.svg`（从 docs/ui/assets/ 复制，见 implementation.md「阶段 0」）。

---

## 实施路线（概览）

> 逐步骤、每步的验收见 [docs/ui/implementation.md](./docs/ui/implementation.md)。

| 阶段 | 内容 | 验收要点 |
| --- | --- | --- |
| 0 基建 | 复制 site.css / ui.js / icons.svg / favicon.svg；建 404.html；后端加 404 兜底路由 | 样张与测试页外观一致；ui.js 测试通过 |
| 1 骨架 | 每页换新骨架（删内联 CSS/页头页脚），脚本只改「必须改」的部分；逐页跑通 | 每页功能不回归；axe 通过 |
| 2 页面细节 | 按各页文档完成状态矩阵、文案、响应式 | 各页验收清单全勾 |
| 3 新功能 | 按 #5→#6→#7→#8→#9→#10 顺序，启用 features 开关 | 对应页面文档验收清单全勾 |

---

## 总验收清单

> 每个页面完成时，除该页清单外，还要过这里。

- [ ] 页面无内联 `<style>`；无十六进制颜色（`site.css` 除外）；无 `rgb(`。
- [ ] 无 `alert(` / `confirm(` / `prompt(`；无 emoji 图标；无字符图标（★ ☆ × ✓ ▼ 👍）。
- [ ] `<title>` 格式正确；每页一个 `h1`；`<html lang="zh-CN">`。
- [ ] `<body>` 带 `data-nav`（如有）；`#siteHeader`、`#siteFooter`（默认壳）、`#siteBanner` 存在；`<main id="main">` 带容器类与 `.main`。
- [ ] 页头/页脚/横幅/用户菜单由 ui.js 渲染且外观与样张一致。
- [ ] 该页文档「JS 钩子清单」全覆盖，控制台零报错。
- [ ] 所有异步区域有 加载/空/错 三态；错误文案是中文（经 `UI.errorText`）。
- [ ] 所有提交按钮有 busy 态；重复点击不产生重复数据。
- [ ] 360px 宽无横向滚动；触控目标 ≥44px。
- [ ] 键盘可完成页面全部操作；焦点环可见；对话框焦点受控。
- [ ] axe 扫描（light+dark）violations = 0。
- [ ] 「有品味」自检 10 条全过。

2026-10-17 骨架屏语义修复：共享 `UI.html.skeleton` 的命名容器使用 `role="status"`，保留 `aria-busy` 和「加载中」名称；外观不变，修复加载过程中普通 div 不允许命名的无障碍问题。
