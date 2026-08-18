// ──────────────────────────────────────────────
// Event Routes - Siri / iOS Shortcuts Integration
// Multi-Tenancy Isolation: All events are scoped to the authenticated user.
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET || 'calendai-jwt-secret-change-in-production';

// ── AI Service (safe import) ──
let parseWithGemini;
try {
  const aiService = require('../services/aiService');
  parseWithGemini = aiService.parseWithGemini;
} catch (aiErr) {
  console.error('⚠️ [Siri Route] Failed to load AI service:', aiErr.message);
  const { fallbackParseAdvice } = require('../services/aiFallback');
  parseWithGemini = async (text, options = {}) => fallbackParseAdvice(text);
}

// ── User Model ──
const userSchema = new mongoose.Schema({
  googleId: { type: String, sparse: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  displayName: { type: String },
  photo: { type: String },
  isPro: { type: Boolean, default: false },
  stripeCustomerId: { type: String },
  schedule: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

// Use existing model if already compiled, otherwise create it
const User = mongoose.models.User || mongoose.model('User', userSchema);

// ── Event Model (Multi-Tenancy Isolated) ──
const eventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  day: { type: String, required: true }, // Sunday, Monday, ...
  startTime: { type: String },
  endTime: { type: String },
  recurrence: { type: String, default: 'once' },
  location: { type: String, default: 'jerusalem' },
  eventType: { type: String, default: 'activity' },
  duration: { type: Number, default: 60 },
  isSleep: { type: Boolean, default: false },
  isReminder: { type: Boolean, default: false },
  reminderMinutesBefore: { type: Number, default: 0 },
  targetDate: { type: Date },
  createdMonth: { type: Number },
  hasAdvice: { type: Boolean, default: false },
  aiAdvice: { type: String },
  guestName: { type: String },
  bookingId: { type: String },
  recurrenceEndType: { type: String, default: 'never' },
  recurrenceEndDate: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);

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

// ── Helper: Load schedule from User model or file ──
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      const raw = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const map = new Map();
      for (const [key, value] of Object.entries(data)) {
        map.set(key, value);
      }
      return map;
    }
  } catch (err) {
    console.error('Failed to load schedules from file:', err.message);
  }
  return new Map();
}

function saveSchedules(map) {
  try {
    const obj = {};
    for (const [key, value] of map.entries()) {
      obj[key] = value;
    }
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save schedules to file:', err.message);
  }
}

let userSchedules = loadSchedules();

function getDefaultSchedule() {
  return {
    Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
    Thursday: [], Friday: [], Saturday: [], Today: []
  };
}

function getUserSchedule(userId) {
  if (!userSchedules.has(userId)) {
    userSchedules.set(userId, getDefaultSchedule());
    saveSchedules(userSchedules);
  }
  return userSchedules.get(userId);
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
        await User.findByIdAndUpdate(userId, { schedule });
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
        await User.findByIdAndUpdate(userId, { schedule });
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

// ──────────────────────────────────────────────
// POST /api/events/siri
// Siri / iOS Shortcuts endpoint: accepts text + userEmail,
// parses with AI, saves to schedule, returns voice-friendly response.
// Multi-Tenancy: Events are saved under the userId resolved from the email.
// ──────────────────────────────────────────────
router.post('/siri', async (req, res) => {
  try {
    const { text, userEmail } = req.body;

    if (!text || !text.trim()) {
      return res.json({
        response: 'לא התקבל טקסט. אנא נסה שוב.'
      });
    }

    if (!userEmail || !userEmail.trim()) {
      return res.json({
        response: 'לא התקבל אימייל משתמש. אנא וודא שה-iCloud Shortcut מוגדר עם האימייל שלך.'
      });
    }

    // ── Find user by email - events are ALWAYS tied to the found user's ID ──
    let user = null;
    let userId = null;
    try {
      user = await User.findOne({ email: userEmail.toLowerCase().trim() });
      if (user) {
        userId = user._id.toString();
      }
    } catch (err) {
      console.error('[Siri Route] Error finding user:', err.message);
    }

    if (!userId) {
      return res.json({
        response: 'לא נמצא משתמש עם האימייל הזה. אנא וודא שהאימייל מוגדר נכון ב-iCloud Shortcut.'
      });
    }

    // ── Parse the text using AI ──
    const parsedResult = await parseWithGemini(text);

    // Handle Shabbat block response from AI
    if (parsedResult.isBlocked === true) {
      return res.json({
        response: parsedResult.blockedMessage || 'לא ניתן לקבוע פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.'
      });
    }

    const { events: parsedEvents, replyMessage } = parsedResult;

    if (!parsedEvents || parsedEvents.length === 0) {
      return res.json({
        response: 'לא הצלחתי לפענח אירוע מהטקסט שהתקבל. אנא נסה לנסח מחדש.'
      });
    }

    // ── Get the user's schedule ──
    const schedule = getUserSchedule(userId);
    const todayName = getTodayDayName();

    const addedEvents = [];

    for (const event of parsedEvents) {
      let day = event.day || todayName;
      if (day === 'Today') {
        day = todayName;
      }

      // Check Shabbat block for the event
      if (event.startTime) {
        // Parse the event time to check if it falls on Shabbat
        const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day);
        if (dayIndex >= 0) {
          // Get the next occurrence of this day
          const now = new Date();
          const eventDate = new Date(now);
          eventDate.setDate(now.getDate() + ((dayIndex + 7 - now.getDay()) % 7));

          // Parse start time
          const timeMatch = event.startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            if (timeMatch[3].toUpperCase() === 'PM' && hours !== 12) hours += 12;
            if (timeMatch[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
            eventDate.setHours(hours, minutes, 0, 0);

            const shabbatCheck = checkShabbatBlock(eventDate);
            if (shabbatCheck.isBlocked) {
              return res.json({
                response: shabbatCheck.message
              });
            }
          }
        }
      }

      const eventRecurrence = event.recurrence || 'once';

      const eventWithRecurrence = {
        ...event,
        day,
        recurrence: eventRecurrence,
        location: 'jerusalem',
        userId: userId
      };

      // Add to schedule (per-user schedule map, keyed by userId)
      if (schedule[day]) {
        schedule[day].push(eventWithRecurrence);
      } else {
        schedule['Today'].push(eventWithRecurrence);
      }

      // Also save to the Event collection with strict userId binding
      try {
        const dbEvent = await Event.create({
          userId: new mongoose.Types.ObjectId(userId),
          title: event.title || 'אירוע',
          day,
          startTime: event.startTime || '',
          endTime: event.endTime || event.startTime || '',
          recurrence: eventRecurrence,
          location: 'jerusalem',
          eventType: event.eventType || 'activity',
          duration: event.duration || 60,
          isSleep: event.isSleep || false,
          targetDate: event.targetDate ? new Date(event.targetDate) : undefined,
          createdMonth: event.createdMonth
        });
        eventWithRecurrence._id = dbEvent._id;
      } catch (dbErr) {
        console.error('[Siri Route] Failed to save event to DB:', dbErr.message);
      }

      addedEvents.push(eventWithRecurrence);
    }

    syncTodayWithCurrentDay(schedule);
    saveSchedules(userSchedules);

    // Save to MongoDB for logged-in users
    if (user && user._id) {
      try {
        const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
        await UserModel.findByIdAndUpdate(user._id, { schedule }).catch(() => {});
      } catch (err) {
        console.error('[Siri Route] Failed to save to MongoDB:', err.message);
      }
    }

    // ── Build a voice-friendly response ──
    const firstEvent = addedEvents[0];
    const eventCount = addedEvents.length;

    let response;
    if (eventCount === 1) {
      response = replyMessage
        ? replyMessage
        : `נקבעה בהצלחה פגישה: ${firstEvent.title} ביום ${firstEvent.day} בשעה ${firstEvent.startTime}.`;
    } else {
      response = replyMessage
        ? replyMessage
        : `נקבעו בהצלחה ${eventCount} אירועים.`;
    }

    res.json({ response });

  } catch (error) {
    console.error('[Siri Route] Error:', error);
    res.json({
      response: 'אירעה שגיאה בעיבוד הבקשה. אנא נסה שוב מאוחר יותר.'
    });
  }
});

module.exports = router;