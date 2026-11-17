export const shopSorts = {
  campus: '距离',
  likes: '点赞数',
  reviews: '评价数',
  rating: '评分',
  walk: '步行时间',
  az: '拼音排序',
  metro: '距地铁最近',
  new: '最新收录',
} as const;

export type ShopSort = keyof typeof shopSorts;
export type ShopOrder = 'asc' | 'desc';

export function shopSortHasOrder(sort: string) {
  return ['campus', 'likes', 'reviews', 'rating', 'walk'].includes(sort);
}

export function defaultShopOrder(sort: string): ShopOrder {
  return ['likes', 'reviews', 'rating', 'new'].includes(sort) ? 'desc' : 'asc';
}

/** Unknown methods reset the complete sort; legacy campus aliases keep their meaning. */
export function normalizeShopSorting(
  value: unknown = 'campus',
  direction?: unknown,
): { sort: ShopSort; order: ShopOrder } {
  const key = value === 'north' || value === 'east' ? 'campus' : value;
  if (typeof key !== 'string' || !Object.hasOwn(shopSorts, key))
    return { sort: 'campus', order: 'asc' };
  const sort = key as ShopSort;
  const order =
    shopSortHasOrder(sort) && (direction === 'asc' || direction === 'desc')
      ? direction
      : defaultShopOrder(sort);
  return { sort, order };
}
