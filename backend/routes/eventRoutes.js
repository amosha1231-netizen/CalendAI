// ──────────────────────────────────────────────
// Event Routes
// (Siri / Shortcuts lives in server.js: POST /api/events/siri, keyed by a personal Siri key.)
// Multi-Tenancy Isolation: All events are scoped to the authenticated user.
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = require('../config/jwtSecret');

// ── User Model (shared model, see ../models/User.js) ──
const User = require('../models/User');

// ── Event Model (shared from ../models/Event.js — Multi-Tenancy Isolated) ──
const Event = require('../models/Event');

// ── Helper: Shabbat guard ──
// Saturday is closed until motzei Shabbat (havdalah at the user's location);
// Friday closes at 16:00. See services/shabbatService.js.
const shabbatService = require('../services/shabbatService');
const { getRequestLocation } = require('../services/userLocation');

/** "HH:MM AM/PM" or "HH:MM" → minutes since midnight, or null. */
function clockToMinutes(value) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3]) {
    const pm = m[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return h * 60 + min;
}

/**
 * Would an event on `day` at `startTime` (optionally on `targetDate`) fall in
 * Shabbat? Motzei Shabbat is allowed; a Saturday event with no time is not.
 */
function isShabbatEvent(req, day, startTime, targetDate) {
  const iso = targetDate ? String(targetDate instanceof Date ? targetDate.toISOString() : targetDate).slice(0, 10) : undefined;
  const location = getRequestLocation(req);
  const startMin = clockToMinutes(startTime);
  const isoIsSaturday = /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && new Date(`${iso}T12:00:00Z`).getUTCDay() === 6;
  if (shabbatService.isShabbatDay(day) || isoIsSaturday) {
    return shabbatService.isShabbatSlot({ date: isoIsSaturday ? iso : undefined, dayName: 'Saturday', startMin, location });
  }
  return day === 'Friday' && startMin !== null && startMin >= shabbatService.FRIDAY_SHABBAT_CUTOFF_MIN;
}

function shabbatBlockedMessage(req, targetDate) {
  const iso = targetDate ? String(targetDate).slice(0, 10) : undefined;
  const clock = shabbatService.motzashStartClock(/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso : undefined, getRequestLocation(req));
  return `שבת שלום 🕯️ המערכת אינה מאפשרת קביעת פעילויות בשבת. אפשר לקבוע במוצאי שבת, מ-${clock}.`;
}

function getTodayDayName() {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[new Date().getDay()];
}

function syncTodayWithCurrentDay(schedule) {
  const todayName = getTodayDayName();
  schedule['Today'] = [...(schedule[todayName] || [])];
  return schedule;
}

// ── Helper: Extract authenticated user ID from request ──
// Supports both JWT Bearer tokens and session-based (passport) auth.
function extractUserId(req) {
  // 1. JWT Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) return decoded.id;
    } catch (err) {
      return null;
    }
  }

  // 2. Session-based auth (passport)
  if (req.isAuthenticated && req.isAuthenticated()) {
    const sessionUser = req.session?.passport?.user;
    const userId = sessionUser?._id || sessionUser?.id || sessionUser?.googleId;
    if (userId) return userId;
  }

  return null;
}

// ──────────────────────────────────────────────
// GET /api/events
// Fetch ALL events for the authenticated user, sorted by startTime.
// Multi-Tenancy: Events are strictly filtered by userId.
// ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    let query = { userId };

    // Optional day filter
    if (req.query.day) {
      query.day = req.query.day;
    }

    const events = await Event.find(query).sort({ startTime: 1 });
    res.json({ events });
  } catch (error) {
    console.error('[GET /api/events] Error:', error);
    res.status(500).json({ error: 'Failed to fetch events.' });
  }
});

// ──────────────────────────────────────────────
// POST /api/events
// Create a new event. The event is ALWAYS saved with the authenticated user's ID.
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const userId = extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    const { title, day, startTime, endTime, recurrence, location, eventType, duration, isSleep, reminderMinutesBefore, targetDate } = req.body;

    if (!title || !day) {
      return res.status(400).json({ error: 'title and day are required.' });
    }

    // ── HARD SHABBAT GUARD: Saturday only from motzei Shabbat, Friday until 16:00 ──
    if (isShabbatEvent(req, day, startTime, targetDate)) {
      return res.status(400).json({ isBlocked: true, blockedMessage: shabbatBlockedMessage(req, targetDate) });
    }

    // ALWAYS bind the event to the authenticated user - never trust client-provided userId
    const event = await Event.create({
      userId: new mongoose.Types.ObjectId(userId),
      title,
      day,
      startTime: startTime || '',
      endTime: endTime || startTime || '',
      recurrence: recurrence || 'once',
      location: location || 'jerusalem',
      eventType: eventType || 'activity',
      duration: duration || 60,
      isSleep: isSleep || false,
      reminderMinutesBefore: reminderMinutesBefore || 0,
      targetDate: targetDate ? new Date(targetDate) : undefined
    });

    // Also sync to the user's schedule object for backward compatibility
    try {
      const user = await User.findById(userId);
      if (user && user.schedule) {
        const schedule = user.schedule;
        const actualDay = day === 'Today' ? getTodayDayName() : day;
        if (!schedule[actualDay]) schedule[actualDay] = [];
        schedule[actualDay].push({
          _id: event._id,
          title: event.title,
          day: actualDay,
          startTime: event.startTime,
          endTime: event.endTime,
          recurrence: event.recurrence,
          location: event.location,
          eventType: event.eventType,
          duration: event.duration,
          isSleep: event.isSleep,
          reminderMinutesBefore: event.reminderMinutesBefore
        });
        syncTodayWithCurrentDay(schedule);
        await User.findByIdAndUpdate(userId, { $set: { schedule }, $inc: { scheduleRevision: 1 } });
      }
    } catch (syncErr) {
      console.error('[POST /api/events] Failed to sync to schedule:', syncErr.message);
    }

    res.status(201).json({ ok: true, event });
  } catch (error) {
    console.error('[POST /api/events] Error:', error);
    res.status(500).json({ error: 'Failed to create event.' });
  }
});

// ──────────────────────────────────────────────
// PUT /api/events/:eventId
// Update an event. Only the owner can update it.
// ──────────────────────────────────────────────
router.put('/:eventId', async (req, res) => {
  try {
    const userId = extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID.' });
    }

    const updates = { ...req.body };
    delete updates.userId; // Never allow changing ownership
    delete updates._id;

    // ── HARD SHABBAT GUARD: Saturday only from motzei Shabbat ──
    if (updates.day && shabbatService.isShabbatDay(updates.day)) {
      const current = updates.startTime ? null : await Event.findOne({ _id: eventId, userId: new mongoose.Types.ObjectId(userId) }).select('startTime targetDate').lean();
      const startTime = updates.startTime || current?.startTime;
      const targetDate = updates.targetDate || current?.targetDate;
      if (isShabbatEvent(req, updates.day, startTime, targetDate)) {
        return res.status(400).json({ isBlocked: true, blockedMessage: shabbatBlockedMessage(req, targetDate) });
      }
    }

    // Find the event - MUST match both _id AND userId (ownership check)
    const event = await Event.findOneAndUpdate(
      { _id: eventId, userId: new mongoose.Types.ObjectId(userId) },
      { $set: updates },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({ error: 'Event not found or you do not have permission to edit it.' });
    }

    res.json({ ok: true, event });
  } catch (error) {
    console.error('[PUT /api/events/:eventId] Error:', error);
    res.status(500).json({ error: 'Failed to update event.' });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/events/:eventId
// Delete an event. Ownership is strictly enforced:
// Event is only deleted if { _id: eventId, userId: req.user._id } matches.
// ──────────────────────────────────────────────
router.delete('/:eventId', async (req, res) => {
  try {
    const userId = extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID.' });
    }

    // Multi-Tenancy: delete ONLY if the event belongs to this user
    const deleted = await Event.findOneAndDelete({
      _id: eventId,
      userId: new mongoose.Types.ObjectId(userId)
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Event not found or you do not have permission to delete it.' });
    }

    // Also remove from the user's schedule array
    try {
      const user = await User.findById(userId);
      if (user && user.schedule) {
        const schedule = user.schedule;
        for (const dayKey of Object.keys(schedule)) {
          if (Array.isArray(schedule[dayKey])) {
            schedule[dayKey] = schedule[dayKey].filter(ev => {
              const evId = ev._id ? ev._id.toString() : ev.id;
              return evId !== eventId;
            });
          }
        }
        syncTodayWithCurrentDay(schedule);
        await User.findByIdAndUpdate(userId, { $set: { schedule }, $inc: { scheduleRevision: 1 } });
      }
    } catch (syncErr) {
      console.error('[DELETE /api/events/:eventId] Failed to sync schedule:', syncErr.message);
    }

    res.json({ ok: true, message: 'Event deleted.' });
  } catch (error) {
    console.error('[DELETE /api/events/:eventId] Error:', error);
    res.status(500).json({ error: 'Failed to delete event.' });
  }
});

module.exports = router;
