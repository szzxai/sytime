import { atLeast } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Confirm, Empty, ErrorState, Icon, Loading, PageHead, useToast } from '../components/ui';
import { api, endpoint, queryClient } from '../lib/api';
import { useSession } from '../lib/session';
import { useDisplayedLocation } from '../lib/navigation';
type Announcement = { id: number; title: string; content: string; publish_date: string };
export function AnnouncementsPage() {
  const { user } = useSession();
  const toast = useToast();
  const query = useQuery(endpoint<{ announcements: Announcement[] }>('/api/announcements', false));
  const selected = useDisplayedLocation().hash;
  const navigate = useNavigate();
  const setSelected = (hash: string) => {
    void navigate({
      hash,
      search: true,
      resetScroll: false,
      state: (previous) => ({
        ...previous,
        sitePanelTransition: innerWidth < 900 && !!hash !== !!selected,
        siteNavigation: { direction: hash ? 'forward' : 'back', section: 4 },
      }),
    });
  };
  const [confirm, setConfirm] = useState(false);
  const canManage = atLeast(user?.role, 'admin');
  const rows = query.data?.announcements || [];
  const a =
    rows.find((x) => String(x.id) === selected) ||
    (!selected && innerWidth >= 900 ? rows[0] : undefined);
  const mutation = useMutation({
    mutationFn: () => api(`/api/admin/announcements/${a!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('已删除');
      setSelected('');
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <main id="main" className="main container">
      <PageHead title="更新公告" eyebrow="校园里的新消息" />
      <div id="annRoot" className={rows.length ? `master-detail${a ? ' is-detail' : ''}` : ''}>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : !rows.length ? (
          <Empty title="暂无公告" description="有新动态时会第一时间发布在这里。" icon="megaphone" />
        ) : (
          <>
            <div className="master-list" id="annList" aria-label="公告列表">
              {rows.map((row, i) => (
                <button
                  type="button"
                  className="master-item"
                  key={row.id}
                  data-id={row.id}
                  aria-current={a?.id === row.id}
                  onClick={() => {
                    setSelected(String(row.id));
                  }}
                >
                  <span className="master-item__date">
                    {row.publish_date}
                    {i === 0 && <span className="tag tag--primary">最新</span>}
                  </span>
                  <span className="master-item__title">{row.title}</span>
                </button>
              ))}
            </div>
            <article className="detail-pane" id="annDetail">
              {a && (
                <>
                  <button
                    type="button"
                    className="back-link u-hide-desktop"
                    id="annBack"
                    onClick={() => {
                      setSelected('');
                    }}
                  >
                    <Icon name="arrow-left" className="icon--sm" />
                    返回公告列表
                  </button>
                  <h2 className="detail-pane__title">{a.title}</h2>
                  <div className="detail-pane__meta">
                    <Icon name="calendar" className="icon--sm" />
                    发布于 {a.publish_date}
                  </div>
                  <div className="prose">{a.content}</div>
                  {canManage && (
                    <div className="row row--sm u-mt-4">
                      <button
                        type="button"
                        className="btn btn--danger-quiet btn--sm"
                        id="annDelete"
                        onClick={() => setConfirm(true)}
                      >
                        <Icon name="trash" />
                        删除公告
                      </button>
                    </div>
                  )}
                </>
              )}
            </article>
          </>
        )}
      </div>
      {confirm && (
        <Confirm
          title="删除这条公告？"
          message="删除后无法恢复，所有用户将不再看到这条公告。"
          onClose={() => setConfirm(false)}
          onConfirm={() => mutation.mutate()}
        />
      )}
    </main>
  );
}
