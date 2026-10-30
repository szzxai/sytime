import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Empty, ErrorState, Icon, Loading, PageHead, Tabs, useToast } from '../components/ui';
import { api, formatTime, queryClient } from '../lib/api';
import { RequireLogin, useSession } from '../lib/session';
import { useUrlSearch } from '../lib/useUrlSearch';
type Message = {
  id: number;
  type: string;
  title: string;
  body: string;
  created_at: number;
  read: boolean;
  important: boolean;
  target?: { url?: string };
};
export function InboxPage() {
  return (
    <RequireLogin>
      <InboxContent />
    </RequireLogin>
  );
}
function InboxContent() {
  const { token } = useSession();
  const toast = useToast();
  const [params, updateSearch] = useUrlSearch();
  const filter = params.type === 'system' ? 'system' : 'all';
  const unread = params.unread === '1';
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const query = useInfiniteQuery({
    queryKey: ['/api/messages', filter, unread, token],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) =>
      api<{ messages: Message[]; has_more: boolean; counts: { all: number; system: number } }>(
        `/api/messages?page_size=20${filter === 'system' ? '&type=system' : ''}${unread ? '&unread=1' : ''}${pageParam ? `&before=${pageParam}` : ''}`,
        { signal },
      ),
    getNextPageParam: (last) => (last.has_more ? last.messages.at(-1)?.id : undefined),
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith('/api/messages'),
    });
  const mutation = useMutation({
    mutationFn: (id: number | null) =>
      api(id === null ? '/api/messages/read-all' : `/api/messages/${id}/read`, { method: 'PUT' }),
    onSuccess: refresh,
    onError: (e) => toast(e.message, 'error'),
  });
  function update(type: string, only: boolean) {
    updateSearch({ type: type === 'system' ? type : undefined, unread: only ? '1' : undefined });
  }
  const rows = query.data?.pages.flatMap((p) => p.messages) || [];
  const groups = new Map<string, Message[]>();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(Date.now());
  const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
    Date.now() - 86400000,
  );
  rows.forEach((m) => {
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
      m.created_at * 1000,
    );
    const day = date === today ? '今天' : date === yesterday ? '昨天' : '更早';
    groups.set(day, [...(groups.get(day) || []), m]);
  });
  return (
    <main id="main" className="main container">
      <PageHead title="消息箱" eyebrow="不错过校园新动态">
        <button
          type="button"
          className="btn btn--sm"
          id="readAllBtn"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(null)}
        >
          <Icon name="check" />
          全部标为已读
        </button>
      </PageHead>
      <div className="row row--between u-mb-6">
        <Tabs
          value={filter}
          items={[
            {
              value: 'all',
              label: (
                <>
                  全部
                  <span
                    className="tab__count"
                    id="cntAll"
                    hidden={!query.data?.pages[0].counts.all}
                  >
                    {query.data?.pages[0].counts.all || 0}
                  </span>
                </>
              ),
            },
            { value: 'system', label: '系统通知' },
          ]}
          onChange={(v) => update(v, unread)}
          className="tabs"
        />
        <label className="switch-row">
          <span>仅看未读</span>
          <input
            type="checkbox"
            className="switch"
            id="unreadOnly"
            checked={unread}
            onChange={(e) => update(filter, e.target.checked)}
          />
        </label>
      </div>
      <div id="inboxList">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : !rows.length ? (
          <Empty
            icon="inbox"
            title={unread ? '暂无未读消息' : '暂无消息'}
            description="有新的互动或通知时会出现在这里。"
          />
        ) : (
          [...groups].map(([day, messages]) => (
            <section className="msg-group" key={day}>
              <h2 className="msg-group__title">{day}</h2>
              <ul className="msg-list">
                {messages.map((m) => (
                  <li
                    className={`msg${m.read ? '' : ' is-unread'}`}
                    data-id={m.id}
                    data-url={m.target?.url || ''}
                    data-hue="ochre"
                    key={m.id}
                  >
                    <div
                      className="msg__link"
                      role="button"
                      tabIndex={0}
                      data-msg-open={m.id}
                      onClick={() => {
                        if (!m.read) mutation.mutate(m.id);
                        if (m.target?.url) location.href = m.target.url;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (!m.read) mutation.mutate(m.id);
                        }
                      }}
                    >
                      <span className="msg__lead">
                        <span className="msg__icon">
                          <Icon name="megaphone" />
                        </span>
                      </span>
                      <span className="msg__main">
                        <span className="msg__title">
                          {m.title}
                          {m.important && (
                            <span className="tag tag--outline">
                              <Icon name="lock" />
                              重要
                            </span>
                          )}
                        </span>
                        <span className="msg__body">
                          {expanded.has(m.id) || m.body.length <= 120
                            ? m.body
                            : `${m.body.slice(0, 120)}…`}
                          {m.body.length > 120 && (
                            <button
                              type="button"
                              className="btn btn--link btn--sm"
                              data-msg-expand={m.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpanded((old) => {
                                  const next = new Set(old);
                                  next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                                  return next;
                                });
                              }}
                            >
                              {expanded.has(m.id) ? '收起' : '展开'}
                            </button>
                          )}
                        </span>
                        <span className="msg__time">{formatTime(m.created_at)}</span>
                      </span>
                      <span className="msg__dot" aria-label="未读" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <div className="load-more" id="loadMore" hidden={!query.hasNextPage}>
        <button
          type="button"
          className="btn"
          id="moreBtn"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          加载更多
        </button>
        <span id="moreInfo">已显示 {rows.length} 条</span>
      </div>
    </main>
  );
}
