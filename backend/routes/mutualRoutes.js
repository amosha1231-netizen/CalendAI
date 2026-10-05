// ──────────────────────────────────────────────
// Mutual (peer-to-peer) scheduling routes.
// Two CalendAI users, both with Google Calendar connected, see their
// overlapping free time and lock a slot onto both calendars at once.
// The host picks the invitee by email (no contacts/friends graph) — if the
// invitee isn't a connected CalendAI user, the frontend falls back to the
// existing share-link flow (Booking model / /api/booking/create-link).
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { google } = require('googleapis');

const JWT_SECRET = require('../config/jwtSecret');
const User = require('../models/User');
const MutualBooking = require('../models/MutualBooking');
const { createOAuth2ClientWithRefresh, buildGcalEventBody } = require('../services/googleCalendar');
const { getMutualFreeSlots, isSlotMutuallyFree } = require('../services/mutualAvailability');

const DEFAULT_LOCATION_ID = 'jerusalem';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Auth helper (same JWT/session extraction convention as the other route files) ──
function getAuthenticatedUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) return decoded.id;
    } catch (err) {
      // fall through
    }
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    const sessionUser = req.session?.passport?.user;
    const id = sessionUser?._id || sessionUser?.id;
    if (id) return id;
  }
  return null;
}

function requireAuth(req, res, next) {
  const userId = getAuthenticatedUserId(req);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  req.userId = userId;
  next();
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function formatTime12(h, m) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getTodayDayName() {
  return DAY_NAMES[new Date().getDay()];
}

async function loadAuthorizedSession(req, res) {
  const session = await MutualBooking.findOne({ sessionId: req.params.id });
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return null;
  }
  const isParty = session.hostId.equals(req.userId) || session.inviteeId.equals(req.userId);
  if (!isParty) {
    res.status(403).json({ error: 'Not authorized for this session.' });
    return null;
  }
  return session;
}

/**
 * Delete whichever Google Calendar events a completed session created, and
 * pull the mirrored entries from both users' local `schedule` docs. Shared
 * by the cancel route and the confirm-handler's failure-rollback path.
 */
async function rollbackCompletedSession(session) {
  const [host, invitee] = await Promise.all([
    User.findById(session.hostId),
    User.findById(session.inviteeId)
  ]);

  if (session.hostEventId && host?.googleAccessToken) {
    try {
      const oauth = await createOAuth2ClientWithRefresh(host);
      await google.calendar({ version: 'v3', auth: oauth }).events.delete({ calendarId: 'primary', eventId: session.hostEventId });
    } catch (err) {
      console.error('Failed to roll back host Google Calendar event:', err.message);
    }
  }
  if (session.inviteeEventId && invitee?.googleAccessToken) {
    try {
      const oauth = await createOAuth2ClientWithRefresh(invitee);
      await google.calendar({ version: 'v3', auth: oauth }).events.delete({ calendarId: 'primary', eventId: session.inviteeEventId });
    } catch (err) {
      console.error('Failed to roll back invitee Google Calendar event:', err.message);
    }
  }

  // Pull by mutualSessionId marker rather than by day key guesswork.
  const dayKeys = [...DAY_NAMES, 'Today'];
  const pullUpdate = {
    $pull: Object.fromEntries(dayKeys.map(day => [`schedule.${day}`, { mutualSessionId: session.sessionId }]))
  };
  await Promise.all([
    User.updateOne({ _id: session.hostId }, pullUpdate).catch(() => {}),
    User.updateOne({ _id: session.inviteeId }, pullUpdate).catch(() => {})
  ]);
}

async function pushToSchedule(userDoc, dayName, eventObj) {
  const update = { $push: { [`schedule.${dayName}`]: eventObj }, $inc: { scheduleRevision: 1 } };
  if (dayName === getTodayDayName()) update.$push['schedule.Today'] = eventObj;
  const observedRevision = Number(userDoc.scheduleRevision || 0);
  const result = await User.updateOne({
    _id: userDoc._id,
    $or: [
      { scheduleRevision: observedRevision },
      ...(observedRevision === 0 ? [{ scheduleRevision: { $exists: false } }] : [])
    ]
  }, update);
  return result.matchedCount > 0;
}

// ──────────────────────────────────────────────
// GET /api/mutual/lookup?email=
// Resolves whether `email` belongs to a Google-connected CalendAI user,
// without ever exposing tokens or other account details.
// ──────────────────────────────────────────────
router.get('/lookup', requireAuth, async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required.' });

    const user = await User.findOne({ email }).select('displayName email googleAccessToken').lean();
    if (!user) return res.json({ found: false, hasGoogle: false });
    res.json({ found: true, displayName: user.displayName || user.email, hasGoogle: !!user.googleAccessToken });
  } catch (err) {
    console.error('Mutual lookup error:', err);
    res.status(500).json({ error: 'Lookup failed.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mutual/sessions
// Creates a mutual-scheduling session between the authenticated host and
// an invitee resolved by email. Both sides must already have Google
// Calendar connected.
// ──────────────────────────────────────────────
router.post('/sessions', requireAuth, async (req, res) => {
  try {
    const { inviteeEmail, subject, duration, locationId } = req.body;
    const email = String(inviteeEmail || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'inviteeEmail is required.' });
    if (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 1440) {
      return res.status(400).json({ error: 'duration must be between 1 and 1440 minutes.' });
    }

    const host = await User.findById(req.userId);
    if (!host) return res.status(401).json({ error: 'Host account not found.' });
    if (!host.googleAccessToken) return res.status(400).json({ error: 'Connect your Google Calendar first.' });

    const invitee = await User.findOne({ email });
    if (!invitee) return res.status(404).json({ error: 'No CalendAI user found with that email.' });
    if (invitee._id.equals(host._id)) return res.status(400).json({ error: 'You cannot schedule a mutual meeting with yourself.' });
    if (!invitee.googleAccessToken) return res.status(400).json({ error: 'That user has not connected Google Calendar yet.' });

    const sessionId = `mut_${crypto.randomBytes(18).toString('hex')}`;
    const session = await MutualBooking.create({
      sessionId,
      hostId: host._id,
      inviteeId: invitee._id,
      inviteeEmail: email,
      subject: subject || 'Meeting',
      duration: Number(duration),
      locationId: locationId || DEFAULT_LOCATION_ID,
      status: 'active'
    });

    res.json({ ok: true, sessionId: session.sessionId, inviteeDisplayName: invitee.displayName || invitee.email });
  } catch (err) {
    console.error('Create mutual session error:', err);
    res.status(500).json({ error: 'Failed to create mutual scheduling session.' });
  }
});

// ──────────────────────────────────────────────
// GET /api/mutual/sessions/:id/availability
// Returns mutual free slots across the next few days for both users.
// ──────────────────────────────────────────────
router.get('/sessions/:id/availability', requireAuth, async (req, res) => {
  try {
    const session = await loadAuthorizedSession(req, res);
    if (!session) return;
    if (session.status !== 'active') {
      return res.status(409).json({ error: session.status === 'processing' ? 'This session is being confirmed.' : 'This session is no longer active.' });
    }

    const [host, invitee] = await Promise.all([
      User.findById(session.hostId),
      User.findById(session.inviteeId)
    ]);
    if (!host || !invitee) return res.status(404).json({ error: 'Host or invitee account missing.' });
    if (!host.googleAccessToken || !invitee.googleAccessToken) {
      return res.status(409).json({ error: 'Both users must have Google Calendar connected.' });
    }

    const rangeDays = Math.min(Math.max(parseInt(req.query.rangeDays, 10) || 7, 1), 14);
    const days = await getMutualFreeSlots(host, invitee, {
      locationId: session.locationId,
      duration: session.duration,
      rangeDays
    });

    res.json({ ok: true, subject: session.subject, duration: session.duration, days });
  } catch (err) {
    console.error('Mutual availability error:', err);
    res.status(500).json({ error: 'Failed to compute mutual availability.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mutual/sessions/:id/confirm
// Atomically claims the session, re-verifies the chosen window is still
// free on BOTH calendars, inserts the event on both, mirrors it into both
// users' local `schedule`, and rolls back on any failure after the claim —
// mirroring the exact claim→verify→insert→persist→rollback skeleton used by
// the existing /api/booking/:id/confirm (anonymous-guest) flow.
// ──────────────────────────────────────────────
router.post('/sessions/:id/confirm', requireAuth, async (req, res) => {
  let claimed = false;
  let hostEventId = null;
  let inviteeEventId = null;
  let claimedSession = null;
  try {
    const { date, startTime, endTime } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return res.status(400).json({ error: 'A valid ISO date is required.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      return res.status(400).json({ error: 'Cannot confirm a meeting on a past date.' });
    }
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (startMin === null || endMin === null || endMin <= startMin) {
      return res.status(400).json({ error: 'Invalid time range.' });
    }

    const existing = await MutualBooking.findOne({ sessionId: req.params.id });
    if (!existing) return res.status(404).json({ error: 'Session not found.' });
    const isParty = existing.hostId.equals(req.userId) || existing.inviteeId.equals(req.userId);
    if (!isParty) return res.status(403).json({ error: 'Not authorized for this session.' });
    if (endMin - startMin !== existing.duration) {
      return res.status(400).json({ error: `The selected window must be exactly ${existing.duration} minutes long.` });
    }

    claimedSession = await MutualBooking.findOneAndUpdate(
      { sessionId: req.params.id, status: 'active' },
      { $set: { status: 'processing' } },
      { new: true }
    );
    if (!claimedSession) return res.status(409).json({ error: 'This session has already been claimed or cancelled.' });
    claimed = true;

    const [host, invitee] = await Promise.all([
      User.findById(claimedSession.hostId),
      User.findById(claimedSession.inviteeId)
    ]);
    if (!host || !invitee) throw Object.assign(new Error('Host or invitee account missing.'), { status: 404 });
    if (!host.googleAccessToken || !invitee.googleAccessToken) {
      throw Object.assign(new Error('Both users must have Google Calendar connected.'), { status: 409 });
    }

    // Race guard: re-check the chosen window is still free on BOTH calendars
    // right before writing (the availability list the client saw may be stale).
    const { free: stillFree, timeZone } = await isSlotMutuallyFree(host, invitee, {
      locationId: claimedSession.locationId, date, startTime, endTime
    });
    if (!stillFree) throw Object.assign(new Error('This time is no longer available on both calendars.'), { status: 409 });

    const [y, m, d] = date.split('-').map(Number);
    const eventDate = new Date(y, m - 1, d);
    const startHour = Math.floor(startMin / 60), startMinute = startMin % 60;
    const endHour = Math.floor(endMin / 60), endMinute = endMin % 60;
    const dayOfWeek = DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const subject = claimedSession.subject || 'Meeting';

    const hostBody = buildGcalEventBody({
      title: subject,
      description: `CalendAI mutual meeting with ${invitee.displayName || invitee.email}`,
      eventDate, startHour, startMinute, endHour, endMinute, timeZone
    });
    const inviteeBody = buildGcalEventBody({
      title: subject,
      description: `CalendAI mutual meeting with ${host.displayName || host.email}`,
      eventDate, startHour, startMinute, endHour, endMinute, timeZone
    });

    try {
      const hostOAuth = await createOAuth2ClientWithRefresh(host);
      const hostResp = await google.calendar({ version: 'v3', auth: hostOAuth }).events.insert({ calendarId: 'primary', requestBody: hostBody });
      hostEventId = hostResp?.data?.id || null;

      const inviteeOAuth = await createOAuth2ClientWithRefresh(invitee);
      const inviteeResp = await google.calendar({ version: 'v3', auth: inviteeOAuth }).events.insert({ calendarId: 'primary', requestBody: inviteeBody });
      inviteeEventId = inviteeResp?.data?.id || null;
    } catch (gcalErr) {
      throw Object.assign(new Error(`Google Calendar insertion failed: ${gcalErr.message}`), { status: 502 });
    }

    const startTimeStr = formatTime12(startHour, startMinute);
    const endTimeStr = formatTime12(endHour, endMinute);
    const hostEvent = {
      title: `${subject} — ${invitee.displayName || invitee.email}`,
      day: dayOfWeek, startTime: startTimeStr, endTime: endTimeStr,
      recurrence: 'once', location: claimedSession.locationId || DEFAULT_LOCATION_ID,
      targetDate: date, mutualSessionId: claimedSession.sessionId
    };
    const inviteeEvent = {
      ...hostEvent,
      title: `${subject} — ${host.displayName || host.email}`
    };

    const hostPersisted = await pushToSchedule(host, dayOfWeek, hostEvent);
    if (!hostPersisted) throw Object.assign(new Error('The host schedule changed during confirmation. Please try again.'), { status: 409 });

    const inviteePersisted = await pushToSchedule(invitee, dayOfWeek, inviteeEvent);
    if (!inviteePersisted) throw Object.assign(new Error('The invitee schedule changed during confirmation. Please try again.'), { status: 409 });

    const completed = await MutualBooking.findOneAndUpdate(
      { sessionId: req.params.id, status: 'processing' },
      { $set: { status: 'completed', hostEventId, inviteeEventId, confirmedAt: new Date(), lockedSlot: { date, startTime: startTimeStr, endTime: endTimeStr, timeZone } } },
      { new: true }
    );
    if (!completed) throw Object.assign(new Error('Could not finalize this session.'), { status: 503 });

    res.json({ ok: true, message: 'Mutual meeting confirmed on both calendars!', session: completed });
  } catch (err) {
    console.error('Confirm mutual session error:', err);

    // Reuse the same calendar-delete + schedule-pull logic the /cancel route
    // uses for a completed session, instead of duplicating it inline here.
    // Safe to call unconditionally once claimed: it no-ops on whichever side
    // (calendar event / schedule push) never actually happened.
    if (claimed && claimedSession) {
      await rollbackCompletedSession({
        hostId: claimedSession.hostId,
        inviteeId: claimedSession.inviteeId,
        sessionId: claimedSession.sessionId,
        hostEventId,
        inviteeEventId
      });
    }
    if (claimed) await MutualBooking.updateOne({ sessionId: req.params.id, status: 'processing' }, { $set: { status: 'active' } }).catch(() => {});

    res.status(err.status || 500).json({ error: err.message || 'Failed to confirm mutual session.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/mutual/sessions/:id/cancel
// ──────────────────────────────────────────────
router.post('/sessions/:id/cancel', requireAuth, async (req, res) => {
  try {
    const session = await loadAuthorizedSession(req, res);
    if (!session) return;
    if (session.status === 'cancelled') return res.json({ ok: true, alreadyCancelled: true });

    if (session.status === 'completed') {
      await rollbackCompletedSession(session);
    }
    await MutualBooking.updateOne({ sessionId: req.params.id }, { $set: { status: 'cancelled' } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Cancel mutual session error:', err);
    res.status(500).json({ error: 'Failed to cancel session.' });
  }
});

module.exports = router;
