/**
 * Shabbat Helper — is it Shabbat where the user is?
 *
 * Computes sunset at the user's location (GPS when detected, otherwise a city
 * in their time zone) and reads the day of week in their own time zone, so a
 * guest in New York is blocked during Shabbat in New York.
 * Mirrors backend/services/shabbatService.js (same SunCalc library); the
 * server enforces the same rule.
 *
 * Shabbat start (Friday):  20 minutes before local sunset
 * Shabbat end (Saturday):  42 minutes after local sunset
 * Where the sun does not set, sunset is taken as 18:00 local time.
 */
import { getTimes } from 'suncalc';
import { getUserLocation } from './userLocation';

const CANDLE_LIGHTING_OFFSET = -20;
const HAVDALAH_OFFSET = 42;
const DAY_MS = 864e5;
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function computeSunset(date, lat, lng) {
  try {
    const { sunset } = getTimes(date, lat, lng);
    return sunset instanceof Date && !isNaN(sunset.getTime()) ? sunset : null;
  } catch (e) {
    return null;
  }
}

function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  const hours = parseInt(get('hour'), 10) || 0;
  const minutes = parseInt(get('minute'), 10) || 0;
  return { dayOfWeek: WEEKDAYS[get('weekday')] ?? date.getDay(), hours, minutes, totalMinutes: hours * 60 + minutes };
}

function localNoon(date, timeZone, dayShift) {
  const { totalMinutes } = getLocalParts(date, timeZone);
  return new Date(date.getTime() - (totalMinutes - 720) * 60000 + dayShift * DAY_MS);
}

function sunsetNear(noon, loc) {
  const sunset = computeSunset(noon, loc.lat, loc.lng);
  if (sunset && Math.abs(sunset - noon) < DAY_MS / 2) return sunset;
  return new Date(noon.getTime() + 6 * 3600000);
}

function formatLocalTime(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

/**
 * Start and end of this week's Shabbat at a location (the coming one on
 * Sunday–Thursday, the current one on Friday and Saturday).
 */
export function getShabbatWindow(date = new Date(), location = getUserLocation()) {
  const { dayOfWeek } = getLocalParts(date, location.timeZone);
  const fridayNoon = localNoon(date, location.timeZone, dayOfWeek === 6 ? -1 : 5 - dayOfWeek);
  const saturdayNoon = new Date(fridayNoon.getTime() + DAY_MS);
  return {
    start: new Date(sunsetNear(fridayNoon, location).getTime() + CANDLE_LIGHTING_OFFSET * 60000),
    end: new Date(sunsetNear(saturdayNoon, location).getTime() + HAVDALAH_OFFSET * 60000)
  };
}

/** Is `date` within Shabbat at the location (default: the user's)? */
export function isShabbatAt(date = new Date(), location) {
  try {
    const loc = location || getUserLocation();
    const { start, end } = getShabbatWindow(date, loc);
    return date >= start && date < end;
  } catch (e) {
    return false;
  }
}

/** Is it Shabbat right now where the user is? */
export function isShabbatNow(location) {
  return isShabbatAt(new Date(), location);
}

/**
 * Current Shabbat status with local times.
 * @returns {{ isShabbat: boolean, shabbatStart: string, shabbatEnd: string, currentTime: string, timezone: string }}
 */
export function getShabbatStatus(location) {
  const loc = location || getUserLocation();
  const now = new Date();
  const { start, end } = getShabbatWindow(now, loc);
  const { hours, minutes } = getLocalParts(now, loc.timeZone);
  return {
    isShabbat: now >= start && now < end,
    shabbatStart: formatLocalTime(start, loc.timeZone),
    shabbatEnd: formatLocalTime(end, loc.timeZone),
    currentTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    timezone: loc.timeZone
  };
}
