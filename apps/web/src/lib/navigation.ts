import { useRouterState, type AnyRouter, type ParsedLocation } from '@tanstack/react-router';
import type { User } from '@sytime/shared';
import { endpoint, queryClient } from './api';

/** Keep the displayed page tied to its committed URL while another route loads. */
export function useDisplayedLocation() {
  return useRouterState({
    select: (state) => {
      const match = state.matches.at(-1);
      const pending =
        match &&
        (match.pathname !== state.location.pathname ||
          JSON.stringify(match.search) !== JSON.stringify(state.location.search));
      return pending ? state.resolvedLocation || state.location : state.location;
    },
  });
}

export type Direction = 'forward' | 'back';
export type Scope = 'section' | 'internal';
export type Navigation = {
  direction: Direction;
  section: number;
  returnTo?: string;
  returnIndex?: number;
};
declare module '@tanstack/react-router' {
  interface HistoryState {
    siteNavigation?: Navigation;
    sitePanelTransition?: boolean;
  }
}
const sections = ['index', 'map', 'recipe', 'shops', 'announcements'];
const parents: Record<string, string> = { dish: 'recipe', shop: 'shops', 'shop-new': 'shops' };
export function pageName(path: string) {
  return path.slice(1).replace('.html', '') || 'index';
}
export function sectionOf(path: string, fallback = 0) {
  const name = pageName(path);
  const index = sections.indexOf(parents[name] || name);
  return index < 0 ? fallback : index;
}
export function navigationFor(
  from: ParsedLocation,
  target: URL,
  scope: Scope,
  back: boolean,
): Navigation {
  const section = sectionOf(
    target.pathname,
    sectionOf(from.pathname, from.state.siteNavigation?.section),
  );
  const fromSection = sectionOf(from.pathname, from.state.siteNavigation?.section);
  const fromName = pageName(from.pathname),
    toName = pageName(target.pathname);
  let direction: Direction = section < fromSection ? 'back' : 'forward';
  if (scope === 'internal') {
    if (back || parents[fromName] === toName) direction = 'back';
    else if (parents[toName] === fromName) direction = 'forward';
  }
  return {
    direction,
    section,
    ...(scope === 'internal' && direction === 'forward' && parents[toName] === fromName
      ? { returnTo: from.href, returnIndex: from.state.__TSR_index }
      : {}),
  };
}

/** Router lifecycle handles history navigation as well as links, after navigation guards. */
export function installNavigation(router: AnyRouter) {
  router.subscribe('onBeforeLoad', ({ fromLocation: from, toLocation: to, pathChanged }) => {
    // Cold visits need a placeholder; subsequent navigation retains the committed page.
    router.options.defaultPendingMs = from ? Infinity : 0;
    const reverse = from && to.state.__TSR_index < from.state.__TSR_index;
    const edge = reverse ? from.state.siteNavigation : to.state.siteNavigation;
    const direction = edge
      ? reverse
        ? edge.direction === 'forward'
          ? 'back'
          : 'forward'
        : edge.direction
      : from && sectionOf(to.pathname) < sectionOf(from.pathname)
        ? 'back'
        : 'forward';
    document.documentElement.dataset.pageDirection = direction;
    const panelChanged =
      !pathChanged &&
      from?.hash !== to.hash &&
      innerWidth < 900 &&
      (to.state.sitePanelTransition || from?.state.sitePanelTransition);
    router.shouldViewTransition =
      !!from &&
      !!(pathChanged || panelChanged) &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  router.subscribe('onBeforeRouteMount', ({ toLocation }) => {
    const name = pageName(toLocation.pathname);
    document.body.dataset.page = name === 'index' ? 'home' : name;
    document.body.dataset.shell = name === 'map' ? 'app' : '';
  });
}

export function savedUser() {
  const cached = queryClient.getQueryData<{ user: User }>(endpoint('/api/user/profile').queryKey);
  if (cached) return cached.user;
  try {
    return JSON.parse(localStorage.getItem('user') || 'null') as User | null;
  } catch {
    return null;
  }
}
export function recipeView(search: Record<string, unknown>) {
  const view =
    search.view ||
    savedUser()?.recipe_default_view ||
    localStorage.getItem('recipeDefaultView') ||
    'daily';
  return ['all', 'reviews', 'weekly', 'daily'].includes(String(view)) ? String(view) : 'daily';
}
export function shopFilters(search: Record<string, string>, user: User | null) {
  return {
    ...search,
    type: search.type ?? user?.shop_default_type ?? '',
    sort: search.sort || user?.shop_default_sort || 'campus',
  };
}
export function shopsPath(filters: Record<string, string>) {
  return `/api/shops?${new URLSearchParams(Object.entries(filters).filter(([key, value]) => !!value && key !== 'page'))}`;
}
/** Intent preloading and actual navigation share the same query cache and request. */
export async function preloadPage(name: string, search: Record<string, unknown>) {
  const requests: [string, boolean][] = [];
  if (name === 'recipe') {
    const view = recipeView(search);
    requests.push([
      view === 'all'
        ? '/api/menu' +
          (search.source_id
            ? '?source_id=' + encodeURIComponent(String(search.source_id))
            : '?all=1')
        : view === 'reviews'
          ? '/api/recipes'
          : '/api/menu' +
            (search.source_id ? '?source_id=' + encodeURIComponent(String(search.source_id)) : ''),
      false,
    ]);
  } else if (name === 'dish' && /^[1-9]\d*$/.test(String(search.id))) {
    requests.push([`/api/dishes/${search.id}`, false]);
  } else if (name === 'shops') {
    requests.push(
      [shopsPath(shopFilters(search as Record<string, string>, savedUser())), true],
      ['/api/shops/meta', true],
    );
  } else if (name === 'shop' && search.id) {
    requests.push([`/api/shops/${search.id}`, true], ['/api/shops/meta', true]);
  } else if (name === 'announcements') requests.push(['/api/announcements', false]);
  // Query errors remain available to each page's existing retry and error UI.
  await Promise.all(
    requests.map(([path, auth]) => queryClient.prefetchQuery(endpoint(path, auth))),
  );
}
