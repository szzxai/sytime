import { useNavigate, useRouterState } from '@tanstack/react-router';

import { useDisplayedLocation } from './navigation';

/** Let the router own URL state so filters also work with back/forward navigation. */
export function useUrlSearch(options?: { pendingSearch?: boolean }) {
  const displayed = useDisplayedLocation();
  const pending = useRouterState({
    select: (state) =>
      state.location.pathname === displayed.pathname ? state.location.search : displayed.search,
  });
  const search = (options?.pendingSearch ? pending : displayed.search) as Record<string, string>;
  const navigate = useNavigate();
  return [
    search,
    (patch: Record<string, string | undefined>, navigation?: { replace?: boolean }) => {
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, ...patch }),
        replace: navigation?.replace ?? true,
        resetScroll: false,
      });
    },
  ] as const;
}
