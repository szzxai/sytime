import { useState } from 'react';
import type { Supply } from './RecipePage';

export const weekday = (date: string) =>
  ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][
    new Date(date + 'T12:00:00Z').getUTCDay()
  ];
export function shiftDate(date: string, offset: number) {
  return new Date(Date.parse(date + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
}
export function campusOf(place: string | null) {
  return /正谊/.test(place || '') ? 'zhengyi' : 'main';
}
const mealOptions = [
  ['morning', '早餐'],
  ['noon', '午餐'],
  ['evening', '晚餐'],
  ['night', '夜宵'],
  ['break', '课间加餐'],
];
const priceLabel = (price: number | null) =>
  price === null ? '价格未注明' : price === 0 ? '免费' : '¥' + price;
const priority = (r: Supply) =>
  /风味|现煮/.test(r.group || '') ? 0 : /小食|小吃|面档|点心|课间/.test(r.group || '') ? 1 : 2;
export function DailyControls({
  date,
  campus,
  onDate,
  onCampus,
}: {
  date: string;
  campus: string;
  onDate: (date: string) => void;
  onCampus: () => void;
}) {
  const [open, setOpen] = useState(false);
  const monday = shiftDate(date, -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7));
  return (
    <div className="daily-context">
      <label className="daily-date">
        <span>{date.replace('-', ' 年 ').replace('-', ' 月 ')} 日</span>
        <input
          aria-label="选择日期"
          type="date"
          value={date}
          onChange={(e) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onDate(e.target.value);
          }}
        />
      </label>
      <span aria-hidden="true">·</span>
      <div className="daily-weekday">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="weekday-options"
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          {weekday(date)} ▾
        </button>
        {open && (
          <div
            id="weekday-options"
            className="weekday-options"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            {Array.from({ length: 7 }, (_, i) => shiftDate(monday, i)).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={date === d}
                onClick={() => {
                  onDate(d);
                  setOpen(false);
                }}
              >
                {weekday(d)}
                <small>{d.slice(5)}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="daily-campus" type="button" onClick={onCampus} aria-label="切换校区">
        {campus === 'main' ? '本部校区' : '正谊校区'} ⇄
      </button>
    </div>
  );
}
export function DailyColumn({
  title,
  date,
  records,
  campus,
  meal,
  onMeal,
  render,
}: {
  title: string;
  date: string;
  records: Supply[];
  campus: string;
  meal: string;
  onMeal: (meal: string) => void;
  render: (row: Supply) => React.ReactNode;
}) {
  const matching = records
    .filter(
      (r) =>
        r.date === date &&
        campusOf(r.place) === campus &&
        (meal === 'break' ? !r.time.length : r.time.includes(meal)),
    )
    .sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name, 'zh-CN'));
  const merged = new Map<number, Supply>();
  for (const row of matching) {
    const previous = merged.get(row.dish_id);
    if (!previous) merged.set(row.dish_id, { ...row });
    else {
      const places = [
        ...new Set([...(previous.place || '').split('和'), row.place].filter(Boolean)),
      ];
      const priceLabels = [
        ...new Set([
          ...(previous.price_label || priceLabel(previous.price)).split(' / '),
          priceLabel(row.price),
        ]),
      ];
      merged.set(row.dish_id, {
        ...previous,
        place: places.join('和'),
        price_label: priceLabels.join(' / '),
      });
    }
  }
  const rows = [...merged.values()];

  return (
    <section className="daily-column" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <div className="daily-meals" role="group" aria-label={title + '餐次'}>
          {mealOptions.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={v === meal} onClick={() => onMeal(v)}>
              {l}
            </button>
          ))}
        </div>
      </header>
      {rows.length ? (
        <div className="menu-grid">{rows.map(render)}</div>
      ) : (
        <p className="daily-empty">
          这一天的{mealOptions.find(([v]) => v === meal)?.[1]}暂无已公布的供应。
          <br />
          可以切换日期或餐次，供应以食堂实际安排为准。
        </p>
      )}
    </section>
  );
}
