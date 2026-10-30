import { SiteLink } from './SiteLink';
import type { Shop } from '@sytime/shared';
import { distance } from '../lib/api';
import { CollectButton } from './Collections';
import { shopHue } from './ShopMap';
import { Icon } from './ui';
export function ShopCard({ shop, collect = true }: { shop: Shop; collect?: boolean }) {
  return (
    <article className="card card--interactive shop">
      <div className="shop__top">
        <h2 className="card__title">
          <SiteLink className="card__link" href={`shop.html?id=${shop.id}`}>
            {shop.name}
          </SiteLink>
        </h2>
        <span className="tag" data-hue={shopHue(shop.type)}>
          {shop.type}
        </span>
      </div>
      <p className="shop__addr">
        <Icon name="map-pin" />
        <span>
          {shop.address}
          {shop.location_note && <small>{shop.location_note}</small>}
        </span>
      </p>
      <div className="shop__stats">
        <span className="stat">
          <Icon name="route" />
          <b>{distance(shop.campus_distance_m)}</b>
          <small>距苏州中学本部 · 步行 {shop.campus_walk_min} 分钟</small>
        </span>
      </div>
      <p className="shop__addr">
        <Icon name="compass" />
        <span>
          最近地铁：{shop.metro_station} {shop.metro_exit}
          <small>
            步行 {distance(shop.metro_distance_m)} · {shop.metro_walk_min} 分钟
          </small>
        </span>
      </p>
      {shop.dianping_url && (
        <SiteLink
          className="shop__dianping"
          href={shop.dianping_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="external" className="icon--sm" />
          大众点评
        </SiteLink>
      )}
      <div className="shop__engagement" aria-label="店铺互动统计">
        <span>
          <Icon name="heart" />
          <b>{shop.likes_count || 0}</b>
          <small>点赞</small>
        </span>
        <span>
          <Icon name="message" />
          <b>{shop.reviews_count || 0}</b>
          <small>评价</small>
        </span>
        <span>
          <Icon name="star" />
          <b>{shop.rating_avg == null ? '暂无' : `${Number(shop.rating_avg).toFixed(1)} / 5`}</b>
          <small>{shop.ratings_count || 0} 次评分</small>
        </span>
      </div>
      {collect && (
        <div className="row row--end">
          <CollectButton shopId={shop.id} />
        </div>
      )}
    </article>
  );
}
