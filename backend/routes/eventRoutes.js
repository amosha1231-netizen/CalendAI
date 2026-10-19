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

// ── Helper: Check Shabbat Block ──
function isShabbatTime(date) {
  const day = date.getDay();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  if (day === 5 && totalMinutes >= 960) return true;
  if (day === 6 && totalMinutes < 1200) return true;
  return false;
}

function checkShabbatBlock(startDate) {
  const date = startDate instanceof Date ? startDate : new Date(startDate);
  if (isNaN(date.getTime())) return { isBlocked: false, message: '' };
  if (isShabbatTime(date)) {
    return {
      isBlocked: true,
      message: 'לא ניתן לקבוע פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.'
    };
  }
  return { isBlocked: false, message: '' };
}

/**
 * Day-based Shabbat guard: checks if the event day name is Saturday (שבת).
 * This is a hard guard that works regardless of time-based checks.
 * @param {string} day - The day name (e.g., "Saturday", "שבת")
 * @returns {boolean} - True if the day is Shabbat/Saturday.
 */
function isShabbat(day) {
  if (!day) return false;
  const d = day.toLowerCase();
  return d.includes('שבת') || d.includes('saturday');
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

    // ── HARD SHABBAT GUARD: Block event creation on Saturday ──
    if (isShabbat(day)) {
      return res.status(400).json({
        isBlocked: true,
        blockedMessage: 'שבת שלום 🕯️ המערכת אינה מאפשרת קביעת פעילויות בשבת. נשמח לתאם למוצאי השבת או ליום חול.'
      });
    }

    // Check Shabbat block if startTime is provided
    if (startTime) {
      const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day);
      if (dayIndex >= 0) {
        const now = new Date();
        const eventDate = new Date(now);
        eventDate.setDate(now.getDate() + ((dayIndex + 7 - now.getDay()) % 7));

        const timeMatch = startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          if (timeMatch[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (timeMatch[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
          eventDate.setHours(hours, minutes, 0, 0);

          const shabbatCheck = checkShabbatBlock(eventDate);
          if (shabbatCheck.isBlocked) {
            return res.status(400).json({ isBlocked: true, blockedMessage: shabbatCheck.message });
          }
        }
      }
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

    // ── HARD SHABBAT GUARD: Block updating event to Saturday ──
    if (updates.day && isShabbat(updates.day)) {
      return res.status(400).json({
        isBlocked: true,
        blockedMessage: 'שבת שלום 🕯️ המערכת אינה מאפשרת קביעת פעילויות בשבת. נשמח לתאם למוצאי השבת או ליום חול.'
      });
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
