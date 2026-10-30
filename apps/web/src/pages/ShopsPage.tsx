import { SiteLink } from '../components/SiteLink';
import { roleLabels, type Role, type Shop } from '@sytime/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Pager } from '../components/Collections';
import { ShopCard } from '../components/ShopCard';
import { ShopMap, type ShopMeta } from '../components/ShopMap';
import { Empty, ErrorState, Icon, Loading, PageHead } from '../components/ui';
import { endpoint } from '../lib/api';
import { useSession } from '../lib/session';
import { shopFilters, shopsPath } from '../lib/navigation';
import { useUrlSearch } from '../lib/useUrlSearch';
export const shopSorts = {
  campus: '距苏州中学本部最近',
  az: '拼音排序',
  metro: '距地铁最近',
  likes: '按点赞数',
  reviews: '按评价数',
  rating: '按评分',
  new: '最新添加',
};
const ranges = [
  {
    label: '距苏州中学本部（米）',
    min: 'distance_min_m',
    max: 'distance_max_m',
    ids: ['distanceMin', 'distanceMax'],
    limit: 50000,
    step: 50,
  },
  {
    label: '步行时间（分钟）',
    min: 'walk_min',
    max: 'walk_max',
    ids: ['walkMin', 'walkMax'],
    limit: 240,
    step: 1,
  },
  {
    label: '点赞数',
    min: 'likes_min',
    max: 'likes_max',
    ids: ['likesMin', 'likesMax'],
    limit: 1000000,
    step: 1,
  },
  {
    label: '评价数',
    min: 'reviews_min',
    max: 'reviews_max',
    ids: ['reviewsMin', 'reviewsMax'],
    limit: 1000000,
    step: 1,
  },
  {
    label: '评分（1–5）',
    min: 'rating_min',
    max: 'rating_max',
    ids: ['ratingMin', 'ratingMax'],
    limit: 5,
    step: 0.1,
  },
];
export function ShopsPage() {
  const { user, token } = useSession();
  const [paramsState, updateSearch] = useUrlSearch();
  const filters = useMemo<Record<string, string>>(
    () => shopFilters(paramsState, user),
    [paramsState, user],
  );
  const page = Math.max(1, Number(paramsState.page) || 1);
  const setPage = (value: number) => updateSearch({ page: value > 1 ? String(value) : undefined });
  const [debounced, setDebounced] = useState(filters);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters), 250);
    return () => clearTimeout(timer);
  }, [filters]);
  const query = useQuery(
    endpoint<{
      shops: Shop[];
      total: number;
      types: { all: string[] };
      can_create: boolean;
      create_min_role: Role;
      area: { text: string };
    }>(shopsPath(debounced)),
  );
  const meta = useQuery(endpoint<ShopMeta>('/api/shops/meta'));
  const rows = [...(query.data?.shops || [])];
  if (debounced.sort === 'az')
    rows.sort(
      (a, b) =>
        new Intl.Collator('zh-Hans-CN-u-co-pinyin', { numeric: true, sensitivity: 'base' }).compare(
          a.name,
          b.name,
        ) || a.id - b.id,
    );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const current = Math.min(page, pages);
  function change(key: string, value: string) {
    updateSearch({ [key]: value, page: undefined });
  }
  return (
    <main id="main" className="workspace workspace--shops">
      <aside className="workspace__sidebar" aria-label="美食筛选">
        <PageHead
          title="三元坊必吃榜"
          eyebrow="校园周边美食"
          description="同学们推荐的学校周边美食。距离与步行时间按高德地图步行路线填写，均为步行距离而非直线距离。"
        >
          <span id="createAction">
            {meta.data?.can_create && (
              <SiteLink className="btn btn--primary" href="/shop-new.html">
                <Icon name="plus" className="icon--sm" />
                添加店铺
              </SiteLink>
            )}
          </span>
        </PageHead>
        <div className="row row--between row--top u-mb-4">
          <div className="filter-bar" id="typeFilter" role="radiogroup" aria-label="店铺类型筛选">
            {['', ...(meta.data?.types.all || [])].map((type) => (
              <label className="chip" key={type}>
                <input
                  className="chip__input"
                  type="radio"
                  name="type"
                  value={type}
                  checked={(filters.type || '') === type}
                  onChange={() => change('type', type)}
                />
                <span className="chip__face">{type || '全部'}</span>
              </label>
            ))}
          </div>
          <div className="row row--sm">
            <label className="u-fs-sm u-muted" htmlFor="sortSelect">
              排序
            </label>
            <select
              className="select select--sm"
              id="sortSelect"
              aria-label="排序"
              value={filters.sort || 'campus'}
              onChange={(e) => change('sort', e.target.value)}
            >
              {Object.entries(shopSorts).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <section className="card shop-search u-mb-4" aria-labelledby="searchTitle">
          <div className="shop-search__grid">
            <div className="field shop-search__text">
              <label className="field__label" id="searchTitle" htmlFor="shopSearch">
                搜索店名、道路或商场
              </label>
              <input
                className="input"
                id="shopSearch"
                type="search"
                maxLength={80}
                placeholder="例如：十全街、购物中心、面馆"
                autoComplete="off"
                value={filters.q || ''}
                onChange={(e) => change('q', e.target.value)}
              />
            </div>
            {ranges.map((r) => (
              <fieldset className="shop-search__range" key={r.min}>
                <legend>{r.label}</legend>
                <label className="sr-only" htmlFor={r.ids[0]}>
                  最小{r.label}
                </label>
                <input
                  className="input"
                  id={r.ids[0]}
                  type="number"
                  min="0"
                  max={r.limit}
                  step={r.step}
                  inputMode="decimal"
                  placeholder="最小"
                  value={filters[r.min] || ''}
                  onChange={(e) => change(r.min, e.target.value)}
                />
                <span aria-hidden="true">至</span>
                <label className="sr-only" htmlFor={r.ids[1]}>
                  最大{r.label}
                </label>
                <input
                  className="input"
                  id={r.ids[1]}
                  type="number"
                  min="0"
                  max={r.limit}
                  step={r.step}
                  inputMode="decimal"
                  placeholder="最大"
                  value={filters[r.max] || ''}
                  onChange={(e) => change(r.max, e.target.value)}
                />
              </fieldset>
            ))}
            <button
              type="button"
              className="btn btn--sm shop-search__clear"
              id="clearShopFilters"
              onClick={() => {
                updateSearch(
                  Object.fromEntries([
                    ...Object.keys(filters).map((key) => [key, undefined]),
                    ['sort', 'campus'],
                    ['type', ''],
                  ]),
                );
              }}
            >
              清除筛选
            </button>
          </div>
        </section>
      </aside>
      <div className="workspace__content">
        <section className="card u-mb-6" aria-labelledby="mapTitle">
          <div className="row row--between u-mb-4">
            <div>
              <h2 className="section__title" id="mapTitle">
                附近地图
              </h2>
              <p className="u-muted u-fs-sm" id="areaText">
                覆盖范围：{meta.data?.area.text || '加载中…'}
              </p>
            </div>
          </div>
          <ShopMap meta={meta.data} shops={rows} />
        </section>
        <p className="u-muted u-fs-sm u-mb-4" id="shopSummary" role="status">
          共 {rows.length} 家店铺 · 第 {current} / {pages} 页
        </p>
        <span className="sr-only" aria-live="polite" id="shopLive">
          找到 {rows.length} 家店铺
        </span>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={query.refetch} />
        ) : (
          <div className="grid grid--lg" id="shopGrid">
            {rows.length ? (
              rows
                .slice((current - 1) * 20, current * 20)
                .map((shop) => <ShopCard shop={shop} key={shop.id} />)
            ) : (
              <Empty
                title="没有找到相关店铺"
                description="试试其他关键词或清除筛选。"
                icon="store"
              />
            )}
          </div>
        )}
        <Pager
          id="pager"
          page={current}
          totalPages={pages}
          onChange={(p) => {
            setPage(p);
            document.getElementById('shopSummary')?.scrollIntoView({ block: 'start' });
          }}
        />
        <div className="callout u-mt-6" id="addHint" hidden={!token || meta.data?.can_create}>
          <span className="callout__text" id="addHintText">
            添加店铺需要「{roleLabels[(meta.data?.create_min_role || 'student') as Role]}
            」及以上权限，当前账号暂无此权限。
          </span>
          <span className="callout__actions" id="addHintActions" />
        </div>
      </div>
    </main>
  );
}
