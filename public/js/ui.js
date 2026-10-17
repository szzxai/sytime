/* ==========================================================================
   校园信息网 · ui.js  (交互层参考实现 v1.0)
   - 唯一全局：window.UI。无依赖、无构建，需配合 site.css 与 img/icons.svg。
   - 页面里只做三件事：引入本文件 → 写 <body data-nav="..."> → 用 UI.* 工具函数。
   - 所有拼接进 innerHTML 的动态字符串必须先过 UI.esc()。
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 0. 配置（按功能上线进度翻转 features） ---------- */
  var UI = {
    version: '1.0',
    config: {
      brand: '校园信息网',
      iconsUrl: '/img/icons.svg?v=brand-su-2026-10-03',
      features: {
        shops: true,     // #6 三元坊必吃榜（列表 / 详情 / 添加店铺）
        dishes: true,    // #5 菜品目录已上线；详情与店铺关联后续实现
        inbox: true,     // #9 消息箱已上线
        titles: true,    // #10 头衔系统
        theme: false     // 深色主题（P2）
      },
      api: {
        profile: '/api/user/profile',
        banner: '/api/settings/banner',
        unreadCount: '/api/messages/unread-count'   // #9 落地后以实际接口为准
      },
      loginUrl: 'login.html',
      pollMs: 60000,         // 消息未读数轮询间隔
      pageSize: 20,          // 列表“加载更多”每次追加的条数
      slowMs: 8000,          // 超过该时长仍在加载时提示“网络较慢”
      shopCreateMinRole: 'student',   // 添加店铺的最低角色（后端必须再校验）
      dishCreateMinRole: 'student'    // 添加菜品的最低角色
    }
  };
  window.UI = UI;

  var HUES = ['teal', 'vermilion', 'ochre', 'bamboo', 'wisteria', 'indigo', 'rose', 'stone'];
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. 基础工具 ---------- */
  UI.esc = function (value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  UI.icon = function (name, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="' + UI.config.iconsUrl + '#i-' + name + '"></use></svg>';
  };

  UI.ready = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  UI.qs = function (sel, root) { return (root || document).querySelector(sel); };
  UI.qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var uid = 0;
  UI.uid = function (prefix) { uid += 1; return (prefix || 'ui') + '-' + uid; };

  // 只允许站内相对路径或 /uploads 下的图片，防止 javascript: 等协议
  UI.safeUrl = function (url) {
    var s = String(url || '');
    if (/^(\/|\.\/|[a-zA-Z0-9_\-]+\/|data:image\/(png|jpeg);base64,)/.test(s) && !/^\/\//.test(s)) return s;
    return '';
  };

  // 头像底色只在 7 种彩色里取（不含灰色 stone），同一个用户永远是同一种颜色
  UI.hueFor = function (seed) {
    var pool = HUES.slice(0, 7);
    var s = String(seed === undefined || seed === null ? '' : seed);
    if (/^\d+$/.test(s)) return pool[Number(s) % pool.length];
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return pool[h % pool.length];
  };

  UI.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms === undefined ? 250 : ms);
    };
  };

  /* ---------- 2. 格式化 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  UI.formatTime = function (sec) {
    if (!sec) return '';
    var d = new Date(Number(sec) * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  UI.timeAgo = function (sec) {
    if (!sec) return '';
    var t = Number(sec) * 1000, now = Date.now(), diff = Math.max(0, now - t);
    var m = 60000, h = 3600000, d = 86400000;
    if (diff < m) return '刚刚';
    if (diff < h) return Math.floor(diff / m) + ' 分钟前';
    if (diff < d) return Math.floor(diff / h) + ' 小时前';
    var date = new Date(t), today = new Date();
    var startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    if (t >= startToday - d && t < startToday) return '昨天 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    if (diff < 7 * d) return Math.floor(diff / d) + ' 天前';
    if (date.getFullYear() === today.getFullYear()) return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  };
  UI.timeEl = function (sec) {
    if (!sec) return '';
    return '<time datetime="' + new Date(Number(sec) * 1000).toISOString() + '" title="' + UI.esc(UI.formatTime(sec)) + '">' + UI.esc(UI.timeAgo(sec)) + '</time>';
  };
  UI.formatDistance = function (m) {
    m = Number(m);
    if (!isFinite(m) || m < 0) return '';
    if (m >= 1000) return (Math.round(m / 100) / 10) + ' 公里';
    return Math.round(m) + ' 米';
  };
  UI.formatMinutes = function (min) {
    min = Number(min);
    if (!isFinite(min) || min < 0) return '';
    if (min >= 60) { var h = Math.floor(min / 60), r = Math.round(min % 60); return h + ' 小时' + (r ? ' ' + r + ' 分钟' : ''); }
    return Math.round(min) + ' 分钟';
  };
  UI.formatBytes = function (n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };

  /* ---------- 3. 会话与角色 ---------- */
  UI.ROLE_WEIGHTS = { developer: 6, super_admin: 5, admin: 4, student: 3, user: 2, guest: 1 };
  UI.ROLE_LABELS = { developer: '开发者', super_admin: '超级管理员', admin: '管理员', student: '学生', user: '普通用户', guest: '访客' };
  UI.PERMISSION_LABELS = {
    banner_edit: '编辑横幅', announcement_publish: '发布更新公告', student_review: '学生认证审核',
    invite_manage: '邀请码管理', weekly_menu_upload: '每周菜谱上传', map_popup_edit: '地图弹窗编辑',
    user_manage: '用户管理', ban_appeal_review: '申诉处理', ticket_manage: '工单管理',
    shop_create: '添加店铺', title_manage: '头衔管理'
  };
  UI.session = {
    token: function () { try { return localStorage.getItem('token') || ''; } catch (e) { return ''; } },
    user: function () { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { return null; } },
    save: function (user) { try { localStorage.setItem('user', JSON.stringify(user)); } catch (e) { /* ignore */ } },
    patch: function (patch) { var u = UI.session.user(); if (!u) return; for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) u[k] = patch[k]; } UI.session.save(u); },
    clear: function () { try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch (e) { /* ignore */ } },
    weight: function (user) { user = user || UI.session.user(); return (user && UI.ROLE_WEIGHTS[user.role]) || 0; },
    isAtLeast: function (role, user) { return UI.session.weight(user) >= (UI.ROLE_WEIGHTS[role] || 99); },
    can: function (perm, minRole, user) {
      user = user || UI.session.user();
      if (!user) return false;
      if (UI.session.weight(user) >= (UI.ROLE_WEIGHTS[minRole] || 99)) return true;
      return !!(user.permissions && user.permissions.indexOf(perm) !== -1);
    },
    // 登录过期：清除并回到登录页（带 next）
    expired: function (opts) {
      UI.session.clear();
      if (opts && opts.redirect === false) return;
      UI.toast('登录已过期，请重新登录', { type: 'warning' });
      setTimeout(function () { UI.goLogin(); }, 900);
    }
  };
  UI.goLogin = function () {
    var next = location.pathname.replace(/^\//, '') + location.search + location.hash;
    var url = UI.config.loginUrl + (next && next !== UI.config.loginUrl ? '?next=' + encodeURIComponent(next) : '');
    location.href = url;
  };
  // 登录成功后的跳转目标：只接受站内相对路径
  UI.nextUrl = function (fallback) {
    var n = new URLSearchParams(location.search).get('next') || '';
    return /^[a-zA-Z0-9_\-.\/]+(\?[^#]*)?(#.*)?$/.test(n) && !/^\/\//.test(n) && n.indexOf('..') === -1 ? n : (fallback || 'index.html');
  };

  /* ---------- 4. 接口封装与错误文案 ---------- */
  var ERROR_TEXT = {
    'network': '网络连接失败，请检查网络后重试',
    'login required': '请先登录',
    'forbidden': '你没有权限执行此操作',
    'server error': '服务器开小差了，请稍后再试',
    'invalid username or password': '用户名或密码错误',
    'username already exists': '用户名已被占用',
    'username, nickname and password are required': '请填写完整的用户名、昵称和密码',
    'username and password are required': '请输入用户名和密码',
    'title and content are required': '标题和内容都不能为空',
    'content is required': '内容不能为空',
    'category must be 讨论 or 提问': '请选择有效的分类',
    'invalid post id': '帖子编号无效',
    'post not found': '帖子不存在或已被删除',
    '已点赞': '你已经点过赞了',
    'name is required': '请填写名称',
    'rating must be between 0 and 5': '评分需在 0 到 5 分之间',
    'only jpg/png images are allowed': '仅支持 JPG / PNG 格式的图片',
    'File too large': '图片太大，请压缩后重试',
    'Unexpected field': '上传的文件字段不正确，请刷新页面后重试',
    'avatar image is required': '请先选择头像图片',
    'nickname is required': '昵称不能为空',
    'oldPassword and newPassword are required': '请填写旧密码和新密码',
    'old password is incorrect': '旧密码不正确',
    'student_id, class_name and real_name are required': '请填写新生号、班级和真实姓名',
    'invite_code is required': '请输入邀请码',
    'code is required': '请输入邀请码',
    'code already exists': '该邀请码已存在',
    'invalid id': '编号无效',
    'id is required': '缺少必要参数',
    'application not found': '该申请不存在或已处理',
    'appeal not found': '该申诉不存在或已处理',
    'ticket not found': '该工单不存在',
    'id and reply are required': '请填写批复内容',
    'userId and a valid newRole are required': '请选择有效的角色',
    'cannot change your own role': '不能修改自己的角色',
    'cannot modify a user with equal or higher role': '不能操作同级或更高级别的用户',
    'new role out of allowed range': '该角色超出你可分配的范围',
    'user not found': '用户不存在',
    'userId is required': '缺少用户编号',
    'cannot ban yourself': '不能封禁自己',
    'cannot ban a user with equal or higher role': '不能封禁同级或更高级别的用户',
    'cannot modify this user': '你无权修改该用户',
    'username and appeal_reason are required': '请填写申诉理由',
    'user is not banned': '该账号当前没有被封禁',
    'appealId and action (approve/reject) are required': '操作参数不完整',
    'menu_start_date and menu_end_date are required': '请选择第一天和最后一天',
    'image is required': '请先选择图片',
    'image not found': '图片不存在或已被删除',
    'feature not found': '没有找到该地图对象',
    'rate_limited': '操作太频繁，请稍后再试',
    'banned': '账号已被封禁',
    'head title name already exists': '头衔名称已存在',
    'head title not found': '头衔不存在或已被删除',
    'head title not owned': '你尚未拥有该头衔',
    'invalid head title': '头衔无效',
    'auto head title cannot be revoked': '自动头衔由规则发放，不能撤销',
    'auto head title cannot be granted': '自动头衔由规则发放，不能手动授予',
    'built-in head title cannot be deleted': '内置头衔不能删除'
  };
  var STATUS_TEXT = {
    0: '网络连接失败，请检查网络后重试',
    400: '提交的内容有误，请检查后重试',
    401: '请先登录',
    403: '你没有权限执行此操作',
    404: '内容不存在或已被删除',
    409: '内容冲突，可能已经存在',
    413: '文件太大，请压缩后重试',
    429: '操作太频繁，请稍后再试',
    500: '服务器开小差了，请稍后再试'
  };
  // 接收 UI.api 的返回值（或任何带 data/status 的对象）
  UI.errorText = function (r, fallback) {
    if (!r) return fallback || '操作失败，请稍后再试';
    var data = r.data || r;
    if (data && data.message && /[一-龥]/.test(data.message)) return data.message;
    var key = data && (data.error || data.message);
    if (key && ERROR_TEXT[key]) return ERROR_TEXT[key];
    if (key && /[一-龥]/.test(key)) return key;
    if (r.status !== undefined && STATUS_TEXT[r.status]) return STATUS_TEXT[r.status];
    if (r.status >= 500) return STATUS_TEXT[500];
    return fallback || '操作失败，请稍后再试';
  };

  // 统一请求：永不抛异常，返回 { ok, status, data }
  UI.api = function (path, opt) {
    opt = opt || {};
    var headers = {};
    var token = UI.session.token();
    if (opt.auth !== false && token) headers.Authorization = 'Bearer ' + token;
    var body;
    if (opt.form) body = opt.form;
    else if (opt.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opt.body); }
    return fetch(path, { method: opt.method || 'GET', headers: headers, body: body, signal: opt.signal })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      })
      .catch(function (err) {
        return { ok: false, status: 0, data: { error: 'network' }, aborted: !!(err && err.name === 'AbortError') };
      })
      .then(function (r) {
        if (r.status === 401 && opt.auth !== false && token && opt.on401 !== false) UI.session.expired({ redirect: opt.redirect });
        return r;
      });
  };

  /* ---------- 5. 头像 / 用户行 / 评分 / 头衔 ---------- */
  UI.avatar = function (user, size) {
    user = user || {};
    var name = user.nickname || user.username || '?';
    var hue = UI.hueFor(user.id !== undefined && user.id !== null ? user.id : name);
    var url = UI.safeUrl(user.avatar_url);
    var initial = String(name).trim().slice(0, 1).toUpperCase();
    var inner = url ? '<img src="' + UI.esc(url) + '" alt="" loading="lazy" decoding="async">' : UI.esc(initial);
    return '<span class="avatar avatar--' + (size || 'md') + '" data-hue="' + hue + '" data-initial="' + UI.esc(initial) + '">' + inner + '</span>';
  };
  UI.titleBadge = function (t) {
    if (!t || !t.name) return '';
    return '<span class="title-badge" data-hue="' + UI.esc(t.hue || 'stone') + '">' + UI.icon('award') + '<span class="title-badge__text">' + UI.esc(t.name) + '</span></span>';
  };
  // 权限等级标签：所有已登录角色都有；除普通用户（user）强制展示外，其余由用户偏好 show_role 控制（默认展示）
  UI.roleTag = function (role, showRole) {
    if (!role || role === 'guest' || !UI.ROLE_LABELS[role]) return '';
    if (role !== 'user' && (showRole === 0 || showRole === false || showRole === '0')) return '';
    return '<span class="role-tag">' + UI.esc(UI.ROLE_LABELS[role]) + '</span>';
  };
  // 头像 → 用户主页链接（#21）：自己 → 个人中心；他人 → user.html?id=；无法定位则返回空
  UI.userHref = function (user) {
    if (!user) return '';
    var id = user.id !== undefined && user.id !== null ? user.id
      : (user.user_id !== undefined && user.user_id !== null ? user.user_id : null);
    if (id === null || id === '' || String(id) === 'undefined') return '';
    var me = UI.session.user();
    if (me && me.id !== undefined && me.id !== null && String(me.id) === String(id)) return 'profile.html';
    return 'user.html?id=' + encodeURIComponent(String(id));
  };
  // 头像（可点击进入该用户主页/个人中心）；user 无 id 时退化为不可点击
  UI.avatarLink = function (user, size, cls) {
    var inner = UI.avatar(user, size);
    var href = UI.userHref(user);
    if (!href) return '<span class="user-avatar' + (cls ? ' ' + cls : '') + '">' + inner + '</span>';
    return '<a class="user-avatar user-avatar--link' + (cls ? ' ' + cls : '') + '" href="' + UI.esc(href) + '" aria-label="查看用户主页">' + inner + '</a>';
  };
  // 统一用户信息组件：论坛、评价、消息、后台都用它
  UI.userLine = function (user, opt) {
    user = user || {}; opt = opt || {};
    var name = user.nickname || user.username || '已注销用户';
    var top = '<span class="user-line__name">' + UI.esc(name) + '</span>' +
      (UI.config.features.titles ? UI.titleBadge(user.title) : '') +
      (opt.showRole === false ? '' : UI.roleTag(user.role, user.show_role));
    var meta = opt.meta ? '<span class="user-line__meta">' + opt.meta + '</span>' : '';   // meta 由调用方保证已转义（可含 <time>）
    var tag = opt.href ? 'a' : 'div';
    // opt.href 时整行已是链接，避免嵌套 <a>，头像不再单独链接
    var avatar = opt.href ? UI.avatar(user, opt.size || 'sm') : UI.avatarLink(user, opt.size || 'sm');
    return '<' + tag + ' class="user-line' + (opt.large ? ' user-line--lg' : '') + '"' + (opt.href ? ' href="' + UI.esc(opt.href) + '"' : '') + '>' +
      avatar + '<span class="user-line__body"><span class="user-line__top">' + top + '</span>' + meta + '</span></' + tag + '>';
  };
  UI.stars = function (rating, opt) {
    var r = Math.max(0, Math.min(5, Number(rating) || 0));
    var row = new Array(6).join(UI.icon('star'));
    return '<span class="stars' + (opt && opt.large ? ' stars--lg' : '') + '" style="--rating:' + r + '" role="img" aria-label="评分 ' + r + ' 分，满分 5 分">' +
      '<span class="stars__row stars__base">' + row + '</span><span class="stars__fill"><span class="stars__row">' + row + '</span></span></span>';
  };

  /* ---------- 6. 状态区块：骨架 / 空状态 / 加载失败 ---------- */
  UI.html = {
    skeleton: function (kind, n) {
      n = n || 3;
      var one = {
        post: '<div class="card"><div class="row row--top"><span class="skeleton skeleton--avatar"></span><div class="grow"><span class="skeleton skeleton--title"></span><span class="skeleton skeleton--text"></span><span class="skeleton skeleton--text skeleton--short"></span></div></div></div>',
        card: '<div class="card card--flush"><span class="skeleton skeleton--media"></span><div style="padding:1rem"><span class="skeleton skeleton--title"></span><span class="skeleton skeleton--text"></span></div></div>',
        row: '<div class="dish-row"><span class="skeleton" style="width:3.5rem;height:3.5rem;border-radius:var(--r-2)"></span><div class="dish-row__main"><span class="skeleton skeleton--title"></span><span class="skeleton skeleton--text skeleton--short"></span></div></div>',
        text: '<span class="skeleton skeleton--text"></span><span class="skeleton skeleton--text"></span><span class="skeleton skeleton--text skeleton--short"></span>'
      }[kind || 'post'];
      var out = '';
      for (var i = 0; i < n; i++) out += one;
      return '<div class="stack" role="status" aria-busy="true" aria-label="加载中">' + out + '</div>';
    },
    // tone: '' | 'error' | 'lock'；actions: [{label, href, id, primary}]
    empty: function (o) {
      o = o || {};
      var actions = (o.actions || []).map(function (a) {
        return (a.href ? '<a' : '<button type="button"') + ' class="btn' + (a.primary ? ' btn--primary' : '') + '"' + (a.href ? ' href="' + UI.esc(a.href) + '"' : '') + (a.id ? ' id="' + UI.esc(a.id) + '"' : '') + (a.attrs ? ' ' + a.attrs : '') + '>' + (a.icon ? UI.icon(a.icon, 'icon--sm') : '') + UI.esc(a.label) + (a.href ? '</a>' : '</button>');
      }).join('');
      return '<div class="empty' + (o.compact ? ' empty--compact' : '') + (o.card ? ' empty--card' : '') + (o.tone ? ' empty--' + o.tone : '') + '">' +
        '<div class="empty__icon">' + UI.icon(o.icon || 'inbox') + '</div>' +
        '<div class="empty__title">' + UI.esc(o.title || '这里还没有内容') + '</div>' +
        (o.desc ? '<div class="empty__desc">' + UI.esc(o.desc) + '</div>' : '') +
        (actions ? '<div class="empty__actions">' + actions + '</div>' : '') + '</div>';
    },
    // 加载失败：带重试按钮（按钮带 data-retry，由页面脚本监听）
    loadError: function (r, title) {
      return UI.html.empty({ tone: 'error', icon: r && r.status === 0 ? 'wifi-off' : 'alert-circle', title: title || '加载失败', desc: UI.errorText(r), actions: [{ label: '重试', icon: 'refresh', attrs: 'data-retry' }] });
    }
  };

  /* ---------- 7. 页面滚动锁与对话框 ---------- */
  var lockCount = 0;
  function lockScroll() {
    if (lockCount === 0) {
      var sw = window.innerWidth - document.documentElement.clientWidth;
      if (sw > 0) document.documentElement.style.paddingRight = sw + 'px';
      document.documentElement.style.overflow = 'hidden';
    }
    lockCount += 1;
  }
  function unlockScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.documentElement.style.overflow = '';
      document.documentElement.style.paddingRight = '';
    }
  }

  function resolveDialog(x) { return typeof x === 'string' ? document.getElementById(x) : x; }
  UI.dialog = {
    open: function (x) {
      var d = resolveDialog(x);
      if (!d || d.open) return d;
      d.classList.remove('is-closing');
      d.showModal();
      lockScroll();
      d.dispatchEvent(new CustomEvent('ui:open'));
      return d;
    },
    close: function (x, value) {
      var d = resolveDialog(x);
      if (!d || !d.open) return;
      if (REDUCED) { d.close(value); return; }
      if (d.classList.contains('is-closing')) return;
      d.classList.add('is-closing');
      setTimeout(function () { d.classList.remove('is-closing'); if (d.open) d.close(value); }, 150);
    }
  };
  // 原生 close 事件里统一解锁滚动
  document.addEventListener('close', function (e) {
    if (e.target && e.target.tagName === 'DIALOG') unlockScroll();
  }, true);

  function buildDialog(cls, html) {
    var d = document.createElement('dialog');
    d.className = 'dialog ' + cls;
    d.innerHTML = html;
    document.body.appendChild(d);
    d.addEventListener('close', function () { setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 0); });
    return d;
  }
  function wireBackdrop(d, enabled) {
    d.addEventListener('mousedown', function (e) { if (e.target === d && enabled) d._downOnBackdrop = true; else d._downOnBackdrop = false; });
    d.addEventListener('click', function (e) { if (e.target === d && enabled && d._downOnBackdrop) UI.dialog.close(d, 'cancel'); });
  }

  // 确认框：返回 Promise<boolean>
  UI.confirm = function (o) {
    o = o || {};
    return new Promise(function (resolve) {
      var id = UI.uid('dlg');
      var d = buildDialog('dialog--confirm', '<form class="dialog__form" method="dialog">' +
        '<div class="dialog__head"><div class="dialog__icon' + (o.danger ? ' dialog__icon--danger' : '') + '">' + UI.icon(o.icon || (o.danger ? 'alert-triangle' : 'help')) + '</div><h2 class="dialog__title" id="' + id + '-t">' + UI.esc(o.title || '确认操作') + '</h2></div>' +
        (o.message ? '<div class="dialog__body" id="' + id + '-d">' + UI.esc(o.message) + '</div>' : '') +
        '<div class="dialog__foot"><button type="button" class="btn" data-r="cancel">' + UI.esc(o.cancelText || '取消') + '</button>' +
        '<button type="submit" class="btn ' + (o.danger ? 'btn--danger' : 'btn--primary') + '" data-r="ok">' + UI.esc(o.confirmText || '确定') + '</button></div></form>');
      d.setAttribute('aria-labelledby', id + '-t');
      if (o.message) d.setAttribute('aria-describedby', id + '-d');
      var result = false;
      d.querySelector('[data-r="cancel"]').addEventListener('click', function () { UI.dialog.close(d, 'cancel'); });
      d.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); result = true; UI.dialog.close(d, 'ok'); });
      d.addEventListener('close', function () { resolve(result); });
      wireBackdrop(d, o.dismissible !== false);
      UI.dialog.open(d);
      // 危险操作默认聚焦“取消”，避免误触；其余聚焦确认
      (o.danger ? d.querySelector('[data-r="cancel"]') : d.querySelector('[data-r="ok"]')).focus();
    });
  };

  // 输入框：返回 Promise<string|null>（取消为 null）
  UI.prompt = function (o) {
    o = o || {};
    return new Promise(function (resolve) {
      var id = UI.uid('dlg');
      var control = o.multiline
        ? '<textarea class="textarea" id="' + id + '-i" rows="4" placeholder="' + UI.esc(o.placeholder || '') + '">' + UI.esc(o.value || '') + '</textarea>'
        : '<input class="input" id="' + id + '-i" type="text" placeholder="' + UI.esc(o.placeholder || '') + '" value="' + UI.esc(o.value || '') + '">';
      var d = buildDialog('dialog--sheet', '<form class="dialog__form" method="dialog">' +
        '<div class="dialog__head"><h2 class="dialog__title" id="' + id + '-t">' + UI.esc(o.title || '请输入') + '</h2></div>' +
        '<div class="dialog__body"><div class="field"><label class="field__label" for="' + id + '-i">' + UI.esc(o.label || '') + '</label>' + control +
        '<div class="field__error" id="' + id + '-e">' + UI.icon('alert-circle') + '<span></span></div></div></div>' +
        '<div class="dialog__foot"><button type="button" class="btn" data-r="cancel">' + UI.esc(o.cancelText || '取消') + '</button>' +
        '<button type="submit" class="btn btn--primary">' + UI.esc(o.confirmText || '确定') + '</button></div></form>');
      d.setAttribute('aria-labelledby', id + '-t');
      var input = d.querySelector('#' + id + '-i');
      var result = null;
      d.querySelector('[data-r="cancel"]').addEventListener('click', function () { UI.dialog.close(d, 'cancel'); });
      d.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = input.value.trim();
        if (o.required && !v) { UI.form.fieldError(input, o.requiredMessage || '此项不能为空'); return; }
        result = input.value;
        UI.dialog.close(d, 'ok');
      });
      input.addEventListener('input', function () { UI.form.clearField(input); });
      d.addEventListener('close', function () { resolve(result); });
      wireBackdrop(d, false);
      UI.dialog.open(d);
      input.focus();
      if (input.select && !o.multiline) input.select();
    });
  };

  UI.alert = function (o) {
    o = o || {};
    return new Promise(function (resolve) {
      var id = UI.uid('dlg');
      var d = buildDialog('dialog--confirm', '<form class="dialog__form" method="dialog">' +
        '<div class="dialog__head"><div class="dialog__icon">' + UI.icon(o.icon || 'info') + '</div><h2 class="dialog__title" id="' + id + '-t">' + UI.esc(o.title || '提示') + '</h2></div>' +
        (o.message ? '<div class="dialog__body">' + UI.esc(o.message) + '</div>' : '') +
        '<div class="dialog__foot"><button type="submit" class="btn btn--primary">' + UI.esc(o.confirmText || '我知道了') + '</button></div></form>');
      d.setAttribute('aria-labelledby', id + '-t');
      d.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); UI.dialog.close(d, 'ok'); });
      d.addEventListener('close', function () { resolve(); });
      wireBackdrop(d, true);
      UI.dialog.open(d);
    });
  };

  /* ---------- 收藏夹（#23） ---------- */
  var COLLECT_ITEM_TYPE = { forum: "forum_post", shops: "shop" };
  UI.collections = {
    key: function (section, itemId) {
      var me = UI.session.user();
      var uid = me && me.id !== undefined && me.id !== null ? me.id : "guest";
      return "collected:" + uid + ":" + section + ":" + itemId;
    },
    isCollected: function (section, itemId) {
      try { return localStorage.getItem(UI.collections.key(section, itemId)) === "1"; } catch (e) { return false; }
    },
    mark: function (section, itemId, value) {
      try {
        if (value === false) localStorage.removeItem(UI.collections.key(section, itemId));
        else localStorage.setItem(UI.collections.key(section, itemId), "1");
      } catch (e) { /* localStorage 不可用时忽略 */ }
    },
    // 收藏按钮：action-btn（列表/帖子）或 btn--sm（详情页操作区）；已收藏用主色高亮
    button: function (section, itemId, opt) {
      opt = opt || {};
      var pressed = UI.collections.isCollected(section, itemId);
      var cls = opt.variant === "btn" ? "btn btn--sm btn--collect" : "action-btn action-btn--collect";
      if (opt.className) cls += " " + opt.className;
      return '<button type="button" class="' + cls + '" aria-pressed="' + pressed +
        '" aria-label="' + (pressed ? "已收藏" : "收藏") + '" data-collect data-section="' + UI.esc(section) +
        '" data-item-id="' + UI.esc(itemId) + '">' + UI.icon("star") +
        '<span data-collect-label>' + (pressed ? "已收藏" : "收藏") + "</span></button>";
    },
    open: function (opt) {
      opt = opt || {};
      if (!UI.session.token()) {
        UI.toast.warning("请先登录后再收藏");
        return;
      }
      var section = opt.section === "shops" ? "shops" : "forum";
      var itemType = COLLECT_ITEM_TYPE[section];
      var itemId = Number(opt.itemId);
      if (!itemId) return;
      var id = UI.uid("collection");
      var collections = [];
      var defaults = {};
      var selectedId = null;
      var d = document.createElement("dialog");
      d.className = "dialog dialog--sheet dialog--wide";
      d.innerHTML =
        '<form class="dialog__form" method="dialog">' +
        '<div class="dialog__head"><h2 class="dialog__title" id="' + id + '-t">收藏</h2>' +
        '<button type="button" class="icon-btn icon-btn--sm" data-close aria-label="关闭">' + UI.icon("close") + "</button></div>" +
        '<div class="dialog__body"><div class="stack collection-dialog__list" data-list>' + UI.html.skeleton("row", 2) + "</div>" +
        '<div class="field" data-new-field hidden>' +
        '<label class="field__label" for="' + id + '-new">新建收藏夹</label>' +
        '<div class="row row--sm"><input class="input grow" id="' + id + '-new" maxlength="40" placeholder="收藏夹名称">' +
        '<button type="button" class="btn btn--sm" data-create>新建</button></div>' +
        '<div class="field__error" data-new-error>' + UI.icon("alert-circle") + "<span></span></div></div>" +
        '<button type="button" class="btn btn--ghost btn--sm" data-new-toggle>' + UI.icon("plus", "icon--sm") + "新建收藏夹</button>" +
        "</div>" +
        '<div class="dialog__foot"><span class="status-text" data-status role="status"></span>' +
        '<button type="button" class="btn" data-cancel>取消</button>' +
        '<button type="submit" class="btn btn--primary" data-confirm>确认收藏</button></div></form>';
      d.setAttribute("aria-labelledby", id + "-t");
      document.body.appendChild(d);
      d.addEventListener("close", function () {
        setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 0);
      });
      d.addEventListener("mousedown", function (e) { d._downOnBackdrop = e.target === d; });
      d.addEventListener("click", function (e) {
        if (e.target === d && d._downOnBackdrop) UI.dialog.close(d, "cancel");
      });

      var list = d.querySelector("[data-list]");
      var newField = d.querySelector("[data-new-field]");
      var newInput = d.querySelector("#" + id + "-new");
      var createBtn = d.querySelector("[data-create]");

      function choiceItem(item, checked) {
        return '<label class="choice"><input class="choice__input" type="radio" name="collectionChoice" value="' +
          UI.esc(item.id) + '"' + (checked ? " checked" : "") + '><span class="choice__body">' +
          '<span class="choice__title">' + UI.esc(item.name) + UI.icon("check-circle", "choice__check") + "</span>" +
          '<span class="choice__desc">' + UI.esc(item.items_count || 0) + " 条内容 · " +
          (item.is_public ? "公开" : "私密") + "</span></span></label>";
      }

      function renderList() {
        if (!collections.length) {
          list.innerHTML = '<div class="callout"><span class="callout__text">还没有收藏夹，先新建一个吧。</span></div>';
          return;
        }
        var selected = Number(selectedId);
        if (!selected || !collections.some(function (c) { return Number(c.id) === selected; })) {
          selected = Number(defaults[section]);
          if (!selected || !collections.some(function (c) { return Number(c.id) === selected; })) {
            selected = Number(collections[0].id);
          }
        }
        selectedId = selected;
        list.innerHTML = '<div class="choice-group choice-group--compact" role="radiogroup" aria-label="选择收藏夹">' +
          collections.map(function (c) { return choiceItem(c, Number(c.id) === selected); }).join("") + "</div>";
      }

      function loadList() {
        list.innerHTML = UI.html.skeleton("row", 2);
        UI.api("/api/collections?section=" + encodeURIComponent(section), { on401: false }).then(function (r) {
          if (!r.ok) {
            list.innerHTML = '<div class="callout"><span class="callout__text">' + UI.esc(UI.errorText(r, "收藏夹加载失败")) + "</span></div>";
            return;
          }
          collections = r.data.collections || [];
          defaults = r.data.defaults || {};
          renderList();
        });
      }

      list.addEventListener("change", function (e) {
        var input = e.target.closest && e.target.closest('input[name="collectionChoice"]');
        if (input) selectedId = Number(input.value);
      });
      d.querySelector("[data-new-toggle]").addEventListener("click", function () {
        newField.hidden = false;
        newInput.focus();
      });
      newInput.addEventListener("input", function () { UI.form.clearField(newInput); });
      newInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); createBtn.click(); }
      });
      createBtn.addEventListener("click", function () {
        var name = newInput.value.trim();
        if (!name) { UI.form.fieldError(newInput, "请填写收藏夹名称"); return; }
        createBtn.disabled = true;
        UI.api("/api/collections", { method: "POST", body: { section: section, name: name }, on401: false }).then(function (r) {
          createBtn.disabled = false;
          if (!r.ok) { UI.toast.error(UI.errorText(r, "新建收藏夹失败")); return; }
          collections.push(r.data.collection);
          selectedId = Number(r.data.collection.id);
          newInput.value = "";
          newField.hidden = true;
          UI.form.clearField(newInput);
          renderList();
          UI.toast.success("已新建收藏夹");
        });
      });
      d.querySelector("[data-close]").addEventListener("click", function () { UI.dialog.close(d, "cancel"); });
      d.querySelector("[data-cancel]").addEventListener("click", function () { UI.dialog.close(d, "cancel"); });
      d.querySelector("form").addEventListener("submit", function (e) {
        e.preventDefault();
        if (!selectedId) { UI.toast.warning("请先选择收藏夹"); return; }
        var confirmBtn = d.querySelector("[data-confirm]");
        if (confirmBtn.disabled) return;
        confirmBtn.disabled = true;
        UI.api("/api/collections/" + encodeURIComponent(selectedId) + "/items", {
          method: "POST",
          body: { item_type: itemType, item_id: itemId },
          on401: false
        }).then(function (r) {
          confirmBtn.disabled = false;
          if (!r.ok) { UI.toast.error(UI.errorText(r, "收藏失败")); return; }
          UI.collections.mark(section, itemId);
          if (opt.button) {
            opt.button.setAttribute("aria-pressed", "true");
            opt.button.setAttribute("aria-label", "已收藏");
            var label = opt.button.querySelector("[data-collect-label]");
            if (label) label.textContent = "已收藏";
          }
          UI.toast.success(r.data.added === false ? "已在收藏夹中" : "已收藏");
          UI.dialog.close(d, "ok");
          if (typeof opt.onDone === "function") opt.onDone(r.data);
        });
      });
      UI.dialog.open(d);
      loadList();
    }
  };
  // 统一委托：任何页面的 [data-collect] 按钮都打开收藏夹选择器
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-collect]");
    if (!btn) return;
    var section = btn.getAttribute("data-section");
    var itemId = Number(btn.getAttribute("data-item-id"));
    if (!section || !itemId) return;
    e.preventDefault();
    UI.collections.open({ section: section, itemId: itemId, button: btn });
  });

  /* ---------- 收藏页共用：移动端判断 / 店铺卡片 / 分页器 ---------- */
  UI.isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
  UI.shopHue = function (type) {
    var map = { 面馆: "teal", 小吃: "ochre", 饮品: "wisteria", 快餐: "indigo", 甜点: "rose", 正餐: "vermilion" };
    return map[type] || "stone";
  };
  // 与 shops.html 列表共用的店铺卡片；opt.collect 控制是否显示收藏按钮
  UI.shopCard = function (shop, opt) {
    opt = opt || {};
    var ratingText = shop.rating_avg === null || shop.rating_avg === undefined
      ? "暂无"
      : Number(shop.rating_avg).toFixed(1) + " / 5";
    return (
      '<article class="card card--interactive shop">' +
      '<div class="shop__top">' +
      '<h2 class="card__title"><a class="card__link" href="shop.html?id=' + encodeURIComponent(shop.id) + '">' + UI.esc(shop.name) + "</a></h2>" +
      '<span class="tag" data-hue="' + UI.shopHue(shop.type) + '">' + UI.esc(shop.type) + "</span>" +
      "</div>" +
      '<p class="shop__addr">' + UI.icon("map-pin") + "<span>" + UI.esc(shop.address) +
      (shop.location_note ? "<small>" + UI.esc(shop.location_note) + "</small>" : "") +
      "</span></p>" +
      '<div class="shop__stats">' +
      '<span class="stat">' + UI.icon("route") + "<b>" + UI.esc(UI.formatDistance(shop.campus_distance_m)) +
      "</b><small>" + UI.esc("距苏州中学本部 · 步行 " + UI.formatMinutes(shop.campus_walk_min)) + "</small></span>" +
      "</div>" +
      '<p class="shop__addr">' + UI.icon("compass") + "<span>最近地铁：" + UI.esc(shop.metro_station + " " + shop.metro_exit) +
      "<small>步行 " + UI.esc(UI.formatDistance(shop.metro_distance_m)) + " · " + UI.esc(UI.formatMinutes(shop.metro_walk_min)) + "</small></span></p>" +
      (shop.dianping_url ? '<a class="shop__dianping" href="' + UI.esc(shop.dianping_url) + '" target="_blank" rel="noopener noreferrer">' + UI.icon("external", "icon--sm") + "大众点评</a>" : "") +
      '<div class="shop__engagement" aria-label="店铺互动统计">' +
      '<span>' + UI.icon("heart") + "<b>" + UI.esc(shop.likes_count || 0) + "</b><small>点赞</small></span>" +
      '<span>' + UI.icon("message") + "<b>" + UI.esc(shop.reviews_count || 0) + "</b><small>评价</small></span>" +
      '<span>' + UI.icon("star") + "<b>" + UI.esc(ratingText) + "</b><small>" + UI.esc(shop.ratings_count || 0) + " 次评分</small></span>" +
      "</div>" +
      (opt.collect ? '<div class="row row--end">' + UI.collections.button("shops", shop.id, { className: "card__action" }) + "</div>" : "") +
      "</article>"
    );
  };
  // 与 shops.html 相同的分页器骨架（首/末页 + 当前页 ±2）
  UI.pagerHtml = function (current, totalPages) {
    if (totalPages <= 1) return "";
    var pages = [];
    for (var p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - current) <= 2) pages.push(p);
      else if (pages[pages.length - 1] !== "gap") pages.push("gap");
    }
    var html = '<button type="button" class="btn btn--sm" data-page="' + (current - 1) + '"' + (current <= 1 ? " disabled" : "") + ' aria-label="上一页">' + UI.icon("chevron-left", "icon--sm") + "</button>";
    pages.forEach(function (p) {
      if (p === "gap") html += '<span class="pager__gap" aria-hidden="true">…</span>';
      else html += '<button type="button" class="btn btn--sm' + (p === current ? " btn--primary" : "") + '" data-page="' + p + '"' + (p === current ? ' aria-current="page"' : "") + ">" + p + "</button>";
    });
    html += '<button type="button" class="btn btn--sm" data-page="' + (current + 1) + '"' + (current >= totalPages ? " disabled" : "") + ' aria-label="下一页">' + UI.icon("chevron-right", "icon--sm") + "</button>";
    return html;
  };

  /* ---------- 8. Toast ---------- */
  var toastLast = { msg: '', at: 0 };
  function toastHost() {
    var opens = document.querySelectorAll('dialog[open]');
    var parent = opens.length ? opens[opens.length - 1] : document.body;
    var host = parent.querySelector(':scope > .toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      host.setAttribute('aria-live', 'polite');
      parent.appendChild(host);
    }
    return host;
  }
  UI.toast = function (message, o) {
    o = o || {};
    var type = o.type || 'info';
    var now = Date.now();
    if (message === toastLast.msg && now - toastLast.at < 1200) return { close: function () {} };
    toastLast = { msg: message, at: now };
    var host = toastHost();
    while (host.children.length >= 3) host.removeChild(host.firstChild);
    var el = document.createElement('div');
    var icon = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info' }[type] || 'info';
    el.className = 'toast toast--' + type;
    el.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
    el.innerHTML = UI.icon(icon, 'toast__icon') + '<span class="toast__text">' + UI.esc(message) + '</span>' +
      (o.action ? '<button type="button" class="toast__action">' + UI.esc(o.action.label) + '</button>' : '') +
      '<button type="button" class="icon-btn icon-btn--sm toast__close" aria-label="关闭">' + UI.icon('close', 'icon--sm') + '</button>';
    host.appendChild(el);
    var duration = o.duration === undefined ? ({ success: 3000, info: 3000, warning: 4500, error: 5000 }[type]) : o.duration;
    var timer = null;
    function close() {
      clearTimeout(timer);
      if (!el.parentNode) return;
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, REDUCED ? 0 : 140);
    }
    function arm() { if (duration > 0) { clearTimeout(timer); timer = setTimeout(close, duration); } }
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', arm);
    el.querySelector('.toast__close').addEventListener('click', close);
    if (o.action) el.querySelector('.toast__action').addEventListener('click', function () { close(); if (o.action.onClick) o.action.onClick(); });
    arm();
    return { close: close };
  };
  ['success', 'error', 'info', 'warning'].forEach(function (t) {
    UI.toast[t] = function (m, o) { o = o || {}; o.type = t; return UI.toast(m, o); };
  });

  /* ---------- 9. 表单辅助 ---------- */
  UI.form = {
    busy: function (btn, on, text) {
      if (!btn) return;
      if (on) {
        btn._label = btn._label === undefined ? btn.innerHTML : btn._label;
        btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
        if (text) btn.textContent = text;
      } else {
        btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); btn.disabled = false;
        if (btn._label !== undefined) { btn.innerHTML = btn._label; btn._label = undefined; }
      }
    },
    fieldError: function (input, msg) {
      var field = input.closest('.field');
      if (!field) return;
      field.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      var err = field.querySelector('.field__error');
      if (!err) {
        err = document.createElement('div');
        err.className = 'field__error';
        err.innerHTML = UI.icon('alert-circle') + '<span></span>';
        field.appendChild(err);
      }
      if (!err.id) err.id = UI.uid('err');
      err.querySelector('span').textContent = msg;
      var desc = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (desc.indexOf(err.id) === -1) desc.push(err.id);
      input.setAttribute('aria-describedby', desc.join(' '));
    },
    clearField: function (input) {
      var field = input.closest('.field');
      if (!field) return;
      field.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
    },
    clearAll: function (form) {
      UI.qsa('.field.is-invalid', form).forEach(function (f) {
        f.classList.remove('is-invalid');
        UI.qsa('[aria-invalid]', f).forEach(function (i) { i.removeAttribute('aria-invalid'); });
      });
    },
    focusFirstInvalid: function (form) {
      var el = form.querySelector('[aria-invalid="true"]');
      if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' }); }
    },
    // 字数统计：<textarea data-counter="2000"> 旁边放 <span class="field__counter">
    counter: function (el) {
      var max = Number(el.getAttribute('data-counter'));
      var out = el.closest('.field') && el.closest('.field').querySelector('.field__counter');
      if (!out) return;
      function upd() { var n = el.value.length; out.textContent = n + ' / ' + max; out.classList.toggle('is-over', n > max); }
      el.addEventListener('input', upd); upd();
    }
  };
  // 输入时自动清除该字段错误
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('.field.is-invalid input, .field.is-invalid textarea, .field.is-invalid select')) UI.form.clearField(t);
  });

  // 图片上传校验与预览：root 内含 .upload（label+input[type=file]）与 .upload-preview-slot
  UI.upload = {
    bind: function (root, opt) {
      opt = opt || {};
      var input = root.querySelector('input[type="file"]');
      var zone = root.querySelector('.upload');
      var slot = root.querySelector('.upload-preview-slot');
      var maxBytes = (opt.maxMB || Number(root.getAttribute('data-max-mb')) || 2) * 1048576;
      var types = (opt.types || root.getAttribute('data-types') || 'image/jpeg,image/png').split(',');
      var typeNames = types.map(function (t) { return t.replace('image/', '').replace('jpeg', 'JPG').toUpperCase(); }).join(' / ');
      root._file = null;
      function fail(msg) { input.value = ''; root._file = null; render(); UI.form.fieldError(input, msg); if (opt.onChange) opt.onChange(null); }
      function accept(file) {
        UI.form.clearField(input);
        if (types.indexOf(file.type) === -1) return fail('仅支持 ' + typeNames + ' 格式的图片');
        if (file.size > maxBytes) return fail('图片不能超过 ' + (maxBytes / 1048576) + ' MB（当前 ' + UI.formatBytes(file.size) + '）');
        root._file = file; render();
        if (opt.onChange) opt.onChange(file);
      }
      function render() {
        if (!slot) return;
        if (!root._file) { slot.innerHTML = ''; if (zone) zone.hidden = false; return; }
        if (root._url) URL.revokeObjectURL(root._url);
        root._url = URL.createObjectURL(root._file);
        slot.innerHTML = '<div class="upload-preview"><img class="upload-preview__img" alt="" src="' + root._url + '"><div class="upload-preview__meta"><div class="upload-preview__name">' + UI.esc(root._file.name) + '</div><div class="upload-preview__size">' + UI.formatBytes(root._file.size) + '</div></div><button type="button" class="icon-btn icon-btn--sm" aria-label="移除图片" data-upload-clear>' + UI.icon('close') + '</button></div>';
        if (zone) zone.hidden = true;
      }
      input.addEventListener('change', function () { if (input.files && input.files[0]) accept(input.files[0]); });
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-upload-clear]')) { UI.upload.clear(root); if (opt.onChange) opt.onChange(null); }
      });
      if (zone) {
        ['dragenter', 'dragover'].forEach(function (n) { zone.addEventListener(n, function (e) { e.preventDefault(); zone.classList.add('is-dragover'); }); });
        ['dragleave', 'drop'].forEach(function (n) { zone.addEventListener(n, function (e) { e.preventDefault(); zone.classList.remove('is-dragover'); }); });
        zone.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) accept(f); });
      }
    },
    get: function (root) { return root._file || null; },
    clear: function (root) {
      var input = root.querySelector('input[type="file"]');
      if (input) input.value = '';
      root._file = null;
      var slot = root.querySelector('.upload-preview-slot'); if (slot) slot.innerHTML = '';
      var zone = root.querySelector('.upload'); if (zone) zone.hidden = false;
      if (input) UI.form.clearField(input);
    }
  };

  // 倒计时（限流提示等）
  UI.countdown = function (seconds, onTick, onDone) {
    var left = Math.max(0, Math.ceil(seconds));
    var t = setInterval(function () {
      left -= 1;
      if (left <= 0) { clearInterval(t); if (onDone) onDone(); } else if (onTick) onTick(left);
    }, 1000);
    if (onTick) onTick(left);
    return function cancel() { clearInterval(t); };
  };
  UI.formatCountdown = function (s) { s = Math.max(0, s); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };

  /* ---------- 10. 菜单 / 标签页 / 折叠 / 图片兜底（全局事件委托） ---------- */
  function closeMenus(except) {
    UI.qsa('[data-menu] .menu__panel:not([hidden])').forEach(function (p) {
      var wrap = p.closest('[data-menu]');
      if (wrap === except) return;
      p.hidden = true;
      var tr = wrap.querySelector('[data-menu-trigger]');
      if (tr) tr.setAttribute('aria-expanded', 'false');
    });
  }
  function openMenu(wrap, focusFirst) {
    closeMenus(wrap);
    var panel = wrap.querySelector('.menu__panel');
    var trigger = wrap.querySelector('[data-menu-trigger]');
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (focusFirst) { var first = panel.querySelector('[role="menuitem"]'); if (first) first.focus(); }
  }
  document.addEventListener('click', function (e) {
    var tr = e.target.closest && e.target.closest('[data-menu-trigger]');
    if (tr) {
      var wrap = tr.closest('[data-menu]');
      var isOpen = tr.getAttribute('aria-expanded') === 'true';
      if (isOpen) closeMenus(); else openMenu(wrap, false);
      return;
    }
    if (e.target.closest && e.target.closest('.menu__panel [role="menuitem"]')) { closeMenus(); return; }
    if (!(e.target.closest && e.target.closest('[data-menu]'))) closeMenus();

    var c = e.target.closest && e.target.closest('.collapse__trigger');
    if (c) {
      var box = c.closest('.collapse');
      var open = !box.classList.contains('is-open');
      box.classList.toggle('is-open', open);
      c.setAttribute('aria-expanded', open ? 'true' : 'false');
      var inner = box.querySelector('.collapse__inner');
      if (inner) { if (open) inner.removeAttribute('inert'); else inner.setAttribute('inert', ''); }
      return;
    }
    var po = e.target.closest && e.target.closest('[data-dialog-open]');
    if (po) { UI.dialog.open(po.getAttribute('data-dialog-open')); return; }
    var pc = e.target.closest && e.target.closest('[data-dialog-close]');
    if (pc) { UI.dialog.close(pc.closest('dialog')); return; }
    var pw = e.target.closest && e.target.closest('[data-password-toggle]');
    if (pw) {
      var inp = pw.closest('.input-group').querySelector('input');
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      pw.setAttribute('aria-pressed', show ? 'true' : 'false');
      pw.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      pw.innerHTML = UI.icon(show ? 'eye-off' : 'eye');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var open = document.querySelector('[data-menu] .menu__panel:not([hidden])');
      if (open) { var tr = open.closest('[data-menu]').querySelector('[data-menu-trigger]'); closeMenus(); if (tr) tr.focus(); e.preventDefault(); return; }
    }
    var t = e.target;
    // 菜单上下键
    var item = t.closest && t.closest('.menu__panel [role="menuitem"]');
    if (item && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      var items = UI.qsa('[role="menuitem"]', item.closest('.menu__panel'));
      var i = items.indexOf(item) + (e.key === 'ArrowDown' ? 1 : -1);
      items[(i + items.length) % items.length].focus();
      e.preventDefault();
    }
    var trg = t.closest && t.closest('[data-menu-trigger]');
    if (trg && (e.key === 'ArrowDown') && trg.getAttribute('aria-expanded') !== 'true') { openMenu(trg.closest('[data-menu]'), true); e.preventDefault(); }
    // 标签页方向键
    var tab = t.closest && t.closest('[role="tab"]');
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End')) {
      var list = tab.closest('[role="tablist"]');
      var tabs = UI.qsa('[role="tab"]:not([disabled])', list);
      var idx = tabs.indexOf(tab);
      if (e.key === 'ArrowRight') idx = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') idx = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') idx = 0; else idx = tabs.length - 1;
      tabs[idx].focus(); tabs[idx].click();
      e.preventDefault();
    }
  });

  // 标签页：UI.tabs(listEl, { onChange(id, tabEl) })；tab 用 aria-controls 指向面板
  UI.tabs = function (list, opt) {
    opt = opt || {};
    var tabs = UI.qsa('[role="tab"]', list);
    function select(tab, silent) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var pid = t.getAttribute('aria-controls');
        var panel = pid && document.getElementById(pid);
        if (panel) panel.hidden = !on;
      });
      if (!silent && opt.onChange) opt.onChange(tab.getAttribute('data-tab') || tab.id, tab);
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { select(t); }); });
    var cur = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
    if (cur) select(cur, true);
    return { select: function (key) { var t = tabs.filter(function (x) { return (x.getAttribute('data-tab') || x.id) === key; })[0]; if (t) select(t); } };
  };

  // 吸顶标签 + 区块联动高亮
  UI.scrollSpy = function (list, sections, opt) {
    opt = opt || {};
    var tabs = UI.qsa('[role="tab"]', list);
    if (!('IntersectionObserver' in window)) return;
    var offset = (opt.offset || 120);
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target._vis = en.isIntersecting; });
      var vis = sections.filter(function (s) { return s._vis; });
      var pick = vis.length ? vis[0] : null;
      if (pick && pick !== current) {
        current = pick;
        tabs.forEach(function (t) {
          var on = t.getAttribute('data-target') === pick.id;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      }
    }, { rootMargin: '-' + offset + 'px 0px -55% 0px', threshold: 0 });
    sections.forEach(function (s) { io.observe(s); });
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        var target = document.getElementById(t.getAttribute('data-target'));
        if (target) target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
      });
    });
    return io;
  };

  // 图片加载失败：给最近的容器加 is-broken 并换成占位
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.fallbackDone) return;
    img.dataset.fallbackDone = '1';
    var holder = img.parentElement;
    if (holder && !holder.classList.contains('avatar')) {
      holder.classList.add('is-broken');
      if (!holder.querySelector('.media-fallback')) {
        var ph = document.createElement('span');
        ph.className = 'media-fallback';
        ph.style.position = 'absolute'; ph.style.inset = '0';
        ph.innerHTML = UI.icon('image-off', 'icon--lg');
        holder.style.position = holder.style.position || 'relative';
        holder.appendChild(ph);
      }
    } else if (holder) {
      holder.textContent = holder.getAttribute('data-initial') || '?';
    }
  }, true);

  /* ---------- 11. 图片查看器（滚轮/双指缩放、拖动、双击） ---------- */
  UI.viewer = {
    open: function (src, caption) {
      var url = UI.safeUrl(src);
      if (!url) return;
      var d = document.createElement('dialog');
      d.className = 'viewer';
      d.setAttribute('aria-label', '图片查看器');
      d.innerHTML = '<div class="viewer__stage"><img class="viewer__img" alt="' + UI.esc(caption || '') + '" src="' + UI.esc(url) + '" draggable="false"></div>' +
        (caption ? '<div class="viewer__caption">' + UI.esc(caption) + '</div>' : '') +
        '<button type="button" class="icon-btn viewer__close" aria-label="关闭">' + UI.icon('close') + '</button>' +
        '<div class="viewer__bar"><button type="button" class="icon-btn" data-z="out" aria-label="缩小">' + UI.icon('minus') + '</button><span class="viewer__zoom" aria-live="polite">100%</span><button type="button" class="icon-btn" data-z="in" aria-label="放大">' + UI.icon('plus') + '</button><button type="button" class="icon-btn" data-z="fit" aria-label="适应屏幕">' + UI.icon('fullscreen') + '</button></div>';
      document.body.appendChild(d);
      var stage = d.querySelector('.viewer__stage'), img = d.querySelector('.viewer__img'), zoomEl = d.querySelector('.viewer__zoom');
      var s = 1, tx = 0, ty = 0, pointers = {}, startDist = 0, startScale = 1, dragging = false, moved = false, last = null;
      function apply() { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')'; zoomEl.textContent = Math.round(s * 100) + '%'; }
      function setScale(ns, cx, cy) {
        ns = Math.min(8, Math.max(0.5, ns));
        var r = stage.getBoundingClientRect();
        var ox = (cx === undefined ? r.left + r.width / 2 : cx) - (r.left + r.width / 2);
        var oy = (cy === undefined ? r.top + r.height / 2 : cy) - (r.top + r.height / 2);
        tx = ox - (ox - tx) * (ns / s); ty = oy - (oy - ty) * (ns / s);
        s = ns;
        if (s <= 1) { tx = 0; ty = 0; }
        apply();
      }
      stage.addEventListener('wheel', function (e) { e.preventDefault(); setScale(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
      stage.addEventListener('pointerdown', function (e) {
        stage.setPointerCapture(e.pointerId);
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        moved = false;
        var ids = Object.keys(pointers);
        if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startScale = s; }
        else { dragging = true; last = { x: e.clientX, y: e.clientY }; stage.classList.add('is-dragging'); }
      });
      stage.addEventListener('pointermove', function (e) {
        if (!pointers[e.pointerId]) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 2) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          setScale(startScale * Math.hypot(a.x - b.x, a.y - b.y) / (startDist || 1), (a.x + b.x) / 2, (a.y + b.y) / 2);
          moved = true;
        } else if (dragging && last) {
          var dx = e.clientX - last.x, dy = e.clientY - last.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
          if (s > 1) { tx += dx; ty += dy; apply(); }
          last = { x: e.clientX, y: e.clientY };
        }
      });
      function endPtr(e) {
        delete pointers[e.pointerId];
        if (Object.keys(pointers).length === 0) { dragging = false; last = null; stage.classList.remove('is-dragging'); }
      }
      stage.addEventListener('pointerup', function (e) {
        endPtr(e);
        if (!moved && e.target === stage && s <= 1) UI.dialog.close(d);
      });
      stage.addEventListener('pointercancel', endPtr);
      img.addEventListener('dblclick', function (e) { if (s > 1) { s = 1; tx = 0; ty = 0; apply(); } else setScale(2.5, e.clientX, e.clientY); });
      d.addEventListener('click', function (e) {
        var z = e.target.closest('[data-z]');
        if (z) { var k = z.getAttribute('data-z'); if (k === 'in') setScale(s * 1.3); else if (k === 'out') setScale(s / 1.3); else { s = 1; tx = 0; ty = 0; apply(); } return; }
        if (e.target.closest('.viewer__close')) UI.dialog.close(d);
      });
      d.addEventListener('keydown', function (e) {
        if (e.key === '+' || e.key === '=') setScale(s * 1.3);
        else if (e.key === '-') setScale(s / 1.3);
        else if (e.key === '0') { s = 1; tx = 0; ty = 0; apply(); }
      });
      d.addEventListener('close', function () { setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 0); });
      UI.dialog.open(d);
      apply();
    }
  };
  // 任何带 data-zoom="图片地址" 的元素点击即放大
  document.addEventListener('click', function (e) {
    var z = e.target.closest && e.target.closest('[data-zoom]');
    if (z) { e.preventDefault(); UI.viewer.open(z.getAttribute('data-zoom'), z.getAttribute('data-caption') || z.getAttribute('alt') || ''); }
  });

  /* ---------- 12. 主题（P2：features.theme 打开后可用） ---------- */
  UI.theme = {
    get: function () { try { return localStorage.getItem('theme') || 'light'; } catch (e) { return 'light'; } },
    apply: function () {
      var m = UI.theme.get();
      var dark = m === 'dark' || (m === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#103A22' : '#085628');
    },
    set: function (m) { try { localStorage.setItem('theme', m); } catch (e) { /* ignore */ } UI.theme.apply(); }
  };

  /* ---------- 13. 页壳：页头 / 抽屉 / 用户菜单 / 横幅 / 页脚 ---------- */
  UI.nav = [
    { key: 'home', href: 'index.html', label: '首页', full: '首页', icon: 'home', onlyDrawer: true },
    { key: 'map', href: 'map.html', label: '地图', full: '校园地图', icon: 'map' },
    { key: 'forum', href: 'forum.html', label: '论坛', full: '论坛', icon: 'message' },
    { key: 'recipe', href: 'recipe.html', label: '菜谱', full: '菜品与食谱', icon: 'utensils' },
    { key: 'shops', href: 'shops.html', label: '必吃榜', full: '三元坊必吃榜', icon: 'store', feature: 'shops' },
    { key: 'announce', href: 'announcements.html', label: '公告', full: '更新公告', icon: 'megaphone' }
  ];
  function navItems() { return UI.nav.filter(function (n) { return !n.feature || UI.config.features[n.feature]; }); }

  function brandMark() { return '<svg class="brand__mark" aria-hidden="true"><use href="' + UI.config.iconsUrl + '#brand-mark"></use></svg>'; }
  function brandHtml(extra) {
    return '<a class="brand" href="index.html" aria-label="' + UI.config.brand + ' 首页">' + brandMark() + '<span class="brand__text"><span class="brand__name">' + UI.config.brand + '</span><span class="brand__sub">SZZX · INFO</span></span></a>' + (extra || '');
  }

  function accountLinks(user) {
    var links = [{ href: 'profile.html', icon: 'user', label: '个人中心' }, { href: 'settings.html', icon: 'settings', label: '设置' }];
    if (UI.session.weight(user) < UI.ROLE_WEIGHTS.student) links.push({ href: 'student_verify.html', icon: 'graduation', label: '学生认证' });
    var hasPerms = user.permissions && user.permissions.length > 0;
    if (UI.session.weight(user) >= UI.ROLE_WEIGHTS.admin || hasPerms) links.push({ href: 'admin.html', icon: 'shield', label: '管理后台' });
    return links;
  }

  function authHtml() {
    var token = UI.session.token(), user = UI.session.user();
    if (!token || !user) {
      return '<a class="btn btn--ghost btn--sm" href="' + UI.config.loginUrl + '">登录</a><a class="btn btn--primary btn--sm" href="register.html">注册</a>';
    }
    var bell = UI.config.features.inbox ? '<a class="icon-btn" href="inbox.html" id="inboxBell" aria-label="消息">' + UI.icon('bell') + '<span class="count-badge" id="inboxCount" hidden></span></a>' : '';
    var items = accountLinks(user).map(function (l) {
      return '<a class="menu__item" role="menuitem" href="' + l.href + '">' + UI.icon(l.icon) + UI.esc(l.label) + '</a>';
    }).join('');
    return bell + '<div class="menu" data-menu><button type="button" class="avatar-btn" data-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="账户菜单">' + UI.avatar(user, 'sm') + '</button>' +
      '<div class="menu__panel" role="menu" hidden><div class="menu__head"><div class="menu__head-name">' + UI.esc(user.nickname || user.username) + '</div><div class="menu__head-sub">' + UI.esc(UI.ROLE_LABELS[user.role] || '') + (user.display_id || user.id ? ' · ID ' + UI.esc(user.display_id || user.id) : '') + '</div></div>' +
      items + '<div class="menu__sep"></div><button type="button" class="menu__item menu__item--danger" role="menuitem" data-logout>' + UI.icon('logout') + '退出登录</button></div></div>';
  }

  function drawerHtml(active) {
    var user = UI.session.user(), token = UI.session.token();
    var nav = navItems().map(function (n) {
      return '<a class="drawer-link" href="' + n.href + '"' + (n.key === active ? ' aria-current="page"' : '') + '>' + UI.icon(n.icon) + UI.esc(n.full) + '</a>';
    }).join('');
    var account = '';
    if (token && user) {
      account = '<div class="drawer-sep"></div>' + accountLinks(user).map(function (l) { return '<a class="drawer-link" href="' + l.href + '">' + UI.icon(l.icon) + UI.esc(l.label) + '</a>'; }).join('') +
        '<button type="button" class="drawer-link" data-logout style="width:100%;color:var(--red)">' + UI.icon('logout') + '退出登录</button>';
    } else {
      account = '<div class="drawer-sep"></div><a class="drawer-link" href="' + UI.config.loginUrl + '">' + UI.icon('login') + '登录</a><a class="drawer-link" href="register.html">' + UI.icon('user') + '注册</a>';
    }
    return '<dialog class="dialog dialog--drawer" id="navDrawer" aria-label="站点导航"><div class="drawer__head">' + brandHtml() +
      '<button type="button" class="icon-btn" data-dialog-close aria-label="关闭菜单">' + UI.icon('close') + '</button></div>' +
      '<nav class="drawer__body" aria-label="主导航">' + nav + account + '</nav><div class="drawer__foot">' + UI.config.brand + ' · AGPL-3.0</div></dialog>';
  }

  function footerHtml() {
    return '<footer class="site-footer"><div class="container container--wide site-footer__inner"><div class="site-footer__brand">' + brandMark() + '<span>' + UI.config.brand + '</span></div>' +
      '<nav class="site-footer__links" aria-label="页脚"><a href="index.html#about">关于我们</a><a href="announcements.html">更新公告</a><a href="settings.html#tickets">提交工单</a></nav>' +
      '<p class="site-footer__note">© ' + new Date().getFullYear() + ' ' + UI.config.brand + ' · 以 AGPL-3.0 协议开源</p></div></footer>';
  }

  UI.shell = {
    mounted: false,
    mount: function () {
      var body = document.body;
      var active = body.getAttribute('data-nav') || '';
      var headerHost = document.getElementById('siteHeader');
      if (!headerHost) {
        headerHost = document.createElement('div'); headerHost.id = 'siteHeader';
        body.insertBefore(headerHost, body.firstChild);
      }
      headerHost.innerHTML = '<header class="site-header"><div class="site-header__inner container container--wide">' +
        '<button type="button" class="icon-btn site-header__menu" data-dialog-open="navDrawer" aria-label="打开菜单">' + UI.icon('menu') + '</button>' +
        brandHtml('<nav class="site-nav" aria-label="主导航">' + navItems().filter(function (n) { return !n.onlyDrawer; }).map(function (n) {
          return '<a class="site-nav__link" href="' + n.href + '"' + (n.key === active ? ' aria-current="page"' : '') + ' title="' + UI.esc(n.full) + '">' + UI.esc(n.label) + '</a>';
        }).join('') + '</nav>') +
        '<div class="site-header__actions" id="authArea">' + authHtml() + '</div></div></header>' + drawerHtml(active);
      var footHost = document.getElementById('siteFooter');
      if (footHost && !footHost.firstChild && body.getAttribute('data-shell') !== 'app') footHost.innerHTML = footerHtml();
      UI.shell.mounted = true;
      UI.shell.refreshAuth();
      UI.shell.loadBanner();
      if (UI.config.features.inbox) UI.inbox.start();
    },
    // 用接口数据刷新头像/菜单（登录态变化后调用；兼容旧页面里的 renderAuth()）
    refreshAuth: function () {
      var area = document.getElementById('authArea');
      if (!area) return Promise.resolve();
      var token = UI.session.token();
      if (!token) { area.innerHTML = authHtml(); return Promise.resolve(); }
      return UI.api(UI.config.api.profile, { on401: false }).then(function (r) {
        if (r.status === 401) { UI.session.clear(); area.innerHTML = authHtml(); rebuildDrawer(); return; }
        if (r.ok && r.data && r.data.user) { UI.session.save(r.data.user); area.innerHTML = authHtml(); rebuildDrawer(); if (UI.config.features.inbox) UI.inbox.render(); }
      });
    },
    loadBanner: function () {
      if (document.querySelector('.site-banner')) return;
      UI.api(UI.config.api.banner, { auth: false }).then(function (r) {
        var text = r.ok && r.data && r.data.banner ? String(r.data.banner) : '';
        if (!text) return;
        var version = r.data.version !== undefined ? String(r.data.version) : '0';
        var user = UI.session.user();
        var key = 'bannerDismissed:' + (user && user.username ? user.username : 'guest');
        try { if (localStorage.getItem(key) === version) return; } catch (e) { /* ignore */ }
        var el = document.createElement('div');
        el.className = 'site-banner'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', '站点公告');
        el.innerHTML = '<div class="container container--wide site-banner__inner">' + UI.icon('megaphone', 'icon--sm') + '<div class="site-banner__text">' + UI.esc(text) + '</div><button type="button" class="icon-btn" aria-label="关闭横幅">' + UI.icon('close', 'icon--sm') + '</button></div>';
        el.querySelector('button').addEventListener('click', function () { try { localStorage.setItem(key, version); } catch (e) { /* ignore */ } el.remove(); });
        var host = document.getElementById('siteBanner');
        if (host) host.appendChild(el); else document.body.insertBefore(el, document.body.firstChild);
      });
    }
  };
  function rebuildDrawer() {
    var d = document.getElementById('navDrawer');
    if (!d || d.open) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = drawerHtml(document.body.getAttribute('data-nav') || '');
    d.parentNode.replaceChild(tmp.firstChild, d);
    wireDrawer();
  }
  function wireDrawer() {
    var d = document.getElementById('navDrawer');
    if (!d || d._wired) return;
    d._wired = true;
    d.addEventListener('click', function (e) { if (e.target === d) UI.dialog.close(d); });
    // 窗口变宽到桌面布局时自动关闭
    window.addEventListener('resize', function () { if (d.open && window.innerWidth >= 768) UI.dialog.close(d); });
  }

  // 退出登录
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-logout]')) {
      UI.session.clear();
      UI.toast('已退出登录', { type: 'success' });
      setTimeout(function () { location.href = 'index.html'; }, 500);
    }
  });

  /* ---------- 14. 消息箱未读数（#9 落地后启用 features.inbox） ---------- */
  UI.inbox = {
    count: 0, timer: null,
    set: function (n) { UI.inbox.count = Math.max(0, Number(n) || 0); UI.inbox.render(); },
    render: function () {
      var b = document.getElementById('inboxCount'), bell = document.getElementById('inboxBell');
      if (!b) return;
      var n = UI.inbox.count;
      b.hidden = n <= 0;
      b.textContent = n > 99 ? '99+' : String(n);
      if (bell) bell.setAttribute('aria-label', n > 0 ? '消息，' + n + ' 条未读' : '消息');
    },
    fetch: function () {
      if (!UI.session.token() || document.hidden) return;
      UI.api(UI.config.api.unreadCount, { on401: false }).then(function (r) { if (r.ok && r.data) UI.inbox.set(r.data.count !== undefined ? r.data.count : r.data.unread); });
    },
    start: function () {
      UI.inbox.fetch();
      clearInterval(UI.inbox.timer);
      UI.inbox.timer = setInterval(UI.inbox.fetch, UI.config.pollMs);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) UI.inbox.fetch(); });
    }
  };

  /* ---------- 15. 离线提示、未保存提醒 ---------- */
  function updateOnline() {
    var bar = document.querySelector('.offline-bar');
    if (!navigator.onLine && !bar) {
      bar = document.createElement('div');
      bar.className = 'offline-bar'; bar.setAttribute('role', 'status');
      bar.textContent = '网络已断开，部分功能暂不可用';
      document.body.insertBefore(bar, document.body.firstChild);
    } else if (navigator.onLine && bar) {
      bar.remove();
      UI.toast('网络已恢复', { type: 'success' });
    }
  }
  window.addEventListener('offline', updateOnline);
  window.addEventListener('online', updateOnline);

  UI.guardUnsaved = function (form) {
    var dirty = false;
    form.addEventListener('input', function (e) { if (e.isTrusted) dirty = true; });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    return { clean: function () { dirty = false; } };
  };

  /* ---------- 16. 旧浏览器提示（无 polyfill，特性检测一次） ---------- */
  (function () {
    var ok = !!window.HTMLDialogElement && !!window.CSS && !!CSS.supports && CSS.supports("color", "var(--x)") && "fetch" in window;
    if (ok) return;
    document.addEventListener("DOMContentLoaded", function () {
      document.body.insertAdjacentHTML("afterbegin",
        '<div class="alert alert--warning" role="alert" style="margin:1rem"><div class="alert__body">你的浏览器版本过旧，部分功能无法使用。建议升级浏览器或换用新版 Edge / Chrome / Safari。</div></div>');
    });
  })();

  /* ---------- 17. 自动初始化 ---------- */
  UI.theme.apply();
  UI.ready(function () {
    UI.qsa('[data-counter]').forEach(UI.form.counter);
    UI.qsa('[data-upload]').forEach(function (r) { UI.upload.bind(r); });
    UI.qsa('.collapse:not(.is-open) .collapse__inner').forEach(function (i) { i.setAttribute('inert', ''); });
    if (document.getElementById('siteHeader') || document.body.hasAttribute('data-nav')) {
      UI.shell.mount();
      wireDrawer();
    }
    updateOnline();
  });
  // 兼容旧页面脚本里的 renderAuth()
  window.renderAuth = function () { return UI.shell.refreshAuth(); };
})();


