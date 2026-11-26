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

/** The date (YYYY-MM-DD) of the next `dayName` on or after `todayIso`, or null. */
function nextDateForDay(dayName, todayIso) {
  const idx = DAY_NAMES.indexOf(dayName);
  if (idx < 0 || !todayIso) return null;
  const today = parseIsoDay(todayIso);
  const diff = (idx - today.getUTCDay() + 7) % 7;
  return new Date(today.getTime() + diff * 86400000).toISOString().slice(0, 10);
}

/**
 * The calendar date an event lands on next: its targetDate when it has one,
 * otherwise the next matching weekday (today included).
 */
function occurrenceDateOf(event, todayIso) {
  return toIsoDay(event && event.targetDate) || nextDateForDay(event && event.day, todayIso);
}

/** The latest date on or before `refIso` that falls on `dayName`. */
function lastDateForDay(dayName, refIso) {
  const idx = DAY_NAMES.indexOf(dayName);
  if (idx < 0 || !refIso) return null;
  const ref = parseIsoDay(refIso);
  const diff = (ref.getUTCDay() - idx + 7) % 7;
  return new Date(ref.getTime() - diff * 86400000).toISOString().slice(0, 10);
}

// Until 2026-11-24 some one-off events were saved with only a weekday and no
// date. Read with the "next matching weekday" rule, such an event came back
// every week (a Thursday meeting from last week showed again this Thursday).
// Those events were all created by that day, so the date they were meant for
// is taken as their last weekday on or before it.
const UNDATED_ONE_OFF_CUTOFF = '2026-11-24';

/**
 * Give every one-off event that has no date a fixed targetDate, so it stops
 * repeating weekly. Mutates `schedule`; returns how many events were pinned.
 * The 'Today' key is a copy of today's weekday and is left to the caller to
 * rebuild.
 */
function pinUndatedOneOffs(schedule, todayIso, cutoffIso = UNDATED_ONE_OFF_CUTOFF) {
  if (!schedule || typeof schedule !== 'object' || !todayIso) return 0;
  const refIso = todayIso < cutoffIso ? todayIso : cutoffIso;
  let pinned = 0;
  for (const dayName of DAY_NAMES) {
    const events = schedule[dayName];
    if (!Array.isArray(events)) continue;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object' || ev.recurrence !== 'once' || toIsoDay(ev.targetDate)) continue;
      const date = lastDateForDay(ev.day && DAY_NAMES.includes(ev.day) ? ev.day : dayName, refIso);
      if (!date) continue;
      ev.targetDate = date;
      pinned++;
    }
  }
  return pinned;
}

module.exports = { isZeroDurationEvent, eventOccursOnDate, getScheduleEventsForDate, toIsoDay, nextDateForDay, lastDateForDay, occurrenceDateOf, pinUndatedOneOffs, UNDATED_ONE_OFF_CUTOFF };
