import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { endpoint } from '../lib/api';
import { useSession } from '../lib/session';
import { useAccordion } from '../components/Accordion';
import { HomeContent } from './HomeContent';
export function HomePage() {
  const { token } = useSession();
  const profile = useQuery({
    ...endpoint<{ user: { default_page: string } }>('/api/user/profile'),
    enabled: !!token,
  });
  useEffect(() => {
    if (location.pathname !== '/' || location.hash || (token && !profile.isFetched)) return;
    const page = profile.data?.user.default_page || localStorage.getItem('defaultPage');
    if (['map.html', 'recipe.html', 'announcements.html'].includes(page || ''))
      location.replace(`/${page}`);
  }, [token, profile.isFetched, profile.data]);
  const root = useRef<HTMLDivElement>(null);
  useAccordion(root);
  return (
    <div ref={root} style={{ display: 'contents' }}>
      <HomeContent />
    </div>
  );
}
