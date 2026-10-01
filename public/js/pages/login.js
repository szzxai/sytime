(function () {
  "use strict";
  var P = UI.page,
    form = P.el("loginForm"),
    submit = P.el("submitBtn"),
    username = "";
  // Only the image field is an upload component; the reason has its own validation.
  var reasonRoot = P.el("appealReason").closest(".field");
  reasonRoot.removeAttribute("data-upload");
  var upload = P.el("appealImageInput").closest("[data-upload]");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (
      submit.disabled ||
      !P.validate(form, [
        ["username", "请输入用户名"],
        ["password", "请输入密码"],
      ])
    )
      return;
    P.el("loginAlert").hidden = true;
    P.el("appealBox").hidden = true;
    username = P.value("username");
    UI.form.busy(submit, true);
    var r = await UI.api("/api/login", {
      method: "POST",
      auth: false,
      body: { username: username, password: P.el("password").value },
    });
    UI.form.busy(submit, false);
    if (r.ok) {
      localStorage.setItem("token", r.data.token);
      UI.session.save(r.data.user);
      UI.toast.success("登录成功");
      submit.disabled = true;
      setTimeout(function () {
        location.href = UI.nextUrl("index.html");
      }, 500);
    } else if (r.status === 403 && r.data.error === "banned") {
      var box = P.el("loginAlert"),
        allowed = Number(r.data.allow_appeal) === 1;
      box.hidden = false;
      box.innerHTML =
        '<div class="alert alert--danger" role="alert">' +
        UI.icon("ban") +
        '<div class="alert__body"><span class="alert__title">账号已被封禁</span>' +
        UI.esc(
          r.data.ban_reason
            ? "封禁理由：" + r.data.ban_reason
            : "未填写封禁理由",
        ) +
        (!allowed ? "<p>您已被封禁，如要解封请线下联系超级管理员</p>" : "") +
        P.picture(r.data.ban_image, "封禁说明图片") +
        "</div></div>";
      P.el("appealBox").hidden = !allowed;
      if (allowed) P.el("appealReason").focus();
    } else UI.toast.error(UI.errorText(r, "登录失败"));
  });
  P.el("appealSubmit").addEventListener("click", async function () {
    var btn = this;
    if (
      btn.disabled ||
      !P.validate(P.el("appealBox"), [["appealReason", "请填写申诉理由"]])
    )
      return;
    UI.form.busy(btn, true);
    try {
      var image = await P.readImage(UI.upload.get(upload));
      var r = await UI.api("/api/user/appeal", {
        method: "POST",
        auth: false,
        body: {
          username: username,
          appeal_reason: P.value("appealReason"),
          appeal_image: image,
        },
      });
      UI.form.busy(btn, false);
      if (!r.ok) {
        UI.toast.error(UI.errorText(r));
        if (r.status === 429)
          P.cooldown(btn, Number(r.data.retry_after) || 600);
        return;
      }
      UI.toast.success("申诉已提交，请等待管理员审核");
      P.el("appealReason").value = "";
      P.el("appealReason").dispatchEvent(new Event("input", { bubbles: true }));
      UI.upload.clear(upload);
    } catch (err) {
      UI.form.busy(btn, false);
      UI.toast.error(err.message);
    }
  });
  var next = new URLSearchParams(location.search).get("next");
  if (next)
    UI.qs(".auth-card__switch a").href =
      "/register.html?next=" + encodeURIComponent(UI.nextUrl("index.html"));
})();
