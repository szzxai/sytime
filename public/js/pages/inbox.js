(function () {
  "use strict";
  var P = UI.page;
  if (!P.requireLogin()) return;
  var list = P.el("inboxList"), more = P.el("loadMore"), moreBtn = P.el("moreBtn"), moreInfo = P.el("moreInfo");
  var filter = "all", unreadOnly = false, items = [], cursor = null, hasMore = false, loading = false;
  var KINDS = {
    comment: { icon: "message", hue: "teal" },
    reply: { icon: "message", hue: "teal" },
    like: { icon: "heart", hue: "vermilion" },
    system: { icon: "megaphone", hue: "ochre" },
  };
  function esc(value) { return UI.esc(value); }
  function nameOf(a) { return (a && (a.nickname || a.username)) || "有人"; }
  function dayKey(sec) {
    var d = new Date(Number(sec) * 1000), now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (day === start) return "今天";
    if (day === start - 86400000) return "昨天";
    return "更早";
  }
  function quote(m) {
    return m.target && m.target.snippet ? '<span class="msg__quote">' + esc(m.target.snippet) + "</span>" : "";
  }
  function mainHtml(m) {
    if (m.type === "system") {
      var body = m.body || "";
      var tag = m.important ? '<span class="tag tag--outline">' + UI.icon("lock", "icon--sm") + "重要</span>" : "";
      var bodyHtml =
        body.length <= 120
          ? '<span class="msg__body">' + esc(body) + "</span>"
          : '<span class="msg__body">' + esc(body.slice(0, 120)) + "…" +
            '<button type="button" class="btn btn--link btn--sm" data-msg-expand="' + m.id + '">展开</button></span>';
      return '<span class="msg__title">' + esc(m.title || "") + tag + "</span>" + bodyHtml +
        '<span class="msg__time">' + UI.timeEl(m.created_at) + "</span>";
    }
    var a = m.actors && m.actors[0];
    var title = m.target ? m.target.title : "";
    var text;
    if (m.type === "like") {
      var names = (m.actors || []).map(nameOf);
      if (m.count > 1 && names.length) {
        text = "<b>" + names.slice(0, 2).map(esc).join("、") + "</b> 等 " + m.count + " 人赞了你的帖子《" + esc(title) + "》";
      } else {
        text = "<b>" + esc(names[0] || "有人") + "</b> 赞了你的帖子《" + esc(title) + "》";
      }
    } else if (m.type === "reply") {
      text = "<b>" + esc(nameOf(a)) + "</b> 回复了你的评论";
    } else {
      text = "<b>" + esc(nameOf(a)) + "</b> 评论了你的帖子《" + esc(title) + "》";
    }
    return '<span class="msg__text">' + text + "</span>" + quote(m) +
      '<span class="msg__time">' + UI.timeEl(m.created_at) + "</span>";
  }
  function leadHtml(m) {
    if (m.type === "system") {
      return '<span class="msg__lead"><span class="msg__icon">' + UI.icon("megaphone") + "</span></span>";
    }
    var kind = KINDS[m.type] || KINDS.comment;
    return '<span class="msg__lead">' + UI.avatar(m.actors && m.actors[0], "sm") +
      '<span class="msg__kind">' + UI.icon(kind.icon) + "</span></span>";
  }
  function itemHtml(m) {
    var kind = KINDS[m.type] || KINDS.system;
    var url = m.target && m.target.url ? UI.safeUrl(m.target.url) : "";
    var inner = leadHtml(m) + '<span class="msg__main">' + mainHtml(m) + "</span>" +
      '<span class="msg__dot" aria-label="未读"></span>';
    var link = url
      ? '<a class="msg__link" href="' + esc(url) + '">' + inner + "</a>"
      : '<div class="msg__link" role="button" tabindex="0" data-msg-open="' + m.id + '">' + inner + "</div>";
    return '<li class="msg' + (m.read ? "" : " is-unread") + '" data-id="' + m.id + '" data-url="' + esc(url) + '" data-hue="' + kind.hue + '">' + link + "</li>";
  }
  function render() {
    more.hidden = !hasMore;
    moreInfo.textContent = items.length ? "已显示 " + items.length + " 条" : "";
    if (!items.length) {
      var filtered = filter !== "all" || unreadOnly;
      list.innerHTML = UI.html.empty({
        compact: filtered,
        icon: "inbox",
        title: unreadOnly ? "暂无未读消息" : filtered ? "暂无该类型消息" : "暂无消息",
        desc: filtered ? "" : "有新的互动或通知时会出现在这里。",
      });
      return;
    }
    var groups = [], index = {};
    items.forEach(function (m) {
      var key = dayKey(m.created_at);
      if (!(key in index)) { index[key] = groups.length; groups.push({ key: key, rows: [] }); }
      groups[index[key]].rows.push(m);
    });
    list.innerHTML = groups.map(function (g) {
      return '<section class="msg-group"><h2 class="msg-group__title">' + esc(g.key) + '</h2><ul class="msg-list">' +
        g.rows.map(itemHtml).join("") + "</ul></section>";
    }).join("");
  }
  function setCounts(counts) {
    if (!counts) return;
    var n = Number(counts.all) || 0;
    P.el("cntAll").hidden = n <= 0;
    P.el("cntAll").textContent = n > 99 ? "99+" : String(n);
    UI.inbox.set(n);
  }
  function query() {
    var qs = new URLSearchParams();
    qs.set("page_size", "20");
    if (filter !== "all") qs.set("type", filter);
    if (unreadOnly) qs.set("unread", "1");
    if (cursor) qs.set("before", cursor);
    return "?" + qs.toString();
  }
  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      cursor = null;
      items = [];
      list.innerHTML = UI.html.skeleton("post", 3);
      more.hidden = true;
    }
    var r = await UI.api("/api/messages" + query());
    loading = false;
    if (r.aborted) return;
    if (!r.ok) {
      P.error(list, r, function () { load(true); });
      return;
    }
    var batch = r.data.messages || [];
    items = reset ? batch : items.concat(batch);
    hasMore = !!r.data.has_more;
    cursor = items.length ? items[items.length - 1].id : null;
    setCounts(r.data.counts);
    render();
  }
  function updateUrl() {
    var url = new URL(location.href);
    if (filter !== "all") url.searchParams.set("type", filter); else url.searchParams.delete("type");
    if (unreadOnly) url.searchParams.set("unread", "1"); else url.searchParams.delete("unread");
    history.replaceState(null, "", url);
  }
  function markRead(item, id) {
    if (!item.classList.contains("is-unread")) return;
    item.classList.remove("is-unread");
    var next = Math.max(0, UI.inbox.count - 1);
    UI.inbox.set(next);
    P.el("cntAll").hidden = next <= 0;
    P.el("cntAll").textContent = next > 99 ? "99+" : String(next);
    UI.api("/api/messages/" + encodeURIComponent(id) + "/read", { method: "PUT" }).then(function (r) {
      if (!r.ok) { item.classList.add("is-unread"); load(true); }
    });
  }
  list.addEventListener("click", function (e) {
    var exp = e.target.closest("[data-msg-expand]");
    if (exp) {
      e.preventDefault();
      var id = exp.getAttribute("data-msg-expand");
      var m = items.filter(function (x) { return String(x.id) === id; })[0];
      var holder = exp.closest(".msg__body");
      if (!m || !holder) return;
      if (exp.textContent.indexOf("展开") !== -1) {
        holder.innerHTML = esc(m.body || "") + '<button type="button" class="btn btn--link btn--sm" data-msg-expand="' + m.id + '">收起</button>';
      } else {
        holder.innerHTML = esc((m.body || "").slice(0, 120)) + "…" + '<button type="button" class="btn btn--link btn--sm" data-msg-expand="' + m.id + '">展开</button>';
      }
      return;
    }
    var item = e.target.closest(".msg");
    if (!item) return;
    var link = e.target.closest(".msg__link");
    if (!link) return;
    e.preventDefault();
    markRead(item, item.dataset.id);
    var url = item.dataset.url;
    if (url) setTimeout(function () { location.href = url; }, 300);
  });
  list.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var open = e.target.closest("[data-msg-open]");
    if (!open) return;
    e.preventDefault();
    var item = open.closest(".msg");
    markRead(item, item.dataset.id);
  });
  P.el("readAllBtn").addEventListener("click", async function () {
    var r = await P.request(this, "/api/messages/read-all", { method: "PUT" }, "已全部标为已读");
    if (r && r.ok) { setCounts({ all: 0 }); load(true); }
  });
  P.el("unreadOnly").addEventListener("change", function () {
    unreadOnly = this.checked;
    updateUrl();
    load(true);
  });
  moreBtn.addEventListener("click", function () { load(false); });
  var tabs = UI.tabs(UI.qs('[role="tablist"]'), {
    onChange: function (key) {
      filter = key || "all";
      updateUrl();
      load(true);
    },
  });
  (function init() {
    var params = new URLSearchParams(location.search);
    var type = params.get("type");
    if (["system", "interact", "like"].indexOf(type) !== -1) filter = type;
    unreadOnly = params.get("unread") === "1";
    P.el("unreadOnly").checked = unreadOnly;
    tabs.select(filter);
    load(true);
  })();
})();
