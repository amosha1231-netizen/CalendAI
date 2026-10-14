/**
 * User Location — resolves where a request comes from (time zone + coordinates).
 *
 * The frontend sends the user's IANA time zone, and GPS coordinates when the
 * user allowed location detection, on every API request:
 *   X-CalendAI-Timezone: America/New_York
 *   X-CalendAI-Lat / X-CalendAI-Lng: 40.71 / -74.00
 * A `timezone` field in the body or query string takes precedence.
 *
 * Requests without these (old clients, Siri shortcuts) fall back to Jerusalem,
 * which is the behaviour the app had before location support.
 */

const DEFAULT_TIMEZONE = 'Asia/Jerusalem';
const DEFAULT_COORDS = { lat: 31.7683, lng: 35.2137 };

// Representative city coordinates per time zone, used for sunset when the
// user did not share GPS. Keys cover the timezone picker plus common zones.
const TZ_COORDS = {
  'Asia/Jerusalem': { lat: 31.7683, lng: 35.2137 },
  'Asia/Tel_Aviv': { lat: 32.0853, lng: 34.7818 },
  'Asia/Hebron': { lat: 31.5326, lng: 35.0998 },
  'Asia/Gaza': { lat: 31.5017, lng: 34.4668 },
  'America/New_York': { lat: 40.7128, lng: -74.006 },
  'America/Toronto': { lat: 43.6532, lng: -79.3832 },
  'America/Chicago': { lat: 41.8781, lng: -87.6298 },
  'America/Denver': { lat: 39.7392, lng: -104.9903 },
  'America/Phoenix': { lat: 33.4484, lng: -112.074 },
  'America/Los_Angeles': { lat: 34.0522, lng: -118.2437 },
  'America/Mexico_City': { lat: 19.4326, lng: -99.1332 },
  'America/Sao_Paulo': { lat: -23.5505, lng: -46.6333 },
  'America/Argentina/Buenos_Aires': { lat: -34.6037, lng: -58.3816 },
  'Europe/London': { lat: 51.5072, lng: -0.1276 },
  'Europe/Paris': { lat: 48.8566, lng: 2.3522 },
  'Europe/Berlin': { lat: 52.52, lng: 13.405 },
  'Europe/Madrid': { lat: 40.4168, lng: -3.7038 },
  'Europe/Rome': { lat: 41.9028, lng: 12.4964 },
  'Europe/Amsterdam': { lat: 52.3676, lng: 4.9041 },
  'Europe/Brussels': { lat: 50.8503, lng: 4.3517 },
  'Europe/Zurich': { lat: 47.3769, lng: 8.5417 },
  'Europe/Vienna': { lat: 48.2082, lng: 16.3738 },
  'Europe/Kiev': { lat: 50.4501, lng: 30.5234 },
  'Europe/Kyiv': { lat: 50.4501, lng: 30.5234 },
  'Europe/Moscow': { lat: 55.7558, lng: 37.6173 },
  'Africa/Johannesburg': { lat: -26.2041, lng: 28.0473 },
  'Asia/Dubai': { lat: 25.2048, lng: 55.2708 },
  'Asia/Kolkata': { lat: 28.6139, lng: 77.209 },
  'Asia/Shanghai': { lat: 31.2304, lng: 121.4737 },
  'Asia/Hong_Kong': { lat: 22.3193, lng: 114.1694 },
  'Asia/Singapore': { lat: 1.3521, lng: 103.8198 },
  'Asia/Tokyo': { lat: 35.6762, lng: 139.6503 },
  'Australia/Sydney': { lat: -33.8688, lng: 151.2093 },
  'Australia/Melbourne': { lat: -37.8136, lng: 144.9631 },
  'Pacific/Auckland': { lat: -36.8485, lng: 174.7633 }
};

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** UTC offset of a time zone at a given instant, in minutes (e.g. +180 for Israel in summer). */
function getTimeZoneOffsetMinutes(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date);
    const get = type => Number(parts.find(p => p.type === type).value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/**
 * Coordinates for a time zone without GPS: a known city, otherwise a point on
 * the zone's meridian at a mid latitude (good to within a few minutes of sunset).
 */
function coordsForTimeZone(timeZone) {
  if (TZ_COORDS[timeZone]) return TZ_COORDS[timeZone];
  if (!isValidTimeZone(timeZone)) return DEFAULT_COORDS;
  const offsetHours = getTimeZoneOffsetMinutes(timeZone) / 60;
  return { lat: 35, lng: Math.max(-180, Math.min(180, offsetHours * 15)) };
}

function parseCoord(value, limit) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/**
 * Build a location from raw values, validating everything.
 * @returns {{ timeZone: string, lat: number, lng: number, source: 'gps'|'timezone'|'default' }}
 */
function buildLocation({ timeZone, lat, lng } = {}) {
  const tz = isValidTimeZone(timeZone) ? timeZone : null;
  const la = parseCoord(lat, 90);
  const ln = parseCoord(lng, 180);
  if (tz && la !== null && ln !== null) return { timeZone: tz, lat: la, lng: ln, source: 'gps' };
  if (tz) return { timeZone: tz, ...coordsForTimeZone(tz), source: 'timezone' };
  return { timeZone: DEFAULT_TIMEZONE, ...DEFAULT_COORDS, source: 'default' };
}

/** The requesting user's location, from body/query fields or the X-CalendAI-* headers. */
function getRequestLocation(req) {
  const body = (req && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) ? req.body : {};
  const query = (req && req.query) || {};
  const header = name => (req && typeof req.get === 'function' ? req.get(name) : undefined);
  return buildLocation({
    timeZone: body.timezone || query.timezone || header('x-calendai-timezone'),
    lat: query.lat ?? header('x-calendai-lat'),
    lng: query.lng ?? header('x-calendai-lng')
  });
}

/** Just the requesting user's IANA time zone, or null when the request did not say. */
function getRequestTimeZone(req) {
  const loc = getRequestLocation(req);
  return loc.source === 'default' ? null : loc.timeZone;
}

module.exports = {
  DEFAULT_TIMEZONE,
  DEFAULT_COORDS,
  TZ_COORDS,
  isValidTimeZone,
  getTimeZoneOffsetMinutes,
  coordsForTimeZone,
  buildLocation,
  getRequestLocation,
  getRequestTimeZone
};
