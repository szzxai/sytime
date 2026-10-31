import { SiteLink } from '../components/SiteLink';
import type { Dish, Review } from '@sytime/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DishReview } from '../components/DishReview';
import { Picture } from '../components/Media';
import { Empty, ErrorState, Icon, Loading, Stars, UserLine } from '../components/ui';
import { endpoint, loginUrl } from '../lib/api';
import { useSession } from '../lib/session';
import { useUrlSearch } from '../lib/useUrlSearch';
import { DailyControls, DailyColumn, shiftDate } from './MenuDaily';
import './MenuPage.css';

type Week = {
  id: string;
  title: string;
  url: string;
  start_date: string;
  end_date: string;
  updated_at: number;
};
export type Supply = {
  record_key: string;
  price_label?: string;
  dish_id: number;
  date: string;
  weekday: string;
  time: string[];
  place: string | null;
  group: string | null;
  name: string;
  price: number | null;
  spicy: boolean | null;
  rating_avg: number | null;
  reviews_count: number;
  pinyin: string;
  pinyin_initials: string;
};
type Menu = {
  weeks: Week[];
  week: Week | null;
  records: Supply[];
  sync: { status: string; finished_at: number } | null;
};
const meals: Record<string, string> = {
  morning: '早餐',
  noon: '午餐',
  evening: '晚餐',
  night: '夜宵',
};
export function RecipePage() {
  const session = useSession();
  const [params, update] = useUrlSearch();
  const [writer, setWriter] = useState<Dish | null>(null);
  const preference = params.view || session.user?.recipe_default_view || 'daily';
  const view = ['daily', 'weekly', 'all', 'reviews'].includes(preference) ? preference : 'daily';
  const allowedMeals = ['morning', 'noon', 'evening', 'night', 'break'];
  const leftMeal = allowedMeals.includes(params.left_meal) ? params.left_meal : 'noon';
  const rightMeal = allowedMeals.includes(params.right_meal) ? params.right_meal : 'noon';
  const baseMenu = useQuery({ ...endpoint<Menu>('/api/menu', false), refetchInterval: 60000 });
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(Date.now());
  const parsedDate = new Date((params.date || '') + 'T12:00:00Z');
  const selectedDate =
    params.date &&
    Number.isFinite(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === params.date
      ? params.date
      : today;
  const tomorrow = shiftDate(selectedDate, 1);
  const sourceFor = (date: string) =>
    baseMenu.data?.weeks.find((w) => w.start_date <= date && w.end_date >= date)?.id;
  const querySource = (id: string | undefined) => (id === baseMenu.data?.week?.id ? undefined : id);
  const sourceId = view === 'daily' ? querySource(sourceFor(selectedDate)) : params.source_id;
  const path =
    '/api/menu' +
    (sourceId ? '?source_id=' + encodeURIComponent(sourceId) : view === 'all' ? '?all=1' : '');
  const menu = useQuery({ ...endpoint<Menu>(path, false), refetchInterval: 60000 });
  const reviews = useQuery({
    ...endpoint<{ recipes: Review[] }>('/api/recipes', false),
    enabled: view === 'reviews',
  });
  const days = [...new Set(menu.data?.records.map((r) => r.date) || [])].sort();
  const nextMenu = useQuery({
    ...endpoint<Menu>(
      '/api/menu' +
        (querySource(sourceFor(tomorrow))
          ? '?source_id=' + encodeURIComponent(sourceFor(tomorrow)!)
          : ''),
      false,
    ),
    enabled: view === 'daily',
    refetchInterval: 60000,
  });
  const dailyRecords = [
    ...new Map(
      [...(menu.data?.records || []), ...(nextMenu.data?.records || [])].map((r) => [
        r.record_key,
        r,
      ]),
    ).values(),
  ];
  const day =
    (days.includes(params.date) ? params.date : undefined) ||
    days.find((d) => d >= today) ||
    days[0] ||
    '';
  const query = (params.q || '').trim().toLowerCase();
  const places = [...new Set(menu.data?.records.map((r) => r.place).filter(Boolean) || [])];
  const rows = (menu.data?.records || []).filter(
    (r) =>
      (!day || r.date === day) &&
      (!params.place || r.place === params.place) &&
      (!params.meal || r.time.includes(params.meal)) &&
      (!query ||
        r.name.toLowerCase().includes(query) ||
        r.pinyin.includes(query) ||
        r.pinyin_initials.includes(query)),
  );
  const groups = new Map<string, Supply[]>();
  for (const row of rows) {
    const key = [
      row.time.map((t) => meals[t]).join(' / ') || '课间加餐',
      row.place || '地点未注明',
      row.group,
    ]
      .filter(Boolean)
      .join(' · ');
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const advancedRows = (menu.data?.records || []).filter(
    (r) =>
      (!params.filter_date || r.date === params.filter_date) &&
      (!params.place || r.place === params.place) &&
      (!params.meal || r.time.includes(params.meal)) &&
      (!params.category || r.group === params.category) &&
      (params.spicy !== 'yes' || r.spicy === true) &&
      (params.spicy !== 'no' || r.spicy === false) &&
      (!params.rating || (r.rating_avg ?? 0) >= Number(params.rating)) &&
      (!params.min_price || (r.price !== null && r.price >= Number(params.min_price))) &&
      (!params.max_price || (r.price !== null && r.price <= Number(params.max_price))) &&
      (!query ||
        r.name.toLowerCase().includes(query) ||
        r.pinyin.includes(query) ||
        r.pinyin_initials.includes(query)),
  );
  const filteredDishes = [...new Map(advancedRows.map((r) => [r.dish_id, r])).values()];
  function write(row: Supply) {
    if (!session.token) return location.assign(loginUrl());
    if (session.user?.role === 'user') return location.assign('/student_verify.html');
    setWriter({
      id: row.dish_id,
      name: row.name,
      pinyin: row.pinyin,
      pinyin_initials: row.pinyin_initials,
      initial: '',
      sort_key: '',
    });
  }
  function renderSupply(r: Supply) {
    return (
      <article className="menu-dish" key={r.record_key} data-dish-id={r.dish_id}>
        <div className="menu-dish__top">
          <SiteLink href={'/dish.html?id=' + r.dish_id} className="menu-dish__name">
            {r.name}
          </SiteLink>
          {r.spicy === true && (
            <span title="原食谱标注辣椒" aria-label="辣">
              🌶
            </span>
          )}
          <span className="menu-price">
            {r.price_label
              ? r.price_label
              : r.price === null
                ? '价格未注明'
                : r.price === 0
                  ? '免费'
                  : `¥${r.price}`}
          </span>
        </div>
        <div className="menu-dish__meta">
          <span>{r.place || '地点未注明'}</span>
          {r.group && !/风味|现煮/.test(r.group) && <small>{r.group}</small>}
        </div>
        <div className="menu-dish__foot">
          <span className="menu-rating">
            {r.rating_avg === null ? (
              '暂无评价'
            ) : (
              <>
                <Stars rating={r.rating_avg} />
                <span>
                  {r.rating_avg.toFixed(1)} · {r.reviews_count} 条
                </span>
              </>
            )}
          </span>
          <button className="btn btn--sm" type="button" onClick={() => write(r)}>
            评价
          </button>
        </div>
      </article>
    );
  }
  return (
    <main
      id="main"
      className={'main container menu-page' + (view === 'daily' ? ' menu-page--daily' : '')}
    >
      <h1 className="sr-only">菜品与食谱</h1>
      <div className="menu-topline">
        {view === 'daily' ? (
          <DailyControls
            date={selectedDate}
            campus={params.campus || 'main'}
            onDate={(date) => update({ date })}
            onCampus={() => update({ campus: params.campus === 'zhengyi' ? 'main' : 'zhengyi' })}
          />
        ) : (
          <span className="daily-context">
            {view === 'weekly' ? '每周食谱' : view === 'all' ? '全部菜品 · 高级筛选' : '大家的评价'}
          </span>
        )}
        <nav className="menu-view-switch" aria-label="食谱视图">
          {(
            [
              ['daily', '今日与明日'],
              ['weekly', '每周食谱'],
              ['all', '全部菜品'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={view === value}
              onClick={() => update({ view: value })}
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {value === 'daily' ? (
                  <path d="M4 5h16v14H4zM12 5v14" />
                ) : value === 'weekly' ? (
                  <path d="M4 5h16v14H4zM4 10h16M9 10v9M15 10v9" />
                ) : (
                  <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
                )}
              </svg>
            </button>
          ))}
        </nav>
      </div>
      {view === 'daily' ? (
        <>
          {menu.isPending || nextMenu.isPending ? (
            <Loading />
          ) : menu.error || nextMenu.error ? (
            <ErrorState
              error={(menu.error || nextMenu.error)!}
              retry={() => {
                void menu.refetch();
                void nextMenu.refetch();
              }}
            />
          ) : (
            <div className="daily-columns">
              <DailyColumn
                title="今天我吃了…"
                date={selectedDate}
                records={dailyRecords}
                campus={params.campus || 'main'}
                meal={leftMeal}
                onMeal={(left_meal) => update({ left_meal })}
                render={renderSupply}
              />
              <DailyColumn
                title="明天吃什么？"
                date={tomorrow}
                records={dailyRecords}
                campus={params.campus || 'main'}
                meal={rightMeal}
                onMeal={(right_meal) => update({ right_meal })}
                render={renderSupply}
              />
            </div>
          )}
        </>
      ) : view === 'weekly' ? (
        <>
          {menu.isPending ? (
            <Loading />
          ) : menu.error ? (
            <ErrorState error={menu.error} retry={menu.refetch} />
          ) : !menu.data.week ? (
            <Empty
              icon="utensils"
              title="食谱正在等候更新"
              description="学校发布食谱后会自动整理。暂时没有已发布的菜单。"
            />
          ) : (
            <>
              <section className="menu-toolbar" aria-label="筛选食谱">
                <label>
                  食谱周次
                  <select
                    className="select"
                    value={menu.data.week.id}
                    onChange={(e) =>
                      update({ source_id: e.target.value, date: undefined, place: undefined })
                    }
                  >
                    {menu.data.weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.start_date} — {w.end_date}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  供应地点
                  <select
                    className="select"
                    value={params.place || ''}
                    onChange={(e) => update({ place: e.target.value || undefined })}
                  >
                    <option value="">全部地点</option>
                    {places.map((p) => (
                      <option key={p} value={p!}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  餐次
                  <select
                    className="select"
                    value={params.meal || ''}
                    onChange={(e) => update({ meal: e.target.value || undefined })}
                  >
                    <option value="">全部餐次</option>
                    {Object.entries(meals).map(([v, l]) => (
                      <option value={v} key={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  找一道菜
                  <input
                    className="input"
                    id="dishSearch"
                    type="search"
                    placeholder="菜名、拼音或首字母"
                    value={params.q || ''}
                    onChange={(e) => update({ q: e.target.value || undefined })}
                  />
                </label>
              </section>
              <div className="menu-days" aria-label="供应日期">
                {days.map((d) => (
                  <button
                    type="button"
                    key={d}
                    aria-pressed={d === day}
                    className={d === day ? 'is-active' : ''}
                    onClick={() => update({ date: d })}
                  >
                    <span>
                      {
                        ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
                          new Date(d + 'T00:00:00Z').getUTCDay()
                        ]
                      }
                    </span>
                    <strong>{d.slice(5).replace('-', ' / ')}</strong>
                    {d === today && <small>今天</small>}
                  </button>
                ))}
              </div>
              <div className="menu-status" role="status">
                <span>
                  共 {rows.length} 条供应 · 整理于{' '}
                  {new Date(menu.data.week.updated_at).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                  })}
                </span>
                <span>供应以食堂实际安排为准</span>
              </div>
              {menu.data.sync &&
                ['failed', 'partial', 'interrupted'].includes(menu.data.sync.status) && (
                  <p className="menu-notice">
                    最近一次更新未完成，正在展示上次成功整理的食谱，系统将在下次检查时重试。
                  </p>
                )}
              {!rows.length ? (
                <Empty title="没有匹配的供应" description="试试其他日期、地点或餐次。" />
              ) : (
                [...groups].map(([name, items]) => (
                  <section className="menu-section" key={name}>
                    <h2>{name}</h2>
                    <div className="menu-grid">{items.map((r) => renderSupply(r))}</div>
                  </section>
                ))
              )}
            </>
          )}
        </>
      ) : view === 'all' ? (
        <section className="stack stack--md">
          <h2>全部菜品</h2>
          <button className="btn btn--sm" type="button" onClick={() => update({ view: 'reviews' })}>
            查看大家的评价
          </button>
          <div className="menu-toolbar advanced-filters" aria-label="高级筛选">
            <label>
              食谱周次
              <select
                className="select"
                value={params.source_id || ''}
                onChange={(e) =>
                  update({ source_id: e.target.value || undefined, filter_date: undefined })
                }
              >
                <option value="">全部周次</option>
                {menu.data?.weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.start_date} — {w.end_date}
                  </option>
                ))}
              </select>
            </label>
            <label>
              供应日期
              <select
                className="select"
                value={params.filter_date || ''}
                onChange={(e) => update({ filter_date: e.target.value || undefined })}
              >
                <option value="">全部日期</option>
                {days.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              供应地点
              <select
                className="select"
                value={params.place || ''}
                onChange={(e) => update({ place: e.target.value || undefined })}
              >
                <option value="">全部地点</option>
                {places.map((p) => (
                  <option key={p} value={p!}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              餐次
              <select
                className="select"
                value={params.meal || ''}
                onChange={(e) => update({ meal: e.target.value || undefined })}
              >
                <option value="">全部餐次</option>
                {Object.entries(meals).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              分类
              <select
                className="select"
                value={params.category || ''}
                onChange={(e) => update({ category: e.target.value || undefined })}
              >
                <option value="">全部分类</option>
                {[...new Set(menu.data?.records.map((r) => r.group).filter(Boolean))].map((g) => (
                  <option key={g} value={g!}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              辣椒标记
              <select
                className="select"
                value={params.spicy || ''}
                onChange={(e) => update({ spicy: e.target.value || undefined })}
              >
                <option value="">不限</option>
                <option value="yes">有辣椒</option>
                <option value="no">无辣椒</option>
              </select>
            </label>
            <label>
              最低评分
              <select
                className="select"
                value={params.rating || ''}
                onChange={(e) => update({ rating: e.target.value || undefined })}
              >
                <option value="">不限</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} 星
                  </option>
                ))}
              </select>
            </label>
            <label>
              最低价格
              <input
                className="input"
                type="number"
                min="0"
                step="0.5"
                value={params.min_price || ''}
                onChange={(e) => update({ min_price: e.target.value || undefined })}
              />
            </label>
            <label>
              最高价格
              <input
                className="input"
                type="number"
                min="0"
                step="0.5"
                value={params.max_price || ''}
                onChange={(e) => update({ max_price: e.target.value || undefined })}
              />
            </label>
            <label>
              找一道菜
              <input
                id="dishSearch"
                className="input"
                type="search"
                placeholder="菜名、拼音或首字母"
                value={params.q || ''}
                onChange={(e) => update({ q: e.target.value || undefined })}
              />
            </label>
          </div>
          {menu.isPending ? (
            <Loading />
          ) : menu.error ? (
            <ErrorState error={menu.error} retry={menu.refetch} />
          ) : (
            <>
              <p className="muted">共 {filteredDishes.length} 道菜 · 按已发布的供应筛选</p>
              <div className="menu-grid">{filteredDishes.map(renderSupply)}</div>
              {!filteredDishes.length && (
                <Empty title="没有匹配的菜品" description="试试其他周次或筛选条件。" />
              )}
            </>
          )}
        </section>
      ) : (
        <section className="stack stack--md">
          <h2>大家的评价</h2>
          {reviews.isPending ? (
            <Loading />
          ) : reviews.error ? (
            <ErrorState error={reviews.error} retry={reviews.refetch} />
          ) : reviews.data.recipes.length ? (
            reviews.data.recipes.map((r) => <ReviewCard review={r} detail key={r.id} />)
          ) : (
            <Empty title="还没有评价" description="从每周食谱选择一道菜，分享你的用餐体验。" />
          )}
        </section>
      )}
      {writer && <DishReview dish={writer} onClose={() => setWriter(null)} />}
    </main>
  );
}

export function ReviewCard({
  review: r,
  detail = false,
  highlighted = false,
}: {
  review: Review;
  detail?: boolean;
  highlighted?: boolean;
}) {
  return detail ? (
    <article
      id={`review-${r.id}`}
      tabIndex={-1}
      className={`card dish-review review-target${highlighted ? ' is-highlighted' : ''}`}
    >
      {r.name && <SiteLink href={'/dish.html?id=' + r.dish_id}>{r.name}</SiteLink>}
      <header className="dish-review__head">
        <UserLine user={{ ...r, id: r.user_id }} time={r.created_at} />
        <Stars rating={r.rating} />
      </header>
      {r.comment && <p className="dish-review__text">{r.comment}</p>}
      {r.image_url && (
        <Picture
          src={r.image_url}
          caption={`${r.name || '菜品'}的评价图片`}
          className="dish-review__image"
        />
      )}
    </article>
  ) : (
    <article className="card card--flush review-card">
      {r.image_url ? (
        <Picture src={r.image_url} caption={r.name || '菜品'} className="card__media u-w-full" />
      ) : (
        <div className="card__media">
          <span className="dish__placeholder">
            <Icon name="utensils" className="icon--xl" />
          </span>
        </div>
      )}
      <div className="review-card__body">
        <div className="review-card__head">
          <h2 className="review-card__name">{r.name}</h2>
          <Stars rating={r.rating} />
        </div>
        {r.comment && <p className="review-card__text">{r.comment}</p>}
      </div>
      <div className="review-card__foot">
        <UserLine user={{ ...r, id: r.user_id }} time={r.created_at} size="xs" />
      </div>
    </article>
  );
}
