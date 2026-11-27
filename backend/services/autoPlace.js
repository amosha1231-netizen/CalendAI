// Picks a real free time for AI-parsed events the user gave no time for.
//
// The AI marks each event with timeSource: "exact" (the user said a time, or
// "after X"), "part-of-day" (only "בבוקר" / "in the evening" etc., with
// partOfDay) or "none". Events that are not "exact" are moved, when needed, to
// the first free window that doesn't overlap the user's calendar on that date
// or the other events in the same request. An event with no time that sits
// between two events of the same request is placed between them.
const { getScheduleEventsForDate, occurrenceDateOf, isZeroDurationEvent } = require('./scheduleOccurrence');
const shabbatService = require('./shabbatService');

const STEP = 5; // minutes; placed times are rounded to this
const DEFAULT_DURATION = 30;
const DAY_WINDOW = { start: 8 * 60, end: 22 * 60 };
const PART_OF_DAY_WINDOWS = {
  morning: { start: 7 * 60 + 30, end: 12 * 60 },
  noon: { start: 12 * 60, end: 14 * 60 },
  afternoon: { start: 13 * 60, end: 18 * 60 },
  evening: { start: 18 * 60, end: 22 * 60 },
  night: { start: 21 * 60, end: 23 * 60 + 30 },
};

/** "14:30", "2:30 PM" or "02:30 PM" → minutes from midnight, or null. */
function toMinutes(time) {
  if (typeof time !== 'string') return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    const pm = m[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

function toHHMM(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

const roundUp = m => Math.ceil(m / STEP) * STEP;

function isMovable(ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (ev.timeSource !== 'none' && ev.timeSource !== 'part-of-day') return false;
  if (ev.isSleep || ev.isReminder === true || ev.eventType === 'notification') return false;
  return true;
}

/** Busy [start, end) ranges of an event list; zero-length and midnight-crossing ones are skipped. */
function busyRanges(events) {
  const out = [];
  for (const ev of events) {
    if (!ev || isZeroDurationEvent(ev)) continue;
    const s = toMinutes(ev.startTime);
    const e = toMinutes(ev.endTime);
    if (s === null || e === null || e <= s) continue;
    out.push({ start: s, end: e });
  }
  return out;
}

/** First start ≥ from where [start, start+duration) fits before `until` without touching busy time. */
function firstFreeStart(busy, duration, from, until) {
  const candidates = [roundUp(from), ...busy.map(b => roundUp(b.end))]
    .filter(c => c >= from)
    .sort((a, b) => a - b);
  for (const c of candidates) {
    if (c + duration > until) break;
    if (!busy.some(b => c < b.end && c + duration > b.start)) return c;
  }
  return null;
}

/**
 * Returns a copy of `events` where events without an explicit time are moved
 * to a free window. `todayName` resolves "Today"; `nowMinutes` keeps events
 * for today out of the past.
 */
function placeUntimedEvents(events, schedule, { todayName, todayIso, nowMinutes = null, location } = {}) {
  if (!Array.isArray(events) || !todayIso) return events;
  const out = events.map(ev => (ev && typeof ev === 'object' ? { ...ev } : ev));
  const dates = out.map(ev => {
    if (!ev || typeof ev !== 'object') return null;
    const day = !ev.day || ev.day === 'Today' ? todayName : ev.day;
    return occurrenceDateOf({ ...ev, day }, todayIso);
  });
  const placed = out.map(ev => !isMovable(ev)); // fixed events count as placed from the start

  out.forEach((ev, i) => {
    if (placed[i]) return;
    placed[i] = true;
    const date = dates[i];
    const start = toMinutes(ev.startTime);
    const end = toMinutes(ev.endTime);
    if (!date || start === null) return;
    const duration = end !== null && end > start ? end - start : DEFAULT_DURATION;

    // Busy: the calendar on that date, plus this request's other events that
    // already have their time (fixed ones, and earlier ones already placed).
    const sameDate = j => j !== i && dates[j] === date && out[j] && typeof out[j] === 'object';
    const siblings = out.filter((_, j) => sameDate(j) && placed[j]);
    const busy = busyRanges([...getScheduleEventsForDate(schedule, date, todayIso), ...siblings]);

    // Neighbours in the order the user said them: after the previous event of
    // this request on that date, and before the next one with a fixed time.
    let prevEnd = null;
    for (let j = i - 1; j >= 0; j--) {
      if (!sameDate(j)) continue;
      const e = toMinutes(out[j].endTime);
      if (e !== null) { prevEnd = e; break; }
    }
    let nextStart = null;
    for (let j = i + 1; j < out.length; j++) {
      if (!sameDate(j) || isMovable(out[j])) continue;
      const s = toMinutes(out[j].startTime);
      if (s !== null) { nextStart = s; break; }
    }

    const partWindow = ev.timeSource === 'part-of-day' ? PART_OF_DAY_WINDOWS[ev.partOfDay] : null;
    const window = partWindow || DAY_WINDOW;
    let lower = window.start;
    let upper = window.end;
    // A part of day the user asked for wins over the neighbours.
    if (!partWindow) {
      if (prevEnd !== null) lower = prevEnd;
      if (nextStart !== null) upper = nextStart;
      if (prevEnd !== null && nextStart === null) upper = Math.max(upper, prevEnd + duration);
    }
    if (date === todayIso && nowMinutes !== null) lower = Math.max(lower, nowMinutes);
    // Saturday: only from motzei Shabbat (havdalah at the user's location).
    const saturdayFloor = new Date(`${date}T12:00:00Z`).getUTCDay() === 6
      ? shabbatService.motzashStartMinutes(date, location)
      : null;
    if (saturdayFloor !== null) {
      lower = Math.max(lower, saturdayFloor);
      upper = Math.max(upper, lower + duration);
    }

    const preferred = Math.min(Math.max(start, lower), upper);
    let chosen = firstFreeStart(busy, duration, preferred, upper);
    if (chosen === null) chosen = firstFreeStart(busy, duration, lower, upper);
    // No room between the neighbours: fall back to the whole day.
    if (chosen === null && !partWindow) {
      let dayLower = date === todayIso && nowMinutes !== null ? Math.max(DAY_WINDOW.start, nowMinutes) : DAY_WINDOW.start;
      if (saturdayFloor !== null) dayLower = Math.max(dayLower, saturdayFloor);
      chosen = firstFreeStart(busy, duration, Math.max(preferred, dayLower), DAY_WINDOW.end);
      if (chosen === null) chosen = firstFreeStart(busy, duration, dayLower, DAY_WINDOW.end);
    }
    if (chosen === null || chosen === start) return; // keep the AI's time; the overlap warning will show
    ev.startTime = toHHMM(chosen);
    ev.endTime = toHHMM(chosen + duration);
    ev.autoPlaced = true;
  });
  return out;
}

module.exports = { placeUntimedEvents, toMinutes };
