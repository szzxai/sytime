const { query } = require('../../../../../packages/db/src/client.ts');
const { MenuError } = require('./schema');
function weeks(db) {
  return query(
    db,
    `SELECT s.id,s.title,s.url,s.updated_at,s.revision,
    MIN(r.date) AS start_date,MAX(r.date) AS end_date,COUNT(*) AS records_count
    FROM menu_sources s JOIN menu_records r ON r.source_id=s.id
    GROUP BY s.id ORDER BY MAX(r.date) DESC,s.updated_at DESC`,
  ).all();
}
function weeklyMenu(db, sourceId, all = false) {
  const available = weeks(db);
  const selected = sourceId ? available.find((week) => week.id === sourceId) : available[0];
  if (sourceId && !selected) throw new MenuError('没有找到这周的食谱', 404);
  const lastJob =
    query(
      db,
      `SELECT status,finished_at,error FROM menu_sync_jobs
    ORDER BY created_at DESC,id DESC LIMIT 1`,
    ).get() || null;
  if (!selected) return { weeks: available, week: null, records: [], sync: lastJob };
  const records = query(
    db,
    `SELECT r.record_key,r.dish_id,r.date,r.weekday,r.time_json,
    r.place,r.group_name,r.price,r.spicy,d.name,d.pinyin,d.pinyin_initials,
    COALESCE(v.reviews_count,0) AS reviews_count,v.rating_avg
    FROM menu_records r JOIN dishes d ON d.id=r.dish_id
    LEFT JOIN (SELECT dish_id,COUNT(*) AS reviews_count,ROUND(AVG(rating),1) AS rating_avg
      FROM recipes WHERE is_weekly=0 GROUP BY dish_id) v ON v.dish_id=r.dish_id
    WHERE (?=1 OR r.source_id=?) ORDER BY r.date,r.place,r.group_name,d.sort_key`,
  )
    .all(all ? 1 : 0, selected.id)
    .map(({ time_json, spicy, group_name, ...record }) => ({
      ...record,
      time: JSON.parse(time_json),
      group: group_name,
      spicy: spicy === null ? null : !!spicy,
    }));
  return { weeks: available, week: selected, records, sync: lastJob };
}
module.exports = { weeks, weeklyMenu };
