# 系统页面与全局状态 · system-pages.md

> 状态：新建（404）+ 全局规则 ｜ 优先级：P0（404、noscript、旧浏览器）；其余随场景触发 ｜ issue：#4

> 本页为系统页与全局状态集合，不套用模板 G 的单页结构，各小节的定位如下：
> - **用途与目标**：本页收集“非内容型页面”与“全局状态”的呈现规则；404/权限态/维护等每条目自带触发条件与呈现。
> - **布局**：各条目的呈现方式本身（整页空态、提示条等），无独立线框。
> - **HTML 骨架**：§1 的 404 完整文件与各条目内给出的模板片段。
> - **状态矩阵 / 响应式 / 边界场景**：每条目内自带（触发 → 呈现；涉及布局的注明断点）。
> - **JS 钩子清单 / 需要修改的脚本行为**：不适用（404 与各模板均为新内容，无旧代码可迁移）。

## 1. 404.html（完整文件）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>页面不存在 · 校园信息网</title>
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="css/site.css">
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<main id="main" class="auth container container--narrow">
  <div class="card" style="text-align:center">
    <div class="empty">
      <div class="empty__icon"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-compass"></use></svg></div>
      <div class="empty__title">页面不存在或已被删除</div>
      <div class="empty__desc">地址可能输入有误，或内容已被移除。</div>
      <div class="empty__actions">
        <a class="btn btn--primary" href="/">返回首页</a>
        <a class="btn" href="forum.html">去论坛</a>
      </div>
    </div>
  </div>
</main>
<script src="js/ui.js"></script>
</body>
</html>
```

注意：404 页**不渲染页头/页脚**（不设 `data-nav`，不放占位 div）——保持极简；404 时站点页头的导航也无意义。

后端兜底路由见 implementation.md「阶段 0」。验收：任意不存在的无扩展名路径 → 404 状态码 + 本页；`/api/xxx` 仍返回 JSON 404；`/uploads/xxx`、静态文件 404 保持原样（extname 排除已处理）。

## 2. 整页权限态模板（页面内复用）

页面脚本遇到无权限时，替换 `<main>` 内容：

```js
main.innerHTML = UI.html.empty({
  tone: "lock", icon: "lock",
  title: "暂无权限访问管理后台",            // 或「请先登录」「需要学生认证」
  desc: "此页面需要管理员及以上权限。",      // 一句原因
  actions: [{ label: "返回首页", href: "index.html" }, { label: "去登录", href: "login.html" }]  // 1–2 个，按场景
});
```

变体文案：
- 未登录：title「请先登录」desc「登录后才能访问{{页面名}}。」actions=[去登录(primary)]（或直接 `UI.goLogin()` 自动跳，二选一——需要用户知情时用本模板，纯重定向用 goLogin）。
- 需认证：title「需要学生认证」desc「认证为学生后才能{{动作}}。」actions=[去认证(primary), 返回]。
- 无管理权限：title「暂无权限访问管理后台」desc「此页面需要管理员及以上权限。」actions=[返回首页]。

## 3. 服务器错误整页

- 触发：页面数据接口 500 且该页无任何可呈现内容。
- 呈现：`empty--error`「服务器开小差了」/「请稍后再试，或提交工单告诉我们。」actions=[重试(带 data-retry), 提交工单→profile.html#tickets]。
- **禁止**为此新建独立 500.html（现有架构由前端状态承担）。

## 4. 维护中页面

- 触发：〔待产品确认：目前无维护开关；如需，后端加 `/api/maintenance`〕
- 呈现（约定）：整页 empty「网站维护中」「预计 {{时间}} 恢复，稍后回来看看。」actions=[]；页头正常显示。

## 5. `<noscript>`

每页 `<body>` 开头（skip-link 之前或之后均可）：

```html
<noscript>
  <div class="alert alert--warning" role="alert" style="margin:1rem">
    <svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-alert-triangle"></use></svg>
    <div class="alert__body">本站需要启用 JavaScript 才能正常使用。</div>
  </div>
</noscript>
```

（noscript 内 `<use>` 不会生效——图标可省，只留文字 div；见下简化版）最终采用：

```html
<noscript><div class="alert alert--warning" role="alert" style="margin:1rem"><div class="alert__body">本站需要启用 JavaScript 才能正常使用。</div></div></noscript>
```

## 6. 浏览器过旧提示

特性检测（放 `js/ui.js` 之后或独立内联；每页无需自写，由 ui.js 开头执行）：

```js
var ok = !!window.HTMLDialogElement && !!window.CSS && !!CSS.supports && CSS.supports("color", "var(--x)") && "fetch" in window;
if (!ok) {
  document.body.insertAdjacentHTML("afterbegin",
    '<div class="alert alert--warning" role="alert" style="margin:1rem"><div class="alert__body">你的浏览器版本过旧，部分功能无法使用。建议升级浏览器或换用新版 Edge / Chrome / Safari。</div></div>');
}
```

（此段应并入 ui.js 开头；本文档为规范出处。）〔实施：在 ui.js「自动初始化」前插入；无对应功能时页面自行降级为静态可读——不做 polyfill〕

## 7. 内容被删除的空状态

- 帖子 → post.md；店铺 → shop-detail.md；菜品 → dishes.md；图片 → 占位。
- 通用模板：`UI.html.empty({icon:'trash', title:'{{内容}}不存在或已被删除', desc:'', actions:[{label:'返回{{列表名}}', href:'…'}]})`。

## 8. 登录过期流程

- 触发：任何带 token 的请求返回 401。
- 处理（ui.js 自动）：清 token/user → toast.warning「登录已过期，请重新登录」→ 0.9s 后 `UI.goLogin()`（带 next）。
- 页面脚本禁止自行处理 401（`UI.api({on401:false})` 显式豁免除外，如登录页预检）。

## 9. 使用中被封禁

- 触发：操作返回 403 且语义为封禁（登录接口返回 banned 才有详情；其它 403 统一无权限文案）。
- 处理：toast「你没有权限执行此操作」；若后端在 403 body 明确 `error:"banned"` → toast「账号已被封禁」+ 0.9s 跳登录页（登录页展示封禁详情）。〔接口现状：操作类 403 无 banned 标记；登录页有。按现状实现〕

## 10. 跨标签页登录状态同步（P2）

- 方案：`window.addEventListener('storage', e => { if (e.key === 'token' || e.key === 'user') UI.shell.refreshAuth(); })`——并入 ui.js（P2 任务）；P0 不实现。

## 11. 离线 / 恢复

- 见 UI.md「状态与反馈」表 + components.md「Offline Bar」。恢复后的 toast「网络已恢复」（ui.js 自动）；数据刷新由用户驱动。

## 12. 验收清单

- [ ] 未知路径 → 404 页（状态码 404）；API/uploads 不受影响。
- [ ] 整页权限态三变体文案正确；有唯一 CTA。
- [ ] noscript 提示显示；旧浏览器提示条（禁用 dialog 特性模拟）。
- [ ] 登录过期：任意页操作触发 → 清会话 + 提示 + next 回跳。
- [ ] 打印：公告/帖子详情打印干净（无按钮页头）。
