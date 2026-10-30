const { query } = require('../../../../../packages/db/src/client.ts');
const { MenuError, nameFields, sha256, validateRecords } = require('./schema');
const SOURCE_PREFIX = 'szzx1000:36:';
function migrate(db) {
  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
      initial TEXT NOT NULL, pinyin TEXT NOT NULL, pinyin_initials TEXT NOT NULL, sort_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menu_sources (
      id TEXT PRIMARY KEY, article_id INTEGER UNIQUE, title TEXT NOT NULL, url TEXT NOT NULL,
      published_date TEXT, content_hash TEXT, updated_at INTEGER, checked_at INTEGER,
      records_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS menu_records (
      source_id TEXT NOT NULL REFERENCES menu_sources(id), record_key TEXT NOT NULL,
      dish_id INTEGER NOT NULL REFERENCES dishes(id), date TEXT, weekday TEXT, time_json TEXT NOT NULL,
      place TEXT, group_name TEXT, price REAL, spicy INTEGER,
      PRIMARY KEY (source_id, record_key)
    );
    CREATE INDEX IF NOT EXISTS idx_menu_records_dish ON menu_records(dish_id);
    CREATE TABLE IF NOT EXISTS menu_sync_jobs (
      id TEXT PRIMARY KEY, trigger TEXT NOT NULL, auto_day TEXT UNIQUE, status TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'queued', created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER,
      config_revision INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0, processed INTEGER NOT NULL DEFAULT 0,
      succeeded INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
      cancel_requested INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS menu_job_items (
      job_id TEXT NOT NULL REFERENCES menu_sync_jobs(id), source_id TEXT NOT NULL,
      article_id INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'fetch', records_count INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '', artifact_path TEXT, PRIMARY KEY (job_id, source_id)
    );
    CREATE TABLE IF NOT EXISTS menu_sync_lease (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS menu_sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  // Existing installations required an article ID. Manual batches have no school article.
  if (
    query(db, 'PRAGMA table_info(menu_sources)')
      .all()
      .find((column) => column.name === 'article_id').notnull
  ) {
    const foreignKeys = query(db, 'PRAGMA foreign_keys').get().foreign_keys;
    db.$client.exec('PRAGMA foreign_keys=OFF');
    try {
      db.$client.exec(`BEGIN IMMEDIATE;
        CREATE TABLE menu_sources_nullable (id TEXT PRIMARY KEY, article_id INTEGER UNIQUE, title TEXT NOT NULL, url TEXT NOT NULL,
          published_date TEXT, content_hash TEXT, updated_at INTEGER, checked_at INTEGER,
          records_count INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '');
        INSERT INTO menu_sources_nullable SELECT * FROM menu_sources;
        DROP TABLE menu_sources;
        ALTER TABLE menu_sources_nullable RENAME TO menu_sources;
        COMMIT;`);
    } catch (error) {
      db.$client.exec('ROLLBACK');
      throw error;
    } finally {
      db.$client.exec(`PRAGMA foreign_keys=${foreignKeys ? 'ON' : 'OFF'}`);
    }
  }
  const columns = query(db, 'PRAGMA table_info(menu_sources)')
    .all()
    .map((column) => column.name);
  for (const [name, definition] of Object.entries({
    kind: "TEXT NOT NULL DEFAULT 'school'",
    publication_origin: "TEXT NOT NULL DEFAULT 'automatic'",
    revision: 'INTEGER NOT NULL DEFAULT 0',
  })) {
    if (!columns.includes(name))
      db.$client.exec(`ALTER TABLE menu_sources ADD COLUMN ${name} ${definition}`);
  }
  db.$client.exec(`CREATE TABLE IF NOT EXISTS menu_import_audit (
    id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES menu_sources(id),actor_id INTEGER NOT NULL,
    job_id TEXT,created_at INTEGER NOT NULL,records_count INTEGER NOT NULL,records_json TEXT NOT NULL,revision INTEGER NOT NULL
  );`);
}
const sourceId = (id) => SOURCE_PREFIX + id;
function sourceMetadata(source) {
  if (source.kind === 'manual') {
    if (!/^manual:[a-f0-9-]{36}$/.test(source.id || ''))
      throw new MenuError('手动菜单批次编号无效');
    return {
      id: source.id,
      article_id: null,
      title: String(source.title || '手动导入菜单').slice(0, 300),
      url: '',
      published_date: null,
      kind: 'manual',
    };
  }
  if (
    !Number.isSafeInteger(source.article_id) ||
    source.article_id < 1 ||
    source.article_id > 999999999
  )
    throw new MenuError('菜单文章编号无效');
  return {
    id: sourceId(source.article_id),
    article_id: source.article_id,
    title: String(source.title || '').slice(0, 300),
    url: `https://www.szzx1000.cn/e/action/ShowInfo.php?classid=36&id=${source.article_id}`,
    published_date: source.published_date || null,
  };
}
function touchSource(db, source, now = Date.now()) {
  const meta = sourceMetadata(source);
  query(
    db,
    `INSERT INTO menu_sources (id,article_id,title,url,published_date,checked_at,kind) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,published_date=COALESCE(excluded.published_date,menu_sources.published_date),checked_at=excluded.checked_at`,
  ).run(
    meta.id,
    meta.article_id,
    meta.title,
    meta.url,
    meta.published_date,
    now,
    meta.kind || 'school',
  );
  return meta;
}
function publishSource(
  db,
  source,
  records,
  { historical = false, now = Date.now(), insertOnly = false, manualAudit } = {},
) {
  const meta = sourceMetadata(source);
  if (
    insertOnly &&
    query(db, 'SELECT content_hash FROM menu_sources WHERE id=?').get(meta.id)?.content_hash
  )
    return false;
  if (!/^[a-f0-9]{64}$/.test(source.content_hash || '')) throw new MenuError('菜单来源摘要无效');
  records = validateRecords(records, { historical });
  db.$client.exec('BEGIN IMMEDIATE');
  try {
    if (manualAudit) {
      if (query(db, 'SELECT owner FROM menu_sync_lease WHERE expires_at>?').get(now))
        throw new MenuError('同步任务正在运行，请结束后再发布手动菜单', 409);
      const current = query(db, 'SELECT revision FROM menu_sources WHERE id=?').get(meta.id);
      if ((current?.revision ?? null) !== manualAudit.expected_revision)
        throw new MenuError('菜单已经更新，请重新载入并校验后发布', 409);
    }
    touchSource(db, source, now);
    query(db, 'DELETE FROM menu_records WHERE source_id=?').run(meta.id);
    const insertDish = query(
      db,
      `INSERT OR IGNORE INTO dishes (name,name_key,initial,pinyin,pinyin_initials,sort_key,created_at) VALUES (?,?,?,?,?,?,?)`,
    );
    const findDish = query(db, 'SELECT id FROM dishes WHERE name_key=?');
    const insertRecord = query(
      db,
      `INSERT INTO menu_records (source_id,record_key,dish_id,date,weekday,time_json,place,group_name,price,spicy) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const record of records) {
      const fields = nameFields(record.name);
      insertDish.run(
        fields.name,
        fields.name_key,
        fields.initial,
        fields.pinyin,
        fields.pinyin_initials,
        fields.sort_key,
        now,
      );
      const dish = findDish.get(fields.name_key);
      insertRecord.run(
        meta.id,
        sha256(JSON.stringify(record)),
        dish.id,
        record.date,
        record.weekday,
        JSON.stringify(record.time),
        record.place,
        record.group,
        record.price,
        record.spicy === null ? null : Number(record.spicy),
      );
    }
    query(
      db,
      "UPDATE menu_sources SET content_hash=?,records_count=?,updated_at=?,last_error='',revision=revision+1,publication_origin=? WHERE id=?",
    ).run(
      source.content_hash,
      records.length,
      now,
      manualAudit ? 'manual' : historical ? 'historical' : 'automatic',
      meta.id,
    );
    if (manualAudit) {
      const revision = query(db, 'SELECT revision FROM menu_sources WHERE id=?').get(
        meta.id,
      ).revision;
      query(
        db,
        'INSERT INTO menu_import_audit(id,source_id,actor_id,job_id,created_at,records_count,records_json,revision) VALUES(?,?,?,?,?,?,?,?)',
      ).run(
        manualAudit.id,
        meta.id,
        manualAudit.actor_id,
        manualAudit.job_id || null,
        now,
        records.length,
        JSON.stringify(records),
        revision,
      );
    }
    db.$client.exec('COMMIT');
    return records.length;
  } catch (error) {
    db.$client.exec('ROLLBACK');
    throw error;
  }
}
function bootstrap(db, seed) {
  if (seed.schema_version !== 1 || !Array.isArray(seed.sources) || seed.sources.length !== 10)
    throw new MenuError('历史菜单种子格式无效');
  for (const source of seed.sources)
    publishSource(db, source, source.records, {
      historical: true,
      insertOnly: true,
      now: Date.parse(seed.generated_at),
    });
  if (!query(db, "SELECT value FROM menu_sync_state WHERE key='discovery_anchor'").get()) {
    query(db, "INSERT INTO menu_sync_state (key,value) VALUES ('discovery_anchor',?)").run(
      String(seed.sources[0].article_id),
    );
  }
}
function catalog(db) {
  const dishes = query(
    db,
    `SELECT id,name,initial,pinyin,pinyin_initials,sort_key FROM dishes d
    WHERE EXISTS (SELECT 1 FROM menu_records r WHERE r.dish_id=d.id)
    ORDER BY CASE WHEN initial='#' THEN 1 ELSE 0 END,initial COLLATE BINARY,sort_key COLLATE BINARY,name_key COLLATE BINARY,id`,
  ).all();
  if (query(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'").get()) {
    const ratings = new Map(
      query(
        db,
        `SELECT dish_id,COUNT(*) AS reviews_count,
      ROUND(AVG(rating),1) AS rating_avg FROM recipes WHERE is_weekly=0 GROUP BY dish_id`,
      )
        .all()
        .map((row) => [row.dish_id, row]),
    );
    for (const dish of dishes)
      Object.assign(dish, {
        rating_avg: ratings.get(dish.id)?.rating_avg ?? null,
        reviews_count: ratings.get(dish.id)?.reviews_count ?? 0,
      });
  }
  const meta = query(
    db,
    'SELECT COUNT(*) AS source_count,MAX(updated_at) AS updated_at,SUM(records_count) AS records_count FROM menu_sources WHERE content_hash IS NOT NULL',
  ).get();
  const sync = query(
    db,
    "SELECT MAX(finished_at) AS time FROM menu_sync_jobs WHERE status IN ('succeeded','partial') AND succeeded>0",
  ).get();
  return {
    dishes,
    meta: { ...meta, total: dishes.length, last_sync_success_at: sync.time || null },
  };
}
const lastAutoDay = (db) => query(db, 'SELECT MAX(auto_day) AS day FROM menu_sync_jobs').get().day;
module.exports = {
  migrate,
  sourceId,
  sourceMetadata,
  touchSource,
  publishSource,
  bootstrap,
  catalog,
  lastAutoDay,
};
