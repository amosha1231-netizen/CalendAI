// ──────────────────────────────────────────────
// Which local-schedule events actually take up time on a given calendar date.
// Mirrors the calendar view's recurrence rules (expandEventForMonth /
// expandDailyEventForMonth in server.js) so the free-slot finders don't treat
// a one-off, monthly or yearly event as blocking that weekday every week, and
// don't treat zero-length reminders as busy time.
// ──────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseIsoDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dayNameOf(isoDate) {
  return DAY_NAMES[parseIsoDay(isoDate).getUTCDay()];
}

/** Normalize a stored targetDate (YYYY-MM-DD string, ISO string or Date) to YYYY-MM-DD, or null. */
function toIsoDay(targetDate) {
  if (!targetDate) return null;
  if (typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(targetDate)) return targetDate.slice(0, 10);
  const d = targetDate instanceof Date ? targetDate : new Date(targetDate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Reminders/notifications are stored with endTime === startTime; they ping
 * the user but don't occupy the calendar, so they must never block a slot.
 */
function isZeroDurationEvent(event) {
  if (!event) return true;
  if (event.isReminder === true || event.eventType === 'notification' || event.eventType === 'reminder') return true;
  return Boolean(event.startTime) && event.startTime === event.endTime;
}

/**
 * True if `event` (stored under its weekday key) occurs on `isoDate`.
 * `todayIso` is today's date in the user's timezone, used for one-off events
 * saved without a targetDate (the calendar shows those on the next matching
 * weekday only).
 */
function eventOccursOnDate(event, isoDate, todayIso) {
  const target = toIsoDay(event.targetDate);
  // A dated event saved without a recurrence (e.g. older bookings) is a one-off.
  const recurrence = event.recurrence || (target ? 'once' : 'weekly');
  const dayName = dayNameOf(isoDate);
  if (recurrence !== 'daily' && event.day && event.day !== dayName) return false;

  switch (recurrence) {
    case 'once': {
      if (target) return target === isoDate;
      const diffDays = Math.round((parseIsoDay(isoDate) - parseIsoDay(todayIso)) / 86400000);
      return diffDays >= 0 && diffDays < 7;
    }
    case 'monthly':
      if (target && isoDate < target) return false;
      return parseIsoDay(isoDate).getUTCDate() <= 7;
    case 'yearly': {
      if (target && isoDate < target) return false;
      const month = parseIsoDay(isoDate).getUTCMonth();
      const createdMonth = event.createdMonth !== undefined ? event.createdMonth : parseIsoDay(todayIso).getUTCMonth();
      return month === createdMonth;
    }
    default:
      // weekly / daily / forever: recurring from its start date onward
      return !target || isoDate >= target;
  }
}

/**
 * All local-schedule events that occupy time on `isoDate`: that weekday's
 * events which actually recur on this date, plus daily events stored under
 * any weekday key (deduplicated), minus zero-length reminders.
 */
function getScheduleEventsForDate(schedule, isoDate, todayIso) {
  const dayName = dayNameOf(isoDate);
  const seen = new Set();
  const out = [];
  for (const [key, events] of Object.entries(schedule || {})) {
    if (key === 'Today' || !Array.isArray(events)) continue;
    for (const event of events) {
      if (!event || isZeroDurationEvent(event)) continue;
      if (key !== dayName && event.recurrence !== 'daily') continue;
      if (!eventOccursOnDate(key === dayName ? event : { ...event, day: undefined }, isoDate, todayIso)) continue;
      const dedupeKey = `${event.title}|${event.startTime}|${event.endTime}|${event.recurrence}|${event.recurrence === 'daily' ? '' : key}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(event);
    }
  }
  return out;
}

module.exports = { isZeroDurationEvent, eventOccursOnDate, getScheduleEventsForDate, toIsoDay };
