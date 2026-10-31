import { SiteLink } from './SiteLink';
import { atLeast, roleLabels } from '@sytime/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { endpoint } from '../lib/api';
import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';
import { Avatar, Icon, useToast } from './ui';
const nav = [
  { key: 'home', href: 'index.html', label: '首页', icon: 'home' },
  { key: 'map', href: 'map.html', label: '地图', icon: 'map' },
  { key: 'recipe', href: 'recipe.html', label: '菜谱', icon: 'utensils' },
  { key: 'shops', href: 'shops.html', label: '必吃榜', icon: 'store' },
  { key: 'announce', href: 'announcements.html', label: '更新公告', icon: 'megaphone' },
];
function NetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const toast = useToast();
  useEffect(() => {
    const offline = () => setOnline(false);
    const expired = () => toast('登录已过期，请重新登录', 'warning');
    const recovered = () => {
      setOnline(true);
      toast('网络已恢复');
    };
    window.addEventListener('sytime:session-expired', expired);
    window.addEventListener('offline', offline);
    window.addEventListener('online', recovered);
    return () => {
      window.removeEventListener('sytime:session-expired', expired);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', recovered);
    };
  }, [toast]);
  return online ? null : (
    <div className="offline-bar" role="status">
      网络已断开，部分功能暂不可用
    </div>
  );
}
function Brand() {
  return (
    <SiteLink className="brand" href="/index.html" aria-label="拾光酥糕 首页">
      <img
        className="brand__mark"
        src="/img/brand-lime.svg?v=20261019"
        alt=""
        width="40"
        height="40"
      />
    </SiteLink>
  );
}
export function ThemeControls() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="theme-switch" role="group" aria-label="外观主题">
      {(
        [
          { value: 'auto', label: '跟随系统', icon: 'monitor' },
          { value: 'light', label: '浅色', icon: 'sun' },
          { value: 'dark', label: '深色', icon: 'moon' },
        ] as const
      ).map((t) => (
        <button
          key={t.value}
          type="button"
          data-theme-choice={t.value}
          aria-label={t.label}
          aria-pressed={theme === t.value}
          title={t.label}
          onClick={() => setTheme(t.value)}
        >
          <Icon name={t.icon} />
        </button>
      ))}
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const { user, token, logout } = useSession();
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const drawerButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const loading = useRouterState({ select: (state) => state.isLoading });
  const pathname = useRouterState({
    select: (state) => state.matches.at(-1)?.pathname || state.location.pathname,
  });
  const active = pathname.includes('shop')
    ? 'shops'
    : pathname.includes('recipe') || pathname.includes('dish')
      ? 'recipe'
      : pathname.includes('announcements')
        ? 'announce'
        : pathname.includes('map')
          ? 'map'
          : 'home';
  const banner = useQuery(
    endpoint<{ banner: string; version: string | number }>('/api/settings/banner', false),
  );
  const unread = useQuery({
    ...endpoint<{ count: number }>('/api/messages/unread-count'),
    enabled: !!token,
    refetchInterval: 60_000,
  });
  const bannerKey = `bannerDismissed:${user?.username || 'guest'}`;
  const version = String(banner.data?.version ?? '0');
  const [dismissed, setDismissed] = useState('');
  const [, setTheme] = useTheme();
  const dark = document.documentElement.dataset.theme === 'dark';
  const account = [
    { href: 'profile.html', icon: 'user', label: '个人中心' },
    { href: 'settings.html', icon: 'settings', label: '设置' },
    ...(!atLeast(user?.role, 'student')
      ? [{ href: 'student_verify.html', icon: 'graduation', label: '学生认证' }]
      : []),
    ...(atLeast(user?.role, 'admin')
      ? [{ href: 'admin.html', icon: 'shield', label: '管理后台' }]
      : []),
  ];
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  useEffect(() => {
    document.body.dataset.nav = active;
    document.body.dataset.shell = pathname === '/map.html' ? 'app' : '';
    document.body.dataset.page =
      pathname === '/' || pathname === '/index.html'
        ? 'home'
        : pathname.slice(1).replace('.html', '');
    const header = document.getElementById('siteHeader')!;
    const bannerEl = document.getElementById('siteBanner')!;
    const observer = new ResizeObserver(() => {
      const top = `${header.offsetHeight + bannerEl.offsetHeight}px`;
      document.documentElement.style.setProperty('--landing-top', top);
    });
    observer.observe(header);
    observer.observe(bannerEl);
    return () => observer.disconnect();
  }, [active, pathname]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 993px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setDrawer(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    setMenu(false);
    const header = document.getElementById('siteHeader')!;
    const panel = drawerRef.current!;
    const button = drawerButtonRef.current;
    const updateTop = () =>
      header.style.setProperty('--mobile-nav-top', header.getBoundingClientRect().bottom + 'px');
    updateTop();
    const observer = new ResizeObserver(updateTop);
    observer.observe(header);
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const background = Array.from(document.getElementById('root')!.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== header,
    );
    const previousInert = background.map((el) => el.inert);
    background.forEach((el) => {
      el.inert = true;
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawer(false);
        button?.focus({ preventScroll: true });
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        header.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ).filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden], [inert]'));
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', keydown);
      document.documentElement.style.overflow = overflow;
      background.forEach((el, i) => {
        el.inert = previousInert[i]!;
      });
      if (panel.contains(document.activeElement)) button?.focus({ preventScroll: true });
    };
  }, [drawer]);
  function closeForNavigation(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    // Commit the closed state before Router captures its stationary-header snapshot.
    // Ordinary toggle/Escape closes keep their exit animation.
    flushSync(() => setDrawer(false));
    for (const element of [drawerRef.current, drawerButtonRef.current]) {
      element?.getAnimations({ subtree: true }).forEach((animation) => animation.finish());
    }
  }
  function signOut() {
    logout();
    setMenu(false);
    setDrawer(false);
    location.href = '/index.html';
  }
  useEffect(() => {
    setMenu(false);
    setDrawer(false);
  }, [pathname]);
  return (
    <>
      <NetworkStatus />
      {loading && <div className="navigation-progress" role="status" aria-label="正在加载页面" />}
      <SiteLink className="skip-link" href="#main">
        跳到正文
      </SiteLink>
      <div id="siteBanner">
        {banner.data?.banner &&
          localStorage.getItem(bannerKey) !== version &&
          dismissed !== `${bannerKey}:${version}` && (
            <div className="site-banner" role="region" aria-label="站点公告">
              <div className="container container--wide site-banner__inner">
                <Icon name="megaphone" className="icon--sm" />
                <div className="site-banner__text">{banner.data.banner}</div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="关闭横幅"
                  onClick={() => {
                    localStorage.setItem(bannerKey, version);
                    setDismissed(`${bannerKey}:${version}`);
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>
          )}
      </div>
      <div id="siteHeader">
        <header className="site-header">
          <div className="site-header__inner container container--wide">
            <Brand />
            <nav className="site-nav" aria-label="主导航">
              {nav.slice(1).map((n) => (
                <SiteLink
                  className="site-nav__link"
                  key={n.key}
                  href={`/${n.href}`}
                  aria-current={active === n.key ? 'page' : undefined}
                >
                  {n.label}
                </SiteLink>
              ))}
            </nav>
            <button
              type="button"
              className="icon-btn site-header__menu"
              ref={drawerButtonRef}
              aria-label={drawer ? '关闭菜单' : '打开菜单'}
              aria-expanded={drawer}
              aria-controls="navDrawer"
              onClick={() => setDrawer(!drawer)}
            >
              <span className="menu-glyph" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
            <div className="site-header__tools">
              <button
                type="button"
                className="icon-btn theme-toggle"
                data-theme-toggle
                aria-label={dark ? '切换至浅色主题' : '切换至深色主题'}
                title="切换明暗主题"
                onClick={() => setTheme(dark ? 'light' : 'dark')}
              >
                <Icon name={dark ? 'moon' : 'sun'} />
              </button>
              <div className="site-header__actions" id="authArea">
                {token && user ? (
                  <>
                    <SiteLink
                      className="icon-btn"
                      href="/inbox.html"
                      id="inboxBell"
                      aria-label="消息"
                    >
                      <Icon name="bell" />
                      <span className="count-badge" id="inboxCount" hidden={!unread.data?.count}>
                        {(unread.data?.count || 0) > 99 ? '99+' : unread.data?.count}
                      </span>
                    </SiteLink>
                    <div
                      className="menu"
                      data-menu
                      ref={menuRef}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setMenu(false);
                          menuRef.current?.querySelector('button')?.focus();
                        }
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault();
                          setMenu(true);
                          const items = Array.from(
                            menuRef.current!.querySelectorAll<HTMLElement>('[role="menuitem"]'),
                          );
                          const i = items.indexOf(document.activeElement as HTMLElement);
                          items[
                            (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                          ]?.focus();
                        }
                      }}
                    >
                      <button
                        className="avatar-btn"
                        type="button"
                        data-menu-trigger
                        aria-haspopup="menu"
                        aria-expanded={menu}
                        aria-label="账户菜单"
                        onClick={() => setMenu(!menu)}
                      >
                        <Avatar user={user} />
                      </button>
                      <div className="menu__panel" role="menu" hidden={!menu}>
                        <div className="menu__head">
                          <div className="menu__head-name">{user.nickname || user.username}</div>
                          <div className="menu__head-sub">
                            {roleLabels[user.role]} · ID {user.display_id || user.id}
                          </div>
                        </div>
                        {account.map((a) => (
                          <SiteLink
                            key={a.href}
                            className="menu__item"
                            role="menuitem"
                            href={`/${a.href}`}
                            onClick={() => setMenu(false)}
                          >
                            <Icon name={a.icon} />
                            {a.label}
                          </SiteLink>
                        ))}
                        <div className="menu__sep" />
                        <button
                          type="button"
                          className="menu__item menu__item--danger"
                          role="menuitem"
                          data-logout
                          onClick={signOut}
                        >
                          <Icon name="logout" />
                          退出登录
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <SiteLink className="btn btn--primary btn--sm header-login" href="/login.html">
                    登录
                    <Icon name="arrow-right" />
                  </SiteLink>
                )}
              </div>
            </div>
          </div>
        </header>
        <div
          id="navDrawer"
          ref={drawerRef}
          className="mobile-nav"
          data-open={drawer}
          aria-hidden={!drawer}
          inert={!drawer}
        >
          <nav className="mobile-nav__body" aria-label="移动端主导航">
            {nav.map((n, i) => (
              <SiteLink
                key={n.key}
                className="drawer-link mobile-nav__link"
                style={{ '--nav-order': i } as CSSProperties}
                href={'/' + n.href}
                aria-current={active === n.key ? 'page' : undefined}
                onClick={closeForNavigation}
              >
                {n.label}
              </SiteLink>
            ))}
            <div
              className="mobile-nav__account"
              style={{ '--nav-order': nav.length } as CSSProperties}
            >
              {(user
                ? [...account, { href: 'inbox.html', icon: 'bell', label: '消息箱' }]
                : [
                    { href: 'login.html', icon: 'login', label: '登录' },
                    { href: 'register.html', icon: 'user', label: '注册' },
                  ]
              ).map((n) => (
                <SiteLink
                  key={n.href}
                  className="mobile-nav__account-link"
                  href={'/' + n.href}
                  onClick={closeForNavigation}
                >
                  <Icon name={n.icon} />
                  {n.label}
                </SiteLink>
              ))}
              {token && (
                <button type="button" className="mobile-nav__account-link" onClick={signOut}>
                  <Icon name="logout" />
                  退出登录
                </button>
              )}
            </div>
          </nav>
        </div>
      </div>
      {children}
      <div id="siteFooter" hidden={pathname === '/map.html'}>
        <footer className="site-footer">
          <div className="site-footer__inner">
            <div className="site-footer__top">
              <div className="site-footer__identity">
                <Brand />
                <p>
                  本站系学生自主运营的校园资讯聚合平台，与江苏省苏州中学官方无隶属关系。“苏州中学”名称、校徽及相关标识的知识产权均归原权利主体所有。所载信息仅供参考，不代表校方立场，权威资讯及具体事宜请以学校官方发布渠道为准。如有疑问或勘误，请致信{' '}
                  <SiteLink href="mailto:baimoqilin@gmail.com">baimoqilin@gmail.com</SiteLink>
                  ，我们将于核实后及时妥善处理。
                </p>
                <SiteLink className="footer-project" href="/about.html">
                  <Icon name="graduation" />
                  校园里的事，在这里相遇
                </SiteLink>
              </div>
              <nav className="site-footer__columns" aria-label="页脚">
                <div>
                  <h2>交流与反馈</h2>
                  <SiteLink href="/settings.html#tickets">提交工单</SiteLink>
                  <SiteLink href="/announcements.html">更新公告</SiteLink>
                </div>
                <div>
                  <h2>校园生活</h2>
                  <SiteLink href="/map.html">校园地图</SiteLink>
                  <SiteLink href="/recipe.html">食堂菜谱</SiteLink>
                  <SiteLink href="/shops.html">三元坊必吃榜</SiteLink>
                  <SiteLink href="/inbox.html">消息箱</SiteLink>
                </div>
                <div>
                  <h2>关于我们</h2>
                  <SiteLink href="/about.html">拾光酥糕</SiteLink>
                  <SiteLink href="/profile.html">个人中心</SiteLink>
                  <SiteLink href="/student_verify.html">学生认证</SiteLink>
                  <SiteLink href="/settings.html">网站设置</SiteLink>
                </div>
              </nav>
            </div>
            <div className="site-footer__bottom">
              <p>© 2026 苏州中学软件开发社人工智能部</p>
              <ThemeControls />
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
