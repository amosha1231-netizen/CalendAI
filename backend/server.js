const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { GoogleGenAI } = require('@google/genai');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ──────────────────────────────────────────────
// Persistent file-based storage
// ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

// ──────────────────────────────────────────────
// 1. Middleware
// ──────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

// Dynamic base URLs for production vs local development
const CLIENT_URL = process.env.CLIENT_URL || (isProduction ? 'https://calendai.onrender.com' : 'http://localhost:5173');
const BACKEND_URL = process.env.BACKEND_URL || (isProduction ? 'https://calendai.onrender.com' : 'http://localhost:5000');

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'https://calendai.onrender.com', 'https://calendai-backend-dfmi.onrender.com'],
  credentials: true
}));
app.use(express.json());

// ──────────────────────────────────────────────
// Serve frontend static files in production
// ──────────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

app.use(session({
  secret: process.env.SESSION_SECRET || 'calendai-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ──────────────────────────────────────────────
// Rate limiting for AI-powered / expensive endpoints
// ──────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a minute.' }
});

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
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `${BACKEND_URL}/api/auth/google/callback`
  }, (accessToken, refreshToken, profile, done) => {
    const user = {
      id: profile.id,
      googleId: profile.id,
      displayName: profile.displayName,
      email: profile.emails?.[0]?.value || '',
      photo: profile.photos?.[0]?.value || ''
    };
    return done(null, { ...user, accessToken });
  }));

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });
}

// ──────────────────────────────────────────────
// 3. Locations data
// ──────────────────────────────────────────────
const LOCATIONS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'locations.json'), 'utf-8'));
const LOCATIONS = LOCATIONS_DATA.locations;
const DEFAULT_LOCATION_ID = 'jerusalem';

// ──────────────────────────────────────────────
// 4. Persistent schedule storage per user (file-backed)
// ──────────────────────────────────────────────
let userSchedules = loadSchedules();

function saveSchedulesNow() {
  saveSchedules(userSchedules);
}

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
    const fullUser = req.session?.passport?.user;
    return fullUser?.id || fullUser?.googleId || 'anonymous';
  }
  return 'anonymous';
}

function getUserSchedule(userId) {
  if (!userSchedules.has(userId)) {
    userSchedules.set(userId, getDefaultSchedule());
    saveSchedulesNow();
  }
  return userSchedules.get(userId);
}

// ──────────────────────────────────────────────
// 4. Event expansion helpers
// ──────────────────────────────────────────────

/**
 * Expand a recurring event into actual dates within a given month/year.
 * recurrence can be: "once", "daily", "weekly", "monthly", "yearly", "forever"
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

  const storedTargetDate = event.targetDate && new Date(event.targetDate);

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();

    if (dow !== targetDayOfWeek) continue;

    let include = false;

    switch (event.recurrence || 'weekly') {
      case 'once': {
        if (storedTargetDate) {
          const thisDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const targetDateStr = `${storedTargetDate.getFullYear()}-${String(storedTargetDate.getMonth()+1).padStart(2,'0')}-${String(storedTargetDate.getDate()).padStart(2,'0')}`;
          if (thisDateStr === targetDateStr) {
            include = true;
          }
        } else {
          const today = new Date();
          const currentDayOfWeek = today.getDay();
          let daysUntilTarget = targetDayOfWeek - currentDayOfWeek;
          if (daysUntilTarget < 0) daysUntilTarget += 7;
          const nextDate = new Date(today);
          nextDate.setDate(today.getDate() + daysUntilTarget);
          const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth()+1).padStart(2,'0')}-${String(nextDate.getDate()).padStart(2,'0')}`;
          const thisDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          if (thisDateStr === nextDateStr) {
            include = true;
          }
        }
        break;
      }
      case 'daily':
        break;
      case 'weekly':
        include = true;
        break;
      case 'monthly':
        if (d <= 7) {
          include = true;
        }
        break;
      case 'yearly':
        // Yearly events: only show in the SAME month as the event's createdMonth.
        if (event.createdMonth !== undefined && event.createdMonth === month) {
          include = true;
        } else if (event.createdMonth === undefined && month === new Date().getMonth()) {
          include = true;
        }
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
 * Expand a daily recurring event into ALL dates within a given month/year.
 */
function expandDailyEventForMonth(event, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const results = [];

  for (let d = 1; d <= daysInMonth; d++) {
    results.push({
      ...event,
      date: `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
      dayOfMonth: d,
      dayOfWeek: new Date(year, month, d).getDay()
    });
  }

  return results;
}

function getDailyEventKey(event) {
  return `${event.title}|${event.startTime}|${event.endTime}|${event.recurrence}`;
}

function expandEventsForYear(schedule, year) {
  const allEvents = [];
  const expandedDailyKeys = new Set();

  for (let month = 0; month < 12; month++) {
    for (const dayKey of Object.keys(schedule)) {
      if (dayKey === 'Today') continue;
      const dayEvents = schedule[dayKey] || [];
      for (const event of dayEvents) {
        let expanded;
        if (event.recurrence === 'daily') {
          const dailyKey = getDailyEventKey(event);
          if (expandedDailyKeys.has(dailyKey)) continue;
          expandedDailyKeys.add(dailyKey);
          expanded = expandDailyEventForMonth(event, year, month);
        } else {
          expanded = expandEventForMonth(event, year, month);
        }
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
  const quarterToMatch = text.match(/רבע\s+ל(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה)/);
  if (quarterToMatch) {
    const hourWord = quarterToMatch[1];
    const hour = hebrewNumbers[hourWord];
    if (hour) {
      let quarterHour = hour - 1;
      if (quarterHour === 0) quarterHour = 12;
      return {
        hour: quarterHour,
        minute: 45
      };
    }
  }

  const singlePatterns = [
    /ב(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|שמונה|תשעה|עשרה)/,
    /\b(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת|אחד|שנים|ששה|שבעה|תשעה|עשרה)\b/
  ];

  const hasHalf = text.includes('וחצי');
  const hasQuarter = text.includes('ורבע');

  for (const pattern of singlePatterns) {
    const match = text.match(pattern);
    if (match) {
      const hourWord = match[1] || match[0];
      const hour = hebrewNumbers[hourWord];
      if (hour) {
        let minute = 0;
        if (hasQuarter) minute = 15;
        else if (hasHalf) minute = 30;
        return {
          hour,
          minute
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
      const noPrefix = word.replace(/^[בוכפלמש]/, '');
      if (noPrefix !== word && hebrewDays[noPrefix]) {
        foundDays.push(hebrewDays[noPrefix]);
      }
    }
  });

  let days = [...new Set(foundDays)];

  if (text.includes('מחר')) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    days = [dayNames[tomorrow.getDay()]];
  }

  if (text.includes('היום')) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    days = [dayNames[new Date().getDay()]];
  }

  if (days.length === 0) {
    const standaloneDayMatch = text.match(/\b(שני|ב|ב׳)\b/);
    if (standaloneDayMatch) {
      days = ['Monday'];
    }
  }

  if (days.length === 0) {
    days = ['Today'];
  }

  let startHour = 9, startMinute = 0, endHour = 10, endMinute = 0;

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

  if (text.includes('בערב') || text.includes('בלילה') || text.includes('באחה"צ') || text.includes('אחר הצהריים')) {
    if (startHour < 12) startHour += 12;
    if (endHour < 12) endHour += 12;
  } else if (text.includes('בבוקר') || text.includes('בבקר')) {
    // Morning → keep as AM
  } else {
    if (startHour >= 1 && startHour <= 7) {
      startHour += 12;
      endHour += 12;
    }
  }

  const startTime = formatTime(startHour, startMinute);
  const endTime = formatTime(endHour, endMinute);

  let title = text
    .replace(/^(מחר\s*)?/, '')
    .replace(/משעה\s+[א-ת]+\s*(?:וחצי|ורבע)?\s*(?:ועד|עד)\s*[א-ת]+\s*(?:וחצי|ורבע)?\s*/, '')
    .replace(/ב(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת)\s*(?:וחצי|ורבע)?\s*(?:בבוקר|בערב|בלילה)?\s*/, '')
    .replace(/^\d{1,2}:\d{2}\s*/, '')
    .replace(/[,!?;:]/g, '')
    .trim();

  if (title.length > 30) {
    const titleWords = title.split(/\s+/);
    if (titleWords.length > 4) {
      title = titleWords.slice(-4).join(' ');
    }
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
    return fallbackParseAdvice(text);
  }

  const now = new Date();
  const todayString = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
  const currentTimeString = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayEnglish = dayNames[now.getDay()];

  const isEnglish = /^[a-zA-Z0-9\s.,!?;:'"()-]+$/.test(text.trim()) && /[a-zA-Z]/.test(text.trim());

  const prompt = `
    You are a world-class AI scheduling agent. Your role is to **reason step-by-step** about the user's request, then produce a structured schedule. You think like a human personal assistant, not a text parser.

    ─────────────────────────────────────────────
    LANGUAGE INSTRUCTIONS
    ─────────────────────────────────────────────
    The user's request is written in: ${isEnglish ? 'ENGLISH' : 'HEBREW'}.

    **CRITICAL**: You MUST respond in the SAME language as the user's request.
    - If the user writes in English → respond in English (reasoning, replyMessage, title, aiAdvice all in English).
    - If the user writes in Hebrew → respond in Hebrew (reasoning, replyMessage, title, aiAdvice all in Hebrew).
    - The event "day" field must always be in English (Sunday, Monday, etc.).
    - The event "startTime" and "endTime" must always be in "HH:MM AM/PM" format.
    - Detect the language from the user's text below.

    ─────────────────────────────────────────────
    CONTEXT
    ─────────────────────────────────────────────
    - Current date and time: ${todayString}, ${currentTimeString}
    - Today's English day name: ${todayEnglish}
    - Today's date (ISO): ${now.toISOString().split('T')[0]}
    - Use this information to resolve relative terms like "היום" / "today", "מחר" / "tomorrow", "מחרתיים" / "day after tomorrow", "השבוע" / "this week", "בשבוע הבא" / "next week", "בראשון" / "on Sunday", "בשני" / "on Monday", etc.
    - Assume the user is in Israel (Asia/Jerusalem timezone) unless otherwise specified.
    - Understand both Hebrew terms (e.g., "שני", "שלישי") and English terms (e.g., "Monday", "Tuesday") for days.
    - **CRITICAL DAY RESOLUTION FOR ENGLISH**: When the user specifies a day name in English (e.g., "Monday", "Tuesday"), you MUST calculate the exact date of that day in the CURRENT or NEXT week (whichever comes first, starting from today). For example, if today is Tuesday and the user says "Monday", that means NEXT Monday (today + 6 days). If today is Monday and the user says "Monday", that means TODAY. Use the current date information above to compute the exact date. Do NOT guess or shift days incorrectly.
    - **CRITICAL DAY RESOLUTION FOR HEBREW**: When the user specifies a day in Hebrew (e.g., "שני", "שלישי"), resolve it the same way: find the next occurrence of that day from today.
    - **IMPORTANT**: "Monday evening" means Monday, NOT Tuesday. "Tuesday morning" means Tuesday, NOT Wednesday. The day name IS the day the event should be scheduled on. Do not shift the event to the next day.

    ─────────────────────────────────────────────
    STEP 1: REASONING (Chain of Thought)
    ─────────────────────────────────────────────
    Before producing the events, you MUST include a "reasoning" field in your JSON output. This is your internal thought process. Write it in the SAME LANGUAGE as the user's request. In this field, analyze:

    1. **Intent Analysis**: What is the user trying to accomplish?
    2. **Temporal Calculation**: How do you resolve the day, time, and duration? Show your math.
    3. **Distribution Logic**: If the user mentions multiple items or a quantity, explain how you will distribute them across the week.
    4. **Common Sense Decisions**: Explain any gaps, rest periods, or reasonable defaults you applied.

    ─────────────────────────────────────────────
    STEP 2: MULTI-EVENT PERCEPTION
    ─────────────────────────────────────────────
    You MUST detect and handle the following patterns intelligently:

    A. **Quantities**: If the user says "3 אימונים" / "3 workouts", "פעמיים" / "twice", "4 פגישות" / "4 meetings" → produce an array of that many events, distributed sensibly across available days.
    B. **Total Hours**: If the user says "ללמוד 6 שעות השבוע" / "study 6 hours this week" → break it into multiple sessions spread across the week.
    C. **Multiple People/Items**: "פגישות עם דני ויוסי" / "meetings with Danny and Yossi" → create separate events.
    D. **Chain of Events**: "תפילה ואז להוציא את הכלב" / "prayer then walk the dog" → calculate consecutively.

    For distribution, use COMMON SENSE:
    - Spread activities evenly across the week (not all on the same day).
    - Morning activities = 06:00-12:00. Afternoon = 12:00-17:00. Evening = 17:00-22:00.
    - Leave at least 15-30 minute breaks between activities.
    - Don't schedule anything after 23:00 or before 06:00 unless explicitly requested.

    ─────────────────────────────────────────────
    STEP 3: COMMON SENSE RESOLUTION
    ─────────────────────────────────────────────
    Fill in missing details using HUMAN JUDGMENT:

    - **Missing Day**: If no day is specified, default to "Today" (today's actual day name).
    - **Missing Time**: If no time is specified, use reasonable defaults based on the activity type:
      * Work/Study → 09:00 AM
      * Workout/Sport → 06:00 AM or 17:00 PM
      * Errands/Shopping → 10:00 AM
      * Social/Family → 17:00 PM
      * Meal → 08:00 AM (breakfast), 13:00 PM (lunch), 19:00 PM (dinner)
      * Sleep → 11:00 PM to 07:00 AM (default 8 hours, crosses midnight!)
    - **Missing Duration**: If no duration is given, assume 1 hour (60 minutes) for general activities, 30 minutes for quick tasks.
    - **Rest Breaks**: If scheduling multiple events in sequence, leave 5-15 minute gaps between them.
    - **Conflicts**: If the user's request would create overlapping events, note this in "reasoning" and suggest alternatives in the replyMessage.
    - **Sleep Handling**: Sleep hours CROSS MIDNIGHT. For example, "קבע לי 8 שעות שינה בלילה" / "set me 8 hours of sleep tonight" means 11:00 PM to 07:00 AM (next day). Mark the event with "isSleep": true.
    - **SLEEP / BEDTIME HANDLING (CRITICAL — MUST FOLLOW EXACTLY)**: When the user requests sleep/bedtime (e.g., "8 שעות שינה בלילה" / "8 hours of sleep at night"):
      1. **STRICTLY set startTime to "11:00 PM" and endTime to "07:00 AM"** (next day) — this is exactly 8 hours, no exceptions. Do NOT use any other times.
      2. Set "isSleep": true on the event.
      3. **STRICTLY set "recurrence": "daily"** — so the sleep schedule repeats every single night. Do NOT use "once", "weekly", or any other value.
      4. Create the event for EVERY day of the week (Sunday through Saturday), not just one day. All 7 days must have a sleep event.
      5. The event crosses midnight, so the endTime is on the next day.
      6. The title should be "שינה" / "Sleep" in the appropriate language.
      7. **CRITICAL**: If the user selects "forever" or "daily" recurrence from the UI, the result MUST still have "recurrence": "daily" and "isSleep": true. The "forever" or "daily" selection from the UI only reinforces that this should be daily.
      8. **CRITICAL**: The startTime "11:00 PM" and endTime "07:00 AM" MUST be identical for ALL 7 days of the week. Every night is exactly 11:00 PM → 07:00 AM.
    - **Free Slot Detection**: When a user says "תפנה לי X דקות/שעות" / "find me X minutes/hours free", set "needsFreeSlot": true with "freeSlotDuration" (in minutes).
    - **Editing Events**: If a user says "תעדכן/תשנה" / "update/change" an event, include "isEdit": true.
    - **YEARLY / BIRTHDAY / ANNUAL EVENT DETECTION (CRITICAL)**: When the user mentions "יום הולדת" / "birthday", "אירוע שנתי" / "annual event", "חג" / "holiday", "נישואין" / "anniversary", or any event that should repeat once a year on the same date, you MUST set "recurrence": "yearly". This is critical for the system to generate a proper RRULE with FREQ=YEARLY. Examples:
      * "יום הולדת לילד ב-18.8" → set recurrence="yearly"
      * "birthday party on August 18" → set recurrence="yearly"
      * "אירוע שנתי של המשפחה" → set recurrence="yearly"
      * "anniversary dinner" → set recurrence="yearly"
      * Do NOT use "weekly" or "once" for these events — they MUST be "yearly".
      * When the user selects "שנתי" / "Yearly" from the recurrence UI buttons, the system will also set it correctly.
      * The current month index (0-11) will be added automatically by the backend as "createdMonth".
      * For yearly events, if the user specifies a specific date (e.g., "18.8" or "August 18"), set the "targetDate" field to that date so the event appears on the correct day each year.
      * If the user says "תזכיר לי כל שנה" / "remind me every year", also set recurrence="yearly".

    ─────────────────────────────────────────────
    STEP 4: NATURAL LANGUAGE TIME PARSING (CRITICAL)
    ─────────────────────────────────────────────
    You MUST accurately parse complex time expressions in BOTH Hebrew and English and convert them to the correct "HH:MM AM/PM" format. This is a core requirement.

    **HEBREW TIME EXPRESSIONS — Parse these correctly:**

    **CRITICAL — "QUARTER TO" (רבע ל) RULE**: "רבע ל-X" means quarter TO X, so the time is (X-1):45. Examples:
    - "רבע לשישה" → quarter to six → 05:45 PM (NOT 06:45!)
    - "רבע לשבע" → quarter to seven → 06:45 PM (NOT 07:45!)
    - "רבע לשלוש" → quarter to three → 02:45 PM (NOT 03:45!)
    - "רבע לשמונה בבוקר" → quarter to eight in the morning → 07:45 AM (NOT 08:45!)

    **CRITICAL — "QUARTER PAST" (ורבע) RULE**: "X ורבע" means quarter past X, so the time is X:15. Examples:
    - "שבע ורבע" → quarter past seven → 07:15 PM (see AM/PM rules)
    - "שתיים ורבע" → quarter past two → 02:15 PM (see AM/PM rules)
    - "תשע ורבע" → quarter past nine → 09:15 PM (see AM/PM rules)
    - "שבע ורבע בבוקר" → quarter past seven in the morning → 07:15 AM

    **HALF PAST (וחצי) RULE**: "X וחצי" means half past X, so the time is X:30. Examples:
    - "חמש וחצי" → half past five → 05:30 PM (see AM/PM rules below)
    - "עשר וחצי בבוקר" → half past ten in the morning → 10:30 AM
    - "שש וחצי בערב" → half past six in the evening → 06:30 PM

    **EXPLICIT MARKER RULE**: "בבוקר" / "in the morning" → AM. "בערב" / "in the evening" → PM.
    - "שמונה בערב" → eight in the evening → 08:00 PM
    - "שש וחצי בערב" → half past six in the evening → 06:30 PM
    - "רבע לשמונה בבוקר" → quarter to eight in the morning → 07:45 AM

    **ENGLISH TIME EXPRESSIONS — Parse these correctly:**

    **CRITICAL — "QUARTER TO" RULE**: "quarter to X" means (X-1):45. Examples:
    - "quarter to six" → 05:45 PM (NOT 06:45!)
    - "quarter to three" → 02:45 PM (NOT 03:45!)
    - "quarter to eight in the morning" → 07:45 AM (NOT 08:45!)

    **CRITICAL — "QUARTER PAST" RULE**: "quarter past X" means X:15. Examples:
    - "quarter past seven" → 07:15 PM (see AM/PM rules)
    - "half past two" → 02:30 PM (see AM/PM rules)
    - "quarter past two" → 02:15 PM (see AM/PM rules)

    **HALF PAST RULE**: "half past X" means X:30. Examples:
    - "half past five" → 05:30 PM (see AM/PM rules)
    - "ten thirty in the morning" → 10:30 AM
    - "six thirty in the evening" → 06:30 PM

    **DIGITAL FORMAT**: 
    - "5:30pm" → 05:30 PM
    - "eight in the evening" → 08:00 PM
    - "quarter to eight in the morning" → 07:45 AM

    **CRITICAL REMINDER**: "quarter to X" / "רבע ל-X" = (X-1):45, NOT X:45. For example, "quarter to six" / "רבע לשישה" = 5:45, NOT 6:45. "quarter past X" / "X ורבע" = X:15. "half past X" / "X וחצי" = X:30.

    ─────────────────────────────────────────────
    STEP 5: AM/PM SMART LOGIC (CRITICAL)
    ─────────────────────────────────────────────
    Apply the following AM/PM resolution rules STRICTLY:

    1. **Explicit morning/evening markers override everything**:
       - "בבוקר" / "in the morning" / "AM" → treat as AM (morning)
       - "בערב" / "in the evening" / "PM" / "באחה"צ" / "אחר הצהריים" → treat as PM (afternoon/evening)
       - "בלילה" / "at night" → treat as PM (night)

    2. **Low hours (1-7) WITHOUT explicit marker → DEFAULT TO PM (afternoon/evening)**:
       - "חמש וחצי" → 05:30 PM (17:30), NOT 05:30 AM
       - "five thirty" → 05:30 PM (17:30), NOT 05:30 AM
       - "שתיים ורבע" → 02:15 PM (14:15), NOT 02:15 AM
       - "half past two" → 02:30 PM (14:30), NOT 02:30 AM
       - "שש" → 06:00 PM (18:00), NOT 06:00 AM
       - "six" → 06:00 PM (18:00), NOT 06:00 AM
       - "שבע" → 07:00 PM (19:00), NOT 07:00 AM
       - "seven" → 07:00 PM (19:00), NOT 07:00 AM
       - "רבע לשישה" → 05:45 PM (17:45), NOT 05:45 AM
       - "quarter to six" → 05:45 PM (17:45), NOT 05:45 AM

    3. **Hours 8-11 WITHOUT explicit marker → DEFAULT TO AM (morning)**:
       - "שמונה" → 08:00 AM, NOT 08:00 PM
       - "eight" → 08:00 AM, NOT 08:00 PM
       - "תשע" → 09:00 AM, NOT 09:00 PM
       - "nine" → 09:00 AM, NOT 09:00 PM
       - "עשר" → 10:00 AM, NOT 10:00 PM
       - "ten" → 10:00 AM, NOT 10:00 PM
       - "אחת עשרה" → 11:00 AM, NOT 11:00 PM
       - "eleven" → 11:00 AM, NOT 11:00 PM

    4. **Hours 12+ are unambiguous**:
       - "שתים עשרה" / "twelve" → 12:00 PM (noon) unless "בבוקר" specified
       - "13:00" → 01:00 PM
       - "ארבע אחר הצהריים" → 04:00 PM

    5. **Digital format (e.g., "5:30pm", "17:30")**:
       - If "am"/"pm" suffix is present → use it directly
       - If 24h format (e.g., "17:30") → convert to 12h AM/PM correctly

    **CRITICAL REMINDER**: When the user says "חמש וחצי" or "five thirty" WITHOUT "בבוקר" / "in the morning", the time is 05:30 PM (17:30), NOT 05:30 AM. This is the most common mistake to avoid.

    ─────────────────────────────────────────────
    STEP 6: SEAMLESS TEXT PARSING (CRITICAL)
    ─────────────────────────────────────────────
    When the user's text is dense or lacks punctuation, you MUST intelligently separate:
    - The **time** (when the event happens)
    - The **duration** (how long it lasts, if mentioned)
    - The **title** (what the event is about)

    **Rules for seamless parsing**:

    1. **Time comes first, then title**: In Hebrew, the time expression typically appears at the beginning of the phrase. Extract the time, then the remaining text is the title.
       - "חמש וחצי ספרים לעמי" → time: 17:30, title: "ספרים לעמי"
       - "שבע בערב ארוחת ערב" → time: 19:00, title: "ארוחת ערב"
       - "רבע לשישה פגישה עם דני" → time: 17:45, title: "פגישה עם דני"
       - "שמונה וחצי בבוקר קפה עם יוסי" → time: 08:30, title: "קפה עם יוסי"

    2. **English patterns**:
       - "five thirty books for ami" → time: 17:30, title: "Books for Ami"
       - "seven pm dinner" → time: 19:00, title: "Dinner"
       - "quarter to six meeting with Danny" → time: 17:45, title: "Meeting with Danny"
       - "half past eight morning coffee with Yossi" → time: 08:30, title: "Coffee with Yossi"

    3. **Duration extraction**: If a duration is mentioned (e.g., "שעה", "חצי שעה", "שעתיים", "30 דקות", "an hour", "half hour", "2 hours"), calculate the endTime accordingly.
       - "חמש וחצי שעה ספרים לעמי" → start: 17:30, duration: 1 hour, end: 18:30, title: "ספרים לעמי"
       - "five thirty for an hour books for ami" → start: 17:30, duration: 1 hour, end: 18:30, title: "Books for Ami"

    4. **No time mentioned**: If no time expression is found, use the default time based on activity type (see STEP 3).

    5. **Title cleanup**: The title should be the remaining text after removing time expressions, duration expressions, and filler words. Keep it concise (max 4 words).

    ─────────────────────────────────────────────
    OUTPUT FORMAT
    ─────────────────────────────────────────────
    Return a single JSON object with these keys:

    {
      "reasoning": "string – analysis in the SAME LANGUAGE as the user's request",
      "replyMessage": "string – friendly, conversational summary in the SAME LANGUAGE as the user's request",
      "events": [
        {
          "title": "string – Short Clean Title (max 4 words, in the SAME LANGUAGE as the user's request)",
          "day": "string – English day name (Sunday, Monday, etc.)",
          "startTime": "string – HH:MM AM/PM format",
          "endTime": "string – HH:MM AM/PM format",
          "recurrence": "string – 'once', 'daily', 'weekly', 'monthly', 'yearly', or 'forever'. For sleep/bedtime events, use 'daily'.",
          "isRecurring": "boolean – true if this repeats weekly or daily",
          "isSleep": "boolean – true if this is a sleep/bedtime event",
          "hasAdvice": "boolean – true if user asked for help/ideas",
          "aiAdvice": "string – practical advice in the SAME LANGUAGE as the user's request, or empty string"
        }
      ]
    }

    CRITICAL: You MUST return an ARRAY of events, even if there's only one event. Always wrap in [ ].

    ─────────────────────────────────────────────
    EXAMPLES
    ─────────────────────────────────────────────

    Example 1 (Hebrew): Multi-event with chain
    User text: "היום משבע ורבע בבוקר תפילה שעה ורבע, אחרי זה להוציא את הכלב חצי שעה"
    Expected JSON:
    {
      "reasoning": "המשתמש מתאר שרשרת אירועים להיום. היום הוא יום שישי. תפילה מתחילה ב-07:15 בבוקר ונמשכת שעה ורבע (75 דקות) = עד 08:30. אחרי זה מיד מוציאים את הכלב לחצי שעה = 08:30-09:00.",
      "replyMessage": "בטח, קבעתי לך שני אירועים להיום (יום שישי): תפילה מ-07:15 עד 08:30, ואז להוציא את הכלב מ-08:30 עד 09:00. שיהיה יום נהדר!",
      "events": [
        { "title": "תפילה", "day": "Friday", "startTime": "07:15 AM", "endTime": "08:30 AM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" },
        { "title": "להוציא את הכלב", "day": "Friday", "startTime": "08:30 AM", "endTime": "09:00 AM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 2 (English): Schedule a workout
    User text: "Schedule 3 workouts this week in the morning"
    Expected JSON:
    {
      "reasoning": "The user wants 3 workouts this week in the morning. Today is Monday, so remaining days are: Monday, Tuesday, Wednesday, Thursday, Friday. I will distribute workouts on Monday, Wednesday, Friday at 06:00 AM, a common workout time. Each workout will be 1 hour (default).",
      "replyMessage": "I've scheduled 3 workouts for this week: Monday, Wednesday, and Friday at 06:00 AM. Each workout is 1 hour. Good luck!",
      "events": [
        { "title": "Workout", "day": "Monday", "startTime": "06:00 AM", "endTime": "07:00 AM", "recurrence": "weekly", "isRecurring": true, "isSleep": false, "hasAdvice": false, "aiAdvice": "" },
        { "title": "Workout", "day": "Wednesday", "startTime": "06:00 AM", "endTime": "07:00 AM", "recurrence": "weekly", "isRecurring": true, "isSleep": false, "hasAdvice": false, "aiAdvice": "" },
        { "title": "Workout", "day": "Friday", "startTime": "06:00 AM", "endTime": "07:00 AM", "recurrence": "weekly", "isRecurring": true, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 3 (English): Reminder
    User text: "Remind me to buy milk tomorrow at 9 AM"
    Expected JSON:
    {
      "reasoning": "The user wants a reminder to buy milk tomorrow. Today is Monday, so tomorrow is Tuesday. The reminder should fire at 09:00 AM on Tuesday.",
      "replyMessage": "I've set a reminder for you to buy milk tomorrow (Tuesday) at 09:00 AM.",
      "events": [
        { "title": "Buy milk", "day": "Tuesday", "startTime": "09:00 AM", "endTime": "09:15 AM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "", "isReminder": true, "reminderTime": "2026-07-29T06:00:00.000Z" }
      ]
    }

    Example 4 (Hebrew): Sleep request
    User text: "קבע לי 8 שעות שינה בלילה"
    Expected JSON:
    {
      "reasoning": "המשתמש מבקש 8 שעות שינה בלילה. ברירת המחדל לשינה היא 23:00-07:00 (8 שעות). השינה חוצה חצות. אני אקבע אירוע שינה יומי (daily) לכל ימות השבוע עם isSleep: true.",
      "replyMessage": "קבעתי לך 8 שעות שינה בכל לילה, מ-23:00 עד 07:00 למחרת. לילה טוב!",
      "events": [
        { "title": "שינה", "day": "Sunday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Monday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Tuesday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Wednesday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Thursday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Friday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" },
        { "title": "שינה", "day": "Saturday", "startTime": "11:00 PM", "endTime": "07:00 AM", "recurrence": "daily", "isRecurring": true, "isSleep": true, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 5 (Hebrew): Seamless text parsing — time + title without punctuation
    User text: "חמש וחצי ספרים לעמי"
    Expected JSON:
    {
      "reasoning": "המשתמש רוצה לקבוע אירוע בשם 'ספרים לעמי' בשעה 17:30. 'חמש וחצי' ללא ציון בוקר/ערב מתפרש כשעה 17:30 לפי חוקי ה-AM/PM (שעות נמוכות 1-7 ברירת מחדל אחה״צ). משך ברירת מחדל: שעה אחת, עד 18:30.",
      "replyMessage": "קבעתי לך 'ספרים לעמי' להיום (יום חמישי) בשעה 17:30-18:30.",
      "events": [
        { "title": "ספרים לעמי", "day": "Thursday", "startTime": "05:30 PM", "endTime": "06:30 PM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 6 (English): Seamless text parsing — time + title without punctuation
    User text: "five thirty books for ami"
    Expected JSON:
    {
      "reasoning": "The user wants to schedule an event called 'Books for Ami' at 17:30. 'five thirty' without AM/PM marker defaults to PM (low hours 1-7 default to afternoon/evening). Default duration: 1 hour, until 18:30.",
      "replyMessage": "I've scheduled 'Books for Ami' for today (Thursday) at 05:30 PM - 06:30 PM.",
      "events": [
        { "title": "Books for Ami", "day": "Thursday", "startTime": "05:30 PM", "endTime": "06:30 PM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 7 (Hebrew): Quarter to pattern
    User text: "רבע לשישה פגישה עם דני"
    Expected JSON:
    {
      "reasoning": "המשתמש רוצה לקבוע פגישה עם דני. 'רבע לשישה' = 17:45 (רבע לשש בערב, לפי חוקי ה-AM/PM). משך ברירת מחדל: שעה, עד 18:45.",
      "replyMessage": "קבעתי לך פגישה עם דני להיום (יום חמישי) בשעה 17:45-18:45.",
      "events": [
        { "title": "פגישה עם דני", "day": "Thursday", "startTime": "05:45 PM", "endTime": "06:45 PM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    Example 8 (English): Quarter to pattern
    User text: "quarter to six meeting with Danny"
    Expected JSON:
    {
      "reasoning": "The user wants a meeting with Danny. 'quarter to six' = 5:45 PM (quarter to six in the evening, default PM for low hours). Default duration: 1 hour, until 6:45 PM.",
      "replyMessage": "I've scheduled a meeting with Danny for today (Thursday) at 05:45 PM - 06:45 PM.",
      "events": [
        { "title": "Meeting with Danny", "day": "Thursday", "startTime": "05:45 PM", "endTime": "06:45 PM", "recurrence": "once", "isRecurring": false, "isSleep": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

    ─────────────────────────────────────────────
    REMINDER HANDLING
    ─────────────────────────────────────────────
    The user may ask for reminders in either language. Examples:
    - "תזכיר לי להתקשר למורן בעוד חצי שעה"
    - "תזכיר לי לשלם חשבון ב-16:00"
    - "remind me to buy milk tomorrow at 9 AM"
    - "תזכיר לי בעוד שעה להתקשר לרופא"

    When the user requests a REMINDER (any phrase containing "תזכיר" / "remind" / "תזכורת"):
    1. Set isReminder: true on the event.
    2. Set reminderTime to the ISO date/time string of when the alert should fire.
    3. The event title should describe what the reminder is about.
    4. Set startTime and endTime to bracket the reminder time.
    5. Set recurrence: "once" for one-time reminders.
    6. IMPORTANT: Do not confuse reminder events with regular schedule events.

    ─────────────────────────────────────────────
    USER REQUEST
    ─────────────────────────────────────────────
    "${text}"

    Now produce your JSON output with reasoning, replyMessage, and events. Remember: respond in the SAME LANGUAGE as the user's request!
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    });

    const raw = response.text || '{}';
    const parsed = JSON.parse(raw);

    // Handle the new structure with reasoning field
    if (parsed.reasoning && parsed.events && parsed.replyMessage) {
      return parsed;
    }

    // Graceful fallback: if the model returned events in an unexpected format
    if (parsed.events && parsed.replyMessage) {
      return {
        reasoning: parsed.reasoning || '',
        replyMessage: parsed.replyMessage,
        events: parsed.events
      };
    }

    // Last resort fallback: if the model returned a flat array of events
    if (Array.isArray(parsed)) {
      return {
        reasoning: isEnglish ? 'The model returned an array of events without explanation. Accepted by the system.' : 'המודל החזיר מערך אירועים ללא הסבר. התקבל על ידי המערכת.',
        replyMessage: isEnglish ? `Added ${parsed.length} new events.` : `נוספו ${parsed.length} אירועים חדשים.`,
        events: parsed
      };
    }

    // If the response is a single event object
    if (parsed.title && parsed.day) {
      return {
        reasoning: parsed.reasoning || (isEnglish ? 'The model returned a single event.' : 'המודל החזיר אירוע בודד.'),
        replyMessage: parsed.replyMessage || (isEnglish ? 'Added one new event.' : 'נוסף אירוע אחד חדש.'),
        events: [parsed]
      };
    }

    // If nothing matched, use fallback
    console.warn('Gemini returned unexpected structure, using fallback. Raw:', raw.slice(0, 200));
    return fallbackParseAdvice(text);

  } catch (error) {
    console.error('Gemini parse failed, using fallback:', error);
    return fallbackParseAdvice(text);
  }
}

function fallbackParseAdvice(text) {
  const isEnglish = /^[a-zA-Z0-9\s.,!?;:'"()-]+$/.test(text.trim()) && /[a-zA-Z]/.test(text.trim());

  const adviceKeywordsHe = ['תן לי','תמצא','תציע','המלץ','עזור','עזרי','רעיון','איך','מה להכין','מה לעשות','תעזור לי'];
  const adviceKeywordsEn = ['suggest', 'recommend', 'help', 'idea', 'how', 'what', 'find me', 'advice'];
  const hasAdvice = adviceKeywordsHe.some(kw => text.includes(kw)) || adviceKeywordsEn.some(kw => text.toLowerCase().includes(kw));

  let events;
  try {
    events = fallbackParse(text);
  } catch (e) {
    events = [{
        title: isEnglish ? 'Meeting / Event' : 'פגישה / אירוע',
        day: 'Today',
        startTime: '06:00 PM',
        endTime: '07:00 PM',
        isRecurring: false
    }];
  }

  const eventsWithAdvice = events.map(ev => ({
      ...ev,
      hasAdvice: hasAdvice,
      aiAdvice: hasAdvice 
        ? (isEnglish ? 'It is recommended to break the task into small steps and start early.' : 'מומלץ לפצל את המשימה לשלבים קטנים ולהתחיל מוקדם.')
        : ''
  }));

  return {
    replyMessage: isEnglish 
      ? `Successfully added ${events.length} event(s) from your text.`
      : `הצלחתי להוסיף ${events.length} אירועים מהטקסט שלך.`,
    events: eventsWithAdvice
  };
}

// ──────────────────────────────────────────────
// 9. AI Reschedule Engine
// ──────────────────────────────────────────────

async function rescheduleWithGemini(currentSchedule, reason) {
  if (!ai) {
    throw new Error("AI model is not initialized.");
  }

  const todayString = new Date().toLocaleString('he-IL', { dateStyle: 'full', timeStyle: 'short' });

  const prompt = `
    You are a world-class AI assistant specializing in calendar management and rescheduling. Your task is to intelligently reorganize a user's schedule based on a given reason, in Hebrew.

    CONTEXT:
    - The current time is: ${todayString}.
    - The user's reason for rescheduling is: "${reason}"
    - The user's current schedule is provided below in JSON format.

    RULES:
    1.  **Analyze Today**: Based on the current time, determine which events for "Today" have already passed and which are yet to happen. Only reschedule events from the current time forward.
    2.  **Identify Flexible Events**: Identify events that are likely flexible. Good candidates for rescheduling include tasks with titles like "אימון", "לימודים", "סידורים", "ריצה", "קניות". Do NOT reschedule events with titles like "פגישה", "שיעור", "תור לרופא", "אירוע" unless the user's reason explicitly asks for it.
    3.  **Apply the Reason**:
        - If the reason is "אני באיחור של X דקות/שעה" (I'm late by X mins/hour), shift all of today's upcoming events forward by that duration. Find new slots for any events that now conflict, prioritizing later today or tomorrow.
        - If the reason is "דחה משימות שלא בוצעו למחר" (Postpone uncompleted tasks to tomorrow), move all of today's flexible, uncompleted tasks to available slots on the next day.
    4.  **Find Free Slots**: When moving events, find logical free slots. Avoid scheduling things too late at night (e.g., after 11 PM) unless necessary. 
    5.  **Maintain Structure**: The output must be a valid JSON object containing the *entire* modified schedule, maintaining the exact same structure as the input (keys for every day of the week).
    6.  **Provide Summary**: The JSON object must also include a "summary" key with a short, friendly Hebrew message explaining the changes you made.

    INPUT SCHEDULE:
    ${JSON.stringify(currentSchedule, null, 2)}

    EXAMPLE OUTPUT:
    {
      "summary": "הבנתי, אתה מאחר בשעה. הזזתי את המשימות שלך להיום קדימה, והעברתי את האימון למחר בבוקר כי לא נשאר זמן. שיהיה המשך יום מוצלח!",
      "newSchedule": {
        "Sunday": [...],
        "Monday": [...],
        "Tuesday": [...],
        "Wednesday": [...],
        "Thursday": [...],
        "Friday": [...],
        "Saturday": [...],
        "Today": [...]
      }
    }

    Generate the JSON output now.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    });

    const raw = response.text || '{}';
    const parsed = JSON.parse(raw);

    if (!parsed.newSchedule || !parsed.summary) {
      throw new Error("AI response is missing 'newSchedule' or 'summary'.");
    }

    return parsed;

  } catch (error) {
    console.error('Gemini reschedule failed:', error);
    throw new Error('Failed to get a valid reschedule plan from AI.');
  }
}

// ──────────────────────────────────────────────
// 9b. Deterministic Schedule Helpers
// ──────────────────────────────────────────────

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function findGapsInSchedule(schedule) {
  const todayName = getTodayDayName();
  const todayEvents = schedule[todayName] || [];
  
  if (todayEvents.length < 2) return [];
  
  const sorted = [...todayEvents]
    .map((e, idx) => ({ ...e, originalIndex: idx }))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  const gaps = [];
  const currentMin = getCurrentMinutes();
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const currentEnd = timeToMinutes(current.endTime);
    const nextStart = timeToMinutes(next.startTime);
    
    if (currentEnd === null || nextStart === null) continue;
    
    if (currentEnd < currentMin) continue;
    
    const gapMinutes = nextStart - currentEnd;
    
    if (gapMinutes >= 15) {
      gaps.push({
        gapMinutes,
        startTime: current.endTime,
        endTime: next.startTime,
        beforeEvent: current.title,
        afterEvent: next.title
      });
    }
  }
  
  return gaps;
}

function shiftScheduleForward(schedule, delayMinutes) {
  const todayName = getTodayDayName();
  const newSchedule = JSON.parse(JSON.stringify(schedule));
  const todayEvents = newSchedule[todayName] || [];
  
  if (todayEvents.length === 0) {
    return { newSchedule, summary: 'אין אירועים להיום להזיז.' };
  }
  
  const currentMin = getCurrentMinutes();
  
  const sorted = todayEvents
    .map((e, idx) => ({ ...e, originalIndex: idx }))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  let shiftStartIndex = -1;
  for (let i = 0; i < sorted.length; i++) {
    const eventEnd = timeToMinutes(sorted[i].endTime);
    if (eventEnd !== null && eventEnd > currentMin) {
      shiftStartIndex = i;
      break;
    }
  }
  
  if (shiftStartIndex === -1) {
    return { newSchedule, summary: 'כל האירועים להיום כבר עברו.' };
  }
  
  let accumulatedDelay = delayMinutes;
  for (let i = shiftStartIndex; i < sorted.length; i++) {
    const event = sorted[i];
    const oldStart = timeToMinutes(event.startTime);
    const oldEnd = timeToMinutes(event.endTime);
    if (oldStart === null || oldEnd === null) continue;
    
    const newStart = oldStart + accumulatedDelay;
    const newEnd = oldEnd + accumulatedDelay;
    
    event.startTime = minutesToTime(newStart);
    event.endTime = minutesToTime(newEnd);
  }
  
  newSchedule[todayName] = sorted.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  syncTodayWithCurrentDay(newSchedule);
  
  const delayDisplay = delayMinutes >= 60 
    ? `${Math.floor(delayMinutes / 60)} שעה ו${delayMinutes % 60} דקות` 
    : `${delayMinutes} דקות`;
  
  return {
    newSchedule,
    summary: `הזזתי את כל האירועים להיום קדימה ב${delayDisplay}.`
  };
}

function mergeGaps(schedule) {
  const todayName = getTodayDayName();
  const newSchedule = JSON.parse(JSON.stringify(schedule));
  const todayEvents = newSchedule[todayName] || [];
  
  if (todayEvents.length < 2) {
    return { newSchedule, gaps: [], summary: 'אין מספיק אירועים למיזוג הפסקות.' };
  }
  
  const currentMin = getCurrentMinutes();
  const gaps = findGapsInSchedule(schedule);
  
  if (gaps.length === 0) {
    return { newSchedule, gaps: [], summary: 'לא נמצאו הפסקות למיזוג בין האירועים.' };
  }
  
  const sorted = todayEvents
    .map((e, idx) => ({ ...e, originalIndex: idx }))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  let totalMerged = 0;
  for (const gap of gaps) {
    const gapStart = timeToMinutes(gap.startTime);
    if (gapStart === null || gapStart < currentMin) continue;
    
    for (let i = 0; i < sorted.length; i++) {
      const eventStart = timeToMinutes(sorted[i].startTime);
      if (eventStart !== null && eventStart >= gapStart + gap.gapMinutes) {
        for (let j = i; j < sorted.length; j++) {
          const oldStart = timeToMinutes(sorted[j].startTime);
          const oldEnd = timeToMinutes(sorted[j].endTime);
          if (oldStart === null || oldEnd === null) continue;
          sorted[j].startTime = minutesToTime(oldStart - gap.gapMinutes);
          sorted[j].endTime = minutesToTime(oldEnd - gap.gapMinutes);
        }
        totalMerged += gap.gapMinutes;
        break;
      }
    }
  }
  
  if (totalMerged === 0) {
    return { newSchedule, gaps, summary: 'לא ניתן למזג הפסקות כרגע.' };
  }
  
  newSchedule[todayName] = sorted.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  syncTodayWithCurrentDay(newSchedule);
  
  return {
    newSchedule,
    gaps: gaps.filter(g => timeToMinutes(g.startTime) >= currentMin),
    summary: `מיזגתי ${gaps.length} הפסקות וחיסכתי ${totalMerged} דקות! האירועים צמודים יותר עכשיו.`,
    totalMergedMinutes: totalMerged
  };
}


// ──────────────────────────────────────────────
// 6. Auth routes
// ──────────────────────────────────────────────

const OAUTH_SCOPES = process.env.OAUTH_SCOPES
  ? process.env.OAUTH_SCOPES.split(',').map(s => s.trim())
  : ['profile', 'email'];

app.get('/api/auth/google',
  (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'your_google_client_id_here') {
      return res.status(400).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
    }
    next();
  },
  passport.authenticate('google', {
    scope: OAUTH_SCOPES
  })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    const baseUrl = process.env.FRONTEND_URL || CLIENT_URL;
    res.redirect(`${baseUrl}/?auth=success`);
  }
);

app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const sessionUser = req.session.passport?.user;
    const userForClient = sessionUser ? { ...sessionUser, hasToken: !!sessionUser.accessToken } : null;
    res.json({ user: userForClient });
  } else {
    res.json({ user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy(err => {
      if (err) return res.status(500).json({ error: 'Session destruction failed' });
      res.clearCookie('connect.sid').json({ ok: true });
    });
  });
});

// ── JWT Token Endpoints (persistent auth across server restarts) ──
const JWT_SECRET = process.env.JWT_SECRET || 'calendai-jwt-secret-change-in-production';

/**
 * POST /api/auth/token
 * Exchange the current session for a JWT token.
 * The frontend stores this token in localStorage and sends it as
 * Authorization: Bearer <token> for subsequent requests.
 */
app.post('/api/auth/token', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const sessionUser = req.session?.passport?.user;
  if (!sessionUser) {
    return res.status(401).json({ error: 'No user in session' });
  }
  const token = jwt.sign(
    {
      id: sessionUser.id || sessionUser.googleId,
      googleId: sessionUser.googleId,
      displayName: sessionUser.displayName,
      email: sessionUser.email,
      photo: sessionUser.photo
    },
    JWT_SECRET,
    { expiresIn: '90d' }
  );
  res.json({ token, user: sessionUser });
});

/**
 * GET /api/auth/verify
 * Verify a JWT token from the Authorization header.
 * Returns the user data if valid, or 401 if invalid/expired.
 */
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: decoded });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ──────────────────────────────────────────────
// 7. Booking invitation endpoint
// ──────────────────────────────────────────────

app.post('/api/booking/send-invitation', async (req, res) => {
  try {
    const { recipient, bookingId, shareLink, day, slots, duration } = req.body;
    if (!recipient || !bookingId || !day || !slots || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const invitationsDir = path.join(DATA_DIR, 'invitations');
    if (!fs.existsSync(invitationsDir)) {
      fs.mkdirSync(invitationsDir, { recursive: true });
    }

    const invitation = {
      id: bookingId,
      recipient,
      shareLink,
      day,
      slots,
      duration,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    const inviteFile = path.join(invitationsDir, `${bookingId}.json`);
    fs.writeFileSync(inviteFile, JSON.stringify(invitation, null, 2));

    res.json({ ok: true, message: 'Invitation sent successfully' });
  } catch (err) {
    console.error('Send invitation error:', err);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// ──────────────────────────────────────────────
// 8. Slot availability check endpoint
// ──────────────────────────────────────────────

app.post('/api/schedule/check-slot', (req, res) => {
  try {
    const { day, startTime, endTime } = req.body;
    if (!day || !startTime || !endTime) {
      return res.status(400).json({ available: false, error: 'Missing required fields: day, startTime, endTime' });
    }

    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    const dayEvents = schedule[day] || [];

    function parseToMinutes(timeStr) {
      if (!timeStr) return null;
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return null;
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    }

    const newStart = parseToMinutes(startTime);
    const newEnd = parseToMinutes(endTime);
    if (newStart === null || newEnd === null) {
      return res.status(400).json({ available: false, error: 'Invalid time format. Use HH:MM AM/PM' });
    }

    for (const event of dayEvents) {
      const exStart = parseToMinutes(event.startTime);
      const exEnd = parseToMinutes(event.endTime);
      if (exStart === null || exEnd === null) continue;
      if (newStart < exEnd && newEnd > exStart) {
        return res.json({ available: false, conflictingEvent: event });
      }
    }

    return res.json({ available: true });
  } catch (err) {
    console.error('Check slot error:', err);
    return res.status(500).json({ available: false, error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────
// 8. Conflict detection helper
// ──────────────────────────────────────────────

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function parseTimeToMinutes24(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function detectConflicts(newEvent, existingEvents, options = {}) {
  const newStart = parseTimeToMinutes(newEvent.startTime);
  const newEnd = parseTimeToMinutes(newEvent.endTime);
  
  const dayStart = options.dayStart ? parseTimeToMinutes24(options.dayStart) : 6 * 60;
  const dayEnd = options.dayEnd ? parseTimeToMinutes24(options.dayEnd) : 23 * 60;
  if (newStart === null || newEnd === null) return { hasConflict: false, conflicts: [], suggestions: [] };

  const conflicts = [];
  for (const existing of existingEvents) {
    const exStart = parseTimeToMinutes(existing.startTime);
    const exEnd = parseTimeToMinutes(existing.endTime);
    if (exStart === null || exEnd === null) continue;

    if (newStart < exEnd && newEnd > exStart) {
      conflicts.push({
        title: existing.title,
        startTime: existing.startTime,
        endTime: existing.endTime
      });
    }
  }

  const suggestions = [];
  if (conflicts.length > 0) {
    const busySlots = existingEvents
      .map(e => ({
        start: parseTimeToMinutes(e.startTime),
        end: parseTimeToMinutes(e.endTime)
      }))
      .filter(s => s.start !== null && s.end !== null)
      .sort((a, b) => a.start - b.start);

    const duration = newEnd - newStart;

    let cursor = dayStart;
    for (const slot of busySlots) {
      if (cursor + duration <= slot.start) {
        const hours = Math.floor(cursor / 60);
        const mins = cursor % 60;
        const endHours = Math.floor((cursor + duration) / 60);
        const endMins = (cursor + duration) % 60;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const endAmpm = endHours >= 12 ? 'PM' : 'AM';
        const displayH = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        const displayEndH = endHours > 12 ? endHours - 12 : (endHours === 0 ? 12 : endHours);
        suggestions.push({
          startTime: `${String(displayH).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`,
          endTime: `${String(displayEndH).padStart(2, '0')}:${String(endMins).padStart(2, '0')} ${endAmpm}`
        });
        if (suggestions.length >= 2) break;
      }
      cursor = Math.max(cursor, slot.end);
    }

    if (suggestions.length === 0 && cursor + duration <= dayEnd) {
      const hours = Math.floor(cursor / 60);
      const mins = cursor % 60;
      const endHours = Math.floor((cursor + duration) / 60);
      const endMins = (cursor + duration) % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const endAmpm = endHours >= 12 ? 'PM' : 'AM';
      const displayH = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
      const displayEndH = endHours > 12 ? endHours - 12 : (endHours === 0 ? 12 : endHours);
      suggestions.push({
        startTime: `${String(displayH).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`,
        endTime: `${String(displayEndH).padStart(2, '0')}:${String(endMins).padStart(2, '0')} ${endAmpm}`
      });
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    suggestions
  };
}

// ──────────────────────────────────────────────
// 8. Schedule routes
// ──────────────────────────────────────────────

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
// 8b. Find Free Slots
// ──────────────────────────────────────────────

function findFreeSlotsForDay(schedule, dayName, locationId) {
  const dayEvents = schedule[dayName] || [];
  const locData = LOCATIONS.find(loc => loc.id === (locationId || DEFAULT_LOCATION_ID));
  const dayStart = locData ? parseTimeToMinutes24(locData.defaultDayStart) : 6 * 60;
  const dayEnd = locData ? parseTimeToMinutes24(locData.defaultDayEnd) : 23 * 60;
  
  if (dayStart === null || dayEnd === null) return [];
  
  const busySlots = dayEvents
    .map(e => ({
      start: timeToMinutes(e.startTime),
      end: timeToMinutes(e.endTime)
    }))
    .filter(s => s.start !== null && s.end !== null)
    .sort((a, b) => a.start - b.start);
  
  const freeSlots = [];
  let cursor = dayStart;
  
  for (const slot of busySlots) {
    if (cursor < slot.start) {
      const gapMinutes = slot.start - cursor;
      if (gapMinutes >= 15) {
        freeSlots.push({
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(slot.start),
          durationMinutes: gapMinutes
        });
      }
    }
    cursor = Math.max(cursor, slot.end);
  }
  
  if (cursor < dayEnd) {
    const gapMinutes = dayEnd - cursor;
    if (gapMinutes >= 15) {
      freeSlots.push({
        startTime: minutesToTime(cursor),
        endTime: minutesToTime(dayEnd),
        durationMinutes: gapMinutes
      });
    }
  }
  
  return freeSlots;
}

app.get('/api/schedule/free-slots', (req, res) => {
  try {
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    
    const day = req.query.day || getTodayDayName();
    const durationMinutes = parseInt(req.query.duration) || 30;
    const locationId = req.query.location || DEFAULT_LOCATION_ID;
    
    const actualDay = day === 'Today' ? getTodayDayName() : day;
    
    const allFreeSlots = findFreeSlotsForDay(schedule, actualDay, locationId);
    
    const suitableSlots = allFreeSlots.filter(slot => slot.durationMinutes >= durationMinutes);
    
    res.json({
      day: actualDay,
      requestedDurationMinutes: durationMinutes,
      freeSlots: suitableSlots,
      totalFreeSlots: suitableSlots.length
    });
  } catch (error) {
    console.error('Failed to find free slots:', error);
    res.status(500).json({ error: 'Failed to find free slots.' });
  }
});

app.post('/api/schedule/add-to-free-slot', (req, res) => {
  try {
    const { day, startTime, endTime, title, recurrence, location } = req.body;
    if (!day || !startTime || !endTime || !title) {
      return res.status(400).json({ error: 'day, startTime, endTime, and title are required.' });
    }
    
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    const todayName = getTodayDayName();
    const locationId = location || DEFAULT_LOCATION_ID;
    
    const actualDay = day === 'Today' ? todayName : day;
    
    const newEvent = {
      title,
      day: actualDay,
      startTime,
      endTime,
      recurrence: recurrence || 'once',
      location: locationId
    };
    
    if (schedule[actualDay]) {
      schedule[actualDay].push(newEvent);
    } else {
      schedule['Today'].push(newEvent);
    }
    
    syncTodayWithCurrentDay(schedule);
    saveSchedulesNow();
    
    res.json({ ok: true, event: newEvent });
  } catch (error) {
    console.error('Failed to add event to free slot:', error);
    res.status(500).json({ error: 'Failed to add event.' });
  }
});

app.put('/api/schedule/event', (req, res) => {
  const { day, index, updates } = req.body;
  if (!day || index === undefined || !updates) {
    return res.status(400).json({ error: 'day, index, and updates are required.' });
  }
  
  try {
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    const actualDay = day === 'Today' ? getTodayDayName() : day;
    
    if (schedule[actualDay] && schedule[actualDay][index]) {
      schedule[actualDay][index] = { ...schedule[actualDay][index], ...updates };
      syncTodayWithCurrentDay(schedule);
      saveSchedulesNow();
      res.json({ ok: true, event: schedule[actualDay][index] });
    } else {
      res.status(404).json({ error: 'Event not found.' });
    }
  } catch (error) {
    console.error('Failed to update event:', error);
    res.status(500).json({ error: 'Failed to update event.' });
  }
});

// ──────────────────────────────────────────────
// 8c. Original parse-schedule route (unchanged)
// ──────────────────────────────────────────────

app.post('/api/parse-schedule', aiLimiter, async (req, res) => {

  const { text, recurrence, location } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text input is required.' });
  }

  try {
    const { events: parsedEvents, replyMessage } = await parseWithGemini(text);
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    const todayName = getTodayDayName();

    const locationId = location || DEFAULT_LOCATION_ID;
    const locData = LOCATIONS.find(loc => loc.id === locationId);
    const locationOptions = locData ? {
      dayStart: locData.defaultDayStart,
      dayEnd: locData.defaultDayEnd
    } : {};

    const addedEvents = [];
    const conflictWarnings = [];

    for (const event of parsedEvents) {
      let day = event.day || todayName;
      if (day === 'Today') {
        day = todayName;
      }

      let eventRecurrence = event.recurrence || recurrence || 'weekly';
      if (event.isSleep) {
        eventRecurrence = 'daily';
      }

      // Auto-set createdMonth for yearly events so they only repeat in the correct month
      const createdMonth = new Date().getMonth();

      const eventWithRecurrence = {
        ...event,
        day: day,
        recurrence: eventRecurrence,
        location: locationId,
        ...(eventRecurrence === 'yearly' && { createdMonth })
      };

      if (schedule[day]) {
        const { hasConflict, conflicts, suggestions } = detectConflicts(eventWithRecurrence, schedule[day], locationOptions);
        if (hasConflict) {
          conflictWarnings.push({
            day: day,
            event: eventWithRecurrence,
            conflicts: conflicts,
            suggestions: suggestions
          });
        }
        schedule[day].push(eventWithRecurrence);
        addedEvents.push(eventWithRecurrence);
      } else {
        schedule['Today'].push(eventWithRecurrence);
        addedEvents.push({ ...eventWithRecurrence, day: 'Today' });
      }
    }

    syncTodayWithCurrentDay(schedule);

    saveSchedulesNow();

    res.json({ 
      events: addedEvents,
      replyMessage: replyMessage || `נוספו ${addedEvents.length} אירועים.`,
      totalEvents: Object.values(schedule).reduce((sum, arr) => sum + arr.length, 0),
      conflicts: conflictWarnings.length > 0 ? conflictWarnings : undefined
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to parse schedule.' });
  }
});

// POST /api/add-to-google-calendar - Add an event to the user's Google Calendar
app.post('/api/add-to-google-calendar', async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.session.passport?.user?.accessToken) {
    return res.status(401).json({ error: 'User not authenticated or token missing.' });
  }


  const { event, location } = req.body;
  if (!event || !event.title || !event.startTime || !event.day) {
    return res.status(400).json({ error: 'Invalid event data provided.' });
  }

  const locationId = location || DEFAULT_LOCATION_ID;
  const locData = LOCATIONS.find(loc => loc.id === locationId);
  const timeZone = locData ? locData.timezone : 'Asia/Jerusalem';

  const accessToken = req.session.passport.user.accessToken;
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const targetDay = dayMap[event.day];
  if (targetDay === undefined) {
    return res.status(400).json({ error: 'Invalid day for Google Calendar event.' });
  }

  const today = new Date();
  const eventDate = new Date(today);
  eventDate.setDate(today.getDate() + (targetDay + 7 - today.getDay()) % 7);

  const [startHour, startMinute] = event.startTime.match(/\d+/g).map(Number);
  const [endHour, endMinute] = event.endTime.match(/\d+/g).map(Number);
  const startIsPM = event.startTime.includes('PM');
  const endIsPM = event.endTime.includes('PM');

  const startDateTime = new Date(eventDate.setHours(startIsPM && startHour !== 12 ? startHour + 12 : startHour, startMinute, 0, 0));
  const endDateTime = new Date(eventDate.setHours(endIsPM && endHour !== 12 ? endHour + 12 : endHour, endMinute, 0, 0));

  // Build RRULE for recurring events
  let recurrenceRule = null;
  if (event.recurrence) {
    switch (event.recurrence) {
      case 'daily':
        recurrenceRule = 'RRULE:FREQ=DAILY';
        break;
      case 'weekly':
        recurrenceRule = 'RRULE:FREQ=WEEKLY';
        break;
      case 'monthly':
        recurrenceRule = 'RRULE:FREQ=MONTHLY';
        break;
      case 'yearly':
        recurrenceRule = 'RRULE:FREQ=YEARLY';
        break;
      case 'forever':
        recurrenceRule = 'RRULE:FREQ=DAILY';
        break;
    }
  }

  try {
    const requestBody = {
      summary: event.title,
      start: { dateTime: startDateTime.toISOString(), timeZone },
      end: { dateTime: endDateTime.toISOString(), timeZone },
    };
    
    // Attach RRULE to recurring events
    if (recurrenceRule) {
      requestBody.recurrence = [recurrenceRule];
    }
    
    const gcalEvent = await calendar.events.insert({
      calendarId: 'primary',
      requestBody,
    });
    res.json({ ok: true, message: 'Event added to Google Calendar!', link: gcalEvent.data.htmlLink });
  } catch (error) {
    console.error('Error adding event to Google Calendar:', error);
    res.status(500).json({ error: 'Failed to add event to Google Calendar.' });
  }
});

// POST /api/reschedule
app.post('/api/reschedule', aiLimiter, async (req, res) => {

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason is required.' });
  }

  try {
    const userId = getUserId(req);
    const currentSchedule = getUserSchedule(userId);
    const result = await rescheduleWithGemini(currentSchedule, reason);

    userSchedules.set(userId, result.newSchedule);
    saveSchedulesNow();

    res.json({
      summary: result.summary,
      newSchedule: result.newSchedule
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reschedule.' });
  }
});

app.post('/api/reschedule/shift', (req, res) => {
  const { delayMinutes } = req.body;
  if (!delayMinutes || delayMinutes < 1) {
    return res.status(400).json({ error: 'delayMinutes is required and must be positive.' });
  }

  try {
    const userId = getUserId(req);
    const currentSchedule = getUserSchedule(userId);
    const result = shiftScheduleForward(currentSchedule, delayMinutes);

    userSchedules.set(userId, result.newSchedule);
    saveSchedulesNow();

    res.json({
      summary: result.summary,
      newSchedule: result.newSchedule
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to shift schedule.' });
  }
});

app.post('/api/reschedule/merge-gaps', (req, res) => {
  try {
    const userId = getUserId(req);
    const currentSchedule = getUserSchedule(userId);
    const result = mergeGaps(currentSchedule);

    if (result.totalMergedMinutes > 0) {
      userSchedules.set(userId, result.newSchedule);
      saveSchedulesNow();
    }

    res.json({
      summary: result.summary,
      newSchedule: result.totalMergedMinutes > 0 ? result.newSchedule : currentSchedule,
      gaps: result.gaps || [],
      totalMergedMinutes: result.totalMergedMinutes || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to merge gaps.' });
  }
});

app.get('/api/reschedule/gaps', (req, res) => {
  try {
    const userId = getUserId(req);
    const currentSchedule = getUserSchedule(userId);
    const gaps = findGapsInSchedule(currentSchedule);

    res.json({
      gaps,
      gapCount: gaps.length,
      hasGaps: gaps.length > 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to check gaps.' });
  }
});

app.put('/api/schedule', (req, res) => {
  const { schedule } = req.body;
  if (!schedule) {
    return res.status(400).json({ error: 'schedule is required.' });
  }
  const userId = getUserId(req);
  userSchedules.set(userId, schedule);
  saveSchedulesNow();
  res.json({ ok: true, message: 'Schedule restored.' });
});

app.get('/api/schedule', (req, res) => {
  const userId = getUserId(req);
  const schedule = getUserSchedule(userId);
  syncTodayWithCurrentDay(schedule);
  res.json({ schedule });
});

app.get('/api/schedule/expanded', (req, res) => {
  const userId = getUserId(req);
  const schedule = getUserSchedule(userId);
  
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const view = req.query.view || 'month';
  
  if (view === 'year') {
    const allEvents = expandEventsForYear(schedule, year);
    return res.json({ events: allEvents, year, view: 'year' });
  }
  
  const month = parseInt(req.query.month) !== undefined ? parseInt(req.query.month) : new Date().getMonth();
  const monthEvents = [];
  const expandedDailyKeys = new Set();
  
  for (const dayKey of Object.keys(schedule)) {
    if (dayKey === 'Today') continue;
    const dayEvents = schedule[dayKey] || [];
    for (const event of dayEvents) {
      let expanded;
      if (event.recurrence === 'daily') {
        const dailyKey = getDailyEventKey(event);
        if (expandedDailyKeys.has(dailyKey)) continue;
        expandedDailyKeys.add(dailyKey);
        expanded = expandDailyEventForMonth(event, year, month);
      } else {
        expanded = expandEventForMonth(event, year, month);
      }
      monthEvents.push(...expanded);
    }
  }
  
  res.json({ events: monthEvents, year, month, view: 'month' });
});

app.delete('/api/schedule/clear', (req, res) => {
  const userId = getUserId(req);
  userSchedules.set(userId, getDefaultSchedule());
  saveSchedulesNow();
  res.json({ ok: true, message: 'Schedule cleared.' });
});

app.delete('/api/schedule/event', (req, res) => {
  const { day, index } = req.body;
  if (!day || index === undefined) {
    return res.status(400).json({ error: 'day and index are required.' });
  }
  const userId = getUserId(req);
  const schedule = getUserSchedule(userId);
  if (schedule[day] && schedule[day][index]) {
    schedule[day].splice(index, 1);
    saveSchedulesNow();
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Event not found.' });
  }
});

// ──────────────────────────────────────────────
// 9c. AI Booking Smart Finder
// ──────────────────────────────────────────────

/**
 * POST /api/booking/ai-find-slot
 * Uses AI to analyze the host's schedule, find gaps, suggest merging tasks,
 * or propose alternative times for a guest booking.
 */
app.post('/api/booking/ai-find-slot', aiLimiter, async (req, res) => {
  try {
    const { day, durationMinutes, guestName, preferences } = req.body;
    if (!day || !durationMinutes) {
      return res.status(400).json({ error: 'day and durationMinutes are required.' });
    }

    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    const todayName = getTodayDayName();
    const actualDay = day === 'Today' ? todayName : day;
    const dayEvents = schedule[actualDay] || [];

    const freeSlots = findFreeSlotsForDay(schedule, actualDay, DEFAULT_LOCATION_ID);

    if (!ai) {
      const suitableSlots = freeSlots.filter(s => s.durationMinutes >= durationMinutes);
      return res.json({
        hasSuggestion: suitableSlots.length > 0,
        freeSlots: suitableSlots,
        suggestion: suitableSlots.length > 0
          ? null
          : { type: 'no_free_slot', message: 'No free slots available. Try another day.' },
        aiMessage: null
      });
    }

    const prompt = `
      אתה עוזר AI חכם שמנתח לו"ז יומי. תפקידך למצוא חלון פנוי לאורח חדש, או להציע דרכים ליצור חלון פנוי על ידי מיזוג משימות.

      הנה נתוני הקלט:
      - היום: ${actualDay}
      - משך הפגישה הרצוי: ${durationMinutes} דקות
      - שם האורח: ${guestName || 'אורח'}
      - העדפות: ${preferences || 'ללא העדפות מיוחדות'}
      - האירועים הקיימים ביום זה: ${JSON.stringify(dayEvents)}

      החלונות הפנויים הקיימים: ${JSON.stringify(freeSlots)}

      אנא החזר JSON בפורמט הבא:
      {
        "hasSuggestion": boolean,
        "aiMessage": "מסביר בעברית מה מצאת או מה אתה מציע",
        "suggestion": {
          "type": "free_slot" | "merge_tasks" | "try_another_day",
          "startTime": "HH:MM AM/PM (אם יש הצעה לשעה)",
          "endTime": "HH:MM AM/PM",
          "message": "הסבר מפורט בעברית"
        },
        "freeSlots": [
          { "startTime": "HH:MM AM/PM", "endTime": "HH:MM AM/PM", "durationMinutes": number }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.4,
        responseMimeType: 'application/json'
      }
    });

    const raw = response.text || '{}';
    const parsed = JSON.parse(raw);

    if (!parsed.hasSuggestion === undefined && !parsed.freeSlots) {
      const suitableSlots = freeSlots.filter(s => s.durationMinutes >= durationMinutes);
      return res.json({
        hasSuggestion: suitableSlots.length > 0,
        freeSlots: suitableSlots,
        suggestion: null,
        aiMessage: suitableSlots.length > 0
          ? `מצאתי ${suitableSlots.length} חלונות פנויים ביום ${actualDay}.`
          : `לא מצאתי חלונות פנויים ביום ${actualDay}. נסה יום אחר.`
      });
    }

    res.json({
      hasSuggestion: parsed.hasSuggestion || false,
      freeSlots: parsed.freeSlots || freeSlots.filter(s => s.durationMinutes >= durationMinutes),
      suggestion: parsed.suggestion || null,
      aiMessage: parsed.aiMessage || null
    });

  } catch (error) {
    console.error('AI booking finder failed:', error);
    try {
      const userId = getUserId(req);
      const schedule = getUserSchedule(userId);
      const todayName = getTodayDayName();
      const actualDay = (req.body.day === 'Today' ? todayName : req.body.day) || todayName;
      const freeSlots = findFreeSlotsForDay(schedule, actualDay, DEFAULT_LOCATION_ID);
      const duration = parseInt(req.body.durationMinutes) || 30;
      const suitableSlots = freeSlots.filter(s => s.durationMinutes >= duration);
      return res.json({
        hasSuggestion: suitableSlots.length > 0,
        freeSlots: suitableSlots,
        suggestion: null,
        aiMessage: suitableSlots.length > 0
          ? `מצאתי ${suitableSlots.length} חלונות פנויים ביום ${actualDay}.`
          : `לא מצאתי חלונות פנויים ביום ${actualDay}. נסה יום אחר.`
      });
    } catch (fallbackErr) {
      res.status(500).json({ error: 'Failed to analyze schedule for booking.' });
    }
  }
});

// ──────────────────────────────────────────────
// 9d. Expiration & Extension Notification
// ──────────────────────────────────────────────

/**
 * GET /api/schedule/expiring
 * Find events that are expiring within the next 30 days.
 * For yearly events: check if the current month is the event's createdMonth
 * (meaning the event is at its "anniversary" and about to "expire").
 */
app.get('/api/schedule/expiring', (req, res) => {
  try {
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    const now = new Date();
    const currentMonth = now.getMonth();
    
    const expiringEvents = [];
    const processedKeys = new Set();
    
    for (const dayKey of Object.keys(schedule)) {
      if (dayKey === 'Today') continue;
      const dayEvents = schedule[dayKey] || [];
      
      for (let i = 0; i < dayEvents.length; i++) {
        const event = dayEvents[i];
        
        if (!event.recurrence || event.recurrence === 'once') continue;
        
        const key = `${event.title}|${event.startTime}|${event.day}|${event.recurrence}|${dayKey}`;
        if (processedKeys.has(key)) continue;
        processedKeys.add(key);
        
        // Check yearly events: they "expire" when the current month is the createdMonth
        if (event.recurrence === 'yearly') {
          if (event.createdMonth !== undefined && event.createdMonth === currentMonth) {
            expiringEvents.push({
              ...event,
              dayKey,
              index: i,
              expiryType: 'yearly',
              expiresInDays: 30,
              message: 'האירוע השנתי עומד להסתיים. האם ברצונך להאריך אותו לשנה נוספת?'
            });
          }
        }
        
        // Check events with endDate (future-proofing)
        if (event.endDate) {
          const endDate = new Date(event.endDate);
          const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 30) {
            expiringEvents.push({
              ...event,
              dayKey,
              index: i,
              expiryType: 'endDate',
              expiresInDays: diffDays,
              message: `האירוע "${event.title}" עומד להסתיים בעוד ${diffDays} ימים. האם ברצונך להאריכו?`
            });
          }
        }
      }
    }
    
    res.json({ 
      expiringEvents, 
      hasExpiring: expiringEvents.length > 0,
      total: expiringEvents.length
    });
  } catch (error) {
    console.error('Failed to check expiring events:', error);
    res.status(500).json({ error: 'Failed to check expiring events.' });
  }
});

/**
 * POST /api/schedule/extend-event
 * Extend a yearly event by updating its createdMonth to the current month
 * (effectively renewing it for another year).
 */
app.post('/api/schedule/extend-event', (req, res) => {
  try {
    const { dayKey, index } = req.body;
    if (!dayKey || index === undefined) {
      return res.status(400).json({ error: 'dayKey and index are required.' });
    }
    
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    
    if (!schedule[dayKey] || !schedule[dayKey][index]) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    
    const event = schedule[dayKey][index];
    const now = new Date();
    const currentMonth = now.getMonth();
    
    // Update the createdMonth to the current month (extends for another year)
    const nextYear = now.getFullYear() + 1;
    
    schedule[dayKey][index] = {
      ...event,
      createdMonth: currentMonth,
      extendedAt: now.toISOString(),
      extendedUntil: `${nextYear}`
    };
    
    syncTodayWithCurrentDay(schedule);
    saveSchedulesNow();
    
    res.json({ 
      ok: true, 
      message: 'האירוע הוארך לשנה נוספת בהצלחה!',
      event: schedule[dayKey][index]
    });
  } catch (error) {
    console.error('Failed to extend event:', error);
    res.status(500).json({ error: 'Failed to extend event.' });
  }
});

// ──────────────────────────────────────────────
// 10. Locations API
// ──────────────────────────────────────────────

app.get('/api/locations', (_req, res) => {
  const locationsList = LOCATIONS.map(loc => ({
    id: loc.id,
    name: loc.name,
    label: loc.label,
    timezone: loc.timezone,
    availableDays: loc.availableDays,
    defaultDayStart: loc.defaultDayStart,
    defaultDayEnd: loc.defaultDayEnd
  }));
  res.json({ locations: locationsList });
});

app.get('/api/locations/:id/slots', (req, res) => {
  const location = LOCATIONS.find(loc => loc.id === req.params.id);
  if (!location) {
    return res.status(404).json({ error: 'Location not found.' });
  }
  res.json({
    location: {
      id: location.id,
      name: location.name,
      label: location.label,
      timezone: location.timezone,
      availableDays: location.availableDays,
      defaultDayStart: location.defaultDayStart,
      defaultDayEnd: location.defaultDayEnd
    },
    timeSlots: location.timeSlots
  });
});

// ──────────────────────────────────────────────
// 11. Health & Fallback
// ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'CalendAI backend is running.' });
});

// ──────────────────────────────────────────────
// 12. Serve frontend for any non-API route
// ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});