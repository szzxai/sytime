(function () {
  "use strict";
  var P = UI.page;
  if (!P.requireLogin()) return;
  var form = P.el("applyForm"),
    btn = P.el("submitBtn");
  function already() {
    P.el("formBox").hidden = true;
    P.el("alreadyBox").hidden = false;
  }
  UI.api("/api/user/profile").then(function (r) {
    if (!r.ok) {
      UI.toast.error(UI.errorText(r));
      return;
    }
    if (UI.session.isAtLeast("student", r.data.user)) already();
  });
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (
      btn.disabled ||
      !P.validate(form, [
        ["student_id", "请填写新生号"],
        ["class_name", "请填写班级"],
        ["real_name", "请填写真实姓名"],
      ])
    )
      return;
    var body = {};
    [
      "student_id",
      "class_name",
      "real_name",
      "invite_code",
      "extra_info",
    ].forEach(function (key) {
      body[key] = P.value(key);
    });
    var r = await P.request(btn, "/api/student/apply", {
      method: "POST",
      body: body,
    });
    if (!r) return;
    if (!r.ok) {
      if (r.status === 429) P.cooldown(btn, Number(r.data.retry_after) || 600);
      return;
    }
    if (r.data.status === "approved") {
      UI.session.patch({ role: "student" });
      UI.shell.refreshAuth();
      UI.toast.success("认证成功");
      already();
    } else {
      UI.toast.success("已提交，等待管理员审核");
      P.cooldown(btn, 600);
    }
  });
})();
