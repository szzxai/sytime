(function () {
  "use strict";
  var P = UI.page, base = "/api/admin/menu-sync", settings, refreshTimer, busy = false, detailId = "", detailSerial = 0;
  var labels = { running: "运行中", succeeded: "已完成", partial: "部分失败", failed: "失败", cancelled: "已取消", interrupted: "已中断", unchanged: "内容未变", queued: "排队", discover: "检索官网", fetch: "获取原图", layout: "定位表格", recognize: "识别菜品", audit: "复核覆盖", validate: "校验数据", done: "结束" };
  function label(value) { return labels[value] || value; }
  function date(value) { return value ? new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short"}).format(new Date(value)) : "未安排"; }
  function showSettings(s) {
    settings = s;
    P.el("menuProvider").value = s.provider; P.el("menuBase").value = s.base_url; P.el("menuModel").value = s.model;
    P.el("menuDailyTime").value = s.daily_time; P.el("menuEnabled").checked = s.enabled;
    P.el("menuKey").value = "";
    P.el("menuKeyHint").textContent = s.key_unavailable ? "Key 无法解密，请恢复主密钥或重新填写 Key。" : s.has_api_key ? "已保存 " + s.masked_api_key + "；留空保留。切换提供商或地址请重新填写。" : "尚未保存 Key。";
    P.el("menuDeleteKey").disabled = !s.has_api_key;
    P.el("menuBaseField").hidden = s.provider !== "compatible";
    P.el("menuConfigStatus").textContent = s.last_test ? (s.model_tested ? "测试通过 · " : "测试未通过 · ") + s.last_test.message : "尚未测试模型配置";
    schedule(s);
  }
  function schedule(s) { P.el("menuSchedule").textContent = "每日 " + s.daily_time + "（北京时间） · 下一次自动同步：" + date(s.next_run_at); P.el("menuSync").disabled = !!s.active_job_id || !s.model_tested || busy; }
  function jobs(rows) {
    P.el("menuJobs").innerHTML = rows.length ? rows.map(function (job) {
      return '<article class="card stack menu-job__meta"><div class="row row--between row--wrap"><h3 class="u-fs-base">' + (job.trigger === "automatic" ? "自动同步" : "手动同步") + ' · ' + UI.esc(date(job.created_at)) + '</h3><span class="badge">' + UI.esc(label(job.status)) + '</span></div><p class="u-muted u-fs-sm">' + UI.esc(label(job.phase)) + ' · 已检查 ' + job.processed + '/' + job.total + ' 篇 · 成功 ' + job.succeeded + ' · 失败 ' + job.failed + '</p>' + (job.error ? '<p>' + UI.esc(job.error) + '</p>' : '') + '<div class="row row--wrap"><button class="btn btn--sm" type="button" data-menu-detail="' + job.id + '">查看详情</button>' + (job.status === "running" ? '<button class="btn btn--sm btn--danger-quiet" type="button" data-menu-action="cancel" data-job="' + job.id + '">停止任务</button>' : job.status !== "succeeded" ? '<button class="btn btn--sm" type="button" data-menu-action="retry" data-job="' + job.id + '">重试失败菜单</button>' : '') + '</div></article>';
    }).join("") : UI.html.empty({icon: "utensils", title: "尚无同步任务", desc: "保存并测试模型配置后可立即同步。"});
  }
  async function refresh(full) {
    clearTimeout(refreshTimer);
    var r = await UI.api(base + "/jobs");
    if (!r.ok) { P.error(P.el("menuJobs"), r, function () { refresh(full); }); return; }
    if (full) showSettings(r.data.settings); else schedule(r.data.settings);
    jobs(r.data.jobs || []);
    if ((r.data.jobs || []).some(function (j) { return j.status === "running"; }) && !P.el("view-menu").hidden) refreshTimer = setTimeout(function () { refresh(false); if (P.el("menuJobDialog").open) detail(detailId, false); }, 4000);
  }
  async function save(btn, extra) {
    if (!settings || (busy && !(extra && extra.clear_api_key))) return;
    busy = true;
    var body = Object.assign({ revision: settings.revision, provider: P.value("menuProvider"), base_url: P.value("menuBase"), model: P.value("menuModel"), api_key: P.value("menuKey"), daily_time: P.value("menuDailyTime"), enabled: P.el("menuEnabled").checked }, extra || {});
    if (extra && extra.clear_api_key) body = {revision: settings.revision, clear_api_key: true, enabled: false};
    var r = await P.request(btn, base + "/settings", {method: "PUT", body: body}, "菜单设置已保存");
    // Never retain a submitted credential in a form or JS draft.
    P.el("menuKey").value = ""; body.api_key = ""; busy = false;
    if (r && r.ok) showSettings(r.data.settings);
  }
  P.el("menuSettingsForm").addEventListener("submit", function (e) { e.preventDefault(); save(P.el("menuSave")); });
  P.el("menuProvider").addEventListener("change", function () { P.el("menuBaseField").hidden = this.value !== "compatible"; });
  P.el("menuDeleteKey").addEventListener("click", async function () {
    var ok = await UI.confirm({title: "删除菜单 API Key？", message: "删除后自动同步关闭，正在运行的任务和配置测试会停止。", confirmText: "删除 Key", danger: true});
    if (ok) { P.el("menuKey").value = ""; await save(this, {clear_api_key: true, enabled: false}); refresh(false); }
  });
  P.el("menuTest").addEventListener("click", async function () {
    if (busy) return; busy = true; P.el("menuConfigStatus").textContent = "正在测试已保存配置的图片识别和 JSON 输出…";
    var r = await P.request(this, base + "/test", {method: "POST"}, "模型测试通过"); busy = false;
    if (r && r.ok) showSettings(r.data.settings); else { var current = await UI.api(base + "/settings"); if (current.ok) showSettings(current.data.settings); }
  });
  P.el("menuRefresh").addEventListener("click", function () { refresh(false); });
  P.el("menuSync").addEventListener("click", async function () { var r = await P.request(this, base + "/jobs", {method: "POST", body: {}}, "同步任务已启动"); if (r && r.ok) refresh(false); });
  function artifactUrl(id, source, kind) { return base + "/jobs/" + encodeURIComponent(id) + "/artifacts/" + kind + "?source_id=" + encodeURIComponent(source); }
  async function detail(id, opening) {
    detailId = id; var serial = ++detailSerial, root = P.el("menuJobDetail");
    if (opening) { root.innerHTML = UI.html.skeleton("post", 2); UI.dialog.open(P.el("menuJobDialog")); }
    var r = await UI.api(base + "/jobs/" + encodeURIComponent(id));
    if (serial !== detailSerial || !P.el("menuJobDialog").open) return;
    if (!r.ok) { P.error(root, r, function () { detail(id, true); }); return; }
    var job = r.data.job;
    // Polling must not remove a selected replacement image or move dialog focus.
    if (!opening && root.querySelector('input[type="file"]')) return;
    root.innerHTML = '<p>' + UI.esc(label(job.status)) + ' · ' + UI.esc(label(job.phase)) + '</p>' + (job.items.length ? job.items.map(function (item) {
      var source = UI.esc(item.source_id);
      return '<section class="card stack menu-job__meta"><h3 class="u-fs-base">' + UI.esc(item.title) + '</h3><p>' + UI.esc(label(item.status)) + ' · ' + UI.esc(label(item.phase)) + ' · ' + item.records_count + ' 条</p>' + (item.error ? '<p>' + UI.esc(item.error) + '</p>' : '') + '<div class="row row--wrap"><button type="button" class="btn btn--sm" data-menu-file="source" data-source="' + source + '">查看原图</button><button type="button" class="btn btn--sm" data-menu-file="menu" data-source="' + source + '">下载 JSON</button><button type="button" class="btn btn--sm" data-menu-file="diagnostic" data-source="' + source + '">下载诊断</button></div><div class="menu-images" data-images="' + source + '"></div>' + (["failed", "cancelled", "interrupted"].includes(item.status) && job.status !== "running" ? '<form data-menu-supplement="' + source + '" class="form"><div class="field"><label class="field__label" for="supplement-' + item.article_id + '">补充该篇全部菜单图片</label><input class="input" type="file" id="supplement-' + item.article_id + '" accept="image/jpeg,image/png,image/webp" multiple required /><span class="field__hint">替换该篇原图，最多六张，每张 10 MB；保存后立即重新识别。</span></div><button type="submit" class="btn btn--sm">补充图片并重试</button></form>' : '') + '</section>';
    }).join("") : '<p class="u-muted">正在检索菜单来源…</p>');
    if (job.status !== "running") root.querySelectorAll('[data-menu-file="menu"]').forEach(function (button) {
      var edit = document.createElement("button"); edit.type = "button"; edit.className = "btn btn--sm";
      edit.textContent = "编辑 JSON 并手动发布"; edit.dataset.menuEdit = button.dataset.source; button.after(edit);
    });
  }
  P.el("menuJobs").addEventListener("click", async function (e) {
    var btn = e.target.closest("button"); if (!btn) return;
    if (btn.dataset.menuDetail) { detail(btn.dataset.menuDetail, true); return; }
    if (btn.dataset.menuAction) { var r = await P.request(btn, base + "/jobs/" + btn.dataset.job + "/" + btn.dataset.menuAction, {method: "POST"}, btn.dataset.menuAction === "cancel" ? "已请求停止" : "重试任务已启动"); if (r && r.ok) refresh(false); }
  });
  P.el("menuJobDetail").addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-menu-file], [data-menu-edit]"); if (!btn || btn.disabled) return;
    if (btn.dataset.menuEdit) { UI.dialog.close(P.el("menuJobDialog")); UI.menuImport.open(btn.dataset.menuEdit, detailId); return; }
    var source = btn.dataset.source, kind = btn.dataset.menuFile, id = detailId;
    UI.form.busy(btn, true);
    try {
      if (kind === "source") {
        var r = await UI.api(artifactUrl(id, source, "source")); if (!r.ok) throw new Error(UI.errorText(r));
        var holder = Array.from(P.el("menuJobDetail").querySelectorAll("[data-images]")).find(function (el) { return el.dataset.images === source; });
        holder.innerHTML = "";
        for (var index = 0; index < r.data.image_count; index++) {
          var response = await fetch(artifactUrl(id, source, "image-" + index), {headers: {Authorization: "Bearer " + UI.session.token()}});
          if (!response.ok) throw new Error("原图尚未保存或无权访问");
          var data = await P.readImage(await response.blob());
          if (id !== detailId || !P.el("menuJobDialog").open) return;
          holder.insertAdjacentHTML("beforeend", P.picture(data, "菜单原图 " + (index + 1), "thumb u-w-full"));
        }
        if (!r.data.image_count) holder.textContent = "官网正文没有可获取的内联图片，请补充菜单图片。";
      } else {
        var responseFile = await fetch(artifactUrl(id, source, kind), {headers: {Authorization: "Bearer " + UI.session.token()}});
        if (!responseFile.ok) { var err = await responseFile.json(); throw new Error(err.error || "资料尚未生成"); }
        var url = URL.createObjectURL(await responseFile.blob()), a = document.createElement("a"); a.href = url; a.download = source.replace(/:/g, "-") + "-" + kind + ".json"; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }
    } catch (error) { UI.toast.error(error.message || "资料读取失败"); } finally { UI.form.busy(btn, false); }
  });
  P.el("menuJobDetail").addEventListener("submit", async function (e) {
    var form = e.target.closest("[data-menu-supplement]"); if (!form) return; e.preventDefault();
    var files = Array.from(form.querySelector("input").files);
    if (!files.length || files.length > 6 || files.some(function (f) { return !["image/png", "image/jpeg", "image/webp"].includes(f.type) || f.size > 10 * 1024 * 1024; })) { UI.toast.error("请选择一至六张 JPG、PNG、WEBP 图片，每张不超过 10 MB"); return; }
    var data = new FormData(); data.append("source_id", form.dataset.menuSupplement); files.forEach(function (f) { data.append("images", f); });
    var r = await P.request(form.querySelector("button"), base + "/jobs", {method: "POST", form: data}, "补充图片已保存，正在重新识别");
    if (r && r.ok) { UI.dialog.close(P.el("menuJobDialog")); refresh(false); }
  });
  UI.menuAdmin = { load: function () { refresh(true); } };
})();
