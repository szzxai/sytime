(function () {
  "use strict";
  var P = UI.page,
    form = P.el("registerForm"),
    btn = P.el("submitBtn");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (
      btn.disabled ||
      !P.validate(form, [
        ["username", "请输入用户名"],
        ["nickname", "请输入昵称"],
        ["password", "请输入密码"],
        ["confirm", "请确认密码"],
      ])
    )
      return;
    if (P.el("password").value !== P.el("confirm").value) {
      UI.form.fieldError(P.el("confirm"), "两次输入的密码不一致");
      UI.form.focusFirstInvalid(form);
      return;
    }
    UI.form.busy(btn, true);
    var body = {
      username: P.value("username"),
      nickname: P.value("nickname"),
      password: P.el("password").value,
    };
    var r = await UI.api("/api/register", {
      method: "POST",
      auth: false,
      body: body,
    });
    if (!r.ok) {
      UI.form.busy(btn, false);
      UI.toast.error(UI.errorText(r, "注册失败"));
      if (r.status === 409) {
        UI.form.fieldError(P.el("username"), "用户名已被占用");
        UI.form.focusFirstInvalid(form);
      }
      return;
    }
    var login = await UI.api("/api/login", {
      method: "POST",
      auth: false,
      body: { username: body.username, password: body.password },
    });
    if (login.ok) {
      localStorage.setItem("token", login.data.token);
      UI.session.save(login.data.user);
    }
    UI.toast.success(login.ok ? "注册成功" : "注册成功，请登录");
    setTimeout(function () {
      location.href = login.ok ? UI.nextUrl("index.html") : P.loginUrl();
    }, 500);
  });
  if (location.search)
    UI.qs(".auth-card__switch a").href =
      "/login.html?next=" + encodeURIComponent(UI.nextUrl("index.html"));
})();
