/* 三元坊必吃榜 · 添加店铺（shop-new.html）
   - 权限来自 GET /api/shops/meta（后端 POST /api/shops 会再次校验）
   - 距离与步行时间为步行距离，可用高德步行路线测算后手工核对 */
(function () {
  "use strict";
  var page = UI.page;
  var form = page.el("shopForm");
  var notice = page.el("permNotice");
  var chips = page.el("typeChips");
  var customType = page.el("customType");
  var submitBtn = page.el("shopSubmit");
  var pickMap = page.el("pickMap");
  var meta = null;
  var previewMap = null;

  var OTHER = "__other";
  function val(id) {
    var el = page.el(id);
    return el ? String(el.value).trim() : "";
  }
  function num(id) {
    var raw = val(id);
    if (!raw) return null;
    var n = Number(raw);
    return isFinite(n) ? n : null;
  }
  function intIn(id, min, max) {
    var n = num(id);
    if (n === null || Math.floor(n) !== n || n < min || n > max) return null;
    return n;
  }

  function lock(title, desc, actions) {
    form.hidden = true;
    notice.hidden = false;
    notice.innerHTML = UI.html.empty({ tone: "lock", icon: "lock", title: title, desc: desc, actions: actions });
  }

  function renderTypes(types) {
    var presets = (types && types.presets) || [];
    chips.innerHTML = presets
      .map(function (type) {
        return (
          '<label class="chip"><input class="chip__input" type="radio" name="shopType" value="' + UI.esc(type) + '">' +
          '<span class="chip__face">' + UI.esc(type) + "</span></label>"
        );
      })
      .join("") +
      '<label class="chip"><input class="chip__input" type="radio" name="shopType" value="' + OTHER + '">' +
      '<span class="chip__face">' + UI.icon("plus", "icon--sm") + "其他 / 自定义</span></label>";
  }

  function selectedType() {
    var input = chips.querySelector('input[name="shopType"]:checked');
    if (!input) return "";
    return input.value === OTHER ? val("customType") : input.value;
  }

  /* ---------- 校验：与后端 lib/shops/store.js 的规则一致 ---------- */
  function validate() {
    UI.form.clearAll(form);
    var ok = true;
    function bad(input, msg) {
      UI.form.fieldError(input, msg);
      ok = false;
    }
    var name = val("sName");
    if (!name) bad(page.el("sName"), "请输入店铺名称");
    else if (name.length > 30) bad(page.el("sName"), "店铺名称不能超过 30 字");

    var address = val("sAddr");
    if (!address) bad(page.el("sAddr"), "请输入店铺地址");
    else if (!/(路|街|巷|道|弄|坊|河沿)/.test(address) || !/\d+\s*号/.test(address)) bad(page.el("sAddr"), "地址格式应包含道路/巷坊名与门牌号");

    if (val("sNote").length > 40) bad(page.el("sNote"), "补充描述不能超过 40 字");

    var typeInput = chips.querySelector('input[name="shopType"]:checked');
    if (typeInput) UI.form.clearField(chips.querySelector('input[name="shopType"]'));
    if (!typeInput) bad(chips.querySelector('input[name="shopType"]'), "请选择店铺类型");
    else if (typeInput.value === OTHER) {
      var custom = val("customType");
      if (!custom) bad(customType, "请输入自定义类型（8 字以内）");
      else if (custom.length > 8) bad(customType, "自定义类型不能超过 8 字");
    }

    var lat = num("sLat");
    var lng = num("sLng");
    if (lat === null || lat < 3 || lat > 54) bad(page.el("sLat"), "请填写有效的纬度（3–54）");
    if (lng === null || lng < 73 || lng > 136) bad(page.el("sLng"), "请填写有效的经度（73–136）");

    var distances = [
      ["sCampusDist", "苏州中学本部"],
      ["sMetroDist", "地铁站出口"]
    ];
    distances.forEach(function (item) {
      if (intIn(item[0], 1, 20000) === null) bad(page.el(item[0]), "请输入到" + item[1] + "的步行距离（1–20000 米）");
    });
    var walks = [
      ["sCampusWalk", "苏州中学本部"],
      ["sMetroWalk", "地铁站出口"]
    ];
    walks.forEach(function (item) {
      if (intIn(item[0], 1, 240) === null) bad(page.el(item[0]), "请输入到" + item[1] + "的预计步行时间（1–240 分钟）");
    });

    if (!val("sMetro")) bad(page.el("sMetro"), "请输入最近的地铁站");
    else if (val("sMetro").length > 30) bad(page.el("sMetro"), "地铁站名称不能超过 30 字");
    if (!val("sMetroExit")) bad(page.el("sMetroExit"), "请输入最近的出口（例如 3 号口）");
    else if (val("sMetroExit").length > 20) bad(page.el("sMetroExit"), "出口名称不能超过 20 字");

    if (!ok) {
      UI.form.focusFirstInvalid(form);
      return null;
    }
    return {
      name: name,
      address: address,
      location_note: val("sNote"),
      dianping_url: val("sDianping"),
      type: selectedType(),
      lat: lat,
      lng: lng,
      campus_distance_m: intIn("sCampusDist", 1, 20000),
      campus_walk_min: intIn("sCampusWalk", 1, 240),
      metro_station: val("sMetro"),
      metro_exit: val("sMetroExit"),
      metro_distance_m: intIn("sMetroDist", 1, 20000),
      metro_walk_min: intIn("sMetroWalk", 1, 240)
    };
  }

  var SERVER_FIELDS = {
    name: "sName",
    address: "sAddr",
    location_note: "sNote",
    dianping_url: "sDianping",
    lat: "sLat",
    campus_distance_m: "sCampusDist",
    campus_walk_min: "sCampusWalk",
    metro_station: "sMetro",
    metro_exit: "sMetroExit",
    metro_distance_m: "sMetroDist",
    metro_walk_min: "sMetroWalk"
  };

  function showServerErrors(fields) {
    var first = null;
    Object.keys(fields || {}).forEach(function (key) {
      var id = SERVER_FIELDS[key] || null;
      var input = key === "type"
        ? (chips.querySelector('input[name="shopType"]:checked') || chips.querySelector('input[name="shopType"]'))
        : id ? page.el(id) : null;
      if (!input) return;
      if (!input) return;
      UI.form.fieldError(input, fields[key]);
      if (!first) first = input;
    });
    if (first) {
      if (first.scrollIntoView) first.scrollIntoView({ block: "center", behavior: "smooth" });
      first.focus();
    }
  }

  /* ---------- 位置预览 ---------- */
  function preview() {
    var lat = num("sLat");
    var lng = num("sLng");
    if (lat === null || lng === null || lat < 3 || lat > 54 || lng < 73 || lng > 136) {
      pickMap.innerHTML = '<div class="shop-map__state u-muted">填写坐标后在此预览位置</div>';
      previewMap = null;
      return;
    }
    var point = { lat: lat, lng: lng };
    var previewShop = { id: 0, name: val("sName") || "新店铺", address: val("sAddr"), type: selectedType() || "其他", lat: lat, lng: lng, campus_distance_m: num("sCampusDist"), campus_walk_min: num("sCampusWalk"), metro_station: val("sMetro"), metro_exit: val("sMetroExit"), metro_distance_m: num("sMetroDist"), metro_walk_min: num("sMetroWalk") };
    pickMap.innerHTML = "";
    previewMap = null;
    if (!meta || !meta.map.key_configured) {
      if (meta && meta.map.static_map_configured) {
        var staticResult = ShopsMap.renderStatic(pickMap, { center: meta.map.center, area: meta.map.area, shops: [previewShop] });
        if (!staticResult.ok) pickMap.innerHTML = '<div class="shop-map__state u-muted">' + UI.esc(staticResult.message) + "</div>";
      } else {
        pickMap.innerHTML = '<div class="shop-map__state u-muted">地图静态底图不可用；仍可按 GCJ-02 坐标手工核对并填写路线。</div>';
      }
      return;
    }
    ShopsMap.load(meta.map.js_key, meta.map.security_code)
      .then(function () {
        var result = ShopsMap.render(pickMap, {
          center: { lat: lat, lng: lng, zoom: 17 },
          shops: [previewShop],
          area: null
        });
        if (!result.ok) pickMap.innerHTML = '<div class="shop-map__state u-muted">' + UI.esc(result.message) + "</div>";
        else previewMap = result.map;
        void point;
      })
      .catch(function () {
        pickMap.innerHTML = '<div class="shop-map__state u-muted">地图加载失败，可稍后在详情页核对位置。</div>';
      });
  }

  /* ---------- 高德步行路线测算 ---------- */
  function anchorOf(key) {
    if (!meta || !meta.map) return null;
    var found = (meta.map.anchors || []).filter(function (item) {
      return item.key === key && item.configured;
    })[0];
    return found || null;
  }

  function wireMeasure(key, buttonId, stateId, distanceId, walkId) {
    var row = form.querySelector('[data-measure="' + key + '"]');
    var anchor = anchorOf(key);
    // No JS API key means manual AMap distance entry remains available, but hide the auto-route button.
    if (!row || !anchor || !meta || !meta.map || !meta.map.key_configured) return;
    row.hidden = false;
    var button = page.el(buttonId);
    var stateEl = page.el(stateId);
    button.addEventListener("click", function () {
      var lat = num("sLat");
      var lng = num("sLng");
      if (lat === null || lng === null) {
        UI.toast.error("请先填写店铺坐标，再测算步行路线");
        page.el("sLat").focus();
        return;
      }
      stateEl.textContent = "正在测算…";
      stateEl.className = "status-text";
      UI.form.busy(button, true);
      ShopsMap.load(meta.map.js_key, meta.map.security_code)
        .then(function () {
          // 页面文案和记录均按「校门 → 店铺」定义路线起点/终点。
          return ShopsMap.walk(previewMap, { lat: anchor.lat, lng: anchor.lng }, { lat: lat, lng: lng });
        })
        .then(function (route) {
          page.el(distanceId).value = String(route.meters);
          page.el(walkId).value = String(route.minutes);
          stateEl.textContent = "已按高德步行路线填入，请核对";
          stateEl.className = "status-text is-ok";
        })
        .catch(function () {
          stateEl.textContent = "自动测算失败，请手动填写";
          stateEl.className = "status-text is-error";
        })
        .then(function () {
          UI.form.busy(button, false);
        });
    });
  }

  /* ---------- 提交 ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = validate();
    if (!data) return;
    UI.form.busy(submitBtn, true);
    UI.api("/api/shops", { method: "POST", body: data })
      .then(function (r) {
        if (r.ok && r.data && r.data.shop) {
          UI.toast.success("已添加");
          if (form._guard) form._guard.clean();
          location.href = "shop.html?id=" + encodeURIComponent(r.data.shop.id);
          return;
        }
        if (r.status === 409) {
          UI.form.fieldError(page.el("sName"), "已有同名店铺");
          var box = page.el("sName").closest(".field").querySelector(".field__error");
          if (box && r.data && r.data.existing_id) {
            box.insertAdjacentHTML("beforeend", ' <a href="shop.html?id=' + encodeURIComponent(r.data.existing_id) + '">查看已有店铺</a>');
          }
          return;
        }
        if (r.status === 422 && r.data && r.data.fields) {
          showServerErrors(r.data.fields);
          UI.toast.error("店铺信息有误，请检查标红项");
          return;
        }
        if (r.status === 403) {
          UI.toast.error("你没有权限添加店铺");
          return;
        }
        if (r.status === 401) {
          UI.toast.error("请先登录后再添加店铺");
          return;
        }
        UI.toast.error(UI.errorText(r));
      })
      .then(function () {
        UI.form.busy(submitBtn, false);
      });
  });

  chips.addEventListener("change", function (e) {
    if (!e.target || e.target.name !== "shopType") return;
    customType.hidden = e.target.value !== OTHER;
    if (!customType.hidden) customType.focus();
  });

  ["sLat", "sLng"].forEach(function (id) {
    page.el(id).addEventListener("change", UI.debounce(preview, 400));
  });

  UI.ready(function () {
    if (form) form._guard = UI.guardUnsaved(form);
    UI.qsa("[data-counter]", form).forEach(UI.form.counter);
    UI.api("/api/shops/meta", { on401: false }).then(function (r) {
      if (!r.ok) {
        lock("加载失败", UI.errorText(r), [{ label: "返回必吃榜", href: "shops.html" }, { label: "重试", id: "metaRetry" }]);
        var retry = page.el("metaRetry");
        if (retry) retry.addEventListener("click", function () { location.reload(); });
        return;
      }
      meta = r.data;
      if (meta.area && meta.area.text) page.el("scopeText").textContent = "收录范围：" + meta.area.text + "。距离与步行时间请在高德地图用步行路线查询后填写。";
      if (!UI.session.token()) {
        lock("登录后才能添加店铺", "添加店铺需要登录并达到「" + (UI.ROLE_LABELS[meta.create_min_role] || meta.create_min_role) + "」及以上权限。", [
          { label: "去登录", primary: true, href: page.loginUrl() },
          { label: "返回必吃榜", href: "shops.html" }
        ]);
        return;
      }
      if (!meta.can_create) {
        lock("需要学生认证", "添加店铺需要「" + (UI.ROLE_LABELS[meta.create_min_role] || meta.create_min_role) + "」及以上权限，认证通过后即可上传。", [
          { label: "去认证", primary: true, href: "student_verify.html" },
          { label: "返回必吃榜", href: "shops.html" }
        ]);
        return;
      }
      renderTypes(meta.types);
      form.hidden = false;
      note_ready();
    });
  });

  function note_ready() {
    wireMeasure("campus", "measureCampus", "measureCampusState", "sCampusDist", "sCampusWalk");
  }
})();
