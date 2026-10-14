/**
 * User Location
 *
 * One place for "where is the user": their IANA time zone and, when they let
 * the app detect their location, GPS coordinates. Used for Shabbat times,
 * for the time zone sent to the server, and for converting booking times.
 *
 * Storage keys (kept from earlier versions of the app):
 *   calendai-timezone           – IANA zone the user picked (or detected)
 *   calendai-detected-location  – JSON { city, timezone, lat, lng, timestamp }
 */
import safeStorage from './safeStorage';

export const DEFAULT_TIMEZONE = 'Asia/Jerusalem';
const TIMEZONE_KEY = 'calendai-timezone';
const DETECTED_KEY = 'calendai-detected-location';

// Representative coordinates per zone, for sunset when there is no GPS fix.
// Mirrors backend/services/userLocation.js.
const TZ_COORDS = {
  'Asia/Jerusalem': [31.7683, 35.2137],
  'Asia/Tel_Aviv': [32.0853, 34.7818],
  'Asia/Hebron': [31.5326, 35.0998],
  'Asia/Gaza': [31.5017, 34.4668],
  'America/New_York': [40.7128, -74.006],
  'America/Toronto': [43.6532, -79.3832],
  'America/Chicago': [41.8781, -87.6298],
  'America/Denver': [39.7392, -104.9903],
  'America/Phoenix': [33.4484, -112.074],
  'America/Los_Angeles': [34.0522, -118.2437],
  'America/Mexico_City': [19.4326, -99.1332],
  'America/Sao_Paulo': [-23.5505, -46.6333],
  'America/Argentina/Buenos_Aires': [-34.6037, -58.3816],
  'Europe/London': [51.5072, -0.1276],
  'Europe/Paris': [48.8566, 2.3522],
  'Europe/Berlin': [52.52, 13.405],
  'Europe/Madrid': [40.4168, -3.7038],
  'Europe/Rome': [41.9028, 12.4964],
  'Europe/Amsterdam': [52.3676, 4.9041],
  'Europe/Brussels': [50.8503, 4.3517],
  'Europe/Zurich': [47.3769, 8.5417],
  'Europe/Vienna': [48.2082, 16.3738],
  'Europe/Kiev': [50.4501, 30.5234],
  'Europe/Kyiv': [50.4501, 30.5234],
  'Europe/Moscow': [55.7558, 37.6173],
  'Africa/Johannesburg': [-26.2041, 28.0473],
  'Asia/Dubai': [25.2048, 55.2708],
  'Asia/Kolkata': [28.6139, 77.209],
  'Asia/Shanghai': [31.2304, 121.4737],
  'Asia/Hong_Kong': [22.3193, 114.1694],
  'Asia/Singapore': [1.3521, 103.8198],
  'Asia/Tokyo': [35.6762, 139.6503],
  'Australia/Sydney': [-33.8688, 151.2093],
  'Australia/Melbourne': [-37.8136, 144.9631],
  'Pacific/Auckland': [-36.8485, 174.7633]
};

// The four preset locations the server knows (working hours etc.).
export const PRESET_LOCATIONS = {
  jerusalem: 'Asia/Jerusalem',
  newyork: 'America/New_York',
  london: 'Europe/London',
  losangeles: 'America/Los_Angeles'
};

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

export function getDeviceTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
  } catch (e) {
    return DEFAULT_TIMEZONE;
  }
}

/** The user's chosen time zone, else the device's. */
export function getUserTimeZone() {
  try {
    const saved = safeStorage.getItem(TIMEZONE_KEY);
    if (isValidTimeZone(saved)) return saved;
  } catch (e) {}
  return getDeviceTimeZone();
}

export function setUserTimeZone(tz) {
  if (!isValidTimeZone(tz)) return;
  try { safeStorage.setItem(TIMEZONE_KEY, tz); } catch (e) {}
}

function getDetected() {
  try {
    const raw = safeStorage.getItem(DETECTED_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const lat = Number(data && data.lat);
    const lng = Number(data && data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { ...data, lat, lng };
  } catch (e) {
    return null;
  }
}

export function setDetectedLocation({ city, timezone, lat, lng }) {
  try {
    safeStorage.setItem(DETECTED_KEY, JSON.stringify({ city, timezone, lat, lng, timestamp: Date.now() }));
  } catch (e) {}
}

function offsetMinutes(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date);
    const get = type => Number(parts.find(p => p.type === type).value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch (e) {
    return 0;
  }
}

function coordsForTimeZone(tz) {
  const known = TZ_COORDS[tz];
  if (known) return { lat: known[0], lng: known[1] };
  return { lat: 35, lng: Math.max(-180, Math.min(180, (offsetMinutes(tz) / 60) * 15)) };
}

/**
 * The user's location: { timeZone, lat, lng, source }.
 * GPS coordinates are used only while they still belong to the chosen zone,
 * so picking another zone by hand is not overridden by an old GPS fix.
 */
export function getUserLocation() {
  const timeZone = getUserTimeZone();
  const detected = getDetected();
  if (detected && detected.timezone === timeZone) {
    return { timeZone, lat: detected.lat, lng: detected.lng, source: 'gps' };
  }
  return { timeZone, ...coordsForTimeZone(timeZone), source: 'timezone' };
}

/** Headers that tell our API where the user is (see backend/services/userLocation.js). */
export function getLocationHeaders() {
  try {
    const loc = getUserLocation();
    const headers = { 'X-CalendAI-Timezone': loc.timeZone };
    if (loc.source === 'gps') {
      headers['X-CalendAI-Lat'] = loc.lat.toFixed(4);
      headers['X-CalendAI-Lng'] = loc.lng.toFixed(4);
    }
    return headers;
  } catch (e) {
    return {};
  }
}

/** Preset location id for a zone, or null when the user is elsewhere. */
export function presetLocationForTimeZone(tz) {
  const entry = Object.entries(PRESET_LOCATIONS).find(([, zone]) => zone === tz);
  return entry ? entry[0] : null;
}

/** "UTC+3" style label for a zone right now. */
export function formatUtcOffset(tz, date = new Date()) {
  const mins = offsetMinutes(tz, date);
  const sign = mins >= 0 ? '+' : '-';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/**
 * The instant at which the wall clock in `timeZone` reads `isoDate` `hour`:`minute`.
 * isoDate is "YYYY-MM-DD".
 */
export function zonedTimeToDate(isoDate, hour, minute, timeZone) {
  const [y, mo, d] = String(isoDate).split('-').map(Number);
  if (!y || !mo || !d) return null;
  const target = Date.UTC(y, mo - 1, d, hour, minute);
  let guess = target;
  // Two passes settle the offset, including across a DST change.
  for (let i = 0; i < 2; i++) {
    guess = target - offsetMinutes(timeZone, new Date(guess)) * 60000;
  }
  return new Date(guess);
}
