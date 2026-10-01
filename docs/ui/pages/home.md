# 首页 · index.html（与 about.html 的废弃）

> 状态：现有改版 ｜ 优先级：P0 ｜ 对应 issue：#4 ｜ 依赖：阶段 0 基建 ｜ 壳：默认 ｜ data-nav：`home` ｜ 容器：`container`

## 用途与目标

- 访客的第一印象页：一眼看懂网站是什么、有什么。
- 保留现有「根路径按用户默认页跳转」逻辑：仅在 `/` 打开时，已登录用户跳 `default_page`，未登录/失败则停留本页。
- `index.html#about` 作为「关于我们」的锚点（页脚与 404 页都指向这里）。
- about.html **废弃**：改为一个极简跳转文件（全文见下），不再维护内容。

## 布局

手机（360）：

```text
┌────────────────────────────┐
│ [菜单]  [印]校园信息网    (铃) (头) │ 页头
├────────────────────────────┤
│ ┌────────────────────────┐ │
│ │ 一 苏州中学·三元坊       │ │ Hero（渐变浅底）
│ │ 校园里的信息，           │ │ 24→30px 标题
│ │ 收进一个干净的地方        │ │
│ │ [打开校园地图][逛逛论坛]  │ │ 两个按钮换行
│ └────────────────────────┘ │
│ ┌────┐┌────┐               │ │
│ │地图 ││论坛 │ …5 个入口方块  │ │ 2 列网格
│ └────┘└────┘               │ │
│ ┌────────────────────────┐ │ │
│ │ 更新公告  查看全部 →      │ │ P2：最新公告 3 条
│ │ · 2026-10-01 标题…      │ │
│ └────────────────────────┘ │
│ ┌────────────────────────┐ │
│ │ 关于我们                 │ │
│ │ 发起原因                 │ │ about 区（双栏→单列）
│ │ 联系方式                 │ │
│ └────────────────────────┘ │
│ 页脚                         │
└────────────────────────────┘
```

桌面（1280）：Hero 全宽（左文右水印），入口方块 5 列网格，公告与 about 同上，容器 1088。

## HTML 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F5F3EE">
<title>校园信息网</title>
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/site.css">
</head>
<body data-nav="home">
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<main id="main" class="main container">
  <section class="hero">
    <svg class="hero__mark" aria-hidden="true"><use href="img/icons.svg#brand-glyph"></use></svg>
    <div class="hero__inner">
      <span class="hero__eyebrow">苏州中学 · 三元坊</span>
      <h1 class="hero__title">校园里的信息，<br>收进一个干净的地方</h1>
      <p class="hero__lead">校园地图、论坛、食堂菜谱、三元坊必吃榜——少一点打扰，多一点有用的内容。</p>
      <div class="hero__actions">
        <a class="btn btn--primary btn--lg" href="map.html"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-map"></use></svg>打开校园地图</a>
        <a class="btn btn--lg" href="forum.html">逛逛论坛</a>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h2 class="section__title">功能入口</h2></div>
    <div class="grid grid--sm">
      <article class="card card--interactive tile" data-hue="teal">
        <span class="tile__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="img/icons.svg#i-map"></use></svg></span>
        <h3 class="tile__title"><a class="card__link" href="map.html">校园地图</a><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-arrow-right"></use></svg></h3>
        <p class="tile__desc">楼层切换，点击建筑查看介绍</p>
      </article>
      <!-- 重复 tile：论坛(message/wisteria)、菜谱评价(utensils/ochre)、必吃榜(store/vermilion, features.shops)、更新公告(megaphone/indigo)；标题层级用 h3；必吃榜仅当 UI.config.features.shops 时渲染 -->
    </div>
  </section>

  <!-- P2：最新公告（features 未定，先不做） -->

  <section class="section" id="about">
    <div class="section__head"><h2 class="section__title">关于我们</h2></div>
    <div class="card">
      <section class="about">
        <h3 class="about__label">我们是什么</h3>
        <div class="about__body">
          <p>「校园信息网」是一个由学生维护的校园信息站，集成了可切换楼层的交互式校园地图、论坛、菜谱评价、三元坊必吃榜与更新公告，并配套一套完整的账号与权限系统。</p>
          <p>我们希望把校园里分散的信息集中到一个简洁、清爽的地方，用最少的视觉干扰，呈现最有用的内容。</p>
        </div>
      </section>
      <section class="about">
        <h3 class="about__label">发起原因</h3>
        <div class="about__body">
          <p>最初它只是一个纯静态的校园地图页面，为了让地图数据便于维护与更新，逐步改造为动态站点，把几何数据抽离出来。</p>
          <p>此后我们陆续加入账号系统、论坛与回复、菜谱评价、更新公告、学生认证、全站横幅与个人设置等功能，希望让它从一个地图工具成长为一个真正好用的校园信息平台。</p>
        </div>
      </section>
      <section class="about">
        <h3 class="about__label">联系方式</h3>
        <div class="about__body">
          <div class="kv">
            <div class="kv__row"><span class="kv__k">邮箱</span><span class="kv__v">contact@example.com</span></div>
            <div class="kv__row"><span class="kv__k">QQ</span><span class="kv__v">123456789</span></div>
          </div>
        </div>
      </section>
    </div>
  </section>
</main>
<div id="siteFooter"></div>
<script src="js/ui.js"></script>
<script>
  /* 根路径默认页跳转（保留原逻辑，原样搬迁；仅在 pathname 为 "/" 时生效） */
  (function () {
    if (location.pathname !== "/" && location.pathname !== "") return;
    function go(target) {
      if (!target || target === "index.html") return;
      location.replace(target);
    }
    var token = localStorage.getItem("token");
    if (token) {
      fetch("/api/user/profile", { headers: { "Authorization": "Bearer " + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && d.user && d.user.default_page) go(d.user.default_page);
          else go(localStorage.getItem("defaultPage"));
        })
        .catch(function () { go(localStorage.getItem("defaultPage")); });
    } else {
      go(localStorage.getItem("defaultPage"));
    }
  })();
  /* 必吃榜入口按开关渲染（简单做法：features.shops 为 false 时移除该 tile） */
  UI.ready(function () {
    if (!UI.config.features.shops) {
      var t = document.querySelector('[data-hue="vermilion"]');
      if (t && t.classList.contains('tile')) t.remove();
    }
  });
</script>
</body>
</html>
```

注意：`#about` 区正文必须保留换行结构；`kv` 里的联系方式是**占位符**，上线前必须替换为真实信息；若某项联系方式未定稿，删除该 `kv__row`（**禁止**显示占位假数据给用户）。旧文案里的「黑白极简风格」已替换为上文的「简洁、清爽」表述。

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| 无 ID 钩子（旧页脚本读 localStorage + fetch） | 默认页跳转 | 原样保留在上文脚本区 | 保留 |
| `auth.js` 引入 | 页头/横幅/头像 | 由 `js/ui.js` 接管（`#siteHeader` 占位） | 删除旧引用 |
| 旧内联 `<style>` | 全部页面样式 | `css/site.css` | 删除 |
| 旧 `.header/.nav/.btn` HTML | 页头 | ui.js 生成 | 删除 |

## 需要修改的脚本行为

1. 删除 `auth.js` 引用 → 改为 `js/ui.js`（本页 `data-nav="home"` 已使 ui.js 自动挂页头）。
2. 默认页跳转脚本：原逻辑保留（放在 ui.js 之后亦可，逻辑独立）。
3. 无其它脚本行为变更（本页原无 alert/confirm）。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 默认 | 正常 | Hero + 入口 + 关于 |
| 登录用户访问 `/` 且设了默认页 | fetch profile 成功 | `location.replace(default_page)`（本页仅闪现） |
| 默认页为空/未登录 | — | 停留本页 |
| 接口失败 | profile/横幅失败 | 停留本页；横幅静默不显示 |
| 离线 | offline 事件 | 顶部黄条（ui.js 自动） |

## 响应式

- 360：Hero 内边距 `--sp-5`，标题 30px，按钮换行；入口 2 列（`grid--sm` 自动）；about 单列。
- 768：标题 40px；入口 3–4 列（auto-fill）；about 双列（14rem + 1fr）。
- 1100：标题 52px；入口 5 列满排。

## 边界场景

- 用户把默认页设为已废弃页面 → 后端/设置页校验值域（profile.md）；历史脏数据：`go()` 对未知值 `location.replace` 会 404 → 可接受（404 页兜底）。
- 首页作为分享落地页：无 token 且无 defaultPage → 停留本页（正确）。
- 深色模式：Hero 渐变与水印由令牌驱动，无需处理。

## 无障碍要点

- Hero 标题是本页唯一 h1；入口标题用 h3（在 h2 之下）；`tile__title` 内的链接可聚焦（card__link 已处理）。
- 水印 SVG `aria-hidden`；跳转链接 skip-link。

## 验收清单

- [ ] 未登录打开 `/` 停留本页；已登录且默认页=地图时打开 `/` 跳到地图。
- [ ] `index.html#about` 直达关于区块（吸顶不遮挡：html 已设 scroll-padding-top）。
- [ ] features.shops=false 时无必吃榜入口；true 时出现。
- [ ] 页头/页脚/横幅与样张一致；无旧内联样式。
- [ ] 360px 无横向滚动；axe = 0 违规。

---

# about.html · 废弃

用下面全文替换 `public/about.html`（保留文件以免旧链接 404）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>关于我们 · 校园信息网</title>
<script>location.replace("index.html#about");</script>
</head>
<body>
<noscript><p style="padding:2rem;font-family:sans-serif">关于我们已合并到<a href="index.html#about">网站首页</a>。</p></noscript>
</body>
</html>
```

验收：访问 `about.html` 立即跳 `index.html#about`；无 JS 时显示提示链接。
