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
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'https://calendai-backend-dfmi.onrender.com'],
  credentials: true
}));
app.use(express.json());

// ──────────────────────────────────────────────
// Serve frontend static files in production
// ──────────────────────────────────────────────
const path = require('path');
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

app.use(session({
  secret: process.env.SESSION_SECRET || 'calendai-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProduction, // true when on Render (HTTPS)
    sameSite: isProduction ? 'none' : 'lax'
  }
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
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback"
  }, (accessToken, refreshToken, profile, done) => {
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
    done(null, { id, displayName: 'User', email: '' });
  });
}

// ──────────────────────────────────────────────
// 3. In‑memory schedule storage per user
// ──────────────────────────────────────────────
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
  return 'anonymous';
}

function getUserSchedule(userId) {
  if (!userSchedules.has(userId)) {
    userSchedules.set(userId, getDefaultSchedule());
  }
  return userSchedules.get(userId);
}

// ──────────────────────────────────────────────
// 4. Event expansion helpers
// ──────────────────────────────────────────────

/**
 * Expand a recurring event into actual dates within a given month/year.
 * recurrence can be: "once", "weekly", "monthly", "yearly", "forever"
 */
function expandEventForMonth(event, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const results = [];
  const dayMap = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6
  };
  const targetDayOfWeek = dayMap[event.day];
  if (targetDayOfWeek === undefined) return results;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();

    if (dow !== targetDayOfWeek) continue;

    let include = false;

    switch (event.recurrence || 'weekly') {
      case 'once': {
        // For "once" events: calculate the next occurrence of this day
        const today = new Date();
        const currentDayOfWeek = today.getDay();
        let daysUntilTarget = targetDayOfWeek - currentDayOfWeek;
        if (daysUntilTarget <= 0) daysUntilTarget += 7; // next week
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + daysUntilTarget);
        const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth()+1).padStart(2,'0')}-${String(nextDate.getDate()).padStart(2,'0')}`;
        const thisDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if (thisDateStr === nextDateStr) {
          include = true;
        }
        break;
      }
      case 'weekly':
        include = true;
        break;
      case 'monthly':
        // Only the first occurrence of that day in the month (or match by week number)
        include = true;
        break;
      case 'yearly':
        // Only if it's the same month as the event was created
        include = true;
        break;
      case 'forever':
        include = true;
        break;
      default:
        include = true;
    }

    if (include) {
      results.push({
        ...event,
        date: `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
        dayOfMonth: d,
        dayOfWeek: dow
      });
    }
  }

  return results;
}

/**
 * Expand events for a full year, returning all occurrences.
 */
function expandEventsForYear(schedule, year) {
  const allEvents = [];
  for (let month = 0; month < 12; month++) {
    for (const dayKey of Object.keys(schedule)) {
      const dayEvents = schedule[dayKey] || [];
      for (const event of dayEvents) {
        const expanded = expandEventForMonth(event, year, month);
        allEvents.push(...expanded);
      }
    }
  }
  return allEvents;
}

// ──────────────────────────────────────────────
// 5. AI & Parsing helpers
// ──────────────────────────────────────────────
let ai = null;
try {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
} catch (e) {
  console.error('Failed to initialize Gemini AI:', e.message);
  // ai stays null -> system falls back to Hebrew parser
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
  const singlePatterns = [
    /ב(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה)/,
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

  const single = parseHebrewSingleTime(text);
  if (single) {
    return {
      startHour: single.hour,
      startMinute: single.minute,
      endHour: single.hour + 1,
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

  if (days.length === 0) {
    const standaloneDayMatch = text.match(/\b(שני|ב|ב׳)\b/);
    if (standaloneDayMatch) {
      days = ['Monday'];
    }
  }

  if (days.length === 0) {
    days = ['Today'];
  }

  let startHour = 18, startMinute = 0, endHour = 19, endMinute = 0;

  const hebrewTime = parseHebrewTime(text);
  if (hebrewTime) {
    startHour = hebrewTime.startHour;
    startMinute = hebrewTime.startMinute;
    endHour = hebrewTime.endHour;
    endMinute = hebrewTime.endMinute;
  } else {
    const timeMatches = [...text.matchAll(/(\d{1,2})(?::(\d{2}))?/g)];
    if (timeMatches.length >= 2) {
      startHour = Number(timeMatches[0][1]);
      startMinute = Number(timeMatches[0][2] || 0);
      endHour = Number(timeMatches[1][1]);
      endMinute = Number(timeMatches[1][2] || 0);
    } else if (timeMatches.length === 1) {
      startHour = Number(timeMatches[0][1]);
      startMinute = Number(timeMatches[0][2] || 0);
      endHour = startHour + 1;
      endMinute = startMinute;
    }
  }

  const startTime = formatTime(startHour, startMinute);
  const endTime = formatTime(endHour, endMinute);

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
    return fallbackParse(text);
  }

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

    ## IMPORTANT: Title and Advice extraction
    10. Extract a SHORT, CLEAN title (max 3-4 words) from the text. Remove time, day, and location details from the title.
        Example: "אני צריך להכין משהו לאכול בשלישי בערב - לרביעי בבוקר" → title: "הכנת אוכל לבוקר"
        Example: "שיעור תורה בכל יום שני אצלי בבית בשמונה וחצי" → title: "שיעור תורה"
        Example: "פגישה עם יוסי במשרד ביום חמישי בעשר" → title: "פגישה עם יוסי"
    11. hasAdvice (boolean): Set to true if the user is asking for a recommendation, idea, suggestion, or help managing time.
        Examples: "תן לי רעיון", "תמצא זמן", "מה להכין", "תעזור לי", "תציע", "המלץ", "איך להתארגן"
    12. aiAdvice (string): If hasAdvice is true, provide a short, practical recommendation in Hebrew (1-2 sentences max).
        If hasAdvice is false, set aiAdvice to: "" (empty string).
        Example: "אפשר להכין מרק עדשים וסלט ירקות - פשוט, מהיר ומספק."

    Return an array like:
    [
      {
        "title": "Short Title",
        "day": "Monday",
        "startTime": "06:00 PM",
        "endTime": "07:00 PM",
        "isRecurring": true,
        "hasAdvice": false,
        "aiAdvice": ""
      }
    ]

    User text:
    "${text}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    });

    const raw = response.text || '[]';
    const parsed = JSON.parse(raw);
    const events = Array.isArray(parsed) ? parsed : [parsed];

    return events.map(ev => ({
      ...ev,
      isRecurring: ev.isRecurring !== undefined ? ev.isRecurring : true,
      hasAdvice: ev.hasAdvice === true,
      aiAdvice: ev.aiAdvice || ""
    }));
  } catch (error) {
    console.error('Gemini parse failed, using fallback:', error);
    return fallbackParseAdvice(text);
  }
}

function fallbackParseAdvice(text) {
  // Check if the text contains advice-related keywords
  const adviceKeywords = ['תן לי','תמצא','תציע','המלץ','עזור','עזרי','רעיון','איך','מה להכין','מה לעשות','תעזור לי'];
  const hasAdvice = adviceKeywords.some(kw => text.includes(kw));

  let result;
  try {
    result = fallbackParse(text);
  } catch (e) {
    return [{
      title: 'פגישה / אירוע',
      day: 'Today',
      startTime: '06:00 PM',
      endTime: '07:00 PM',
      isRecurring: false,
      hasAdvice: hasAdvice,
      aiAdvice: hasAdvice ? 'מומלץ לפצל את המשימה לשלבים קטנים ולהתחיל מוקדם.' : ''
    }];
  }

  return result.map(ev => ({
    ...ev,
    hasAdvice: hasAdvice,
    aiAdvice: hasAdvice ? 'מומלץ לפצל את המשימה לשלבים קטנים ולהתחיל מוקדם.' : ''
  }));
}

// ──────────────────────────────────────────────
// 6. Auth routes
// ──────────────────────────────────────────────

app.get('/api/auth/google',
  (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'your_google_client_id_here') {
      return res.status(400).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
    }
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
  }
);

app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});

// ──────────────────────────────────────────────
// 7. Schedule routes
// ──────────────────────────────────────────────

// POST /api/parse-schedule – parse text and ADD to user's schedule
app.post('/api/parse-schedule', async (req, res) => {
  const { text, recurrence } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text input is required.' });
  }

  try {
    const parsedEvents = await parseWithGemini(text);
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);

    const addedEvents = [];
    parsedEvents.forEach(event => {
      const day = event.day || 'Today';
      const eventWithRecurrence = {
        ...event,
        recurrence: recurrence || 'weekly'
      };
      if (schedule[day]) {
        schedule[day].push(eventWithRecurrence);
        addedEvents.push(eventWithRecurrence);
      } else {
        schedule['Today'].push(eventWithRecurrence);
        addedEvents.push({ ...eventWithRecurrence, day: 'Today' });
      }
    });

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

// GET /api/schedule/expanded – get expanded events for a specific month or year
app.get('/api/schedule/expanded', (req, res) => {
  const userId = getUserId(req);
  const schedule = getUserSchedule(userId);
  
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const view = req.query.view || 'month';
  
  if (view === 'year') {
    const allEvents = expandEventsForYear(schedule, year);
    return res.json({ events: allEvents, year, view: 'year' });
  }
  
  // Default: month view
  const month = parseInt(req.query.month) !== undefined ? parseInt(req.query.month) : new Date().getMonth();
  const monthEvents = [];
  
  for (const dayKey of Object.keys(schedule)) {
    const dayEvents = schedule[dayKey] || [];
    for (const event of dayEvents) {
      const expanded = expandEventForMonth(event, year, month);
      monthEvents.push(...expanded);
    }
  }
  
  res.json({ events: monthEvents, year, month, view: 'month' });
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
// 8. Health
// ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'CalendAI backend is running.' });
});

// ──────────────────────────────────────────────
// 9. Serve frontend for any non-API route
// ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Serving frontend from ${frontendDist}`);
});