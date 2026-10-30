import { useNavigate } from '@tanstack/react-router';

import { useDisplayedLocation } from './navigation';

/** Let the router own URL state so filters also work with back/forward navigation. */
export function useUrlSearch() {
  const search = useDisplayedLocation().search as Record<string, string>;
  const navigate = useNavigate();
  return [
    search,
    (patch: Record<string, string | undefined>) => {
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
        resetScroll: false,
      });
    },
  ] as const;
}
