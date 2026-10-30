'use strict';
const { MenuError } = require('./schema');
const TIMEZONE = 'Asia/Shanghai';
const DAY = 86400000;
function validateTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new MenuError('同步时间应为 00:00 至 23:59 的 HH:mm 格式');
  return value;
}
const localDay = (now) => new Date(Number(now) + 8 * 3600000).toISOString().slice(0, 10);
const atDay = (day, time) => Date.parse(day + 'T' + validateTime(time) + ':00+08:00');
const shiftDay = (day, count) =>
  new Date(Date.parse(day + 'T00:00:00Z') + count * DAY).toISOString().slice(0, 10);
function latestOccurrence(time, now) {
  const today = localDay(now),
    todayAt = atDay(today, time);
  return todayAt <= now
    ? { day: today, at: todayAt }
    : { day: shiftDay(today, -1), at: todayAt - DAY };
}
function dueOccurrence(config, lastAutoDay, now = Date.now()) {
  if (!config.enabled) return null;
  if (config.schedule_mode === 'weekend') {
    const due = weekendSlots(now)
      .filter((slot) => slot.at <= now)
      .at(-1);
    if (
      !due ||
      (lastAutoDay && due.day <= lastAutoDay) ||
      due.at < Number(config.schedule_effective_at || now)
    )
      return null;
    return due;
  }
  const due = latestOccurrence(config.daily_time, now);
  if (lastAutoDay && due.day <= lastAutoDay) return null;
  if (due.at < Number(config.schedule_effective_at || now)) return null;
  return due;
}
function nextRun(config, lastAutoDay, now = Date.now()) {
  if (!config.enabled) return null;
  if (config.schedule_mode === 'weekend') {
    const next = weekendSlots(now).find(
      (slot) =>
        slot.at > now &&
        (!lastAutoDay || slot.day > lastAutoDay) &&
        slot.at >= Number(config.schedule_effective_at || 0),
    );
    return next ? new Date(next.at).toISOString() : null;
  }
  let day = localDay(now);
  if ((lastAutoDay && day <= lastAutoDay) || atDay(day, config.daily_time) <= now) {
    day = shiftDay(lastAutoDay && lastAutoDay > day ? lastAutoDay : day, 1);
  }
  return new Date(atDay(day, config.daily_time)).toISOString();
}
// Hourly weekend checks discover late posts and recover transient failures. Monday
// checks cover menus posted after the weekend. One persisted job per time slot.
function weekendSlots(now) {
  const slots = [];
  for (let offset = -7; offset <= 8; offset++) {
    const day = shiftDay(localDay(now), offset);
    const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
    const hours =
      weekday === 6 || weekday === 0
        ? Array.from({ length: 15 }, (_, i) => i + 8)
        : weekday === 1
          ? [8, 12]
          : [];
    for (const hour of hours) {
      const time = String(hour).padStart(2, '0') + ':00';
      slots.push({ day: day + 'T' + time, at: atDay(day, time) });
    }
  }
  return slots;
}
module.exports = {
  TIMEZONE,
  DAY,
  validateTime,
  localDay,
  atDay,
  shiftDay,
  latestOccurrence,
  dueOccurrence,
  nextRun,
};
