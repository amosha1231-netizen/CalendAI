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

// Trust the Render/production reverse proxy so secure cookies work correctly
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'https://calendai-backend-dfmi.onrender.com'],
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
  message: { error: 'יותר מדי בקשות. אנא נסה שוב בעוד דקה.' }
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
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback"
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
        if (daysUntilTarget <= 0) daysUntilTarget += 7;
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

  const todayString = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });

  const prompt = `
    You are a world-class conversational schedule assistant. Your goal is to parse complex user requests in Hebrew, create a structured schedule, and provide a friendly, human-like confirmation message.

    CONTEXT:
    - Today is ${todayString}. Use this to resolve relative terms like "היום", "מחר", etc.

    IMPORTANT RULES:
    1.  **Chain of Events**: If the user describes multiple events in sequence (e.g., "תפילה שעה ורבע, ואז להוציא את הכלב חצי שעה"), calculate the times consecutively. The end time of one event is the start time of the next.
    2.  **Complex Time Calculation**: Understand durations like "שעה ורבע" (1 hour 15 mins), "חצי שעה" (30 mins).
    3.  **Day Resolution**: Use English day names: Sunday, Monday, etc. "היום" is ${todayString.split(',')[0]}.
    4.  **Time Formatting**: Always format times as 'HH:MM AM/PM'. "שבע ורבע" = 07:15. Assume morning unless "בערב" or "בלילה" is specified.
    5.  **Title Extraction**: Extract a SHORT, CLEAN title (max 4 words). Remove time, day, and location details from the title.
    6.  **AI Advice**: If the user asks for help or ideas ("תמצא לי זמן", "תן רעיונות"), set 'hasAdvice' to true and provide a short, practical 'aiAdvice' in Hebrew. Otherwise, 'hasAdvice' is false and 'aiAdvice' is an empty string.
    6.  **AI Advice**: If the user asks for help or ideas ("תמצא לי זמן", "תן רעיונות"), set "hasAdvice" to true and provide a short, practical "aiAdvice" in Hebrew. Otherwise, "hasAdvice" is false and "aiAdvice" is an empty string.

    OUTPUT FORMAT:
    Return a single JSON object with two keys: "replyMessage" and "events".

    -   "replyMessage" (string): A friendly, conversational summary in Hebrew of the events you created. Be natural, like a real assistant.
    -   "events" (array): An array of event objects.

    Event Object Structure:
    {
      "title": "Short Clean Title",
      "day": "Monday", // English day name
      "startTime": "07:15 PM",
      "endTime": "08:30 PM",
      "isRecurring": true,
      "hasAdvice": false,
      "aiAdvice": ""
    }

    EXAMPLE:
    User text: "היום משבע ורבע בבוקר תפילה שעה ורבע, אחרי זה להוציא את הכלב חצי שעה, ואז להכין אוכל 5 דקות"
    Expected JSON Output:
    {
      "replyMessage": "בטח, קבעתי לך שלושה אירועים להיום (יום שישי): תפילה מ-07:15 עד 08:30, טיול עם הכלב מ-08:30 עד 09:00, והכנת אוכל מ-09:00 עד 09:05. שיהיה יום נהדר!",
      "events": [
        { "title": "תפילה", "day": "Friday", "startTime": "07:15 AM", "endTime": "08:30 AM", "isRecurring": false, "hasAdvice": false, "aiAdvice": "" },
        { "title": "להוציא את הכלב", "day": "Friday", "startTime": "08:30 AM", "endTime": "09:00 AM", "isRecurring": false, "hasAdvice": false, "aiAdvice": "" },
        { "title": "הכנת אוכל", "day": "Friday", "startTime": "09:00 AM", "endTime": "09:05 AM", "isRecurring": false, "hasAdvice": false, "aiAdvice": "" }
      ]
    }

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

    const raw = response.text || '{}';
    const parsed = JSON.parse(raw);

    // Ensure the response has the correct structure
    if (!parsed.events || !parsed.replyMessage) {
      // Fallback if the structure is wrong but it returned an array of events
      const events = Array.isArray(parsed) ? parsed : [parsed];
      return {
        replyMessage: `נוספו ${events.length} אירועים חדשים.`,
        events: events
      };
    }

    return parsed;

  } catch (error) {
    console.error('Gemini parse failed, using fallback:', error);
    return fallbackParseAdvice(text);
  }
}

function fallbackParseAdvice(text) {
  // Check if the text contains advice-related keywords
  const adviceKeywords = ['תן לי','תמצא','תציע','המלץ','עזור','עזרי','רעיון','איך','מה להכין','מה לעשות','תעזור לי'];
  const hasAdvice = adviceKeywords.some(kw => text.includes(kw));

  let events;
  try {
    events = fallbackParse(text);
  } catch (e) {
    events = [{
        title: 'פגישה / אירוע',
        day: 'Today',
        startTime: '06:00 PM',
        endTime: '07:00 PM',
        isRecurring: false
    }];
  }

  const eventsWithAdvice = events.map(ev => ({
      ...ev,
      hasAdvice: hasAdvice,
      aiAdvice: hasAdvice ? 'מומלץ לפצל את המשימה לשלבים קטנים ולהתחיל מוקדם.' : ''
  }));

  return {
    replyMessage: `הצלחתי להוסיף ${events.length} אירועים מהטקסט שלך.`,
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

app.get('/api/auth/google',
  (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'your_google_client_id_here') {
      return res.status(400).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
    }
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar.events'] })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
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

      const eventWithRecurrence = {
        ...event,
        day: day, // Ensure day is the actual day name
        recurrence: recurrence || 'weekly'
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