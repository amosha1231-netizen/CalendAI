const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
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
      // Convert plain objects back to Map
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

// Trust the Render/production reverse proxy so secure cookies work correctly
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
    secure: isProduction, // true when on Render (HTTPS)
    sameSite: isProduction ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ──────────────────────────────────────────────
// Rate limiting for AI-powered / expensive endpoints
// ──────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // max 20 requests per minute per IP
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
    // Pass accessToken to the session
    return done(null, { ...user, accessToken });
  }));

  // Store the FULL user object (including accessToken) in the session.
  // This is required because getUserId() and the Google Calendar sync route
  // both read req.session.passport.user directly and expect the full object
  // (id, googleId, displayName, email, photo, accessToken), not just an ID.
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

  // If the event has a stored targetDate, use it for "once" events
  const storedTargetDate = event.targetDate && new Date(event.targetDate);

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dow = date.getDay();

    if (dow !== targetDayOfWeek) continue;

    let include = false;

    switch (event.recurrence || 'weekly') {
      case 'once': {
        // For "once" events: use the stored targetDate if available,
        // otherwise calculate the next occurrence of this day from today
        if (storedTargetDate) {
          // Use the stored exact date
          const thisDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const targetDateStr = `${storedTargetDate.getFullYear()}-${String(storedTargetDate.getMonth()+1).padStart(2,'0')}-${String(storedTargetDate.getDate()).padStart(2,'0')}`;
          if (thisDateStr === targetDateStr) {
            include = true;
          }
        } else {
          // Fallback: calculate the next occurrence of this day from today
          const today = new Date();
          const currentDayOfWeek = today.getDay();
          let daysUntilTarget = targetDayOfWeek - currentDayOfWeek;
          // If today is the target day, event is for today (not next week)
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
        // Daily events appear every day regardless of day of week
        // Since we iterate by day-of-week match above, we need to handle daily differently
        // For daily events, we include ALL days, not just matching day-of-week
        // We'll handle this by returning early with all days
        break;
      case 'weekly':
        include = true;
        break;
      case 'monthly':
        // Only the first occurrence of that day in the month
        // Include only if this is the first week that contains this day
        if (d <= 7) {
          include = true;
        }
        break;
      case 'yearly':
        // Only if it's the same month as the event was created
        // Store the creation month in event.createdMonth
        if (event.createdMonth === undefined || event.createdMonth === month) {
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
 * This is separate because daily events should appear every day, not just on a specific day-of-week.
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

/**
 * Expand events for a full year, returning all occurrences.
 */
function expandEventsForYear(schedule, year) {
  const allEvents = [];
  for (let month = 0; month < 12; month++) {
    for (const dayKey of Object.keys(schedule)) {
      // Skip "Today" key to avoid duplicate expansion — "Today" mirrors the actual day's events
      if (dayKey === 'Today') continue;
      const dayEvents = schedule[dayKey] || [];
      for (const event of dayEvents) {
        let expanded;
        if (event.recurrence === 'daily') {
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
      // Strip prefixes: ב, כ, פ, ל, מ, ו, ש
      const noPrefix = word.replace(/^[בוכפלמש]/, '');
      if (noPrefix !== word && hebrewDays[noPrefix]) {
        foundDays.push(hebrewDays[noPrefix]);
      }
    }
  });

  let days = [...new Set(foundDays)];

  // Handle "מחר" (tomorrow) - resolve to the next day
  if (text.includes('מחר')) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    days = [dayNames[tomorrow.getDay()]];
  }
  
  // Handle "היום" (today) - resolve to the current day
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

  // Check if "בערב" or "בלילה" to adjust AM/PM
  if (text.includes('בערב') || text.includes('בלילה')) {
    if (startHour < 12) startHour += 12;
    if (endHour < 12) endHour += 12;
  } else if (text.includes('בבוקר') || text.includes('בבקר')) {
    // Already morning, keep as is
  } else {
    // Default: if hours are typical evening hours (5-11), assume PM
    if (startHour >= 5 && startHour <= 11 && !text.includes('בבוקר')) {
      startHour += 12;
      endHour += 12;
    }
  }

  const startTime = formatTime(startHour, startMinute);
  const endTime = formatTime(endHour, endMinute);

  // Better title extraction: take the last meaningful words
  let title = text
    .replace(/^(מחר\s*)?/, '')
    .replace(/משעה\s+[א-ת]+\s*(?:וחצי|ורבע)?\s*(?:ועד|עד)\s*[א-ת]+\s*(?:וחצי|ורבע)?\s*/, '')
    .replace(/ב(שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת)\s*(?:וחצי|ורבע)?\s*(?:בבוקר|בערב|בלילה)?\s*/, '')
    .replace(/^\d{1,2}:\d{2}\s*/, '')
    .replace(/[,!?;:]/g, '')
    .trim();

  // If title is still too long, take last 3-4 words
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

  // Detect if the user's text is in English or Hebrew
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
    - **SLEEP / BEDTIME HANDLING (CRITICAL)**: When the user requests sleep/bedtime (e.g., "8 שעות שינה בלילה" / "8 hours of sleep at night"):
      1. Set startTime to 11:00 PM (23:00) and endTime to exactly X hours later (e.g., 07:00 AM next day for 8 hours).
      2. Set "isSleep": true on the event.
      3. Set "recurrence": "daily" so the sleep schedule repeats every night.
      4. Create the event for EVERY day of the week (Sunday through Saturday), not just one day.
      5. The event crosses midnight, so the endTime is on the next day.
      6. The title should be "שינה" / "Sleep" in the appropriate language.
    - **Free Slot Detection**: When a user says "תפנה לי X דקות/שעות" / "find me X minutes/hours free", set "needsFreeSlot": true with "freeSlotDuration" (in minutes).
    - **Editing Events**: If a user says "תעדכן/תשנה" / "update/change" an event, include "isEdit": true.

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
  // Detect if the text is in English
  const isEnglish = /^[a-zA-Z0-9\s.,!?;:'"()-]+$/.test(text.trim()) && /[a-zA-Z]/.test(text.trim());
  
  // Check if the text contains advice-related keywords (both Hebrew and English)
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

/**
 * Parse time string "HH:MM AM/PM" to total minutes from midnight.
 */
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

/**
 * Convert minutes from midnight back to "HH:MM AM/PM" string.
 */
function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Get current time in minutes from midnight.
 */
function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Check if schedule has any gaps between events that could be merged.
 * Returns an array of gap objects with recommendations.
 */
function findGapsInSchedule(schedule) {
  const todayName = getTodayDayName();
  const todayEvents = schedule[todayName] || [];
  
  if (todayEvents.length < 2) return [];
  
  // Sort events by start time
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
    
    // Only consider events that haven't passed yet
    if (currentEnd < currentMin) continue;
    
    const gapMinutes = nextStart - currentEnd;
    
    // If there's a gap (e.g., 15+ minutes) that could be eliminated
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

/**
 * Shift all upcoming events on "Today" forward by delayMinutes.
 * Returns the modified schedule and a summary.
 */
function shiftScheduleForward(schedule, delayMinutes) {
  const todayName = getTodayDayName();
  const newSchedule = JSON.parse(JSON.stringify(schedule)); // deep clone
  const todayEvents = newSchedule[todayName] || [];
  
  if (todayEvents.length === 0) {
    return { newSchedule, summary: 'אין אירועים להיום להזיז.' };
  }
  
  const currentMin = getCurrentMinutes();
  
  // Sort events by start time
  const sorted = todayEvents
    .map((e, idx) => ({ ...e, originalIndex: idx }))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  // Find the first event that hasn't ended yet
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
  
  // Shift all events from shiftStartIndex onward by delayMinutes
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
  
  // Write back sorted events into the schedule array (preserving order)
  newSchedule[todayName] = sorted.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  // Sync Today
  syncTodayWithCurrentDay(newSchedule);
  
  const delayDisplay = delayMinutes >= 60 
    ? `${Math.floor(delayMinutes / 60)} שעה ו${delayMinutes % 60} דקות` 
    : `${delayMinutes} דקות`;
  
  return {
    newSchedule,
    summary: `הזזתי את כל האירועים להיום קדימה ב${delayDisplay}.`
  };
}

/**
 * Merge gaps in today's schedule by removing the free time between events.
 * Returns the modified schedule, merged gaps info, and a summary.
 */
function mergeGaps(schedule) {
  const todayName = getTodayDayName();
  const newSchedule = JSON.parse(JSON.stringify(schedule)); // deep clone
  const todayEvents = newSchedule[todayName] || [];
  
  if (todayEvents.length < 2) {
    return { newSchedule, gaps: [], summary: 'אין מספיק אירועים למיזוג הפסקות.' };
  }
  
  const currentMin = getCurrentMinutes();
  const gaps = findGapsInSchedule(schedule);
  
  if (gaps.length === 0) {
    return { newSchedule, gaps: [], summary: 'לא נמצאו הפסקות למיזוג בין האירועים.' };
  }
  
  // Sort events by start time
  const sorted = todayEvents
    .map((e, idx) => ({ ...e, originalIndex: idx }))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  // Merge: for each gap, shift all subsequent events backward by the gap duration
  let totalMerged = 0;
  for (const gap of gaps) {
    const gapStart = timeToMinutes(gap.startTime);
    if (gapStart === null || gapStart < currentMin) continue;
    
    // Find the event that starts right after this gap and shift everything after it
    for (let i = 0; i < sorted.length; i++) {
      const eventStart = timeToMinutes(sorted[i].startTime);
      if (eventStart !== null && eventStart >= gapStart + gap.gapMinutes) {
        // Shift this and all subsequent events back by gapMinutes
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
  
  // Write back sorted events
  newSchedule[todayName] = sorted.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  // Sync Today
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

// Google OAuth scopes — minimal: only 'profile' and 'email'.
// No calendar, offline, or openid scopes to keep OAuth consent simple.
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
    res.redirect(process.env.FRONTEND_URL || CLIENT_URL);
  }
);

app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    // req.user from deserialize is minimal. The full user is in the session.
    const sessionUser = req.session.passport?.user;
    // Don't send the accessToken to the client, but confirm it exists.
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

// ──────────────────────────────────────────────
// 7. Conflict detection helper
// ──────────────────────────────────────────────

/**
 * Parse a time string like "06:00 PM" into total minutes from midnight.
 */
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

/**
 * Convert "HH:MM" (24h) string to total minutes from midnight.
 */
function parseTimeToMinutes24(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Check if a new event conflicts with existing events on the same day.
 * Returns conflicts array with suggested alternative free slots.
 * @param {Object} newEvent - The event to check
 * @param {Array} existingEvents - Existing events on the same day
 * @param {Object} [options] - Optional location settings
 * @param {string} [options.dayStart="06:00"] - Day start time in 24h format
 * @param {string} [options.dayEnd="23:00"] - Day end time in 24h format
 */
function detectConflicts(newEvent, existingEvents, options = {}) {
  const newStart = parseTimeToMinutes(newEvent.startTime);
  const newEnd = parseTimeToMinutes(newEvent.endTime);
  
  const dayStart = options.dayStart ? parseTimeToMinutes24(options.dayStart) : 6 * 60; // 06:00
  const dayEnd = options.dayEnd ? parseTimeToMinutes24(options.dayEnd) : 23 * 60; // 23:00
  if (newStart === null || newEnd === null) return { hasConflict: false, conflicts: [], suggestions: [] };

  const conflicts = [];
  for (const existing of existingEvents) {
    const exStart = parseTimeToMinutes(existing.startTime);
    const exEnd = parseTimeToMinutes(existing.endTime);
    if (exStart === null || exEnd === null) continue;

    // Check overlap: new event starts before existing ends AND ends after existing starts
    if (newStart < exEnd && newEnd > exStart) {
      conflicts.push({
        title: existing.title,
        startTime: existing.startTime,
        endTime: existing.endTime
      });
    }
  }

  // Find free slots on the same day (using location-aware day bounds)
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

    // If no slot found before busy slots, try after the last one
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

// Helper: get today's day name (e.g. "Saturday")
function getTodayDayName() {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[new Date().getDay()];
}

// Helper: sync "Today" with the current day of the week
function syncTodayWithCurrentDay(schedule) {
  const todayName = getTodayDayName();
  // "Today" shows events from the current day of the week
  schedule['Today'] = [...(schedule[todayName] || [])];
  return schedule;
}

// ──────────────────────────────────────────────
// 8b. Find Free Slots
// ──────────────────────────────────────────────

/**
 * Find all free time slots for a given day within location bounds.
 * Returns an array of time ranges that are free.
 */
function findFreeSlotsForDay(schedule, dayName, locationId) {
  const dayEvents = schedule[dayName] || [];
  const locData = LOCATIONS.find(loc => loc.id === (locationId || DEFAULT_LOCATION_ID));
  const dayStart = locData ? parseTimeToMinutes24(locData.defaultDayStart) : 6 * 60; // 06:00
  const dayEnd = locData ? parseTimeToMinutes24(locData.defaultDayEnd) : 23 * 60; // 23:00
  
  if (dayStart === null || dayEnd === null) return [];
  
  // Get all busy slots sorted by start time
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
      if (gapMinutes >= 15) { // Only show slots of 15+ minutes
        freeSlots.push({
          startTime: minutesToTime(cursor),
          endTime: minutesToTime(slot.start),
          durationMinutes: gapMinutes
        });
      }
    }
    cursor = Math.max(cursor, slot.end);
  }
  
  // Check after the last event
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

// GET /api/schedule/free-slots?day=Monday&duration=30&location=jerusalem
app.get('/api/schedule/free-slots', (req, res) => {
  try {
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    
    const day = req.query.day || getTodayDayName();
    const durationMinutes = parseInt(req.query.duration) || 30;
    const locationId = req.query.location || DEFAULT_LOCATION_ID;
    
    // If "Today" was requested, resolve to actual day
    const actualDay = day === 'Today' ? getTodayDayName() : day;
    
    const allFreeSlots = findFreeSlotsForDay(schedule, actualDay, locationId);
    
    // Filter slots that can accommodate the requested duration
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

// POST /api/schedule/add-to-free-slot – add an event to a specific free slot
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
    
    // Sync Today
    syncTodayWithCurrentDay(schedule);
    saveSchedulesNow();
    
    res.json({ ok: true, event: newEvent });
  } catch (error) {
    console.error('Failed to add event to free slot:', error);
    res.status(500).json({ error: 'Failed to add event.' });
  }
});

// PUT /api/schedule/event – update a specific event
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

// POST /api/parse-schedule – parse text and ADD to user's schedule
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

    // Resolve location-based day bounds for conflict detection
    const locationId = location || DEFAULT_LOCATION_ID;
    const locData = LOCATIONS.find(loc => loc.id === locationId);
    const locationOptions = locData ? {
      dayStart: locData.defaultDayStart,
      dayEnd: locData.defaultDayEnd
    } : {};

    const addedEvents = [];
    const conflictWarnings = [];

    for (const event of parsedEvents) {
      let day = event.day || todayName; // Default to today if day is missing
      if (day === 'Today') {
        day = todayName;
      }

      // Determine recurrence: if event has isSleep=true, force recurrence to "daily"
      // Otherwise use the event's recurrence if provided, else fall back to the request's recurrence or 'weekly'
      let eventRecurrence = event.recurrence || recurrence || 'weekly';
      if (event.isSleep) {
        eventRecurrence = 'daily';
      }

      const eventWithRecurrence = {
        ...event,
        day: day, // Ensure day is the actual day name
        recurrence: eventRecurrence,
        location: locationId // Store the location with the event
      };

      if (schedule[day]) {
        // --- START: Conflict Detection (location-aware) ---
        const { hasConflict, conflicts, suggestions } = detectConflicts(eventWithRecurrence, schedule[day], locationOptions);
        if (hasConflict) {
          conflictWarnings.push({
            day: day,
            event: eventWithRecurrence,
            conflicts: conflicts,
            suggestions: suggestions
          });
        }
        // --- END: Conflict Detection ---
        schedule[day].push(eventWithRecurrence);
        addedEvents.push(eventWithRecurrence);
      } else {
        // Unknown day -> fallback to Today
        schedule['Today'].push(eventWithRecurrence);
        addedEvents.push({ ...eventWithRecurrence, day: 'Today' });
      }
    }

    // Sync "Today" with current day's events after all additions
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

  // Resolve timezone from location
  const locationId = location || DEFAULT_LOCATION_ID;
  const locData = LOCATIONS.find(loc => loc.id === locationId);
  const timeZone = locData ? locData.timezone : 'Asia/Jerusalem';

  const accessToken = req.session.passport.user.accessToken;
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Simple date calculation for the next occurrence of the event's day
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

  try {
    const gcalEvent = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        start: { dateTime: startDateTime.toISOString(), timeZone },
        end: { dateTime: endDateTime.toISOString(), timeZone },
      },
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

// POST /api/reschedule/shift – deterministic: shift all today's events forward by delayMinutes
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

// POST /api/reschedule/merge-gaps – deterministic: merge gaps between today's events
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

// GET /api/reschedule/gaps – check for gaps in today's schedule without modifying
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

// GET /api/schedule – get the current user's full schedule
app.get('/api/schedule', (req, res) => {
  const userId = getUserId(req);
  const schedule = getUserSchedule(userId);
  // Sync "Today" with the current day of the week before returning
  syncTodayWithCurrentDay(schedule);
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
    // Skip "Today" key to avoid duplicate expansion — "Today" mirrors the actual day's events
    if (dayKey === 'Today') continue;
    const dayEvents = schedule[dayKey] || [];
    for (const event of dayEvents) {
      let expanded;
      if (event.recurrence === 'daily') {
        expanded = expandDailyEventForMonth(event, year, month);
      } else {
        expanded = expandEventForMonth(event, year, month);
      }
      monthEvents.push(...expanded);
    }
  }
  
  res.json({ events: monthEvents, year, month, view: 'month' });
});

// DELETE /api/schedule/clear – clear all events for the user
app.delete('/api/schedule/clear', (req, res) => {
  const userId = getUserId(req);
  userSchedules.set(userId, getDefaultSchedule());
  saveSchedulesNow();
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
    saveSchedulesNow();
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Event not found.' });
  }
});

// ──────────────────────────────────────────────
// 10. Locations API
// ──────────────────────────────────────────────

// GET /api/locations – get all available locations
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

// GET /api/locations/:id/slots – get available time slots for a location
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