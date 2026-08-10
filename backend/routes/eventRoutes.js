// ──────────────────────────────────────────────
// Event Routes - Siri / iOS Shortcuts Integration
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

// ──────────────────────────────────────────────
// POST /api/events/siri
// Siri / iOS Shortcuts endpoint: accepts text + userEmail,
// parses with AI, saves to schedule, returns voice-friendly response.
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

    // ── Find user by email ──
    let user = null;
    let userId = 'anonymous';
    try {
      user = await User.findOne({ email: userEmail.toLowerCase().trim() });
      if (user) {
        userId = user._id.toString();
      }
    } catch (err) {
      console.error('[Siri Route] Error finding user:', err.message);
      // Continue with anonymous user
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
        location: 'jerusalem'
      };

      // Add to schedule
      if (schedule[day]) {
        schedule[day].push(eventWithRecurrence);
      } else {
        schedule['Today'].push(eventWithRecurrence);
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