// ──────────────────────────────────────────────
// Calendar invites sent straight from CalendAI.
// The host picks a time and a list of guest emails; the event is created on
// the host's Google Calendar with those guests as attendees and
// sendUpdates: 'all', so Google emails each guest a regular invitation —
// Yes / No / Maybe buttons, an invite.ics for non-Google calendars, and a
// Google Meet link when asked for. Guests don't need a CalendAI account.
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { google } = require('googleapis');

const User = require('../models/User');
const { createOAuth2ClientWithRefresh, buildGcalEventBody, insertEventWithOptionalMeet, zonedDateTime } = require('../services/googleCalendar');
const { isValidIsoDate, todayIsoInTimeZone, FRIDAY_SHABBAT_CUTOFF_MIN } = require('../services/mutualAvailability');
const { getRequestTimeZone } = require('../services/userLocation');
const shabbatService = require('../services/shabbatService');

const DEFAULT_LOCATION_ID = 'jerusalem';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_ATTENDEES = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Every send makes Google email up to MAX_ATTENDEES people, and every
// conflict check is a live Google API call — keep both metered.
const inviteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a minute.', code: 'rate_limited' }
});

function requireAuth(req, res, next) {
  const getAuthenticatedUserId = req.app.get('getAuthenticatedUserId');
  const userId = getAuthenticatedUserId ? getAuthenticatedUserId(req) : null;
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    return res.status(401).json({ error: 'Sign in required.', code: 'auth_required' });
  }
  req.userId = String(userId);
  next();
}

function badRequest(code, error) {
  return Object.assign(new Error(error), { status: 400, code });
}

/** "HH:MM" (24h) → minutes since midnight, or null. */
function parseClock24(value) {
  const match = typeof value === 'string' && value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime12(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Validate the date/time window shared by both routes. Applies the same
 * Shabbat rules as the rest of the app: nothing on Saturday, and on Friday
 * nothing running past the 16:00 cutoff.
 */
function parseWindow(body, timeZone) {
  const { date, startTime, endTime } = body || {};
  if (!isValidIsoDate(date)) throw badRequest('invalid_date', 'A valid date (YYYY-MM-DD) is required.');
  const startMin = parseClock24(startTime);
  const endMin = parseClock24(endTime);
  if (startMin === null || endMin === null) throw badRequest('invalid_time', 'startTime and endTime must be HH:MM.');
  if (endMin <= startMin) throw badRequest('end_before_start', 'The meeting must end after it starts.');
  if (date < todayIsoInTimeZone(timeZone)) throw badRequest('date_in_past', 'The date is in the past.');

  const dayName = DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];
  if (shabbatService.isShabbatDay(dayName) || (dayName === 'Friday' && endMin > FRIDAY_SHABBAT_CUTOFF_MIN)) {
    throw badRequest('shabbat', 'Meetings cannot be scheduled on Shabbat.');
  }
  return { date, startMin, endMin, dayName };
}

function toHHMM(totalMinutes) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

async function getCalendarForUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404, code: 'user_not_found' });
  if (!user.googleAccessToken) {
    throw Object.assign(new Error('Connect Google Calendar to send invites.'), { status: 409, code: 'google_not_connected' });
  }
  const oauth2Client = await createOAuth2ClientWithRefresh(user);
  return { user, calendar: google.calendar({ version: 'v3', auth: oauth2Client }) };
}

/**
 * Events on the user's primary calendar that overlap [start, end), the same
 * way Google's own "Conflict with N other events" note works: timed events
 * the user hasn't declined and that actually block time.
 */
async function listConflicts(calendar, { date, startMin, endMin }, timeZone) {
  const windowStart = zonedDateTime(date, toHHMM(startMin), timeZone);
  const windowEnd = zonedDateTime(date, toHHMM(endMin), timeZone);
  const result = await calendar.events.list({
    calendarId: 'primary',
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20
  });
  const clock = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  return (result.data?.items || [])
    .filter(ev => ev.status !== 'cancelled'
      && ev.transparency !== 'transparent'
      && ev.start?.dateTime && ev.end?.dateTime
      && !(ev.attendees || []).some(a => a.self && a.responseStatus === 'declined'))
    .map(ev => ({ title: ev.summary || '', startTime: clock(ev.start.dateTime), endTime: clock(ev.end.dateTime) }));
}

function sendError(res, err, fallback) {
  if (err.status) return res.status(err.status).json({ error: err.message, code: err.code || 'error' });
  const googleStatus = Number(err.code) || err.response?.status;
  if (googleStatus === 401) {
    return res.status(401).json({ error: 'Your Google sign-in expired. Please sign in again.', code: 'google_auth_expired' });
  }
  console.error(fallback, err);
  res.status(500).json({ error: fallback, code: 'server_error' });
}

// ──────────────────────────────────────────────
// POST /api/invites/conflicts  { date, startTime, endTime }
// Lists the host's existing events that overlap the proposed time.
// ──────────────────────────────────────────────
router.post('/conflicts', inviteLimiter, requireAuth, async (req, res) => {
  try {
    const timeZone = getRequestTimeZone(req);
    const window = parseWindow(req.body, timeZone);
    const { calendar } = await getCalendarForUser(req.userId);
    const conflicts = await listConflicts(calendar, window, timeZone);
    res.json({ conflicts });
  } catch (err) {
    sendError(res, err, 'Could not check your calendar.');
  }
});

// ──────────────────────────────────────────────
// POST /api/invites
// { title, description?, date, startTime, endTime, attendees: [email], addMeet? }
// Creates the event on the host's Google Calendar and has Google email
// every attendee an invitation.
// ──────────────────────────────────────────────
router.post('/', inviteLimiter, requireAuth, async (req, res) => {
  try {
    const timeZone = getRequestTimeZone(req);
    const { title, description, attendees, addMeet = true } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 200) throw badRequest('invalid_title', 'A meeting title is required.');
    if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > 2000)) {
      throw badRequest('invalid_description', 'The description is too long.');
    }
    if (!Array.isArray(attendees)) throw badRequest('no_attendees', 'Add at least one guest.');
    const emails = [...new Set(attendees.map(e => (typeof e === 'string' ? e.trim().toLowerCase() : '')).filter(Boolean))];
    const invalid = emails.filter(e => e.length > 200 || !EMAIL_RE.test(e));
    if (invalid.length) throw badRequest('invalid_email', `Invalid email: ${invalid[0]}`);
    const window = parseWindow(req.body, timeZone);

    const { user, calendar } = await getCalendarForUser(req.userId);
    const guests = emails.filter(e => e !== String(user.email || '').toLowerCase());
    if (!guests.length) throw badRequest('no_attendees', 'Add at least one guest.');
    if (guests.length > MAX_ATTENDEES) throw badRequest('too_many_attendees', `Up to ${MAX_ATTENDEES} guests per invite.`);

    const [y, m, d] = window.date.split('-').map(Number);
    const requestBody = buildGcalEventBody({
      title: title.trim(),
      description: description ? description.trim() : 'Sent with CalendAI',
      eventDate: new Date(y, m - 1, d),
      startHour: Math.floor(window.startMin / 60), startMinute: window.startMin % 60,
      endHour: Math.floor(window.endMin / 60), endMinute: window.endMin % 60,
      timeZone,
      attendees: guests.map(email => ({ email })),
      addMeet: addMeet !== false
    });
    const { event, meetLink } = await insertEventWithOptionalMeet(calendar, { requestBody, sendUpdates: 'all' });

    // Mirror it into the CalendAI schedule so it shows up in the app right
    // away. Google has already emailed the guests at this point, so a failure
    // here is logged and reported but never undoes the invite.
    const localEvent = {
      title: title.trim(),
      day: window.dayName,
      startTime: formatTime12(window.startMin),
      endTime: formatTime12(window.endMin),
      recurrence: 'once',
      location: user.locationId || DEFAULT_LOCATION_ID,
      targetDate: window.date,
      googleEventId: event.id || null,
      attendees: guests,
      ...(meetLink ? { meetLink } : {})
    };
    let savedToSchedule = true;
    try {
      const push = { [`schedule.${window.dayName}`]: localEvent };
      if (window.date === todayIsoInTimeZone(timeZone)) push['schedule.Today'] = localEvent;
      await User.updateOne({ _id: user._id }, { $push: push, $inc: { scheduleRevision: 1 } });
    } catch (saveErr) {
      savedToSchedule = false;
      console.error('Invite sent but saving to the schedule failed:', saveErr.message);
    }

    res.json({
      ok: true,
      eventId: event.id || null,
      htmlLink: event.htmlLink || null,
      meetLink,
      attendees: guests,
      event: localEvent,
      savedToSchedule
    });
  } catch (err) {
    sendError(res, err, 'Could not send the invite.');
  }
});

module.exports = router;
// Exposed for unit testing only.
module.exports.parseWindow = parseWindow;
module.exports.parseClock24 = parseClock24;
