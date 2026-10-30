import { useNavigate } from '@tanstack/react-router';

import { useDisplayedLocation } from './navigation';

/** Keep tabs shareable through the URL, including navigation within the same page. */
export function usePanel(allowed: string[], fallback: string) {
  const hash = useDisplayedLocation().hash;
  const navigate = useNavigate();
  return [
    allowed.includes(hash) ? hash : fallback,
    (next: string) => {
      if (allowed.includes(next))
        void navigate({ hash: next, search: true, replace: true, resetScroll: false });
    },
  ] as const;
}
