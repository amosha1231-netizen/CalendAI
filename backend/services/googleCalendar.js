// ──────────────────────────────────────────────
// Shared Google Calendar helpers.
// Extracted from server.js so both the single-user sync path and the
// peer-to-peer mutual-scheduling path reuse the same OAuth/refresh and
// event-body logic instead of duplicating it.
// ──────────────────────────────────────────────
const { google } = require('googleapis');
const User = require('../models/User');

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const PRODUCTION_APP_URL = 'https://calendai-q59p.onrender.com';
const BACKEND_URL = (process.env.BACKEND_URL?.trim() || (isProduction ? PRODUCTION_APP_URL : 'http://localhost:5000')).replace(/\/+$/, '');
const GOOGLE_CALLBACK_URL = (process.env.GOOGLE_CALLBACK_URL?.trim() || `${BACKEND_URL}/api/auth/google/callback`).replace(/\/+$/, '');

/**
 * Format a Date with given hours and minutes into an ISO 8601 string
 * with the correct timezone offset for the given IANA timezone.
 * This avoids the bug where toISOString() always outputs UTC (Z),
 * which causes Google Calendar to misinterpret the time.
 * @param {Date} date - The base date
 * @param {number} hours - The hour (0-23) in the target timezone
 * @param {number} minutes - The minute (0-59) in the target timezone
 * @param {string} timeZone - IANA timezone string (e.g., 'Asia/Jerusalem')
 * @returns {string} ISO 8601 string with offset (e.g., '2026-08-24T07:00:00+03:00')
 */
function formatDateTimeWithTimezone(date, hours, minutes, timeZone) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = dateParts.find(p => p.type === 'year').value;
  const month = dateParts.find(p => p.type === 'month').value;
  const day = dateParts.find(p => p.type === 'day').value;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset'
  }).format(date);
  const offsetMatch = formatted.match(/GMT([+-]\d{2}:\d{2})/);
  const offset = offsetMatch ? offsetMatch[1] : '+03:00';

  return `${year}-${month}-${day}T${hh}:${mm}:00${offset}`;
}

/**
 * Resolve a zoned wall-clock time (ISO date + "HH:MM") into an absolute Date,
 * correctly accounting for the IANA timezone's offset (including DST).
 * Generalizes the single-purpose "zonedMidnight" helper previously inlined
 * in /api/schedule/free-slots to any time-of-day, for freebusy windowing.
 * @param {string} isoDate - "YYYY-MM-DD"
 * @param {string} timeHHMM - "HH:MM" (24-hour)
 * @param {string} timeZone - IANA timezone string
 * @returns {Date}
 */
function zonedDateTime(isoDate, timeHHMM, timeZone) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hour, minute] = timeHHMM.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(guess));
    const value = type => Number(parts.find(p => p.type === type).value);
    const observed = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    guess += target - observed;
  }
  return new Date(guess);
}

/**
 * Helper: Refresh Google access token and save to DB.
 * Sets up token refresh handler on the OAuth2 client.
 * @param {Object} user - The user document with googleAccessToken and googleRefreshToken
 * @returns {Promise<google.auth.OAuth2>} Configured OAuth2 client with auto-refresh
 */
async function createOAuth2ClientWithRefresh(user) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID?.trim(),
    process.env.GOOGLE_CLIENT_SECRET?.trim(),
    GOOGLE_CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken || undefined
  });

  // Auto-refresh tokens: when Google issues a new access token, save it to DB
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      try {
        await User.findByIdAndUpdate(user._id, {
          googleAccessToken: tokens.access_token,
          ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {})
        });
        console.log(`[Google Calendar] Tokens refreshed for user ${user._id}`);
      } catch (err) {
        console.error('[Google Calendar] Failed to save refreshed tokens:', err.message);
      }
    }
  });

  // Force refresh if the current access token might be expired
  try {
    const tokenInfo = oauth2Client.credentials;
    if (tokenInfo.refresh_token && tokenInfo.expiry_date && tokenInfo.expiry_date < Date.now()) {
      console.log('[Google Calendar] Access token expired, refreshing...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    }
  } catch (refreshErr) {
    console.warn('[Google Calendar] Token refresh pre-check failed:', refreshErr.message);
    // Continue anyway — the actual API call will trigger a retry
  }

  return oauth2Client;
}

/**
 * Build a Google Calendar event request body. Factored out of the
 * duplicated body-building code in syncEventToGoogleCalendar and
 * /api/add-to-google-calendar so single-user and mutual (dual-insert)
 * event creation share one implementation.
 */
function buildGcalEventBody({ title, description, eventDate, startHour, startMinute, endHour, endMinute, timeZone, reminders, recurrenceRule }) {
  const requestBody = {
    summary: title || 'CalendAI Event',
    start: { dateTime: formatDateTimeWithTimezone(eventDate, startHour, startMinute, timeZone), timeZone },
    end: { dateTime: formatDateTimeWithTimezone(eventDate, endHour, endMinute, timeZone), timeZone },
  };
  if (description) requestBody.description = description;
  if (reminders) requestBody.reminders = reminders;
  if (recurrenceRule) requestBody.recurrence = [recurrenceRule];
  return requestBody;
}

module.exports = {
  GOOGLE_CALLBACK_URL,
  formatDateTimeWithTimezone,
  zonedDateTime,
  createOAuth2ClientWithRefresh,
  buildGcalEventBody
};
