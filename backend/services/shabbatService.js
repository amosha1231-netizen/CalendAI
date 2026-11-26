/**
 * Shabbat Service — Shabbat times for any location.
 *
 * Uses SunCalc to compute sunset at the user's coordinates and evaluates the
 * day of week in the user's own time zone, so a user in New York is blocked
 * during Shabbat in New York, not during Shabbat in Jerusalem.
 *
 * Shabbat start:   Friday, 20 minutes before local sunset (candle-lighting)
 * Shabbat end:     Saturday, 42 minutes after local sunset (havdalah)
 *
 * Every function takes an optional location ({ timeZone, lat, lng }, see
 * userLocation.js). Without one it uses Jerusalem, as before.
 *
 * Where the sun does not set (polar summer) or SunCalc fails, sunset is taken
 * as 18:00 local time.
 */

const SunCalc = require('suncalc');
const { buildLocation, DEFAULT_COORDS } = require('./userLocation');

const JERUSALEM_LAT = DEFAULT_COORDS.lat;
const JERUSALEM_LNG = DEFAULT_COORDS.lng;

const CANDLE_LIGHTING_OFFSET = -20; // minutes relative to Friday sunset
const HAVDALAH_OFFSET = 42;         // minutes relative to Saturday sunset
const FALLBACK_SUNSET_MINUTES = 18 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function normalizeLocation(location) {
  if (location && typeof location.timeZone === 'string' && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    return location;
  }
  return buildLocation(location || {});
}

/** Day of week and minutes since midnight of `date` in `timeZone`. */
function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  const hours = parseInt(get('hour'), 10) || 0;
  const minutes = parseInt(get('minute'), 10) || 0;
  const dayOfWeek = WEEKDAYS[get('weekday')] ?? date.getDay();
  return { dayOfWeek, hours, minutes, totalMinutes: hours * 60 + minutes };
}

function formatLocalTime(date, timeZone) {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

/** Local noon (as an instant) of the local day `dayShift` days after `date`'s local day. */
function localNoon(date, timeZone, dayShift = 0) {
  const { totalMinutes } = getLocalParts(date, timeZone);
  return new Date(date.getTime() - (totalMinutes - 12 * 60) * 60000 + dayShift * DAY_MS);
}

/** Sunset instant on the local day containing `noon`. */
function getSunset(noon, location) {
  try {
    const { sunset } = SunCalc.getTimes(noon, location.lat, location.lng);
    if (sunset instanceof Date && !isNaN(sunset.getTime()) && Math.abs(sunset - noon) < 12 * 60 * 60 * 1000) {
      return sunset;
    }
  } catch (err) {
    console.error('[ShabbatService] SunCalc error:', err.message);
  }
  return new Date(noon.getTime() + (FALLBACK_SUNSET_MINUTES - 12 * 60) * 60000);
}

/**
 * Start and end instants of the Shabbat in the week containing `date`
 * (the coming Shabbat on Sunday–Thursday, the current one on Friday/Saturday).
 */
function getShabbatWindow(date, location) {
  const loc = normalizeLocation(location);
  const { dayOfWeek } = getLocalParts(date, loc.timeZone);
  // Saturday looks back one day to its Friday; every other day looks ahead.
  const fridayNoon = localNoon(date, loc.timeZone, dayOfWeek === 6 ? -1 : 5 - dayOfWeek);
  const saturdayNoon = new Date(fridayNoon.getTime() + DAY_MS);
  const start = new Date(getSunset(fridayNoon, loc).getTime() + CANDLE_LIGHTING_OFFSET * 60000);
  const end = new Date(getSunset(saturdayNoon, loc).getTime() + HAVDALAH_OFFSET * 60000);
  return { start, end, location: loc };
}

/**
 * Check if a given time falls within Shabbat at a location.
 * @param {Date} [date] - Instant to check. Defaults to now.
 * @param {{ timeZone?: string, lat?: number, lng?: number }} [location]
 */
function isShabbatTime(date, location) {
  const when = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const { start, end, location: loc } = getShabbatWindow(when, location);
  const { dayOfWeek, hours, minutes } = getLocalParts(when, loc.timeZone);
  const isShabbat = when >= start && when < end;

  return {
    isShabbat,
    start,
    end,
    details: {
      shabbatStart: formatLocalTime(start, loc.timeZone),
      shabbatEnd: formatLocalTime(end, loc.timeZone),
      currentTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      dayOfWeek,
      timezone: loc.timeZone
    }
  };
}

/** Is it Shabbat right now at this location (Jerusalem when omitted)? */
function isShabbatNow(location) {
  return isShabbatTime(new Date(), location).isShabbat;
}

/**
 * Check if a given day name / event day is Shabbat/Saturday.
 * @param {string} day - The day name (e.g., "Saturday", "שבת")
 */
function isShabbatDay(day) {
  if (!day) return false;
  const d = day.toLowerCase();
  return d.includes('שבת') || d.includes('saturday');
}

// Motzei Shabbat (מוצ"ש) opens this many minutes after havdalah is rounded up to.
const MOTZASH_ROUND_MINUTES = 5;
// Friday cutoff (minutes since midnight) used across the app for new meetings/events.
const FRIDAY_SHABBAT_CUTOFF_MIN = 16 * 60;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Minutes since local midnight from which a Saturday is open again — havdalah
 * at the location, rounded up to the next 5 minutes (e.g. 17:23 → 17:25).
 * @param {string} [isoDate] - The Saturday (YYYY-MM-DD). Defaults to the coming/current one.
 * @param {{ timeZone?: string, lat?: number, lng?: number }} [location]
 */
function motzashStartMinutes(isoDate, location) {
  const loc = normalizeLocation(location);
  // Noon UTC on that date is the same calendar day in every inhabited time zone.
  const probe = isIsoDate(isoDate) ? new Date(`${isoDate}T12:00:00Z`) : new Date();
  const { end } = getShabbatWindow(probe, loc);
  const { totalMinutes } = getLocalParts(end, loc.timeZone);
  return Math.min(24 * 60, Math.ceil(totalMinutes / MOTZASH_ROUND_MINUTES) * MOTZASH_ROUND_MINUTES);
}

/** "HH:MM" of motzashStartMinutes — for messages and the AI prompt. */
function motzashStartClock(isoDate, location) {
  const m = motzashStartMinutes(isoDate, location);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Would a local window on a given day fall in Shabbat?
 * Friday: anything running past 16:00. Saturday: anything starting before
 * motzei Shabbat (havdalah at the location) — or with no time at all.
 * @param {{ date?: string, dayName?: string, startMin?: number|null, endMin?: number|null, location?: object }} window
 */
function isShabbatSlot({ date, dayName, startMin = null, endMin = null, location } = {}) {
  const day = isIsoDate(date) ? DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()] : dayName;
  if (!day) return false;
  if (isShabbatDay(day)) {
    if (!Number.isFinite(startMin)) return true;
    return startMin < motzashStartMinutes(isIsoDate(date) ? date : undefined, location);
  }
  if (day === 'Friday' && Number.isFinite(endMin)) return endMin > FRIDAY_SHABBAT_CUTOFF_MIN;
  return false;
}

/** Current Shabbat status for the API endpoint. */
function getShabbatStatus(location) {
  const result = isShabbatTime(new Date(), location);
  return {
    isShabbat: result.isShabbat,
    shabbatStart: result.details.shabbatStart,
    shabbatEnd: result.details.shabbatEnd,
    shabbatStartISO: result.start.toISOString(),
    shabbatEndISO: result.end.toISOString(),
    currentTime: result.details.currentTime,
    timezone: result.details.timezone,
    shabbatActive: result.isShabbat
  };
}

module.exports = {
  isShabbatTime,
  isShabbatNow,
  isShabbatDay,
  getShabbatStatus,
  getShabbatWindow,
  motzashStartMinutes,
  motzashStartClock,
  isShabbatSlot,
  FRIDAY_SHABBAT_CUTOFF_MIN,
  JERUSALEM_LAT,
  JERUSALEM_LNG
};
