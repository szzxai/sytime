(function () {
  "use strict";
  UI.dishReview = function (options) {
    var pageHelpers = UI.page;
    var hintText = "输入菜名、拼音或首字母，再从下拉列表选择已有菜品。";
    var ratingInputs = [5, 4, 3, 2, 1].map(function (rating) {
      return '<input type="radio" name="rating" id="r' + rating + '" value="' + rating + '"' +
        (rating === 5 ? " checked" : "") + '><label for="r' + rating + '" title="' + rating + ' 分">' + UI.icon("star") + '</label>';
    }).join("");
    document.body.insertAdjacentHTML("beforeend",
      '<dialog class="dialog dialog--sheet dialog--wide" id="reviewDialog" aria-labelledby="reviewDialog-t">' +
      '<form class="dialog__form" id="recipeForm" novalidate><div class="dialog__head">' +
      '<h2 class="dialog__title" id="reviewDialog-t">写评价</h2>' +
      '<button type="button" class="icon-btn icon-btn--sm" data-dialog-close aria-label="关闭">' + UI.icon("close") + '</button></div>' +
      '<div class="dialog__body"><div class="field dish-picker" id="dishPicker">' +
      '<label class="field__label" for="name">菜品</label>' +
      '<div class="dish-picker__control"><input class="input" id="name" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" ' +
      'aria-controls="dishOptions" aria-describedby="dishPickerHint" placeholder="输入菜名、拼音或首字母后选择" autocomplete="off" maxlength="200" autofocus>' +
      '<input type="hidden" id="selectedDishId" name="dish_id">' +
      '<div class="dish-picker__popup" id="dishPickerPopup" hidden>' +
      '<div class="dish-picker__options" id="dishOptions" role="listbox" aria-label="已有菜品" tabindex="-1"></div>' +
      '<p class="dish-picker__status" id="dishPickerStatus" role="status"></p>' +
      '<button type="button" class="btn btn--sm" id="dishPickerMore" aria-controls="dishOptions" hidden>显示更多</button>' +
      '<button type="button" class="btn btn--sm" id="dishPickerRetry" hidden>重新加载菜品</button></div></div>' +
      '<div class="field__hint" id="dishPickerHint">' + hintText + '</div></div>' +
      '<div class="field"><span class="field__label" id="ratingLabel">评分</span>' +
      '<div class="rating-input" role="radiogroup" aria-labelledby="ratingLabel">' + ratingInputs + '</div>' +
      '<div class="field__hint">默认 5 分可改</div></div>' +
      '<div class="field"><label class="field__label" for="comment">评论 <span class="field__opt">（选填）</span></label>' +
      '<textarea class="textarea" id="comment" data-counter="500"></textarea>' +
      '<div class="field__foot"><span class="field__hint"></span><span class="field__counter"></span></div></div>' +
      '<div class="field" data-upload data-max-mb="2" data-types="image/jpeg,image/png">' +
      '<span class="field__label">图片 <span class="field__opt">（选填）</span></span>' +
      '<label class="upload"><span class="upload__icon">' + UI.icon("image", "icon--lg") + '</span>' +
      '<span class="upload__title">点击选择或拖入图片</span><span class="upload__hint">JPG / PNG，不超过 2 MB</span>' +
      '<input aria-label="上传图片" type="file" id="image" accept="image/jpeg,image/png"></label>' +
      '<div class="upload-preview-slot"></div></div></div><div class="dialog__foot">' +
      '<button type="button" class="btn" data-dialog-close>取消</button>' +
      '<button type="submit" class="btn btn--primary" id="recipeSubmit">发布</button></div></form></dialog>');
    var dialog = pageHelpers.el("reviewDialog"), form = pageHelpers.el("recipeForm"), input = pageHelpers.el("name");
    var selectedId = pageHelpers.el("selectedDishId"), popup = pageHelpers.el("dishPickerPopup"), list = pageHelpers.el("dishOptions");
    var status = pageHelpers.el("dishPickerStatus"), hint = pageHelpers.el("dishPickerHint"), retry = pageHelpers.el("dishPickerRetry");
    var more = pageHelpers.el("dishPickerMore"), picker = pageHelpers.el("dishPicker"), optionPageSize = 50, visibleCount = optionPageSize;
    var dishes = null, matches = [], active = -1, composing = false, pending = null, failed = false;

    function closeOptions() {
      popup.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      active = -1;
      visibleCount = optionPageSize;
    }
    function showOptions() {
      if (!dialog.open) return;
      popup.hidden = false;
      input.setAttribute("aria-expanded", "true");
      input.removeAttribute("aria-activedescendant");
      active = -1;
      matches = [];
      list.innerHTML = "";
      retry.hidden = true;
      if (!dishes) {
        more.hidden = true;
        status.textContent = failed ? "菜品加载失败，请重试。" : "正在加载菜品…";
        retry.hidden = !failed;
        return;
      }
      var query = input.value.normalize("NFC").trim().toLocaleLowerCase();
      var latin = query.replace(/\s+/g, "");
      var filtered = dishes.filter(function (dish) {
        return !query || dish.name.normalize("NFC").toLocaleLowerCase().includes(query) ||
          dish.pinyin.includes(latin) || dish.pinyin_initials.includes(latin);
      });
      matches = filtered.slice(0, visibleCount);
      list.innerHTML = matches.map(function (dish) {
        return '<div class="dish-picker__option" role="option" id="dish-option-' + dish.id +
          '" data-dish-choice="' + dish.id + '" aria-selected="false">' + UI.esc(dish.name) + '</div>';
      }).join("");
      more.hidden = matches.length >= filtered.length;
      status.textContent = !filtered.length ? "没有匹配的已有菜品，请更换关键词。" :
        "找到 " + filtered.length + " 道菜品，已显示 " + matches.length + " 道，可用方向键选择后按回车。";
    }
    async function loadCatalog() {
      if (dishes || pending) return;
      failed = false;
      if (!popup.hidden) showOptions();
      pending = UI.api("/api/dishes", { auth: false });
      var result = await pending;
      pending = null;
      if (result.ok) dishes = result.data.dishes || [];
      else failed = true;
      if (dialog.open && (document.activeElement === input || !popup.hidden)) showOptions();
    }
    function selectDish(dish, focus) {
      input.value = dish.name;
      selectedId.value = String(dish.id);
      hint.textContent = "已选择：" + dish.name;
      UI.form.clearField(input);
      if (focus) input.focus();
      closeOptions();
    }
    function moveActive(index) {
      if (!matches.length) return;
      active = (index + matches.length) % matches.length;
      Array.from(list.children).forEach(function (option, position) {
        option.classList.toggle("is-active", position === active);
        option.setAttribute("aria-selected", String(position === active));
      });
      var option = list.children[active];
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    }
    input.addEventListener("focus", function () { showOptions(); loadCatalog(); });
    input.addEventListener("input", function () {
      selectedId.value = "";
      hint.textContent = hintText;
      visibleCount = optionPageSize;
      if (!composing) showOptions();
    });
    input.addEventListener("compositionstart", function () { composing = true; });
    input.addEventListener("compositionend", function () {
      composing = false;
      selectedId.value = "";
      hint.textContent = hintText;
      visibleCount = optionPageSize;
      showOptions();
    });
    input.addEventListener("keydown", function (event) {
      if (composing || event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (popup.hidden) showOptions();
        loadCatalog();
        moveActive(active < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : active + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Enter" && !popup.hidden) {
        event.preventDefault();
        if (active >= 0) selectDish(matches[active], true);
        else if (matches.length === 1) selectDish(matches[0], true);
      } else if (event.key === "Escape" && !popup.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeOptions();
      }
    });
    picker.addEventListener("focusout", function () {
      setTimeout(function () {
        if (document.activeElement !== input && !popup.contains(document.activeElement)) closeOptions();
      }, 0);
    });
    more.addEventListener("click", function () {
      if (more.hidden) return;
      var scrollTop = list.scrollTop;
      visibleCount += optionPageSize;
      showOptions();
      if (more.hidden) input.focus({ preventScroll: true });
      list.scrollTop = scrollTop;
    });
    popup.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        input.focus({ preventScroll: true });
        closeOptions();
      }
    });
    list.addEventListener("pointerdown", function (event) { event.preventDefault(); });
    list.addEventListener("click", function (event) {
      var option = event.target.closest("[data-dish-choice]");
      if (!option) return;
      var dish = matches.find(function (candidate) { return String(candidate.id) === option.dataset.dishChoice; });
      if (dish) selectDish(dish, true);
    });
    retry.addEventListener("click", function () { input.focus(); loadCatalog(); });
    dialog.addEventListener("close", closeOptions);
    dialog.addEventListener("pointerdown", function (event) {
      if (!picker.contains(event.target)) closeOptions();
    });
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var button = pageHelpers.el("recipeSubmit");
      if (button.disabled || !pageHelpers.validate(form, [])) return;
      var dish = dishes && dishes.find(function (candidate) {
        return String(candidate.id) === selectedId.value && candidate.name === input.value;
      });
      if (!dish) {
        UI.form.fieldError(input, "请从下拉列表选择已有菜品");
        input.focus();
        showOptions();
        return;
      }
      closeOptions();
      var data = new FormData();
      data.append("dish_id", String(dish.id));
      data.append("comment", pageHelpers.value("comment"));
      data.append("rating", (form.querySelector('[name="rating"]:checked') || {}).value || "5");
      var file = UI.upload.get(form.querySelector("[data-upload]"));
      if (file) data.append("image", file);
      var result = await pageHelpers.request(button, "/api/recipes", { method: "POST", form: data }, "已发布");
      if (result && result.ok) {
        UI.dialog.close(dialog);
        pageHelpers.reset(form);
        selectedId.value = "";
        hint.textContent = hintText;
        closeOptions();
        if (options.onPublished) options.onPublished(result.data.recipe);
      }
    });
    return {
      open: function (dish) {
        if (!UI.session.token()) {
          UI.toast.warning("请先登录");
          setTimeout(UI.goLogin, 900);
          return;
        }
        if (dish && !selectedId.value) selectDish(dish, false);
        UI.dialog.open(dialog);
        input.focus();
        loadCatalog();
      },
    };
  };
})();
