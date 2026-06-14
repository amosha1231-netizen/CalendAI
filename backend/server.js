const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { GoogleGenAI } = require('@google/genai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ──────────────────────────────────────────────
// 1. Middleware
// ──────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// ──────────────────────────────────────────────
// Serve frontend static files in production
// ──────────────────────────────────────────────
const path = require('path');
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

app.use(session({
  secret: process.env.SESSION_SECRET || 'calendai-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set true if using HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// ──────────────────────────────────────────────
// 2. Google OAuth Strategy (if keys are configured)
// ──────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET &&
    GOOGLE_CLIENT_ID !== 'your_google_client_id_here') {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    // Create or find user – store minimal profile info
    const user = {
      id: profile.id,
      googleId: profile.id,
      displayName: profile.displayName,
      email: profile.emails?.[0]?.value || '',
      photo: profile.photos?.[0]?.value || ''
    };
    return done(null, user);
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    // In production, look up from DB. For now we just re‑create a stub.
    done(null, { id, displayName: 'User', email: '' });
  });
}

// ──────────────────────────────────────────────
// 3. In‑memory schedule storage per user
// ──────────────────────────────────────────────
// Keyed by user id (or 'anonymous')
const userSchedules = new Map();

function getDefaultSchedule() {
  return {
    Sunday: [],
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Today: []
  };
}

function getUserId(req) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return req.user.id || req.user.googleId || 'anonymous';
  }
  // If Google auth isn't configured, everyone is 'anonymous'
  return 'anonymous';
}

function getUserSchedule(userId) {
  if (!userSchedules.has(userId)) {
    userSchedules.set(userId, getDefaultSchedule());
  }
  return userSchedules.get(userId);
}

// ──────────────────────────────────────────────
// 4. AI & Parsing helpers
// ──────────────────────────────────────────────
let ai = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function formatTime(hour, minute = '00', meridiem) {
  const h = Number(hour);
  const m = Number(minute || 0);

  if (meridiem) {
    let hh = h % 12;
    if (hh === 0) hh = 12;
    const suffix = meridiem.toUpperCase();
    return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  let displayHour;
  let suffix;

  if (h >= 12) {
    displayHour = h === 12 ? 12 : h - 12;
    suffix = 'PM';
  } else if (h >= 6 && h <= 11) {
    displayHour = h;
    suffix = 'PM';
  } else {
    displayHour = h === 0 ? 12 : h;
    suffix = 'AM';
  }

  return `${String(displayHour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

const hebrewNumbers = {
  'שש': 6, 'ששה': 6, 'ושישה': 6,
  'שבע': 7, 'שבעה': 7, 'ושבעה': 7,
  'שמונה': 8, 'ושמונה': 8,
  'תשע': 9, 'תשעה': 9, 'ותשעה': 9,
  'עשר': 10, 'עשרה': 10, 'ועשרה': 10,
  'אחת': 1, 'אחד': 1, 'ואחת': 1, 'ואחד': 1,
  'שתים': 2, 'שתיים': 2, 'שנים': 2, 'ושנים': 2,
  'שלוש': 3, 'שלושה': 3, 'ושלוש': 3, 'ושלושה': 3,
  'ארבע': 4, 'ארבעה': 4, 'וארבע': 4, 'וארבעה': 4,
  'חמש': 5, 'חמישה': 5, 'וחמש': 5, 'וחמישה': 5
};

function parseHebrewSingleTime(text) {
  // מחפש ביטוי כמו "בשמונה", "בשמונה וחצי", "בשמונה בערב", "שמונה", "שמונה וחצי"
  const singlePatterns = [
    // "בשמונה וחצי" or "בשמונה" (with ב prefix)
    /ב(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה)/,
    // "שמונה" (without prefix)
    /\b(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|תשעה|עשרה)\b/
  ];

  const hasHalf = text.includes('וחצי');

  for (const pattern of singlePatterns) {
    const match = text.match(pattern);
    if (match) {
      const hourWord = match[1] || match[0];
      const hour = hebrewNumbers[hourWord];
      if (hour) {
        return {
          hour,
          minute: hasHalf ? 30 : 0
        };
      }
    }
  }
  return null;
}

function parseHebrewTime(text) {
  // קודם תבניות "משעה X עד Y"
  const rangePatterns = [
    /משעה\s+(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה|ושישה|ושבעה|ושמונה|ותשע|ועשרה|ואחת|ואחד|ושתיים|ושלוש|ושלושה|וארבע|וארבעה|וחמש|וחמישה)\s*(?:וחצי)?\s*(?:ועד|ו?עד|עד)\s*(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה|ושישה|ושבעה|ושמונה|ותשע|ועשרה|ואחת|ואחד|ושתיים|ושלוש|ושלושה|וארבע|וארבעה|וחמש|וחמישה)\s*(?:וחצי)?/g,
    /משעה\s+(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה|ושישה|ושבעה|ושמונה|ותשע|ועשרה|ואחת|ואחד|ושתיים|ושלוש|ושלושה|וארבע|וארבעה|וחמש|וחמישה)\s+(?:ועד|עד)\s+(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה|ושישה|ושבעה|ושמונה|ותשע|ועשרה|ואחת|ואחד|ושתיים|ושלוש|ושלושה|וארבע|וארבעה|וחמש|וחמישה)/g
  ];

  for (const pattern of rangePatterns) {
    const match = pattern.exec(text);
    if (match) {
      const startWord = match[1];
      const endWord = match[2];
      const startHasHalf = text.includes('וחצי') && text.indexOf('וחצי') < text.indexOf(endWord);
      const endHasHalf = text.lastIndexOf('וחצי') > text.indexOf(endWord) || text.match(new RegExp(endWord + '\\s+וחצי'));

      return {
        startHour: hebrewNumbers[startWord] || 6,
        startMinute: startHasHalf ? 30 : 0,
        endHour: hebrewNumbers[endWord] || 8,
        endMinute: endHasHalf ? 30 : 0,
        isRange: true
      };
    }
  }

  // אם לא מצאנו טווח, ננסה שעה בודדת
  const single = parseHebrewSingleTime(text);
  if (single) {
    return {
      startHour: single.hour,
      startMinute: single.minute,
      endHour: single.hour + 1, // ברירת מחדל: שעה
      endMinute: single.minute,
      isRange: false
    };
  }

  return null;
}

function fallbackParse(text) {
  const hebrewDays = {
    'א': 'Sunday', 'ראשון': 'Sunday', 'א׳': 'Sunday',
    'ב': 'Monday', 'שני': 'Monday', 'ב׳': 'Monday',
    'ג': 'Tuesday', 'שלישי': 'Tuesday', 'ג׳': 'Tuesday',
    'ד': 'Wednesday', 'רביעי': 'Wednesday', 'ד׳': 'Wednesday',
    'ה': 'Thursday', 'חמישי': 'Thursday', 'ה׳': 'Thursday',
    'ו': 'Friday', 'שישי': 'Friday', 'ו׳': 'Friday',
    'ש': 'Saturday', 'שבת': 'Saturday', 'ש׳': 'Saturday'
  };

  const clean = text.replace(/[.,!?;:()"']/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length > 0);

  let foundDays = [];

  words.forEach(word => {
    if (hebrewDays[word]) {
      foundDays.push(hebrewDays[word]);
    } else {
      const noPrefix = word.replace(/^[בוכפל]/, '');
      if (noPrefix !== word && hebrewDays[noPrefix]) {
        foundDays.push(hebrewDays[noPrefix]);
      }
    }
  });

  let days = [...new Set(foundDays)];
  console.log('Found days:', days);

  if (days.length === 0) {
    // Check for standalone "שני" or "ב׳" etc. - treat as recurring Monday
    const standaloneDayMatch = text.match(/\b(שני|ב|ב׳)\b/);
    if (standaloneDayMatch) {
      days = ['Monday'];
    }
  }

  if (days.length === 0) {
    days = ['Today'];
  }

  let startHour = 18, startMinute = 0, endHour = 19, endMinute = 0;

  // Try to extract time from Hebrew
  const hebrewTime = parseHebrewTime(text);
  if (hebrewTime) {
    startHour = hebrewTime.startHour;
    startMinute = hebrewTime.startMinute;
    // If it was a single time (not a range), use same duration logic
    endHour = hebrewTime.endHour;
    endMinute = hebrewTime.endMinute;
  } else {
    // Try numeric times
    const timeMatches = [...text.matchAll(/(\d{1,2})(?::(\d{2}))?/g)];
    if (timeMatches.length >= 2) {
      startHour = Number(timeMatches[0][1]);
      startMinute = Number(timeMatches[0][2] || 0);
      endHour = Number(timeMatches[1][1]);
      endMinute = Number(timeMatches[1][2] || 0);
    } else if (timeMatches.length === 1) {
      // Single numeric time: assume 1 hour duration
      startHour = Number(timeMatches[0][1]);
      startMinute = Number(timeMatches[0][2] || 0);
      endHour = startHour + 1;
      endMinute = startMinute;
    }
  }

  // Check for "בערב" or "בבוקר" context
  const isEvening = text.includes('בערב') || text.includes('ערבית');
  const isMorning = text.includes('בבוקר') || text.includes('בוקר');

  // If hour is <= 12 and it's evening, add 12 for PM
  if (isEvening && startHour <= 12) {
    // Already handled by formatTime
  }
  if (isMorning && startHour >= 6 && startHour <= 11) {
    // Already handled by formatTime
  }

  const startTime = formatTime(startHour, startMinute);
  const endTime = formatTime(endHour, endMinute);

  // Extract title: find text after time expressions
  let title = text
    .replace(/^.*?(?:וחצי)?\s*/, '')
    .replace(/^.*?(?:עד\s+[א-ת]+\s*(?:וחצי)?\s*)/, '')
    .trim();

  if (!title || title.length < 2) {
    const parts = text.split(/\s+/);
    const titleWords = [];
    let foundTimeEnd = false;

    for (let i = 0; i < parts.length; i++) {
      const w = parts[i];
      if (foundTimeEnd) {
        titleWords.push(w);
      } else if (w === 'וחצי' && i < parts.length - 1) {
        foundTimeEnd = true;
      }
    }

    title = titleWords.join(' ').trim();
  }

  if (!title || title.length < 2) {
    title = 'פגישה / אירוע';
  }

  // Return events with isRecurring flag
  return days.map(day => ({
    title,
    day,
    startTime,
    endTime,
    isRecurring: days.length > 1 || days[0] !== 'Today' ? true : false
  }));
}

async function parseWithGemini(text) {
  if (!ai) {
    console.log('No Gemini API key found, running fallback parser.');
    return fallbackParse(text);
  }

  // Improved prompt that understands Hebrew day names as RECURRING (weekly)
  const prompt = `
    You are an intelligent schedule/event parser. Parse the user's text and return JSON.

    IMPORTANT RULES:
    1. Hebrew day names like "שני", "שלישי" etc. mean "every Monday", "every Tuesday" (recurring weekly events), NOT a specific date.
    2. Single-letter day names like "ב" (Monday), "ג" (Tuesday) also mean recurring weekly.
    3. Only create ONE event object per day (not per date). The events repeat every week.
    4. "שש בערב" = 6:00 PM, "שבע בערב" = 7:00 PM, "שמונה בערב" = 8:00 PM etc.
    5. "שש וחצי" = 6:30, "שבע וחצי" = 7:30, etc.
    6. If the text says something like "בימים א ג ד ה" = every Sunday, Tuesday, Wednesday, Thursday.
    7. Always use English day names: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday.
    8. Format times as 'HH:MM AM/PM'.
    9. Set "isRecurring" to true for weekly recurring events.

    Return an array like:
    [
      { "title": "Event Name", "day": "Monday", "startTime": "06:00 PM", "endTime": "07:00 PM", "isRecurring": true }
    ]

    User text:
    "${text}"
  `;

  try {
    console.log('Sending to Gemini, prompt:', prompt.substring(0, 120) + '...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    });

    const raw = response.text || '[]';
    console.log('Gemini raw response:', raw);
    const parsed = JSON.parse(raw);
    console.log('Gemini parsed:', JSON.stringify(parsed));
    const events = Array.isArray(parsed) ? parsed : [parsed];

    // Ensure isRecurring is set properly
    return events.map(ev => ({
      ...ev,
      isRecurring: ev.isRecurring !== undefined ? ev.isRecurring : true
    }));
  } catch (error) {
    console.error('Gemini parse failed, using fallback:', error);
    const fallbackResult = fallbackParse(text);
    console.log('Fallback result:', JSON.stringify(fallbackResult));
    return fallbackResult;
  }
}

// ──────────────────────────────────────────────
// 5. Auth routes
// ──────────────────────────────────────────────

// GET /api/auth/google – start Google OAuth
app.get('/api/auth/google',
  (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'your_google_client_id_here') {
      return res.status(400).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
    }
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// GET /api/auth/google/callback – Google OAuth callback
app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
  }
);

// GET /api/auth/me – return current user info
app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

// POST /api/auth/logout – log out
app.post('/api/auth/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});

// ──────────────────────────────────────────────
// 6. Schedule routes
// ──────────────────────────────────────────────

// POST /api/parse-schedule – parse text and ADD to user's schedule
app.post('/api/parse-schedule', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text input is required.' });
  }

  try {
    const parsedEvents = await parseWithGemini(text);
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);

    // ADD parsed events to the schedule (append, don't replace)
    const addedEvents = [];
    parsedEvents.forEach(event => {
      const day = event.day || 'Today';
      if (schedule[day]) {
        schedule[day].push(event);
        addedEvents.push(event);
      } else {
        schedule['Today'].push(event);
        addedEvents.push({ ...event, day: 'Today' });
      }
    });

    console.log(`User ${userId}: added ${addedEvents.length} events. Total now:`, 
      Object.values(schedule).reduce((sum, arr) => sum + arr.length, 0));

    res.json({ 
      events: addedEvents,
      totalEvents: Object.values(schedule).reduce((sum, arr) => sum + arr.length, 0)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to parse schedule.' });
  }
});

// GET /api/schedule – get the current user's full schedule
app.get('/api/schedule', (req, res) => {
  const userId = getUserId(req);
  const schedule = getUserSchedule(userId);
  res.json({ schedule });
});

// DELETE /api/schedule/clear – clear all events for the user
app.delete('/api/schedule/clear', (req, res) => {
  const userId = getUserId(req);
  userSchedules.set(userId, getDefaultSchedule());
  res.json({ ok: true, message: 'Schedule cleared.' });
});

// DELETE /api/schedule/event – remove a specific event by index
app.delete('/api/schedule/event', (req, res) => {
  const { day, index } = req.body;
  if (!day || index === undefined) {
    return res.status(400).json({ error: 'day and index are required.' });
  }
  const userId = getUserId(req);
  const schedule = getUserSchedule(userId);
  if (schedule[day] && schedule[day][index]) {
    schedule[day].splice(index, 1);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Event not found.' });
  }
});

// ──────────────────────────────────────────────
// 7. Health
// ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'CalendAI backend is running.' });
});

// ──────────────────────────────────────────────
// 8. Serve frontend for any non-API route
// ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Serving frontend from ${frontendDist}`);
});
