# 学生认证 · student_verify.html

## 2026-10-25 · 导航行为同步

认证页站内链接支持意图预加载；等待目标期间保留当前内容、离开提醒和滚动，正文保留可用视口高度。 共同规则见 [导航与加载规范](../../navigation.md)，实际验证见根目录 MAP 与 UI 验收记录。

## 当前 React 实现 · 2026-10-25

实现位于 `apps/web/src/pages/`：AuthPages.tsx 中的 StudentVerifyPage、../layouts/StudentVerifyLayout.tsx。保留邀请码直接认证与人工申请；成功刷新个人资料，补充说明字数由组件管理，审核权限沿用原规则。

视觉令牌和资源位于 `apps/web/public/`；共享站点壳、弹窗、上传、主题和用户展示见 [组件规范](../components.md)。本页 HTML/CSS 示例用于说明最终 DOM 与视觉约束，旧 `UI.*` 或页面脚本示例属于迁移前实现，不是当前可调用 API。当前请求由 TanStack Query、路径/查询/hash 由 TanStack Router 管理，后端为 Hono + Drizzle。最新验证见根目录 [MAP.md](../../../MAP.md) 与 [验收记录](../acceptance.md)。


## 当前视觉与布局 · 2026-10-17

学生认证沿用原申请与邀请码流程，改为无外部大阴影的居中表单，所有审核状态和中文提示使用新版组件。 全站品牌字标为「拾光酥糕」，详细公共尺寸见 [UI.md](../../../UI.md)。本轮验证结果见 [验收记录](../acceptance.md) 和根目录 [MAP.md](../../../MAP.md)。

> 状态：现有改版 ｜ 优先级：P0 ｜ issue：#4 ｜ 依赖：阶段 0 ｜ 壳：默认 ｜ data-nav：无 ｜ 容器：`container--form`

## 用途与目标

未达学生角色的用户提交认证（新生号/班级/真实姓名 + 可选邀请码与补充信息）；填有效邀请码立即通过；否则进入待审核（10 分钟限流）。已达 student 的用户看到成功态。

## 布局

```text
手机 360                     桌面 1280
┌──────────────────┐   ┌────────────────────────────┐
│ 页头              │   │ 页头                        │
│ ┌──────────────┐ │   │   ┌────────────────┐       │
│ │ 学生认证       │ │   │   │ 学生认证         │       │
│ │ 说明一句       │ │   │   │ 说明一句         │       │
│ │ 新生号 ____   │ │   │   │ 新生号 ____      │       │
│ │ 班级   ____   │ │   │   │ 班级   ____      │       │
│ │ 真实姓名 ____  │ │   │   │ 真实姓名 ____    │       │
│ │ 邀请码 ____   │ │   │   │ 邀请码 ____ (选填)│       │
│ │ 补充信息 ____ │ │   │   │ 补充信息 ____     │       │
│ │ [ 提交认证 ]  │ │   │   │ [ 提交认证 ]      │       │
│ └──────────────┘ │   │   └────────────────┘       │
└──────────────────┘   └────────────────────────────┘
已认证态：卡内居中 [已认证] 实心徽标 + 「你已认证为学生」
```

## HTML 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFFFFF">
<title>学生认证 · 拾光酥糕</title>
<link rel="icon" href="/img/brand-lime.svg?v=20261019" type="image/svg+xml">
<link rel="stylesheet" href="css/site.css">
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<div id="siteBanner"></div>
<div id="siteHeader"></div>
<main id="main" class="auth container container--form">
  <div class="card auth-card auth-card--wide">
    <div id="alreadyBox" class="empty empty--compact" hidden>
      <div class="empty__icon"><svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-graduation"></use></svg></div>
      <div class="empty__title">你已认证为学生</div>
    </div>

    <div id="formBox">
      <h1 class="auth-card__title">学生认证</h1>
      <p class="auth-card__desc">提交后由管理员审核；若管理员开启了邀请码，填入正确的邀请码可直接通过。</p>
      <form id="applyForm" class="form" novalidate>
        <div class="field">
          <label class="field__label" for="student_id">新生号</label>
          <input class="input" id="student_id" type="text" required enterkeyhint="next">
        </div>
        <div class="field">
          <label class="field__label" for="class_name">班级</label>
          <input class="input" id="class_name" type="text" required enterkeyhint="next">
        </div>
        <div class="field">
          <label class="field__label" for="real_name">真实姓名</label>
          <input class="input" id="real_name" type="text" required enterkeyhint="next">
        </div>
        <div class="field">
          <label class="field__label" for="invite_code">邀请码 <span class="field__opt">（选填）</span></label>
          <input class="input" id="invite_code" type="text" enterkeyhint="next">
          <div class="field__hint">如果管理员开启了邀请码，填入可直接通过审核</div>
        </div>
        <div class="field">
          <label class="field__label" for="extra_info">补充更多信息 <span class="field__opt">（选填）</span></label>
          <textarea class="textarea" id="extra_info" data-counter="200"></textarea>
          <div class="field__foot"><span class="field__hint">补充更多信息可提高通过率</span><span class="field__counter"></span></div>
        </div>
        <button type="submit" class="btn btn--primary btn--lg btn--block" id="submitBtn">提交认证</button>
        <div class="field__hint u-center">重复提交将覆盖上一次申请；10 分钟内只能提交一次。</div>
      </form>
    </div>
  </div>
</main>
<div id="siteFooter"></div>
<script src="js/ui.js"></script>
<script>
var token = UI.session.token();
var submitBtn = document.getElementById("submitBtn");
var form = document.getElementById("applyForm");
if (!token) { UI.goLogin(); }

function showAlready() {
  document.getElementById("formBox").hidden = true;
  document.getElementById("alreadyBox").hidden = false;
}

// 已认证则显示成功态（原逻辑保留）
UI.api("/api/user/profile").then(function (r) {
  if (r.status === 401) return;
  var role = r.data && r.data.user && r.data.user.role;
  if (UI.session.isAtLeast("student", r.data && r.data.user)) showAlready();
});

form.addEventListener("submit", function (e) {
  e.preventDefault();
  UI.form.clearAll(form);
  var payload = {
    student_id: document.getElementById("student_id").value.trim(),
    class_name: document.getElementById("class_name").value.trim(),
    real_name: document.getElementById("real_name").value.trim(),
    invite_code: document.getElementById("invite_code").value.trim(),
    extra_info: document.getElementById("extra_info").value.trim()
  };
  var bad = null;
  if (!payload.student_id) bad = ["student_id", "请填写新生号"];
  else if (!payload.class_name) bad = ["class_name", "请填写班级"];
  else if (!payload.real_name) bad = ["real_name", "请填写真实姓名"];
  if (bad) { UI.form.fieldError(document.getElementById(bad[0]), bad[1]); UI.form.focusFirstInvalid(form); return; }
  UI.form.busy(submitBtn, true);
  UI.api("/api/student/apply", { method: "POST", body: payload }).then(function (r) {
    if (!r.ok) {
      UI.form.busy(submitBtn, false);
      if (r.status === 429 && r.data && r.data.retry_after !== undefined) {
        var left = Number(r.data.retry_after) || 600;
        UI.toast.warning(UI.errorText(r));
        UI.countdown(left, function (n) { submitBtn.textContent = "等待 " + UI.formatCountdown(n); }, function () { submitBtn.textContent = "提交认证"; });
        return;
      }
      UI.toast.error(UI.errorText(r, "提交失败"));
      return;
    }
    if (r.data.status === "approved") {
      UI.session.patch({ role: "student" });
      UI.shell.refreshAuth();
      UI.toast.success("认证成功");
      setTimeout(showAlready, 600);
    } else {
      UI.toast.success("已提交，等待管理员审核");
      UI.form.busy(submitBtn, false);
    }
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
| #alreadyBox / #formBox | 成功态切换 | 同 ID（`hidden` 属性） | 保留 |
| #applyForm / #student_id / #class_name / #real_name / #invite_code / #extra_info / #submitBtn | 表单 | 同 ID | 保留 |
| #msg | 结果文字 | Toast + 字段错误 + 倒计时 | 删除 |
| `.already .badge`（已认证徽标） | 成功态视觉 | `empty--compact` + 毕业帽图标 | 替换 |
| `.hidden` 类 | 显隐 | `hidden` 属性 | 替换 |

## 需要修改的脚本行为

1. 校验拆分为逐字段内联（原为一条合并消息）。
2. 429 → toast + 按钮 `UI.countdown` 倒计时（原来只是文字消息）。
3. `approved` → `UI.session.patch({role:'student'})` + `UI.shell.refreshAuth()`（同步页头头像/菜单）+ toast，0.6s 后切成功态。
4. 错误经 `UI.errorText`；「login required」类 401 由 `UI.api` 自动处理。

## 状态矩阵

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| 未登录 | 无 token | `UI.goLogin()`（带 next） |
| 已认证 | role ≥ student | 成功态（空态块：图标 + 「你已认证为学生」标题，无操作按钮） |
| 表单默认 | 正常 | 认证表单 |
| 提交中 | submit | busy |
| 直通成功 | status=approved | toast「认证成功」→ 成功态 |
| 待审核 | status=pending | toast「已提交，等待管理员审核」（表单可再次提交，覆盖原申请） |
| 必填缺失 | 前端 | 内联错误 + 聚焦 |
| 限流 | 429 | toast「10 分钟内只能提交一次，请稍后再试」+ 按钮倒计时 mm:ss |
| 邀请码错误 | 走待审核分支 | 与待审核一致（不单独提示邀请码无效；避免暴露码池） |
| 网络失败 | status 0 | toast 网络文案 |

## 响应式

- 360：全宽卡（576 上限）；768：垂直居中。

## 边界场景

- 真实姓名含空格 → trim 后提交；补充信息计数 200（软限制）。
- 重复提交覆盖旧申请（后端行为）→ 界面无特殊处理（提示常驻在表单下方）。

## 无障碍要点

- 成功态焦点：切换后把焦点移到 `alreadyBox`（`alreadyBox.setAttribute('tabindex','-1'); alreadyBox.focus();`）。

## 验收清单

- [ ] 未登录跳登录带 next；已认证显示成功态并隐藏表单。
- [ ] 逐字段校验 + 聚焦；邀请码选填。
- [ ] 直通 approved：toast + 成功态 + 页头刷新。
- [ ] 429：toast + 按钮倒计时并恢复。
- [ ] 计数器工作；无 alert/confirm；控制台零报错。


### 2026-10-19 · 共享标识与运营声明

浏览器图标改为 `brand-lime.svg` 青柠切面；共享顶栏、抽屉、页脚及登录/注册卡片复用该图形，首页链接名称仍为「拾光酥糕 首页」。有页脚的页面展示完整学生自主运营、与校方无隶属关系、知识产权和信息参考声明，勘误邮箱可点击。地图应用壳与极简 404 页继续不显示页脚。完整文字见 [文案规范](../copy.md)。
