# 注册 · register.html

## 当前视觉与布局 · 2026-10-17

注册页使用居中窄表单、青柠切面标志与细边框输入；保留昵称、用户名、密码与注册后登录流程，账户页共享新页脚和主题切换。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：现有改版 ｜ 优先级：P0 ｜ issue：#4 ｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：无 ｜ 容器：`container--narrow` + `.auth`

## 用途与目标

注册四要素（用户名/昵称/密码/确认密码），成功后自动登录并跳 `next`。视觉与 login.md 完全同构（同一张卡），仅表单不同。

## 布局

同 login.md 的卡片布局；标题「创建账号」，副标题「注册后即可发帖、评价与认证学生」。下方切换行：「已有账号？立即登录」。

## HTML 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFFFFF">
<title>注册 · 拾光酥糕</title>
<link rel="icon" href="/img/brand-lime.svg?v=20261019" type="image/svg+xml">
<link rel="stylesheet" href="css/site.css">
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<main id="main" class="auth container container--narrow">
  <div class="card auth-card">
    <div class="auth-card__brand"><svg class="brand__mark" aria-hidden="true"><use href="img/icons.svg#brand-mark"></use></svg></div>
    <h1 class="auth-card__title">创建账号</h1>
    <p class="auth-card__desc">注册后即可发帖、评价与认证学生</p>
    <form id="registerForm" class="form" autocomplete="on" novalidate>
      <div class="field">
        <label class="field__label" for="username">用户名</label>
        <input class="input" id="username" name="username" type="text" autocomplete="username" enterkeyhint="next" required>
        <div class="field__hint">注册后不可修改</div>
      </div>
      <div class="field">
        <label class="field__label" for="nickname">昵称</label>
        <input class="input" id="nickname" name="nickname" type="text" autocomplete="nickname" enterkeyhint="next" required data-counter="20">
        <div class="field__foot"><span class="field__hint">最多 20 字</span><span class="field__counter"></span></div>
      </div>
      <div class="field">
        <label class="field__label" for="password">密码</label>
        <div class="input-group">
          <input class="input input--end" id="password" name="password" type="password" autocomplete="new-password" enterkeyhint="next" required>
          <div class="input-group__end"><button type="button" class="icon-btn icon-btn--sm" data-password-toggle aria-label="显示密码"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-eye"></use></svg></button></div>
        </div>
      </div>
      <div class="field">
        <label class="field__label" for="confirm">确认密码</label>
        <input class="input" id="confirm" name="confirm" type="password" autocomplete="new-password" enterkeyhint="go" required>
      </div>
      <button type="submit" class="btn btn--primary btn--lg btn--block" id="submitBtn">注册</button>
    </form>
    <p class="auth-card__switch">已有账号？<a href="login.html">立即登录</a></p>
  </div>
</main>
<div id="siteFooter"></div>
<script src="js/ui.js"></script>
<script>
var form = document.getElementById("registerForm");
var submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", function (e) {
  e.preventDefault();
  UI.form.clearAll(form);
  var username = document.getElementById("username").value.trim();
  var nickname = document.getElementById("nickname").value.trim();
  var password = document.getElementById("password").value;
  var confirm = document.getElementById("confirm").value;
  var bad = null;
  if (!username) bad = ["username", "请输入用户名"];
  else if (!nickname) bad = ["nickname", "请输入昵称"];
  else if (!password) bad = ["password", "请输入密码"];
  else if (password !== confirm) bad = ["confirm", "两次输入的密码不一致"];
  if (bad) { UI.form.fieldError(document.getElementById(bad[0]), bad[1]); UI.form.focusFirstInvalid(form); return; }
  UI.form.busy(submitBtn, true);
  UI.api("/api/register", { method: "POST", auth: false, body: { username: username, nickname: nickname, password: password } }).then(function (r) {
    if (!r.ok) { UI.form.busy(submitBtn, false); UI.toast.error(UI.errorText(r, "注册失败")); return; }
    return UI.api("/api/login", { method: "POST", auth: false, body: { username: username, password: password } }).then(function (lr) {
      if (lr.ok) {
        localStorage.setItem("token", lr.data.token);
        localStorage.setItem("user", JSON.stringify(lr.data.user));
      }
      UI.toast.success("注册成功");
      setTimeout(function () { location.href = UI.nextUrl("index.html"); }, 500);
    });
  });
});
UI.qsa('[data-counter]').forEach(UI.form.counter);
</script>
</body>
</html>
```

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| #registerForm / #username / #nickname / #password / #confirm / #submitBtn | 表单 | 同 ID | 保留 |
| #msg | 结果文字 | Toast + 字段错误 | 删除 |
| errorMap 对象 | 英文→中文 | `UI.errorText`（统一映射，copy.md 5.2） | 删除 |

## 需要修改的脚本行为

1. 校验改为逐字段内联错误 + 聚焦首个错误（上文脚本已含）。
2. 密码不一致错误挂在「确认密码」字段（原版也是 msg，改内联）。
3. 错误文案经 `UI.errorText`；成功提示 toast；跳转用 `UI.nextUrl("index.html")`。
4. 注册接口 409（username already exists）→ toast「用户名已被占用」并把错误标在用户名字段：`UI.form.fieldError(document.getElementById('username'), '用户名已被占用')`。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 默认 | 正常 | 注册卡 |
| 提交中 | submit | busy |
| 成功 | 201 + 登录 | toast「注册成功」→ 跳转 |
| 用户名重复 | 409 | toast + 用户名字段内联「用户名已被占用」 |
| 字段空/不一致 | 前端 | 内联错误 + 聚焦 |
| 网络失败 | status 0 | toast「网络连接失败…」 |
| 已登录访问 | token 存在 | 不强制跳转（与 login 一致） |

## 响应式

- 360：全宽卡；768：400px 居中卡 + 阴影。昵称计数 20（软限制 〔待产品确认〕）。

## 边界场景

- 自动登录失败（login 401）→ 仍提示注册成功并跳登录页（罕见，可接受；toast 文案「注册成功，请登录」）。

## 无障碍要点

- 密码显隐按钮 aria-label 切换；字段错误与 aria-invalid 由 UI.form 维护。

## 验收清单

- [ ] 四字段校验全内联并聚焦首个错误。
- [ ] 重复用户名 → toast + 用户名字段错误。
- [ ] 成功后自动登录并跳 next（`?next=` 生效）。
- [ ] 昵称计数器工作；密码显隐切换正常。
- [ ] 无 alert/confirm；控制台零报错；360/768 正常。


### 2026-10-19 · 共享标识与运营声明

浏览器图标改为 `brand-lime.svg` 青柠切面；共享顶栏、抽屉、页脚及登录/注册卡片复用该图形，首页链接名称仍为「拾光酥糕 首页」。有页脚的页面展示完整学生自主运营、与校方无隶属关系、知识产权和信息参考声明，勘误邮箱可点击。地图应用壳与极简 404 页继续不显示页脚。完整文字见 [文案规范](../copy.md)。
