export const roleWeights = { operator: 5, admin: 4, student: 3, user: 2, guest: 1 } as const;
export type Role = keyof typeof roleWeights;
export const roleLabels: Record<Role, string> = {
  operator: '运营者',
  admin: '管理员',
  student: '学生',
  user: '普通用户',
  guest: '访客',
};
export const roleHues: Record<Role, string> = {
  operator: 'wisteria',
  admin: 'ochre',
  student: 'bamboo',
  user: 'stone',
  guest: 'stone',
};
export const passwordRules = (value: string) => [
  {
    label: '至少 8 个字符',
    passed: value.length >= 8 && new TextEncoder().encode(value).length <= 72,
  },
  { label: '至少 1 个大写字母', passed: /[A-Z]/.test(value) },
  { label: '至少 1 个小写字母', passed: /[a-z]/.test(value) },
  { label: '至少 1 个数字', passed: /[0-9]/.test(value) },
  { label: '首尾没有空白', passed: !!value && value.trim() === value },
];
export const validPassword = (value: unknown): value is string =>
  typeof value === 'string' && passwordRules(value).every((rule) => rule.passed);
export const pageSize = 20;
export const titleHues = [
  'teal',
  'vermilion',
  'ochre',
  'bamboo',
  'wisteria',
  'indigo',
  'rose',
  'stone',
] as const;
export interface Title {
  id: number;
  name: string;
  color?: string;
  hue?: string;
  description?: string;
  rule_key?: string;
  source?: string;
  owned?: boolean;
  progress?: number;
}
export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar_url?: string;
  role: Role;
  show_role?: number;
  signature?: string;
  display_id?: string;
  user_title?: Title | null;
  title?: Title | null;
  status?: 'active' | 'banned';
  default_page?: string;
  recipe_default_view?: 'all' | 'reviews' | 'weekly' | 'daily';
  shop_default_sort?: string;
  shop_default_type?: string;
  shop_layout?: 'stacked' | 'split';
  shop_layout_mode?: 'manual' | 'auto';
  default_collection_shops?: number | null;
  collection_default_public?: number;
}
export interface Dish {
  id: number;
  name: string;
  initial: string;
  pinyin: string;
  pinyin_initials: string;
  sort_key: string;
  rating_avg?: number | null;
  reviews_count?: number;
}
export interface Review {
  id: number;
  user_id: number;
  username: string;
  nickname?: string;
  role: Role;
  show_role?: number;
  avatar_url?: string;
  user_title?: Title | null;
  title?: Title | null;
  name?: string;
  rating: number;
  comment?: string;
  content?: string;
  image_url?: string;
  created_at: number;
  updated_at?: number;
  dish_id?: number | null;
  guests?: number | null;
  total_price?: number | null;
}
export interface Shop {
  id: number;
  name: string;
  type: string;
  address: string;
  lat: number;
  lng: number;
  campus_distance_m: number;
  campus_walk_min: number;
  metro_distance_m: number;
  metro_walk_min: number;
  metro_station: string;
  metro_exit: string;
  location_note?: string;
  dianping_url?: string;
  dishes?: { name: string; price?: number }[];
  likes_count: number;
  reviews_count: number;
  ratings_count: number;
  rating_avg: number | null;
  user_liked: boolean;
  user_rating?: number | null;
}
export function atLeast(role: Role | undefined, required: Role) {
  return roleWeights[role ?? 'guest'] >= roleWeights[required];
}

export const hueLabels: Record<string, string> = {
  teal: '黛青',
  vermilion: '朱印',
  ochre: '赭石',
  bamboo: '竹青',
  wisteria: '紫藤',
  indigo: '靛蓝',
  rose: '绛红',
  stone: '石灰',
};
