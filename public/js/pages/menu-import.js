(function () {
  "use strict";
  var P = UI.page, base = "/api/admin/menu-sync", data, revision = null, validated = null, pending, loadSerial = 0;
  var labels = {succeeded:"已完成",partial:"部分失败",failed:"失败",cancelled:"已取消",interrupted:"已中断"};
  function date(value) { return new Intl.DateTimeFormat("zh-CN", {timeZone:"Asia/Shanghai",dateStyle:"short",timeStyle:"short"}).format(new Date(value)); }
  function invalidate() {
    validated = null; P.el("menuImportReviewed").checked = false;
    P.el("menuImportPublish").disabled = true; P.el("menuImportStatus").textContent = "内容或目标已变更，请重新校验。";
  }
  function body() { return {json_text:P.value("menuImportJson"),source_id:P.value("menuImportSource") || null,title:P.value("menuImportTitle"),expected_revision:revision,job_id:P.value("menuImportJob") || null}; }
  function targets() {
    var selected = P.value("menuImportSource"), known = (data.sources || []).some(function(s){return s.id===selected;});
    P.el("menuImportSource").innerHTML = '<option value="">新建手动批次</option>' + data.sources.map(function(s){return '<option value="'+UI.esc(s.id)+'">'+UI.esc(s.title)+' · '+(s.kind==="manual"?"手动批次":s.article_id)+' · '+s.records_count+' 条</option>';}).join("");
    if (known) P.el("menuImportSource").value = selected;
  }
  function taskOptions(jobId) {
    var id = P.value("menuImportSource");
    P.el("menuImportJob").innerHTML = '<option value="">已发布 JSON</option>' + data.jobs.filter(function(j){return j.status!=="running" && j.sources.some(function(s){return s.id===id;});}).map(function(j){return '<option value="'+UI.esc(j.id)+'">识图任务 · '+UI.esc(date(j.created_at))+' · '+UI.esc(labels[j.status] || j.status)+'</option>';}).join("");
    if (jobId) P.el("menuImportJob").value = jobId;
    P.el("menuImportImages").hidden = !P.value("menuImportJob");
  }
  function selectTarget(jobId) {
    var id = P.value("menuImportSource"), source = (data.sources || []).find(function(s){return s.id===id;});
    revision = source ? source.revision : null;
    P.el("menuImportTitleField").hidden = !!id; P.el("menuImportJobField").hidden = !id; P.el("menuImportLoad").hidden = !id;
    taskOptions(jobId);
    P.el("menuImportImageList").innerHTML = "";
    P.el("menuImportWarning").textContent = id ? "发布会替换该来源的全部记录。可载入已发布内容或选择识图结果。" : "新建批次会加入目录，不会替换其他来源。";
    P.el("menuImportPublish").textContent = id ? "替换并发布菜单" : "发布菜单";
    invalidate();
  }
  async function refresh() {
    var r = await UI.api(base+"/imports");
    if (!r.ok) { P.error(P.el("menuImportHistory"),r,refresh); return; }
    var oldSource = P.value("menuImportSource"), oldJob = P.value("menuImportJob");
    data = r.data; targets(); taskOptions(oldJob);
    if (oldSource !== P.value("menuImportSource") || oldJob !== P.value("menuImportJob")) {invalidate();P.el("menuImportImageList").innerHTML="";}
    P.el("menuImportHistory").innerHTML = data.history.length ? data.history.map(function(h){return '<article class="card stack"><h3 class="u-fs-base">'+UI.esc(h.title)+'</h3><p class="u-muted u-fs-sm">'+UI.esc(date(h.created_at))+' · 操作者 #'+h.actor_id+' · '+h.records_count+' 条 · 修订 '+h.revision+'</p></article>';}).join("") : UI.html.empty({icon:"utensils",title:"尚无手动导入记录",desc:"通过校验并发布后会记录操作者和修订。"});
    if (pending) {
      P.el("menuImportSource").value=pending.source; selectTarget(pending.job); pending=null; await load();
    }
  }
  async function load() {
    var id = P.value("menuImportSource"), job = P.value("menuImportJob"); if (!id) return;
    if (P.value("menuImportJson").trim()) {
      var ok = await UI.confirm({title:"载入菜单 JSON？",message:"载入会覆盖编辑框中尚未发布的内容。",confirmText:"载入"}); if (!ok) return;
    }
    var serial=++loadSerial;
    var r = await P.request(P.el("menuImportLoad"),base+"/imports/source?source_id="+encodeURIComponent(id)+(job?"&job_id="+encodeURIComponent(job):""));
    if (!r || !r.ok || serial!==loadSerial || id!==P.value("menuImportSource") || job!==P.value("menuImportJob")) return;
    revision=r.data.source.revision;
    P.el("menuImportJson").value=JSON.stringify(r.data.records,null,2); invalidate();
    P.el("menuImportWarning").textContent=r.data.warning || "已载入 JSON。发布会替换该来源的全部记录。";
    P.el("menuImportStatus").textContent="已载入 "+r.data.records.length+" 条，请修改并重新校验。";
  }
  P.el("menuImportSource").addEventListener("change",function(){++loadSerial;selectTarget();});
  P.el("menuImportJob").addEventListener("change",function(){++loadSerial;invalidate();P.el("menuImportImages").hidden=!this.value;P.el("menuImportImageList").innerHTML="";});
  ["menuImportJson","menuImportTitle"].forEach(function(id){P.el(id).addEventListener("input",invalidate);});
  P.el("menuImportReviewed").addEventListener("change",function(){P.el("menuImportPublish").disabled=!validated || !this.checked;});
  P.el("menuImportLoad").addEventListener("click",load);
  P.el("menuImportRefresh").addEventListener("click",refresh);
  P.el("menuImportValidate").addEventListener("click",async function(){
    var draft=body(), serial=++loadSerial; UI.form.busy(this,true);
    try {
      var r=await UI.api(base+"/imports/preview",{method:"POST",body:draft});
      if (serial!==loadSerial || JSON.stringify(body())!==JSON.stringify(draft)) return;
      if (!r.ok) { invalidate(); P.el("menuImportStatus").textContent=UI.errorText(r); UI.toast.error(UI.errorText(r)); return; }
      validated=r.data; P.el("menuImportJson").value=JSON.stringify(validated.records,null,2);
      P.el("menuImportStatus").textContent="校验通过："+validated.count+" 条供应记录、"+validated.dish_count+" 道菜；去除 "+validated.duplicates_removed+" 条完全重复记录。确认核对后可发布。";
      P.el("menuImportPublish").disabled=!P.el("menuImportReviewed").checked;
    } finally {UI.form.busy(this,false);}
  });
  P.el("menuImportForm").addEventListener("submit",async function(e){
    e.preventDefault();if (!validated || !P.el("menuImportReviewed").checked) return;
    var r=await P.request(P.el("menuImportPublish"),base+"/imports",{method:"POST",body:Object.assign(body(),{digest:validated.digest,reviewed:true})},"菜单已发布");
    if (r && r.ok) {
      var count=r.data.import.count;revision=r.data.import.revision;validated=null;
      P.el("menuImportReviewed").checked=false;P.el("menuImportPublish").disabled=true;
      P.el("menuImportStatus").textContent="已发布 "+count+" 条供应记录。";
      P.el("menuImportJson").value=""; await refresh();P.el("menuImportSource").value=r.data.import.source_id;selectTarget();P.el("menuImportStatus").textContent="已发布 "+count+" 条供应记录。";
    } else {invalidate();if(r) P.el("menuImportStatus").textContent=UI.errorText(r);}
  });
  P.el("menuImportImages").addEventListener("click",async function(){
    var id=P.value("menuImportSource"),job=P.value("menuImportJob"),holder=P.el("menuImportImageList");
    if (!id || !job) return;UI.form.busy(this,true);
    try {
      var url=base+"/jobs/"+encodeURIComponent(job)+"/artifacts/",query="?source_id="+encodeURIComponent(id),r=await UI.api(url+"source"+query);
      if (!r.ok) throw new Error(UI.errorText(r));holder.innerHTML="";
      for (var index=0;index<r.data.image_count;index++) {
        var response=await fetch(url+"image-"+index+query,{headers:{Authorization:"Bearer "+UI.session.token()}});
        if (!response.ok) throw new Error("原图尚未保存或无权访问");
        var image=await P.readImage(await response.blob());
        if (id!==P.value("menuImportSource") || job!==P.value("menuImportJob")) return;
        holder.insertAdjacentHTML("beforeend",P.picture(image,"菜单原图 "+(index+1),"thumb u-w-full"));
      }
      if (!r.data.image_count) holder.textContent="该任务没有原图存档。";
    } catch(error){UI.toast.error(error.message);} finally {UI.form.busy(this,false);}
  });
  UI.menuImport={load:refresh,open:function(source,job){pending={source:source,job:job};document.querySelector('[data-panel="menu-import"]').click();}};
})();
