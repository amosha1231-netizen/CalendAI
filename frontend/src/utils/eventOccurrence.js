/**
 * Which events from a weekday-keyed schedule ({ Sunday: [...], ... }) really
 * happen on a given calendar date.
 *
 * The schedule stores every event under its weekday name, so reading
 * schedule[<weekday>] alone puts a one-off meeting (recurrence "once" with a
 * targetDate, e.g. a meeting a friend booked) on that weekday of every week.
 * These rules mirror the server's (backend/services/scheduleOccurrence.js and
 * the month view's expansion in server.js).
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local YYYY-MM-DD of a Date. */
export function isoDayOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** A stored targetDate (YYYY-MM-DD, ISO string or Date) as YYYY-MM-DD, or null. */
export function targetIsoOf(targetDate) {
  if (!targetDate) return null;
  if (typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(targetDate)) return targetDate.slice(0, 10);
  const d = targetDate instanceof Date ? targetDate : new Date(targetDate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * True if `event` (stored under `date`'s weekday) happens on `date`.
 * `today` is only used for one-off events saved without a date, which show on
 * the next matching weekday only (the next seven days).
 */
export function eventOccursOnDate(event, date, today = new Date()) {
  if (!event || !(date instanceof Date) || Number.isNaN(date.getTime())) return true;
  const iso = isoDayOf(date);
  const target = targetIsoOf(event.targetDate);
  const recurrence = event.recurrence || (target ? 'once' : 'weekly');

  switch (recurrence) {
    case 'once': {
      if (target) return target === iso;
      const diffDays = Math.round((parseIso(iso) - parseIso(isoDayOf(today))) / 86400000);
      return diffDays >= 0 && diffDays < 7;
    }
    case 'monthly':
      if (target && iso < target) return false;
      return date.getDate() <= 7;
    case 'yearly': {
      if (target && iso < target) return false;
      const createdMonth = event.createdMonth !== undefined ? event.createdMonth : (target ? parseIso(target).getUTCMonth() : today.getMonth());
      return date.getMonth() === createdMonth;
    }
    default:
      // weekly / daily / forever: from its start date onward
      return !target || iso >= target;
  }
}

/** Only the events of `events` that happen on `date`. */
export function eventsOnDate(events, date, today = new Date()) {
  if (!Array.isArray(events)) return [];
  return events.filter(ev => eventOccursOnDate(ev, date, today));
}

/** The weekday key ('Sunday'...) of a Date. */
export function weekdayKeyOf(date) {
  return DAY_NAMES[date.getDay()];
}
