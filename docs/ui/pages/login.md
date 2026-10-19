# 登录 · login.html

## 当前视觉与布局 · 2026-10-17

登录页改为居中窄表单，无外部投影卡片，28px 标题和绿色「府」字章；顶栏单一登录入口，表单下仍提供注册，所有校验与封禁申诉保留。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：现有改版 ｜ 优先级：P0 ｜ issue：#4 ｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：无 ｜ 容器：`container--narrow` + `.auth`

## 用途与目标

登录卡片式页面；处理三种登录结果（成功 / 凭据错误 / 被封禁）；被封且允许申诉时在卡内展开申诉表单。支持 `?next=` 回跳。

## 布局

```text
手机 360                     桌面 1280
┌──────────────────┐   ┌────────────────────────────┐
│ 页头              │   │        页头                 │
│ ┌──────────────┐ │   │      ┌──────────┐          │
│ │  [印章]       │ │   │      │ [印章]    │          │
│ │  欢迎回来     │ │   │      │ 欢迎回来  │          │
│ │ (封禁提示条)   │ │   │      │ 用户名 ___ │          │
│ │ 用户名 ____   │ │   │      │ 密码 ___[眼]│          │
│ │ 密码  ___ [眼]  │ │   │      │ [  登录  ] │          │
│ │ [  登录  ]    │ │   │      │ 还没有账号?注册│        │
│ │ 还没有…注册    │ │   │      └──────────┘          │
│ └──────────────┘ │   └────────────────────────────┘
└──────────────────┘   封禁时：卡内 alert--danger + 申诉区（分割线下）
```

## HTML 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFFFFF">
<title>登录 · 拾光酥糕</title>
<link rel="icon" href="/img/suzhou-high-school-mark.png?v=20261018" type="image/png">
<link rel="stylesheet" href="css/site.css">
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<main id="main" class="auth container container--narrow">
  <div class="card auth-card">
    <div class="auth-card__brand"><svg class="brand__mark" aria-hidden="true"><use href="img/icons.svg#brand-mark"></use></svg></div>
    <h1 class="auth-card__title">欢迎回来</h1>
    <p class="auth-card__desc">登录后即可发帖、评价和管理个人设置</p>

    <form id="loginForm" class="form" autocomplete="on" novalidate>
      <div id="loginAlert" hidden></div>
      <div class="field">
        <label class="field__label" for="username">用户名</label>
        <input class="input" id="username" name="username" type="text" autocomplete="username" enterkeyhint="go" required>
      </div>
      <div class="field">
        <label class="field__label" for="password">密码</label>
        <div class="input-group">
          <input class="input input--end" id="password" name="password" type="password" autocomplete="current-password" enterkeyhint="go" required>
          <div class="input-group__end"><button type="button" class="icon-btn icon-btn--sm" data-password-toggle aria-label="显示密码"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-eye"></use></svg></button></div>
        </div>
      </div>
      <button type="submit" class="btn btn--primary btn--lg btn--block" id="submitBtn">登录</button>
    </form>

    <div class="auth-card__section" id="appealBox" hidden>
      <h2 class="form__group-title">申请解封</h2>
      <div class="field" data-upload data-max-mb="2" data-types="image/jpeg,image/png">
        <label class="field__label" for="appealReason">申诉理由</label>
        <textarea class="textarea" id="appealReason" placeholder="请说明情况，以便管理员审核" data-counter="500"></textarea>
        <div class="field__foot"><span class="field__hint">重复提交将覆盖上一次申请；10 分钟内只能提交一次。</span><span class="field__counter"></span></div>
      </div>
      <div class="field" data-upload data-max-mb="2" data-types="image/jpeg,image/png">
        <span class="field__label">上传图片 <span class="field__opt">（选填）</span></span>
        <label class="upload"><span class="upload__icon"><svg class="icon icon--lg" aria-hidden="true"><use href="img/icons.svg#i-image"></use></svg></span><span class="upload__title">点击选择图片</span><span class="upload__hint">JPG / PNG，不超过 2 MB</span><input type="file" id="appealImageInput" accept="image/jpeg,image/png"></label>
        <div class="upload-preview-slot"></div>
      </div>
      <button type="button" class="btn btn--block" id="appealSubmit">提交申诉</button>
    </div>

    <p class="auth-card__switch">还没有账号？<a href="register.html">立即注册</a></p>
  </div>
</main>
<div id="siteFooter"></div>
<script src="js/ui.js"></script>
<script src="login.page.js"></script><!-- 或将下方脚本内联 -->
</body>
</html>
```

注：上传项与理由合并示例已给出；**两个 `data-upload` 分开成两个 `.field`**（一个 textarea，一个文件）。

页面脚本（完整替换旧脚本；可内联）：

```js
var form = document.getElementById("loginForm");
var submitBtn = document.getElementById("submitBtn");
var attemptUsername = "";
var lastResponse = null;           // 记录 banned 响应，申诉用

UI.api("/api/user/profile", { auth: false }).then(function () {}); // 预热可省略

form.addEventListener("submit", function (e) {
  e.preventDefault();
  UI.form.clearAll(form);
  var username = document.getElementById("username").value.trim();
  var password = document.getElementById("password").value;
  if (!username) { UI.form.fieldError(document.getElementById("username"), "请输入用户名"); return; }
  if (!password) { UI.form.fieldError(document.getElementById("password"), "请输入密码"); return; }
  UI.form.busy(submitBtn, true);
  UI.api("/api/login", { method: "POST", auth: false, body: { username: username, password: password } }).then(function (r) {
    if (r.ok) {
      localStorage.setItem("token", r.data.token);
      localStorage.setItem("user", JSON.stringify(r.data.user));
      UI.toast.success("登录成功");
      setTimeout(function () { location.href = UI.nextUrl("index.html"); }, 500);
      return;
    }
    UI.form.busy(submitBtn, false);
    if (r.status === 403 && r.data && r.data.error === "banned") { showBanned(username, r.data); return; }
    var msg = r.data.error === "invalid username or password" ? "用户名或密码错误" : UI.errorText(r, "登录失败");
    UI.toast.error(msg);
  });
});

function showBanned(username, data) {
  attemptUsername = username;
  lastResponse = data;
  var box = document.getElementById("loginAlert");
  var reason = data.ban_reason ? String(data.ban_reason) : "";
  box.hidden = false;
  box.innerHTML = '<div class="alert alert--danger" role="alert"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-ban"></use></svg><div class="alert__body"><span class="alert__title">账号已被封禁</span>' +
    (reason ? UI.esc("封禁理由：" + reason) : "未填写封禁理由") + "</div></div>";
  if (Number(data.allow_appeal) === 1) {
    document.getElementById("appealBox").hidden = false;
    document.getElementById("appealReason").focus();
  } else {
    box.querySelector(".alert__body").insertAdjacentHTML("beforeend", "<br>您已被封禁，如要解封请线下联系超级管理员");
  }
}

var uploadRoot = document.querySelector('#appealBox [data-upload]');
UI.upload.bind(uploadRoot);

document.getElementById("appealSubmit").addEventListener("click", function () {
  var btn = this;
  var reason = document.getElementById("appealReason").value.trim();
  if (!reason) { UI.form.fieldError(document.getElementById("appealReason"), "请填写申诉理由"); return; }
  if (!attemptUsername) { UI.toast.error("登录失败状态已失效，请重新尝试登录"); return; }
  var file = UI.upload.get(uploadRoot);
  UI.form.busy(btn, true);
  function send(dataUrl) {
    UI.api("/api/user/appeal", { method: "POST", auth: false, body: { username: attemptUsername, appeal_reason: reason, appeal_image: dataUrl || "" } }).then(function (r) {
      UI.form.busy(btn, false);
      if (!r.ok) { UI.toast.error(UI.errorText(r, "提交失败")); return; }
      UI.toast.success("申诉已提交，请等待管理员审核");
      document.getElementById("appealReason").value = "";
      UI.upload.clear(uploadRoot);
    });
  }
  if (file) {
    var reader = new FileReader();
    reader.onload = function () { send(reader.result); };
    reader.onerror = function () { send(""); };
    reader.readAsDataURL(file);
  } else { send(""); }
});
```

## 需要修改的脚本行为

- 申诉图片读取为 DataURL（≤2MB 已由 `UI.upload` 校验）；FileReader 失败时静默降级为不带图提交（原逻辑保留）。
- 429（`rate_limited`）时：`UI.toast.error(UI.errorText(r))`（message 直显）+ 按钮 `UI.countdown(r.data.retry_after, n => btn.textContent='等待 '+UI.formatCountdown(n), ()=>{btn.textContent='提交申诉';})`。
- 旧脚本不使用 `renderAuth`；ui.js 自动渲染页头。
- 保留钩子：`loginForm / username / password / submitBtn / appealBox / appealReason / appealImageInput / appealSubmit`（appealImageChoose 已由 upload 组件取代 → 删除）。

## JS 钩子清单（旧 → 新）

| 旧钩子 | 旧用途 | 新位置 | 处置 |
| --- | --- | --- | --- |
| #loginForm / #username / #password / #submitBtn | 登录提交 | 骨架同 ID | 保留 |
| #msg / .msg.error/.ok | 登录消息 | 结果反馈改 Toast；封禁改 `#loginAlert` 内 alert | 替换（删除 #msg） |
| #appealBox | 申诉容器 | 同 ID（`hidden` 属性代替 style.display） | 保留 |
| #appealReason | 理由 | 同 ID | 保留 |
| #appealImageChoose / #appealImageInput / #appealImageName | 选图 | `UI.upload` 组件（#appealImageInput 保留在 upload 内） | choose/name 删除 |
| #appealMsg | 申诉结果文字 | 结果反馈改用 Toast | 删除 |
| #appealSubmit | 提交申诉 | 同 ID | 保留 |
| .switch（底部链接区） | 注册引导 | `.auth-card__switch` | 替换 |

## 状态矩阵

| 状态 | 触发 | 界面与文案 |
| --- | --- | --- |
| 默认 | 正常 | 登录卡 |
| 提交中 | submit | 按钮 busy「登录」（转圈） |
| 成功 | 200 | toast「登录成功」→ 0.5s 跳 next/index |
| 凭据错误 | 401 invalid… | toast「用户名或密码错误」 |
| 字段为空 | 前端校验 | 字段错误「请输入用户名 / 请输入密码」 |
| 封禁+可申诉 | 403 banned, allow_appeal=1 | 红 alert（理由）+ 申诉区展开 + 焦点到理由框 |
| 封禁+不可申诉 | allow_appeal=0 | 红 alert + 追加「您已被封禁，如要解封请线下联系超级管理员」 |
| 封禁+无理由 | ban_reason 空 | alert 标题下显示「未填写封禁理由」 |
| 申诉空理由 | 前端校验 | 字段错误「请填写申诉理由」 |
| 申诉提交中 | click | 按钮 busy |
| 申诉成功 | 200 | toast「申诉已提交，请等待管理员审核」+ 清空表单 |
| 申诉失败 | 4xx/网络 | toast（含 429 message 直显） |
| 申诉限流 | 429 | toast + 按钮倒计时（copy.md §6） |
| 已登录访问 | token 存在 | 不强制跳转（保留现行为）；页头显示头像 |
| 离线 | 提交失败 status 0 | toast「网络连接失败，请检查网络后重试」 |

## 响应式

- 360：卡片全宽（`max-width:100%`），内边距 24；按钮整行。
- 768：卡片 400px 居中，加 `--sh-2` 阴影；上下垂直居中（`.auth` 已处理）。
- 密码显隐按钮 32px（触屏 44）。

## 边界场景

- `?next=` 指向外部/非法 → `UI.nextUrl` 已过滤回 index。
- 申诉图片 2MB 精确校验在 `UI.upload`（「图片不能超过 2 MB（当前 X）」）。
- banned 响应缺字段（ban_reason/allow_appeal 缺失）→ 按无理由 / 不可申诉处理（`Number(undefined)=NaN ≠ 1`）。
- 已登录用户再次登录另一账号 → 正常覆盖 localStorage（可接受）。
- 双击登录 → busy 防重。

## 无障碍要点

- 密码显隐按钮 aria-label 随状态切换（ui.js 已做）。
- 封禁 alert 用 `role="alert"`；申诉区展开后焦点移入理由框。
- Enter 提交（表单 submit）；登录按钮 type=submit。

## 验收清单

- [ ] 三种登录结果（成功/错误/封禁两分支）全部正确呈现。
- [ ] `?next=/forum.html` 登录后回论坛；无 next 回首页。
- [ ] 申诉全流程：理由校验、图片选择/预览/移除、DataURL 提交、成功/失败/限流倒计时。
- [ ] 无 alert/confirm；错误文案全中文；360px 正常。
- [ ] 页头未登录态（登录 ghost + 注册 primary）正确显示。
