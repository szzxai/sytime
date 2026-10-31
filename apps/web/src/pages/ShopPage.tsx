import { SiteLink } from '../components/SiteLink';
import type { Review, Shop } from '@sytime/shared';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { CollectButton } from '../components/Collections';
import { Picture, Upload } from '../components/Media';
import { ShopMap, shopHue, type ShopMeta } from '../components/ShopMap';
import {
  Confirm,
  Empty,
  ErrorState,
  Icon,
  Loading,
  Submit,
  UserLine,
  useToast,
} from '../components/ui';
import { api, distance, endpoint, loginUrl, money, queryClient } from '../lib/api';
import { useSession } from '../lib/session';
import { useReviewTarget } from '../lib/useReviewTarget';
export function ShopPage() {
  const id = new URLSearchParams(location.search).get('id');
  const { user, token } = useSession();
  const toast = useToast();
  const [layout, setLayout] = useState(
    String(
      user?.shop_layout ||
        localStorage.getItem('shopLayout') ||
        (innerWidth >= 900 ? 'split' : 'stacked'),
    ),
  );
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    ...endpoint<{ shop: Shop; can_interact: boolean }>(`/api/shops/${id}`),
    enabled: !!id,
  });
  const meta = useQuery(endpoint<ShopMeta>('/api/shops/meta'));
  const targetId = Number(new URLSearchParams(location.search).get('review')) || null;
  const reviews = useInfiniteQuery({
    queryKey: [`/api/shops/${id}/reviews`, token, targetId],
    initialPageParam: 0,
    enabled: !!query.data,
    queryFn: ({ pageParam, signal }) =>
      api<{
        reviews: Review[];
        total: number;
        my_review: Review | null;
        can_interact: boolean;
        focus_review?: Review | null;
      }>(
        `/api/shops/${id}/reviews?offset=${pageParam}&limit=20${targetId ? `&review=${targetId}` : ''}`,
        { signal },
      ),
    getNextPageParam: (last, pages) => {
      const n = pages.reduce((n, p) => n + p.reviews.length, 0);
      return n < last.total ? n : undefined;
    },
  });
  const shop = query.data?.shop;
  useReviewTarget(reviews.isSuccess);
  const loadedReviews = reviews.data?.pages.flatMap((p) => p.reviews) || [];
  const focused = reviews.data?.pages[0].focus_review;
  const reviewRows =
    focused && !loadedReviews.some((r) => r.id === focused.id)
      ? [focused, ...loadedReviews]
      : loadedReviews;
  const mine = reviews.data?.pages[0].my_review;
  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith('/api/shops'),
    });
  const like = useMutation({
    mutationFn: () => api(`/api/shops/${id}/like`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (e) => toast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/shops/${id}/reviews/me`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('已删除评价');
      refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  function setMode(mode: string) {
    setLayout(mode);
    localStorage.setItem('shopLayout', mode);
    if (token)
      api('/api/user/settings', { method: 'PUT', body: { shop_layout: mode } })
        .then(() => queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] }))
        .catch((e) => toast(e.message, 'error'));
  }
  if (!id)
    return (
      <main id="main" className="main container">
        <div id="shopBody">
          <Empty title="缺少店铺编号" icon="store">
            <SiteLink back className="btn" href="/shops.html">
              返回必吃榜
            </SiteLink>
          </Empty>
        </div>
      </main>
    );
  return (
    <main id="main" className="main container">
      <SiteLink className="back-link" href="/shops.html">
        <Icon name="arrow-left" />
        返回必吃榜
      </SiteLink>
      <div
        id="shopBody"
        className={`stack stack--lg${user?.shop_layout_mode === 'auto' ? ' shop-wrap--auto' : layout === 'split' ? ' shop-wrap--split' : ''}`}
        data-layout={layout}
      >
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          'status' in query.error && query.error.status === 404 ? (
            <Empty title="店铺不存在或已被删除" icon="store" />
          ) : (
            <ErrorState error={query.error} retry={query.refetch} />
          )
        ) : (
          shop && (
            <>
              <article className="card shop-hero">
                <div className="row row--between row--top">
                  <div className="grow">
                    <div className="row row--sm u-mb-2">
                      <span className="tag" data-hue={shopHue(shop.type)}>
                        {shop.type}
                      </span>
                    </div>
                    <h1 className="shop-hero__title">{shop.name}</h1>
                  </div>
                  <div
                    className="segmented"
                    role="group"
                    aria-label="店铺详情页布局"
                    id="layoutSwitch"
                    hidden={user?.shop_layout_mode === 'auto'}
                  >
                    {[
                      { value: 'stacked', label: '纵向', icon: 'rows' },
                      { value: 'split', label: '双栏', icon: 'columns' },
                    ].map((t) => (
                      <button
                        type="button"
                        className="segmented__item"
                        data-layout={t.value}
                        key={t.value}
                        aria-pressed={layout === t.value}
                        onClick={() => setMode(t.value)}
                      >
                        <Icon name={t.icon} className="icon--sm" />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="shop-hero__line">
                  <Icon name="map-pin" />
                  <span>
                    {shop.address}
                    {shop.location_note && <small>{shop.location_note}</small>}
                  </span>
                </div>
                <div className="shop-hero__stats">
                  <div className="stat-block">
                    <span className="stat-block__num">{distance(shop.campus_distance_m)}</span>
                    <span className="stat-block__label">
                      <Icon name="route" />
                      距苏州中学本部 · 步行 {shop.campus_walk_min} 分钟
                    </span>
                  </div>
                  <div className="stat-block">
                    <span className="stat-block__num">{distance(shop.metro_distance_m)}</span>
                    <span className="stat-block__label">
                      <Icon name="compass" />距 {shop.metro_station} {shop.metro_exit} 步行{' '}
                      {shop.metro_walk_min} 分钟
                    </span>
                  </div>
                </div>
                <div className="shop-detail__engagement" id="detailEngagementStats">
                  <span>
                    <Icon name="heart" />
                    <b>{shop.likes_count}</b>
                    <small>点赞</small>
                  </span>
                  <span>
                    <Icon name="message" />
                    <b>{shop.reviews_count}</b>
                    <small>评价</small>
                  </span>
                  <span>
                    <Icon name="star" />
                    <b>
                      {shop.rating_avg == null ? '暂无评分' : Number(shop.rating_avg).toFixed(1)}
                    </b>
                    <small>{shop.ratings_count} 次评分</small>
                  </span>
                </div>
                <div className="row row--sm u-mt-4">
                  <SiteLink
                    className="btn btn--sm"
                    href={`https://uri.amap.com/marker?position=${shop.lng},${shop.lat}&name=${encodeURIComponent(shop.name)}&coordinate=gaode&callnative=0`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="external" />
                    在高德地图打开
                  </SiteLink>
                  {shop.dianping_url && (
                    <SiteLink
                      className="btn btn--sm"
                      href={shop.dianping_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      大众点评
                    </SiteLink>
                  )}
                </div>
                <p className="u-muted u-fs-xs u-mt-2">
                  距离与步行时间按高德地图步行路线录入（步行距离，非直线距离）
                </p>
              </article>
              <>
                <section className="card">
                  <div className="shop-section__head">
                    <h2 className="section__title" id="mapTitle">
                      位置与路线
                    </h2>
                  </div>
                  <ShopMap meta={meta.data} shops={[shop]} id="detailMap" detail />
                </section>
                <>
                  <nav className="subnav" id="shopSubnav" aria-label="店铺分区">
                    <div className="tabs" role="tablist" aria-label="内容分区">
                      {[
                        { id: 'shopDishes', label: '菜品', count: shop.dishes?.length || 0 },
                        { id: 'reviewsPanel', label: '评价', count: shop.reviews_count },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="tab"
                          role="tab"
                          aria-selected={false}
                          data-target={t.id}
                          onClick={() =>
                            document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' })
                          }
                        >
                          {t.label}
                          <span className="tab__count">{t.count}</span>
                        </button>
                      ))}
                    </div>
                  </nav>
                  <div
                    id="shopLayout"
                    className={`shop-layout${user?.shop_layout_mode === 'auto' ? ' shop-layout--auto' : layout === 'split' ? ' shop-layout--split' : ''}`}
                  >
                    <section
                      className="card shop-section shop-col--sticky"
                      id="shopDishes"
                      aria-labelledby="dishesTitle"
                    >
                      <div className="shop-section__head">
                        <h2 className="section__title" id="dishesTitle">
                          菜品
                        </h2>
                      </div>
                      <Empty
                        icon="utensils"
                        title="暂无菜品"
                        description="该店铺的菜品目录正在完善中。"
                      />
                    </section>
                    <section
                      className="card shop-review-card shop-section"
                      id="reviewsPanel"
                      aria-labelledby="reviewsTitle"
                    >
                      <div className="shop-section__head">
                        <h2 className="section__title" id="reviewsTitle">
                          同学评价
                        </h2>
                        <div className="row row--sm">
                          <button
                            type="button"
                            className="btn btn--sm"
                            id="likeShopButton"
                            hidden={!query.data?.can_interact}
                            aria-pressed={shop.user_liked}
                            disabled={like.isPending}
                            onClick={() =>
                              query.data?.can_interact
                                ? like.mutate()
                                : toast('学生及以上权限可点赞或评价', 'error')
                            }
                          >
                            <Icon name="heart" />
                            {shop.user_liked ? '已点赞' : '点赞'} {shop.likes_count}
                          </button>
                          <CollectButton shopId={shop.id} variant="btn" />
                        </div>
                      </div>
                      <p id="reviewSummary" className="u-muted u-fs-sm" role="status">
                        {shop.likes_count || 0} 个赞 · {shop.reviews_count || 0} 条评价 ·{' '}
                        {shop.rating_avg == null
                          ? '暂无评分'
                          : `${Number(shop.rating_avg).toFixed(1)} / 5（${shop.ratings_count || 0} 次评分）`}
                      </p>
                      {query.data?.can_interact ? (
                        <ShopReviewForm
                          key={`${mine?.id || 'new'}:${mine?.updated_at || mine?.created_at || ''}`}
                          shopId={shop.id}
                          mine={mine}
                          onSaved={refresh}
                          onDelete={() => setConfirm(true)}
                        />
                      ) : (
                        <div className="callout">
                          <span id="reviewAccess" className="callout__text">
                            {token
                              ? '学生及以上权限可点赞或评价'
                              : '登录并完成学生认证后可点赞或评价'}
                          </span>
                          <SiteLink
                            className="btn btn--sm"
                            href={token ? '/student_verify.html' : loginUrl()}
                          >
                            {token ? '学生认证' : '去登录'}
                          </SiteLink>
                        </div>
                      )}
                      {!query.data?.can_interact && <form id="reviewForm" hidden />}
                      <div className="review-list" id="reviewList">
                        {reviews.isPending ? (
                          <Loading />
                        ) : reviews.error ? (
                          <ErrorState error={reviews.error} retry={reviews.refetch} />
                        ) : reviewRows.length ? (
                          reviewRows.map((r) => (
                            <article
                              id={`review-${r.id}`}
                              tabIndex={-1}
                              className={`shop-review-item review-target${r.id === targetId ? ' is-highlighted' : ''}`}
                              key={r.id}
                            >
                              <div className="shop-review-item__head">
                                <UserLine user={{ ...r, id: r.user_id }} time={r.created_at} />
                                <span
                                  className="shop-review-item__stars"
                                  aria-label={`${r.rating} 星`}
                                >
                                  {'★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)}
                                </span>
                              </div>
                              {r.content && (
                                <p className="shop-review-item__content">{r.content}</p>
                              )}
                              {r.guests && r.total_price != null && (
                                <p className="u-muted u-fs-sm">
                                  {r.guests} 人 · 合计 {money(r.total_price)} · 人均{' '}
                                  {money(Number(r.total_price) / r.guests)}
                                </p>
                              )}
                              <Picture
                                src={r.image_url}
                                caption={`${shop.name}的评价配图`}
                                className="shop-review-thumb"
                              />
                            </article>
                          ))
                        ) : (
                          <Empty title="还没有评价" icon="message" />
                        )}
                      </div>
                      {reviews.hasNextPage && (
                        <button
                          type="button"
                          className="btn"
                          id="moreReviews"
                          disabled={reviews.isFetchingNextPage}
                          onClick={() => reviews.fetchNextPage()}
                        >
                          加载更多
                        </button>
                      )}
                    </section>
                  </div>
                </>
              </>
            </>
          )
        )}
      </div>
      {confirm && (
        <Confirm
          title="删除自己的评价？"
          message="删除后无法恢复。"
          onClose={() => setConfirm(false)}
          onConfirm={() => remove.mutate()}
        />
      )}
    </main>
  );
}
function ShopReviewForm({
  shopId,
  mine,
  onSaved,
  onDelete,
}: {
  shopId: number;
  mine?: Review | null;
  onSaved: () => unknown;
  onDelete: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [hasImage, setHasImage] = useState(!!mine?.image_url);
  const [removed, setRemoved] = useState(false);
  const [guests, setGuests] = useState(mine?.guests ? String(mine.guests) : '');
  const [total, setTotal] = useState(mine?.total_price != null ? String(mine.total_price) : '');
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const body = new FormData(form);
      if (file && hasImage) body.set('image', file);
      else body.delete('image');
      if (removed || !hasImage) body.set('remove_image', '1');
      return api(`/api/shops/${shopId}/reviews`, { method: 'POST', body });
    },
    onSuccess: () => {
      toast('评价已提交审核，原评价在通过前保持不变');
      onSaved();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <form
      id="reviewForm"
      className="shop-review-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!preparingImage) mutation.mutate(e.currentTarget);
      }}
    >
      <fieldset className="shop-rating-fieldset">
        <legend className="field__label">评分（必选）</legend>
        <div className="shop-rating-choices" role="radiogroup" aria-label="评分 1 到 5 星">
          {[5, 4, 3, 2, 1].map((n) => (
            <Fragment key={n}>
              <input
                className="shop-rating-input"
                type="radio"
                name="rating"
                id={`shopRating${n}`}
                value={n}
                defaultChecked={mine?.rating === n}
                required
              />
              <label className="shop-rating-choice" htmlFor={`shopRating${n}`}>
                <span className="sr-only">{n} 星</span>
                <span aria-hidden="true">★</span>
              </label>
            </Fragment>
          ))}
        </div>
      </fieldset>
      <label className="field__label" htmlFor="reviewContent">
        评价内容 <span className="field__opt">（选填，500 字以内）</span>
      </label>
      <textarea
        className="input shop-review-textarea"
        rows={4}
        id="reviewContent"
        name="content"
        maxLength={500}
        defaultValue={mine?.content || ''}
        aria-label="评价内容"
        placeholder="说说你的就餐体验（可选，最多 500 字）"
      />
      <div className="shop-review-numbers">
        <label className="field shop-review-numbers__field">
          就餐人数
          <input
            className="input"
            id="reviewGuests"
            type="number"
            name="guests"
            min="1"
            max="99"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
          />
        </label>
        <label className="field shop-review-numbers__field">
          总价（元）
          <input
            className="input"
            id="reviewTotalPrice"
            type="number"
            name="total_price"
            min="0"
            max="100000"
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>
      </div>
      <p id="reviewPerPerson" className="u-muted" hidden={!guests || !total}>
        人均约 {money(Number(total) / Number(guests))}（{guests} 人 · 合计 {money(total)}）
      </p>
      <label className="check-row">
        <span className="check-row__text">
          <span className="check-row__title">评价带图</span>
          <span className="check-row__desc">选填一张实拍照片（JPG / PNG，超出 2 MB 自动压缩）</span>
        </span>
        <input
          className="check"
          type="checkbox"
          id="reviewHasImage"
          checked={hasImage}
          onChange={(e) => {
            setHasImage(e.target.checked);
            if (!e.target.checked) setFile(null);
          }}
        />
      </label>
      <div id="reviewUploadField" hidden={!hasImage}>
        <Upload file={file} onChange={setFile} onProcessingChange={setPreparingImage}>
          {mine?.image_url && !removed && !file && (
            <>
              <div className="upload-preview">
                <img className="upload-preview__img" src={mine.image_url} alt="当前评价配图" />
                <div className="upload-preview__meta">当前评价配图</div>
              </div>
              <button
                type="button"
                className="btn btn--danger-quiet btn--sm"
                data-remove-existing-image
                onClick={() => setRemoved(true)}
              >
                移除配图
              </button>
            </>
          )}
        </Upload>
      </div>
      <div className="row">
        <Submit pending={mutation.isPending} disabled={preparingImage} id="reviewSubmit">
          {mine ? '提交评价修改审核' : '提交评价审核'}
        </Submit>
        {mine && (
          <button
            type="button"
            className="btn btn--danger-quiet"
            id="deleteMyReview"
            onClick={onDelete}
          >
            删除我的评价
          </button>
        )}
      </div>
    </form>
  );
}
