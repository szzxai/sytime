import './pages/AdminPage.css';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { Suspense, useEffect } from 'react';
import { NavigationScope } from './components/SiteLink';
import { installNavigation, preloadPage, useDisplayedLocation } from './lib/navigation';
import { createRoot } from 'react-dom/client';
import '../public/css/map.css';
import '../public/css/site.css';
import '../public/vendor/leaflet/leaflet.css';
import './app.css';
import { Shell } from './components/Shell';
import { Loading, ToastProvider } from './components/ui';
import { queryClient } from './lib/api';
import { SessionProvider } from './lib/session';
const pages = {
  home: lazyRouteComponent(() => import('./pages/HomePage'), 'HomePage'),
  about: lazyRouteComponent(() => import('./pages/AboutPage'), 'AboutPage'),
  map: lazyRouteComponent(() => import('./pages/MapPage'), 'MapPage'),
  recipe: lazyRouteComponent(() => import('./pages/RecipePage'), 'RecipePage'),
  dish: lazyRouteComponent(() => import('./pages/DishPage'), 'DishPage'),
  shops: lazyRouteComponent(() => import('./pages/ShopsPage'), 'ShopsPage'),
  shop: lazyRouteComponent(() => import('./pages/ShopPage'), 'ShopPage'),
  'shop-new': lazyRouteComponent(() => import('./pages/ShopNewPage'), 'ShopNewPage'),
  announcements: lazyRouteComponent(() => import('./pages/AnnouncementsPage'), 'AnnouncementsPage'),
  inbox: lazyRouteComponent(() => import('./pages/InboxPage'), 'InboxPage'),
  profile: lazyRouteComponent(() => import('./pages/ProfilePage'), 'ProfilePage'),
  user: lazyRouteComponent(() => import('./pages/ProfilePage'), 'UserPage'),
  settings: lazyRouteComponent(() => import('./pages/SettingsPage'), 'SettingsPage'),
  admin: lazyRouteComponent(() => import('./pages/AdminPage'), 'AdminPage'),
  login: lazyRouteComponent(() => import('./pages/AuthPages'), 'LoginPage'),
  register: lazyRouteComponent(() => import('./pages/AuthPages'), 'RegisterPage'),
  student_verify: lazyRouteComponent(() => import('./pages/AuthPages'), 'StudentVerifyPage'),
  '404': lazyRouteComponent(() => import('./pages/NotFoundPage'), 'NotFoundPage'),
};
function Layout() {
  const loc = useDisplayedLocation();
  useEffect(() => {
    const names: Record<string, string> = {
      map: '校园地图',
      recipe: '菜品与食谱',
      dish: '菜品详情',
      shops: '三元坊必吃榜',
      shop: '店铺详情',
      'shop-new': '添加店铺',
      announcements: '更新公告',
      inbox: '消息箱',
      profile: '个人中心',
      user: '用户主页',
      settings: '设置',
      admin: '管理后台',
      login: '登录',
      register: '注册',
      student_verify: '学生认证',
      about: '关于我们',
    };
    const name = loc.pathname.slice(1).replace('.html', '');
    document.title = names[name] ? `${names[name]} · 拾光酥糕` : '拾光酥糕 · 苏州中学校园信息平台';
  }, [loc.pathname]);
  return (
    <Shell>
      <Suspense
        fallback={
          <main id="main" className="main container">
            <Loading />
          </main>
        }
      >
        <NavigationScope value="internal">
          <Outlet />
        </NavigationScope>
      </Suspense>
    </Shell>
  );
}
const root = createRootRoute({ component: Layout, notFoundComponent: pages['404'] });
const routes = [
  createRoute({ getParentRoute: () => root, path: '/', component: pages.home }),
  ...Object.entries(pages).map(([name, component]) =>
    createRoute({
      getParentRoute: () => root,
      path: `/${name === 'home' ? 'index' : name}.html`,
      component,
      loaderDeps: ({ search }) => search,
      loader: ({ deps }) => preloadPage(name, deps),
      remountDeps: ({ search }) => search.id,
      validateSearch: (search: Record<string, unknown>) => search,
    }),
  ),
];
const router = createRouter({
  routeTree: root.addChildren(routes),
  defaultPreload: 'intent',
  defaultPendingMs: Infinity,
  defaultPendingMinMs: 0,
  defaultPendingComponent: () => (
    <main id="main" className="main container">
      <Loading />
    </main>
  ),
  scrollRestorationBehavior: 'instant',
  parseSearch: (value) => Object.fromEntries(new URLSearchParams(value)),
  stringifySearch: (value) => {
    const params = new URLSearchParams();
    for (const [key, item] of Object.entries(value))
      if (item !== undefined && item !== null) params.set(key, String(item));
    return params.size ? `?${params}` : '';
  },
  scrollRestoration: true,
});
installNavigation(router);
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </SessionProvider>
  </QueryClientProvider>,
);
