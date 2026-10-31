/**
 * Reminder Schedule — pure helpers for recurring reminders (no DB, no I/O).
 *
 * A reminder fires at a wall-clock time ("08:00") in the user's own IANA time
 * zone, so "every day at 8" stays at 8 across daylight-saving changes and
 * travels correctly when the server runs in UTC.
 *
 *   frequency  'once'    → fires on `date` (YYYY-MM-DD) at `time`
 *              'daily'   → every day at `time`
 *              'weekly'  → on `daysOfWeek` (0 = Sunday … 6 = Saturday) at `time`
 *              'monthly' → on `dayOfMonth` (clamped to the month's last day) at `time`
 */

const { getTimeZoneOffsetMinutes, isValidTimeZone, DEFAULT_TIMEZONE } = require('./userLocation');

const FREQUENCIES = ['once', 'daily', 'weekly', 'monthly'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SEARCH_DAYS = 400;

/** "8:00", "08:00 AM", "8am", "20:30", "8.30 pm" → "HH:mm" (24h), or null. */
function normalizeTime(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([AaPp])?\.?\s*[Mm]?\.?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (min > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'P' && h !== 12) h += 12;
    if (ampm === 'A' && h === 12) h = 0;
  } else if (!m[2]) {
    return null; // a bare number ("8") is too ambiguous to trust
  }
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function zoneOrDefault(timeZone) {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

/** Calendar parts of an instant as seen in a time zone. */
function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zoneOrDefault(timeZone), hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')]
  };
}

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(key) {
  const m = typeof key === 'string' && key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/**
 * The instant at which a wall-clock time happens in a zone. Times that do not
 * exist (skipped by a DST jump) resolve to the same clock time after the jump.
 */
function zonedTimeToInstant(year, month, day, hour, minute, timeZone) {
  const tz = zoneOrDefault(timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = asUtc - getTimeZoneOffsetMinutes(tz, new Date(asUtc)) * 60000;
  // A second pass settles instants near a DST transition.
  instant = asUtc - getTimeZoneOffsetMinutes(tz, new Date(instant)) * 60000;
  return new Date(instant);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function matchesDay(reminder, year, month, day, weekday) {
  switch (reminder.frequency) {
    case 'daily': return true;
    case 'weekly': return Array.isArray(reminder.daysOfWeek) && reminder.daysOfWeek.includes(weekday);
    case 'monthly': {
      const target = Math.min(Number(reminder.dayOfMonth) || 1, daysInMonth(year, month));
      return day === target;
    }
    case 'once': return reminder.date === dateKey(year, month, day);
    default: return false;
  }
}

/**
 * Next time a reminder should ping strictly after `after`, or null when it
 * never will (a past one-off, or an invalid reminder).
 * @param {object} reminder  { frequency, time, timezone, daysOfWeek?, dayOfMonth?, date? }
 * @param {Date} [after]
 * @param {{ isBlocked?: (instant: Date) => boolean }} [options]
 *        isBlocked skips occurrences (used for Shabbat); one-off reminders ignore it.
 */
function computeNextFire(reminder, after = new Date(), options = {}) {
  if (!reminder || !FREQUENCIES.includes(reminder.frequency)) return null;
  const time = normalizeTime(reminder.time);
  if (!time) return null;
  const [hour, minute] = time.split(':').map(Number);
  const tz = zoneOrDefault(reminder.timezone);
  const isBlocked = reminder.frequency !== 'once' && typeof options.isBlocked === 'function' ? options.isBlocked : null;

  if (reminder.frequency === 'once') {
    const d = parseDateKey(reminder.date);
    if (!d) return null;
    const instant = zonedTimeToInstant(d.year, d.month, d.day, hour, minute, tz);
    return instant > after ? instant : null;
  }

  // Walk calendar days in the user's zone, starting from "today" there.
  const start = localParts(after, tz);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  for (let i = 0; i < SEARCH_DAYS; i++) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const weekday = cursor.getUTCDay();
    if (matchesDay(reminder, year, month, day, weekday)) {
      const instant = zonedTimeToInstant(year, month, day, hour, minute, tz);
      if (instant > after && !(isBlocked && isBlocked(instant))) return instant;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

/** An RFC 5545 RRULE for the reminder (stored for interop / calendar export). */
function toRRule(reminder) {
  const time = normalizeTime(reminder && reminder.time);
  if (!time) return null;
  const [hour, minute] = time.split(':').map(Number);
  const at = `;BYHOUR=${hour};BYMINUTE=${minute}`;
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  switch (reminder.frequency) {
    case 'daily': return `FREQ=DAILY${at}`;
    case 'weekly': {
      const days = (reminder.daysOfWeek || []).filter(d => d >= 0 && d <= 6).sort((a, b) => a - b);
      return days.length ? `FREQ=WEEKLY;BYDAY=${days.map(d => codes[d]).join(',')}${at}` : null;
    }
    case 'monthly': return `FREQ=MONTHLY;BYMONTHDAY=${Number(reminder.dayOfMonth) || 1}${at}`;
    case 'once': {
      const d = parseDateKey(reminder.date);
      return d ? `FREQ=DAILY;COUNT=1;DTSTART=${reminder.date.replace(/-/g, '')}T${time.replace(':', '')}00` : null;
    }
    default: return null;
  }
}

/**
 * Validate and clean reminder fields coming from a client or the AI.
 * @returns {{ value?: object, error?: string }}
 */
function sanitizeReminderInput(input = {}, { timeZone, now = new Date() } = {}) {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : '';
  if (!title) return { error: 'title' };
  const time = normalizeTime(input.time);
  if (!time) return { error: 'time' };
  const frequency = FREQUENCIES.includes(input.frequency) ? input.frequency : null;
  if (!frequency) return { error: 'frequency' };

  const value = {
    title,
    time,
    frequency,
    timezone: zoneOrDefault(timeZone),
    emoji: typeof input.emoji === 'string' && input.emoji.trim() ? input.emoji.trim().slice(0, 8) : '🔔',
    skipShabbat: input.skipShabbat !== false,
    daysOfWeek: [],
    dayOfMonth: null,
    date: null
  };

  if (frequency === 'weekly') {
    const days = Array.isArray(input.daysOfWeek) ? input.daysOfWeek.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    value.daysOfWeek = [...new Set(days)].sort((a, b) => a - b);
    if (!value.daysOfWeek.length) return { error: 'daysOfWeek' };
    if (value.daysOfWeek.length === 7) value.frequency = 'daily';
  } else if (frequency === 'monthly') {
    const dom = Number(input.dayOfMonth) || localParts(now, value.timezone).day;
    if (!Number.isInteger(dom) || dom < 1 || dom > 31) return { error: 'dayOfMonth' };
    value.dayOfMonth = dom;
  } else if (frequency === 'once') {
    if (!parseDateKey(input.date)) return { error: 'date' };
    value.date = input.date;
  }
  return { value };
}

const HEBREW_UNITS = { 'יום': 'day', 'ימים': 'day', 'שבוע': 'week', 'שבועות': 'week', 'חודש': 'month', 'חודשים': 'month', 'שנה': 'year', 'שנים': 'year' };
const HEBREW_DUALS = { 'יומיים': ['day', 2], 'שבועיים': ['week', 2], 'חודשיים': ['month', 2], 'שנתיים': ['year', 2] };
const NOT_WORD = '(?<![\\u0590-\\u05FFA-Za-z0-9])';
const RELATIVE_PATTERNS = [
  // "בעוד 355 ימים", "לעוד 3 שבועות", "עוד 2 חודשים"
  [new RegExp(`${NOT_WORD}ו?[בל]?עוד\\s+(\\d{1,4})\\s*(ימים|יום|שבועות|שבוע|חודשים|חודש|שנים|שנה)(?![\\u0590-\\u05FF])`, 'g'), m => [HEBREW_UNITS[m[2]], Number(m[1])]],
  // "בעוד שבועיים", "לעוד שנתיים"
  [new RegExp(`${NOT_WORD}ו?[בל]?עוד\\s+(יומיים|שבועיים|חודשיים|שנתיים)(?![\\u0590-\\u05FF])`, 'g'), m => HEBREW_DUALS[m[1]]],
  // "בעוד שבוע", "בעוד חודש", "בעוד שנה" (a bare "עוד יום" usually means "another day", so the ב/ל is required)
  [new RegExp(`${NOT_WORD}ו?[בל]עוד\\s+(יום|שבוע|חודש|שנה)(?![\\u0590-\\u05FF])`, 'g'), m => [HEBREW_UNITS[m[1]], 1]],
  // "in 355 days", "in a week", "in two months"
  [/\bin\s+(\d{1,4}|an?|one|two|three)\s+(day|week|month|year)s?\b/gi, m => [m[2].toLowerCase(), Number(m[1]) || { a: 1, an: 1, one: 1, two: 2, three: 3 }[m[1].toLowerCase()]]],
  // "355 days from now"
  [/\b(\d{1,4})\s+(day|week|month|year)s?\s+from\s+now\b/gi, m => [m[2].toLowerCase(), Number(m[1])]]
];

/**
 * The calendar date (YYYY-MM-DD, in the zone) of a relative day offset in the
 * user's text: "בעוד 355 ימים", "בעוד שבועיים", "in 3 months". The AI only
 * returns a weekday name, so anything past a week has to be worked out here.
 * Returns null when there is no such phrase, or more than one distinct date.
 */
function relativeDateFromText(text, timeZone, now = new Date()) {
  if (typeof text !== 'string' || !text) return null;
  const today = localParts(now, zoneOrDefault(timeZone));
  const found = new Set();
  for (const [re, read] of RELATIVE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const [unit, n] = read(m) || [];
      if (!unit || !Number.isInteger(n) || n < 1) continue;
      let { year, month, day } = today;
      if (unit === 'day' || unit === 'week') {
        const d = new Date(Date.UTC(year, month - 1, day + n * (unit === 'week' ? 7 : 1)));
        found.add(dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
      } else {
        const total = (year * 12 + month - 1) + n * (unit === 'year' ? 12 : 1);
        year = Math.floor(total / 12);
        month = total % 12 + 1;
        found.add(dateKey(year, month, Math.min(day, daysInMonth(year, month))));
      }
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

/** The next calendar date (YYYY-MM-DD, in the zone) that falls on `dayName` at `time`, after `now`. */
function nextDateForDayName(dayName, time, timeZone, now = new Date()) {
  const tz = zoneOrDefault(timeZone);
  const target = DAY_NAMES.indexOf(dayName);
  const hm = normalizeTime(time);
  if (target < 0 || !hm) return null;
  const [hour, minute] = hm.split(':').map(Number);
  const start = localParts(now, tz);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  for (let i = 0; i < 8; i++) {
    const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth() + 1, d = cursor.getUTCDate();
    if (cursor.getUTCDay() === target && zonedTimeToInstant(y, m, d, hour, minute, tz) > now) return dateKey(y, m, d);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

/**
 * Turn the AI's parsed events into reminder specs. Only events marked
 * isReminder are taken; the rest are returned untouched for the calendar.
 *
 * The AI sometimes answers "every day" with one event per weekday, so events
 * with the same title and time are merged: weekly days are unioned, and a
 * union covering the whole week becomes daily.
 *
 * Yearly reminders stay as calendar events (the calendar already repeats them).
 */
function reminderSpecsFromEvents(events, { timeZone, now = new Date(), todayName, text } = {}) {
  const remaining = [];
  const groups = new Map();
  const tz = zoneOrDefault(timeZone);
  const todayKey = (p => dateKey(p.year, p.month, p.day))(localParts(now, tz));
  // A relative offset in the text ("בעוד 355 ימים") only pins a date when there
  // is a single one-off reminder for it to belong to.
  const onceCount = (Array.isArray(events) ? events : []).filter(ev => ev && ev.isReminder === true
    && String((ev.repeat && ev.repeat.frequency) || ev.recurrence || 'once').toLowerCase() === 'once').length;
  const relativeDate = onceCount === 1 ? relativeDateFromText(text, tz, now) : null;

  for (const ev of Array.isArray(events) ? events : []) {
    const repeat = ev && typeof ev.repeat === 'object' && ev.repeat ? ev.repeat : {};
    let freq = String(repeat.frequency || ev?.recurrence || 'once').toLowerCase();
    if (freq === 'forever') freq = 'daily';
    const time = normalizeTime(ev && (repeat.time || ev.startTime));
    if (!ev || ev.isReminder !== true || !time || freq === 'yearly' || !['once', 'daily', 'weekly', 'monthly'].includes(freq)) {
      remaining.push(ev);
      continue;
    }

    const title = String(ev.summary || ev.title || '').trim();
    if (!title) { remaining.push(ev); continue; }
    const dayName = ev.day === 'Today' || !ev.day ? (todayName || DAY_NAMES[localParts(now, tz).weekday]) : ev.day;

    let spec;
    if (freq === 'daily') {
      spec = { frequency: 'daily' };
    } else if (freq === 'weekly') {
      const fromRepeat = Array.isArray(repeat.daysOfWeek)
        ? repeat.daysOfWeek.map(d => (typeof d === 'number' ? d : DAY_NAMES.indexOf(d))).filter(d => d >= 0 && d <= 6)
        : [];
      const days = fromRepeat.length ? fromRepeat : [DAY_NAMES.indexOf(dayName)].filter(d => d >= 0);
      if (!days.length) { remaining.push(ev); continue; }
      spec = { frequency: 'weekly', daysOfWeek: days };
    } else if (freq === 'monthly') {
      spec = { frequency: 'monthly', dayOfMonth: Number(repeat.dayOfMonth) || localParts(now, tz).day };
    } else {
      const target = ev.targetDate ? String(ev.targetDate).slice(0, 10) : null;
      const date = relativeDate
        || (parseDateKey(target) && target > todayKey ? target : null)
        || nextDateForDayName(dayName, time, tz, now);
      if (!date) { remaining.push(ev); continue; }
      spec = { frequency: 'once', date };
    }

    const key = `${title.toLowerCase()}|${time}|${spec.frequency === 'weekly' ? 'weekly' : spec.frequency + (spec.date || spec.dayOfMonth || '')}`;
    const existing = groups.get(key);
    if (existing && spec.frequency === 'weekly') {
      existing.daysOfWeek = [...new Set([...existing.daysOfWeek, ...spec.daysOfWeek])];
    } else if (!existing) {
      groups.set(key, { title, time, emoji: typeof ev.emoji === 'string' ? ev.emoji : undefined, ...spec });
    }
  }

  // "Every day" sent as seven separate weekly/once events → daily.
  const reminders = [];
  const onceByTitleTime = new Map();
  for (const spec of groups.values()) {
    if (spec.frequency === 'weekly') {
      spec.daysOfWeek.sort((a, b) => a - b);
      if (spec.daysOfWeek.length === 7) { spec.frequency = 'daily'; spec.daysOfWeek = []; }
    }
    if (spec.frequency === 'once') {
      const k = `${spec.title.toLowerCase()}|${spec.time}`;
      onceByTitleTime.set(k, [...(onceByTitleTime.get(k) || []), spec]);
      continue;
    }
    reminders.push(spec);
  }
  for (const list of onceByTitleTime.values()) {
    if (list.length >= 7) reminders.push({ ...list[0], frequency: 'daily', date: undefined });
    else reminders.push(...list);
  }

  // A daily reminder makes weekly/once duplicates of the same title and time redundant.
  const daily = new Set(reminders.filter(r => r.frequency === 'daily').map(r => `${r.title.toLowerCase()}|${r.time}`));
  const deduped = reminders.filter(r => r.frequency === 'daily' || !daily.has(`${r.title.toLowerCase()}|${r.time}`));

  return { reminders: deduped, remainingEvents: remaining };
}

module.exports = {
  FREQUENCIES,
  DAY_NAMES,
  normalizeTime,
  localParts,
  zonedTimeToInstant,
  computeNextFire,
  toRRule,
  sanitizeReminderInput,
  nextDateForDayName,
  relativeDateFromText,
  reminderSpecsFromEvents
};
