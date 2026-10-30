import type { Shop, User } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import { api, endpoint, queryClient } from '../lib/api';
import { useSession } from '../lib/session';
import { ShopCard } from './ShopCard';
import { Dialog, Empty, ErrorState, Icon, Loading, useToast } from './ui';
export interface Collection {
  id: number;
  name: string;
  is_public: boolean;
  items_count: number;
  section: string;
}
export function CollectButton({
  shopId,
  variant = 'action',
}: {
  shopId: number;
  variant?: string;
}) {
  const session = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const key = `collected:${session.user?.id || 'guest'}:shops:${shopId}`;
  const [collected, setCollected] = useState(localStorage.getItem(key) === '1');
  return (
    <>
      <button
        type="button"
        className={
          variant === 'btn'
            ? 'btn btn--sm btn--collect'
            : 'action-btn action-btn--collect card__action'
        }
        aria-pressed={collected}
        aria-label={collected ? '已收藏' : '收藏'}
        data-collect="shops"
        data-section="shops"
        data-item-id={shopId}
        onClick={() => {
          if (!session.token) {
            toast('请先登录后再收藏', 'info');
            return;
          }
          setOpen(true);
        }}
      >
        <Icon name="star" />
        <span data-collect-label>{collected ? '已收藏' : '收藏'}</span>
      </button>
      {open && (
        <CollectDialog
          shopId={shopId}
          onClose={() => setOpen(false)}
          onDone={() => {
            localStorage.setItem(key, '1');
            setCollected(true);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
function CollectDialog({
  shopId,
  onClose,
  onDone,
}: {
  shopId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const list = useQuery({
    ...endpoint<{ collections: Collection[]; defaults: { shops: number } }>(
      '/api/collections?section=shops',
    ),
    staleTime: 0,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [isPublic, setPublic] = useState(false);
  const [preference, setPreference] = useState<'loading' | 'ok' | 'error'>('loading');
  const chosen = selected || list.data?.defaults?.shops || list.data?.collections[0]?.id;
  async function startCreate() {
    setCreate(true);
    setPublic(false);
    setPreference('loading');
    try {
      const profile = await api<{ user: User }>('/api/user/profile');
      setPublic(profile.user.collection_default_public === 1);
      setPreference('ok');
    } catch {
      setPreference('error');
    }
  }
  const createMutation = useMutation({
    mutationFn: () =>
      api<{ collection: Collection }>('/api/collections', {
        method: 'POST',
        body: { section: 'shops', name: name.trim(), is_public: isPublic ? 1 : 0 },
      }),
    onSuccess: (r) => {
      setSelected(r.collection.id);
      setName('');
      setCreate(false);
      queryClient.invalidateQueries({ queryKey: ['/api/collections?section=shops'] });
      toast('已新建收藏夹');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const save = useMutation({
    mutationFn: () =>
      api<{ added: boolean }>(`/api/collections/${chosen}/items`, {
        method: 'POST',
        body: { item_type: 'shop', item_id: shopId },
      }),
    onSuccess: (r) => {
      toast(r.added === false ? '已在收藏夹中' : '已收藏');
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).includes('/collections'),
      });
      onDone();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Dialog title="收藏" className="dialog--sheet dialog--wide" onClose={onClose}>
      <form
        className="dialog__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen) save.mutate();
        }}
      >
        <div className="dialog__body">
          <div className="stack collection-dialog__list" data-list>
            {list.isPending ? (
              <Loading />
            ) : list.error ? (
              <ErrorState error={list.error} retry={list.refetch} />
            ) : (
              <div
                className="choice-group choice-group--compact"
                role="radiogroup"
                aria-label="选择收藏夹"
              >
                {list.data.collections.map((c) => (
                  <label key={c.id} className="choice">
                    <input
                      className="choice__input"
                      type="radio"
                      name="collectionChoice"
                      value={c.id}
                      checked={chosen === c.id}
                      onChange={() => setSelected(c.id)}
                    />
                    <span className="choice__body">
                      <span className="choice__title">
                        {c.name}
                        <Icon name="check-circle" className="choice__check" />
                      </span>
                      <span className="choice__desc">
                        {c.items_count || 0} 条内容 · {c.is_public ? '公开' : '私密'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="field" data-new-field hidden={!create}>
            <label className="field__label" htmlFor="newCollection">
              新建收藏夹
            </label>
            <div className="row row--sm">
              <input
                className="input grow"
                id="newCollection"
                maxLength={40}
                placeholder="收藏夹名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (name.trim()) createMutation.mutate();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn--sm"
                data-create
                disabled={!name.trim() || preference === 'loading' || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                新建
              </button>
            </div>
            <label className="switch-row">
              <span className="switch-row__text">
                <span className="switch-row__title">公开</span>
                <span className="switch-row__desc" data-new-public-hint>
                  {preference === 'loading'
                    ? '正在读取默认公开设置…'
                    : preference === 'error'
                      ? '默认设置读取失败，本次默认不公开，可手动调整。'
                      : '公开后，其他人可以在你的主页查看此收藏夹。'}
                </span>
              </span>
              <input
                type="checkbox"
                className="switch"
                role="switch"
                data-new-public
                checked={isPublic}
                disabled={preference === 'loading' || createMutation.isPending}
                onChange={(e) => setPublic(e.target.checked)}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            data-new-toggle
            onClick={startCreate}
          >
            <Icon name="plus" className="icon--sm" />
            新建收藏夹
          </button>
        </div>
        <div className="dialog__foot">
          <span className="status-text" data-status role="status" />
          <button type="button" className="btn" data-cancel onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            data-confirm
            disabled={!chosen || save.isPending}
          >
            确认收藏
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function CollectionsBrowser({ userId }: { userId?: number }) {
  const toast = useToast();
  const [selected, setSelected] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [publicOverride, setPublicOverride] = useState<{ id: number; value: boolean } | null>(null);
  const path = userId ? `/api/users/${userId}/collections` : '/api/collections?section=shops';
  const query = useQuery(
    endpoint<{ collections: Collection[]; defaults?: { shops: number } }>(path, !userId),
  );
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const rows = query.data?.collections || [];
  const c =
    rows.find((x) => x.id === selected) ||
    rows.find((x) => x.id === query.data?.defaults?.shops) ||
    rows[0];
  const items = useQuery({
    ...endpoint<{
      items: { id: number; item_id: number; deleted?: boolean; shop: Shop; data?: Shop }[];
      total: number;
      collection: Collection;
      total_pages: number;
    }>(`/api/collections/${c?.id}/items?page=${page}`, !userId),
    enabled: !!c,
  });
  const mutation = useMutation({
    mutationFn: (value: boolean) =>
      api(`/api/collections/${c!.id}/public`, { method: 'PUT', body: { is_public: value } }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [path] });
      setPublicOverride(null);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={query.refetch} />;
  return (
    <div className="shell">
      <div className="shell__nav">
        <div className="field" data-mobile hidden={!mobile}>
          <label className="field__label" htmlFor="collectionSelect">
            收藏夹
          </label>
          <select
            id="collectionSelect"
            className="select"
            data-mobile-select
            value={c?.id || ''}
            onChange={(e) => {
              setSelected(Number(e.target.value));
              setPage(1);
            }}
          >
            <optgroup label="必吃榜">
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <nav className="side-nav" data-sections hidden={mobile} aria-label="收藏版块">
          <button className="side-nav__item is-active" data-section="shops" type="button">
            <Icon name="store" />
            必吃榜
          </button>
        </nav>
        <nav
          className="side-nav"
          data-collections
          hidden={mobile}
          aria-label="收藏夹"
          style={{ marginTop: 'var(--sp-4)' }}
        >
          {rows.map((row) => (
            <button
              type="button"
              className={`side-nav__item${row.id === c?.id ? ' is-active' : ''}`}
              data-collection={row.id}
              data-collection-id={row.id}
              key={row.id}
              onClick={() => {
                setSelected(row.id);
                setPage(1);
              }}
            >
              {row.name}
              <span>{row.items_count}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="shell__main">
        <div className="row row--between" style={{ marginBottom: 'var(--sp-4)' }}>
          <nav className="breadcrumb" data-path aria-label="当前位置">
            必吃榜 / {c?.name}
          </nav>
          <label
            className="switch-row"
            data-public-wrap
            hidden={!!userId || !c}
            style={{ paddingBlock: 0 }}
          >
            <span className="switch-row__text">
              <span className="switch-row__title">公开</span>
              <span className="switch-row__desc">其他人可在你的主页查看</span>
            </span>
            <input
              type="checkbox"
              className="switch"
              data-public
              checked={publicOverride?.id === c?.id ? publicOverride!.value : !!c?.is_public}
              disabled={mutation.isPending}
              onChange={(e) => {
                setPublicOverride({ id: c!.id, value: e.target.checked });
                mutation.mutate(e.target.checked);
              }}
            />
          </label>
          <span className="badge badge--ok" data-public-badge hidden={!userId || !c?.is_public}>
            公开
          </span>
        </div>
        {!c ? (
          <Empty title="暂无公开收藏夹" />
        ) : items.isPending ? (
          <Loading />
        ) : items.error ? (
          <ErrorState error={items.error} retry={items.refetch} />
        ) : (
          <>
            <div className="grid" data-grid style={{ '--grid-min': '20rem' } as CSSProperties}>
              {items.data.items.length ? (
                items.data.items.map((item) =>
                  item.deleted ? (
                    <article className="card" key={item.id}>
                      <Empty title="内容已删除" />
                    </article>
                  ) : (
                    <ShopCard
                      key={item.id || item.item_id}
                      shop={item.shop || item.data || (item as unknown as Shop)}
                      collect={!userId}
                    />
                  ),
                )
              ) : (
                <Empty title="收藏夹还是空的" />
              )}
            </div>
            <Pager
              page={page}
              totalPages={items.data.total_pages || Math.ceil(items.data.total / 20)}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
export function Pager({
  page,
  totalPages,
  onChange,
  id,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  id?: string;
}) {
  const pages = Array.from(
    new Set([
      1,
      ...Array.from({ length: 5 }, (_, i) => page + i - 2).filter((p) => p > 1 && p < totalPages),
      totalPages,
    ]),
  )
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  return (
    <nav className="pager" id={id} aria-label="分页" hidden={totalPages <= 1}>
      <button
        type="button"
        className="pager__btn"
        disabled={page <= 1}
        aria-label="上一页"
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>
      {pages.map((p, i) => (
        <span key={p}>
          {i > 0 && p > pages[i - 1] + 1 && <span className="pager__ellipsis">…</span>}
          <button
            type="button"
            className={`pager__btn${p === page ? ' is-active' : ''}`}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        </span>
      ))}
      <button
        type="button"
        className="pager__btn"
        disabled={page >= totalPages}
        aria-label="下一页"
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
