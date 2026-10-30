import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  unique,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const announcements = sqliteTable(
  'announcements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    publish_date: text('publish_date')
      .notNull()
      .default(sql`(date('now'))`),
  },
  (table) => [index('idx_announcements_date').on(table.publish_date)],
);

export const banAppeals = sqliteTable(
  'ban_appeals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    appeal_reason: text('appeal_reason').notNull(),
    appeal_image: text('appeal_image')
      .notNull()
      .default(sql`''`),
    status: text('status')
      .notNull()
      .default(sql`'pending'`),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_ban_appeals_user').on(table.user_id),
    index('idx_ban_appeals_status').on(table.status),
  ],
);

export const collectionItems = sqliteTable(
  'collection_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    collection_id: integer('collection_id').notNull(),
    item_type: text('item_type').notNull(),
    item_id: integer('item_id').notNull(),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_collection_items_item').on(table.item_type, table.item_id),
    index('idx_collection_items_collection').on(table.collection_id, table.created_at),
    unique('collection_items_collection_id_item_type_item_id_unique').on(
      table.collection_id,
      table.item_type,
      table.item_id,
    ),
    check('collection_items_type_check', sql`item_type IN ('shop')`),
  ],
);

export const collections = sqliteTable(
  'collections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    section: text('section').notNull(),
    name: text('name').notNull(),
    is_public: integer('is_public')
      .notNull()
      .default(sql`0`),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_collections_user_section').on(table.user_id, table.section),
    check('collections_section_check', sql`section IN ('shops')`),
  ],
);

export const dishes = sqliteTable(
  'dishes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    name_key: text('name_key').notNull(),
    initial: text('initial').notNull(),
    pinyin: text('pinyin').notNull(),
    pinyin_initials: text('pinyin_initials').notNull(),
    sort_key: text('sort_key').notNull(),
    created_at: integer('created_at').notNull(),
  },
  (table) => [unique('dishes_name_key_unique').on(table.name_key)],
);

export const inviteCodes = sqliteTable(
  'invite_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull(),
    max_uses: integer('max_uses')
      .notNull()
      .default(sql`0`),
    used_count: integer('used_count')
      .notNull()
      .default(sql`0`),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [unique('invite_codes_code_unique').on(table.code)],
);

export const menuImportAudit = sqliteTable('menu_import_audit', {
  id: text('id').primaryKey(),
  source_id: text('source_id')
    .notNull()
    .references(() => menuSources.id),
  actor_id: integer('actor_id').notNull(),
  job_id: text('job_id'),
  created_at: integer('created_at').notNull(),
  records_count: integer('records_count').notNull(),
  records_json: text('records_json').notNull(),
  revision: integer('revision').notNull(),
});

export const menuJobItems = sqliteTable(
  'menu_job_items',
  {
    job_id: text('job_id').references(() => menuSyncJobs.id),
    source_id: text('source_id'),
    article_id: integer('article_id').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    phase: text('phase')
      .notNull()
      .default(sql`'fetch'`),
    records_count: integer('records_count')
      .notNull()
      .default(sql`0`),
    error: text('error')
      .notNull()
      .default(sql`''`),
    artifact_path: text('artifact_path'),
  },
  (table) => [primaryKey({ columns: [table.job_id, table.source_id] })],
);

export const menuRecords = sqliteTable(
  'menu_records',
  {
    source_id: text('source_id').references(() => menuSources.id),
    record_key: text('record_key'),
    dish_id: integer('dish_id')
      .notNull()
      .references(() => dishes.id),
    date: text('date'),
    weekday: text('weekday'),
    time_json: text('time_json').notNull(),
    place: text('place'),
    group_name: text('group_name'),
    price: real('price'),
    spicy: integer('spicy'),
  },
  (table) => [
    primaryKey({ columns: [table.source_id, table.record_key] }),
    index('idx_menu_records_dish').on(table.dish_id),
  ],
);

export const menuSources = sqliteTable(
  'menu_sources',
  {
    id: text('id').primaryKey(),
    article_id: integer('article_id'),
    title: text('title').notNull(),
    url: text('url').notNull(),
    published_date: text('published_date'),
    content_hash: text('content_hash'),
    updated_at: integer('updated_at'),
    checked_at: integer('checked_at'),
    records_count: integer('records_count')
      .notNull()
      .default(sql`0`),
    last_error: text('last_error')
      .notNull()
      .default(sql`''`),
    kind: text('kind')
      .notNull()
      .default(sql`'school'`),
    publication_origin: text('publication_origin')
      .notNull()
      .default(sql`'automatic'`),
    revision: integer('revision')
      .notNull()
      .default(sql`0`),
  },
  (table) => [unique('menu_sources_article_id_unique').on(table.article_id)],
);

export const menuSyncJobs = sqliteTable(
  'menu_sync_jobs',
  {
    id: text('id').primaryKey(),
    trigger: text('trigger').notNull(),
    auto_day: text('auto_day'),
    status: text('status').notNull(),
    phase: text('phase')
      .notNull()
      .default(sql`'queued'`),
    created_at: integer('created_at').notNull(),
    started_at: integer('started_at'),
    finished_at: integer('finished_at'),
    config_revision: integer('config_revision').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    total: integer('total')
      .notNull()
      .default(sql`0`),
    processed: integer('processed')
      .notNull()
      .default(sql`0`),
    succeeded: integer('succeeded')
      .notNull()
      .default(sql`0`),
    failed: integer('failed')
      .notNull()
      .default(sql`0`),
    cancel_requested: integer('cancel_requested')
      .notNull()
      .default(sql`0`),
    error: text('error')
      .notNull()
      .default(sql`''`),
  },
  (table) => [unique('menu_sync_jobs_auto_day_unique').on(table.auto_day)],
);

export const menuSyncLease = sqliteTable(
  'menu_sync_lease',
  {
    id: integer('id').primaryKey(),
    owner: text('owner').notNull(),
    expires_at: integer('expires_at').notNull(),
  },
  (_table) => [check('menu_sync_lease_id_check', sql`id=1`)],
);

export const menuSyncState = sqliteTable('menu_sync_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    type: text('type').notNull(),
    actors: text('actors')
      .notNull()
      .default(sql`'[]'`),
    count: integer('count')
      .notNull()
      .default(sql`1`),
    target_kind: text('target_kind')
      .notNull()
      .default(sql`''`),
    target_id: integer('target_id'),
    title: text('title')
      .notNull()
      .default(sql`''`),
    body: text('body')
      .notNull()
      .default(sql`''`),
    snippet: text('snippet')
      .notNull()
      .default(sql`''`),
    important: integer('important')
      .notNull()
      .default(sql`0`),
    read_at: integer('read_at'),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_messages_created').on(table.user_id, table.created_at),
    index('idx_messages_user').on(table.user_id, table.read_at),
  ],
);

export const recipes = sqliteTable(
  'recipes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    username: text('username').notNull(),
    name: text('name').notNull(),
    rating: integer('rating')
      .notNull()
      .default(sql`0`),
    comment: text('comment'),
    image_url: text('image_url'),
    is_weekly: integer('is_weekly')
      .notNull()
      .default(sql`0`),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
    dish_id: integer('dish_id').references(() => dishes.id),
  },
  (table) => [
    index('idx_recipes_dish').on(
      table.dish_id,
      sql`${table.created_at} DESC`,
      sql`${table.id} DESC`,
    ),
    index('idx_recipes_weekly').on(table.is_weekly),
  ],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

export const shopLikes = sqliteTable(
  'shop_likes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    shop_id: integer('shop_id').notNull(),
    user_id: integer('user_id').notNull(),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_shop_likes_shop').on(table.shop_id),
    unique('shop_likes_shop_id_user_id_unique').on(table.shop_id, table.user_id),
  ],
);

export const shopReviews = sqliteTable(
  'shop_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    shop_id: integer('shop_id').notNull(),
    user_id: integer('user_id').notNull(),
    rating: integer('rating').notNull(),
    content: text('content')
      .notNull()
      .default(sql`''`),
    guests: integer('guests'),
    total_price: real('total_price'),
    image_url: text('image_url')
      .notNull()
      .default(sql`''`),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
    updated_at: integer('updated_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_shop_reviews_shop').on(table.shop_id),
    unique('shop_reviews_shop_id_user_id_unique').on(table.shop_id, table.user_id),
    check('shop_reviews_rating_check', sql`rating BETWEEN 1 AND 5`),
  ],
);

export const shops = sqliteTable(
  'shops',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    address: text('address').notNull(),
    location_note: text('location_note')
      .notNull()
      .default(sql`''`),
    dianping_url: text('dianping_url')
      .notNull()
      .default(sql`''`),
    type: text('type').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    north_gate_distance_m: integer('north_gate_distance_m').notNull(),
    north_gate_walk_min: integer('north_gate_walk_min').notNull(),
    east_gate_distance_m: integer('east_gate_distance_m').notNull(),
    east_gate_walk_min: integer('east_gate_walk_min').notNull(),
    campus_distance_m: integer('campus_distance_m')
      .notNull()
      .default(sql`0`),
    campus_walk_min: integer('campus_walk_min')
      .notNull()
      .default(sql`0`),
    metro_station: text('metro_station')
      .notNull()
      .default(sql`''`),
    metro_exit: text('metro_exit')
      .notNull()
      .default(sql`''`),
    metro_distance_m: integer('metro_distance_m').notNull(),
    metro_walk_min: integer('metro_walk_min').notNull(),
    created_by: integer('created_by'),
    created_by_name: text('created_by_name')
      .notNull()
      .default(sql`''`),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
    updated_at: integer('updated_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_shops_campus').on(table.campus_distance_m),
    index('idx_shops_metro').on(table.metro_distance_m),
    index('idx_shops_east').on(table.east_gate_distance_m),
    index('idx_shops_north').on(table.north_gate_distance_m),
    uniqueIndex('idx_shops_name').on(table.name),
  ],
);

export const studentApplications = sqliteTable(
  'student_applications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    student_id: text('student_id').notNull(),
    class_name: text('class_name').notNull(),
    real_name: text('real_name').notNull(),
    extra_info: text('extra_info'),
    reject_reason: text('reject_reason'),
    status: text('status')
      .notNull()
      .default(sql`'pending'`),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [index('idx_student_applications_user').on(table.user_id)],
);

export const tickets = sqliteTable(
  'tickets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    username: text('username')
      .notNull()
      .default(sql`''`),
    title: text('title').notNull(),
    content: text('content').notNull(),
    visibility: text('visibility')
      .notNull()
      .default(sql`'admin'`),
    status: text('status')
      .notNull()
      .default(sql`'pending'`),
    reply_content: text('reply_content')
      .notNull()
      .default(sql`''`),
    reply_image: text('reply_image')
      .notNull()
      .default(sql`''`),
    reply_by: text('reply_by')
      .notNull()
      .default(sql`''`),
    replied_at: integer('replied_at'),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_tickets_user').on(table.user_id),
    index('idx_tickets_status').on(table.status),
  ],
);

export const titles = sqliteTable(
  'titles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key')
      .notNull()
      .default(sql`''`),
    name: text('name').notNull(),
    hue: text('hue')
      .notNull()
      .default(sql`'stone'`),
    source: text('source')
      .notNull()
      .default(sql`'grant'`),
    rule: text('rule')
      .notNull()
      .default(sql`''`),
    description: text('description')
      .notNull()
      .default(sql`''`),
    owner_user_id: integer('owner_user_id'),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_titles_owner').on(table.owner_user_id),
    uniqueIndex('idx_titles_owner_name')
      .on(table.owner_user_id, table.name)
      .where(sql`owner_user_id IS NOT NULL`),
    uniqueIndex('idx_titles_public_name')
      .on(table.name)
      .where(sql`owner_user_id IS NULL`),
    uniqueIndex('idx_titles_key')
      .on(table.key)
      .where(sql`key <> ''`),
  ],
);

export const userLoginDays = sqliteTable(
  'user_login_days',
  {
    user_id: integer('user_id'),
    day: text('day'),
  },
  (table) => [primaryKey({ columns: [table.user_id, table.day] })],
);

export const userPermissions = sqliteTable(
  'user_permissions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    permission: text('permission').notNull(),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_user_permissions_user').on(table.user_id),
    unique('user_permissions_user_id_permission_unique').on(table.user_id, table.permission),
  ],
);

export const userTitles = sqliteTable(
  'user_titles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull(),
    title_id: integer('title_id').notNull(),
    granted_by: integer('granted_by'),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [
    index('idx_user_titles_title').on(table.title_id),
    index('idx_user_titles_user').on(table.user_id),
    unique('user_titles_user_id_title_id_unique').on(table.user_id, table.title_id),
  ],
);

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    display_id: text('display_id'),
    email: text('email'),
    password_hash: text('password_hash'),
    username: text('username'),
    nickname: text('nickname'),
    avatar_url: text('avatar_url')
      .notNull()
      .default(sql`''`),
    signature: text('signature'),
    role: text('role')
      .notNull()
      .default(sql`'user'`),
    default_page: text('default_page')
      .notNull()
      .default(sql`'index.html'`),
    default_floor: integer('default_floor')
      .notNull()
      .default(sql`1`),
    recipe_default_view: text('recipe_default_view')
      .notNull()
      .default(sql`'all'`),
    shop_default_sort: text('shop_default_sort')
      .notNull()
      .default(sql`'campus'`),
    shop_default_type: text('shop_default_type')
      .notNull()
      .default(sql`''`),
    shop_layout: text('shop_layout')
      .notNull()
      .default(sql`'stacked'`),
    shop_layout_mode: text('shop_layout_mode')
      .notNull()
      .default(sql`'manual'`),
    default_collection_shops: integer('default_collection_shops'),
    collection_default_public: integer('collection_default_public')
      .notNull()
      .default(sql`0`),
    status: text('status')
      .notNull()
      .default(sql`'active'`),
    ban_reason: text('ban_reason')
      .notNull()
      .default(sql`''`),
    ban_image: text('ban_image')
      .notNull()
      .default(sql`''`),
    allow_appeal: integer('allow_appeal')
      .notNull()
      .default(sql`1`),
    created_at: integer('created_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
    last_login_date: text('last_login_date')
      .notNull()
      .default(sql`''`),
    login_streak: integer('login_streak')
      .notNull()
      .default(sql`0`),
    show_role: integer('show_role')
      .notNull()
      .default(sql`1`),
    equipped_title_id: integer('equipped_title_id'),
  },
  (table) => [
    unique('users_username_unique').on(table.username),
    unique('users_email_unique').on(table.email),
    unique('users_display_id_unique').on(table.display_id),
  ],
);

export const weeklyMenuImages = sqliteTable(
  'weekly_menu_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id'),
    menu_start_date: text('menu_start_date').notNull(),
    menu_end_date: text('menu_end_date').notNull(),
    filename: text('filename').notNull(),
    uploaded_at: integer('uploaded_at')
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (table) => [index('idx_weekly_menu_dates').on(table.menu_start_date, table.menu_end_date)],
);
