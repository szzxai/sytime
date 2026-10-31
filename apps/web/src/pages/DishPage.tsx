import { SiteLink } from '../components/SiteLink';
import type { Dish, Review } from '@sytime/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DishReview } from '../components/DishReview';
import { Empty, ErrorState, Icon, Loading, Stars } from '../components/ui';
import { api, endpoint, loginUrl } from '../lib/api';
import { useSession } from '../lib/session';
import { useReviewTarget } from '../lib/useReviewTarget';
import { ReviewCard } from './RecipePage';
export function DishPage() {
  const { token, user } = useSession();
  const id = new URLSearchParams(location.search).get('id');
  const valid = !!id && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
  const dish = useQuery({
    ...endpoint<{
      dish: Dish;
      supplies: {
        date: string;
        time: string[];
        place: string | null;
        group_name: string | null;
        price: number | null;
        url: string;
        title: string;
      }[];
    }>(`/api/dishes/${id}`, false),
    enabled: valid,
  });
  const [writer, setWriter] = useState(false);
  const targetId = Number(new URLSearchParams(location.search).get('review')) || null;
  const reviews = useInfiniteQuery({
    queryKey: [`/api/dishes/${id}/reviews`, targetId],
    initialPageParam: 0,
    enabled: !!dish.data,
    queryFn: ({ pageParam, signal }) =>
      api<{
        reviews: Review[];
        total: number;
        offset: number;
        has_more: boolean;
        focus_review?: Review | null;
      }>(`/api/dishes/${id}/reviews?offset=${pageParam}${targetId ? `&review=${targetId}` : ''}`, {
        auth: false,
        signal,
      }),
    getNextPageParam: (p) => (p.has_more ? p.offset + p.reviews.length : undefined),
  });
  useReviewTarget(reviews.isSuccess);
  const d = dish.data?.dish;
  const loadedRows = reviews.data?.pages.flatMap((p) => p.reviews) || [];
  const focused = reviews.data?.pages[0].focus_review;
  const rows =
    focused && !loadedRows.some((r) => r.id === focused.id) ? [focused, ...loadedRows] : loadedRows;
  return (
    <main id="main" className="main container dish-detail">
      <SiteLink className="back-link" href="/recipe.html">
        <Icon name="arrow-left" className="icon--sm" />
        返回菜品与食谱
      </SiteLink>
      <div className="page-head">
        <div className="page-head__main">
          <span className="page-head__eyebrow">学校食堂 · 菜品评价</span>
          <h1 className="page-head__title" id="dishTitle">
            {d?.name || (!valid || dish.error ? '菜品不存在' : '菜品详情')}
          </h1>
          <div className="dish-detail__summary" id="dishSummary" role="status">
            {d && (
              <>
                {d.rating_avg == null ? (
                  <span>暂无评分</span>
                ) : (
                  <>
                    <Stars rating={d.rating_avg} />
                    <span>{d.rating_avg.toFixed(1)} / 5</span>
                  </>
                )}
                <span>共 {d.reviews_count} 条评价</span>
              </>
            )}
          </div>
        </div>
        <div className="page-head__actions">
          <button
            type="button"
            className="btn btn--primary"
            id="writeDishReview"
            hidden={!d}
            onClick={() =>
              !token
                ? location.assign(loginUrl())
                : user?.role === 'user'
                  ? location.assign('/student_verify.html')
                  : setWriter(true)
            }
          >
            <Icon name="pencil" />
            写评价
          </button>
        </div>
      </div>
      {d && (
        <section className="stack stack--md" aria-labelledby="dishSupplyTitle">
          <h2 className="section-title" id="dishSupplyTitle">
            近期供应
          </h2>
          <div className="menu-grid">
            {dish.data?.supplies.map((s, index) => (
              <article className="menu-dish" key={index}>
                <strong>
                  {s.date} ·{' '}
                  {s.time
                    .map(
                      (t) => ({ morning: '早餐', noon: '午餐', evening: '晚餐', night: '夜宵' })[t],
                    )
                    .join(' / ') || '课间加餐'}
                </strong>
                <span>{[s.place, s.group_name].filter(Boolean).join(' · ')}</span>
                <span>
                  {s.price === null ? '价格未注明' : s.price === 0 ? '免费' : `¥${s.price}`}
                </span>
                <a href={s.url} target="_blank" rel="noreferrer">
                  查看学校原文 ↗
                </a>
              </article>
            ))}
          </div>
          {!dish.data?.supplies.length && (
            <p className="u-muted">近期食谱暂未安排这道菜，仍可查看和发表评价。</p>
          )}
        </section>
      )}
      <div id="dishState">
        {dish.error && !('status' in dish.error && dish.error.status === 404) ? (
          <ErrorState error={dish.error} retry={dish.refetch} />
        ) : !valid || dish.error ? (
          <Empty
            icon="utensils"
            title="没有找到这道菜品"
            description="菜品链接无效，或菜品已不在当前目录中。"
          >
            <SiteLink className="btn" href="/recipe.html?view=all">
              返回全部菜品
            </SiteLink>
          </Empty>
        ) : dish.isPending ? (
          <Loading />
        ) : null}
      </div>
      <section
        className="stack stack--md"
        id="dishReviewsSection"
        aria-labelledby="dishReviewsTitle"
        hidden={!d}
      >
        <h2 className="section-title" id="dishReviewsTitle">
          评论与评价
        </h2>
        <div className="stack stack--md" id="dishReviews" aria-live="polite">
          {reviews.isPending ? (
            <Loading />
          ) : reviews.error ? (
            <ErrorState error={reviews.error} retry={reviews.refetch} />
          ) : rows.length ? (
            rows.map((r) => (
              <ReviewCard review={r} detail highlighted={r.id === targetId} key={r.id} />
            ))
          ) : (
            <Empty icon="message" title="还没有评价" description="吃过这道菜？来分享你的感受吧。" />
          )}
        </div>
        <div className="load-more" id="dishMore" hidden={!reviews.hasNextPage}>
          <span id="dishMoreInfo">
            已显示 {rows.length} / {reviews.data?.pages[0].total || 0} 条评价
          </span>
          <button
            type="button"
            className="btn"
            id="dishMoreButton"
            disabled={reviews.isFetchingNextPage}
            onClick={() => reviews.fetchNextPage()}
          >
            加载更多
          </button>
        </div>
      </section>
      {writer && d && (
        <DishReview
          dish={d}
          onClose={() => setWriter(false)}
          onPublished={(r) => {
            if (String(r.dish_id) !== id) location.href = `/dish.html?id=${r.dish_id}`;
          }}
        />
      )}
    </main>
  );
}
