import { useEffect } from 'react';
import { useUrlSearch } from './useUrlSearch';
/** Focus a linked review even if it is outside the first pagination page. */
export function useReviewTarget(ready: boolean) {
  const [search] = useUrlSearch();
  const raw = search.review;
  const id =
    raw && /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
  useEffect(() => {
    if (!ready || !id) return;
    const element = document.getElementById(`review-${id}`);
    if (!element) return;
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    element.focus({ preventScroll: true });
  }, [ready, id]);
  return id;
}
