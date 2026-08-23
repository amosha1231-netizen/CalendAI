// ──────────────────────────────────────────────
// Global Error Handlers (prevent server crashes)
// ──────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error('Error name:', err?.name);
  console.error('Error message:', err?.message);
  console.error('Stack trace:', err?.stack);
  console.error('============================');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('=== UNHANDLED REJECTION ===');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('============================');
});

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto'); // For Lemon Squeezy webhook HMAC signature verification

dotenv.config({ path: path.join(__dirname, '.env') });

// ──────────────────────────────────────────────
// Safe module initialization (never crash on missing deps)
// ──────────────────────────────────────────────

// Safe import of AI service - if @google/generative-ai is missing,
// the server still starts and uses the fallback parser.
let parseWithGemini, parseWithGeminiSmart, rescheduleWithGemini, cleanTitle;
try {
  const aiService = require('./services/aiService');
  parseWithGemini = aiService.parseWithGemini;
  parseWithGeminiSmart = aiService.parseWithGeminiSmart;
  rescheduleWithGemini = aiService.rescheduleWithGemini;
  cleanTitle = aiService.cleanTitle;
  console.log('✅ AI Service loaded successfully');
} catch (aiErr) {
  console.error('⚠️ Failed to load AI service:', aiErr.message);
  console.error('⚠️ Server will start with fallback parser only.');
  // Provide safe fallbacks so the server never crashes
  const { fallbackParseAdvice } = require('./services/aiFallback');
  parseWithGemini = async (text, options = {}) => fallbackParseAdvice(text);
  rescheduleWithGemini = async (currentSchedule, reason) => {
    throw new Error('AI reschedule unavailable - fallback mode');
  };
  cleanTitle = (title) => title || 'פגישה / אירוע';
}

// Safe Lemon Squeezy initialization - never crash if LEMON_SQUEEZY_API_KEY is missing
// CalendAI uses Lemon Squeezy for payment processing (not Stripe).
let lemonSqueezyEnabled = false;
try {
  const lsApiKey = process.env.LEMON_SQUEEZY_API_KEY;
  if (lsApiKey && lsApiKey !== 'your_lemon_squeezy_api_key_here') {
    lemonSqueezyEnabled = true;
    console.log('✅ Lemon Squeezy payment service configured');
  } else {
    console.warn('⚠️ LEMON_SQUEEZY_API_KEY not configured. Payment features disabled.');
  }
} catch (lsErr) {
  console.error('⚠️ Failed to initialize Lemon Squeezy:', lsErr.message);
  console.error('⚠️ Payment features will be disabled.');
}

// ── Startup Environment Checks ──
console.log('=== CalendAI Startup Environment Check ===');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ SET' : '❌ MISSING');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ SET' : '❌ MISSING');
console.log('MONGO_URI:', process.env.MONGO_URI ? '✅ SET' : '❌ MISSING (will use default)');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ SET' : '❌ MISSING');
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ SET' : '❌ MISSING (will use default)');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('RENDER:', process.env.RENDER || 'not set');
console.log('PORT:', process.env.PORT || 'not set (will use 5000)');
console.log('========================================');

const app = express();
const PORT = process.env.PORT || 5000;

// ──────────────────────────────────────────────
// MongoDB Connection
// ──────────────────────────────────────────────
// Support both MONGODB_URI and MONGO_URI env variable names
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/calendai';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// ──────────────────────────────────────────────
// User Schema (MongoDB)
// ──────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  googleId: { type: String, sparse: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  displayName: { type: String },
  photo: { type: String },
  googleAccessToken: { type: String },
  googleRefreshToken: { type: String },
  isPro: { type: Boolean, default: false },
  stripeCustomerId: { type: String },
  aiCredits: { type: Number, default: 15 }, // Freemium: 15 free AI credits for new users
  schedule: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      Sunday: [],
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Today: []
    }
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ──────────────────────────────────────────────
// Persistent file-based storage (fallback for anonymous users)
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
const CLIENT_URL = process.env.CLIENT_URL || (isProduction ? 'https://calendai-q59p.onrender.com' : 'http://localhost:5173');
const BACKEND_URL = process.env.BACKEND_URL || (isProduction ? 'https://calendai-backend-dfmi.onrender.com' : 'http://localhost:5000');

app.set('trust proxy', 1);

const corsOrigin = process.env.FRONTEND_URL || process.env.CORS_ORIGIN;
// CRITICAL: CORS origin must be explicit URLs, NOT wildcard '*', when using credentials: true
const allowedOrigins = corsOrigin && corsOrigin !== '*'
  ? corsOrigin.split(',')
  : [
      'http://localhost:5173',
      'https://calendai.onrender.com',
      'https://calendai-backend-dfmi.onrender.com',
      'https://calendai-q59p.onrender.com'
    ];
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// ── Raw body middleware for payment webhook path ──
// MUST run BEFORE express.json() so the body remains a raw Buffer
// for HMAC signature verification (Stripe & Lemon Squeezy).
// body-parser sets req._body = true after raw parsing, so express.json()
// will skip requests already consumed by express.raw().
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

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
    sameSite: isProduction ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000
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
// Global Shabbat Middleware — blocks ALL API requests during Shabbat
// except for: /api/health, /api/shabbat/status, and static files.
// ──────────────────────────────────────────────
app.use('/api/', (req, res, next) => {
  // Skip Shabbat check for these whitelisted paths
  const whitelistedPaths = ['/api/health', '/api/shabbat/status'];
  if (whitelistedPaths.includes(req.path)) {
    return next();
  }

  // Check if currently Shabbat
  const shabbatStatus = shabbatService.isShabbatNow();
  if (shabbatStatus) {
    return res.status(503).json({
      isShabbat: true,
      shabbatActive: true,
      error: 'שבת שלום 🕯️ המערכת אינה זמינה בשבת. נשוב לפעול במוצאי שבת.',
      message: 'Shabbat mode is active. The system is unavailable until after Havdalah.'
    });
  }

  next();
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
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Find or create user in MongoDB
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.findOne({ email: profile.emails?.[0]?.value || '' });
        if (user) {
          user.googleId = profile.id;
          if (!user.displayName) user.displayName = profile.displayName;
          if (!user.photo) user.photo = profile.photos?.[0]?.value || '';
          await user.save();
        } else {
          user = await User.create({
            googleId: profile.id,
            displayName: profile.displayName,
            email: profile.emails?.[0]?.value || '',
            photo: profile.photos?.[0]?.value || ''
          });
        }
      }

      // Save Google tokens to the user model for Calendar API access
      if (accessToken) {
        user.googleAccessToken = accessToken;
      }
      if (refreshToken) {
        user.googleRefreshToken = refreshToken;
      }
      await user.save();

      return done(null, { ...user.toObject(), accessToken });
    } catch (err) {
      console.error('=== GOOGLE STRATEGY ERROR ===');
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);
      console.error('Stack trace:', err.stack);
      console.error('Profile ID:', profile?.id);
      console.error('Profile email:', profile?.emails?.[0]?.value);
      console.error('==============================');
      return done(err, null);
    }
  }));

  passport.serializeUser((user, done) => {
    // Store only the user ID in the session (minimal session size)
    const userId = user._id || user.id || user.googleId;
    done(null, userId ? userId.toString() : 'unknown');
  });

  passport.deserializeUser(async (id, done) => {
    try {
      let userData = { id, googleId: id };
      if (mongoose.Types.ObjectId.isValid(id)) {
        const dbUser = await User.findById(id).lean().catch(() => null);
        if (dbUser) {
          userData = {
            _id: dbUser._id,
            id: dbUser._id,
            googleId: dbUser.googleId,
            email: dbUser.email,
            displayName: dbUser.displayName,
            photo: dbUser.photo,
            isPro: dbUser.isPro,
            stripeCustomerId: dbUser.stripeCustomerId,
            aiCredits: dbUser.aiCredits
          };
        }
      } else {
        const dbUser = await User.findOne({ googleId: id }).lean().catch(() => null);
        if (dbUser) {
          userData = {
            _id: dbUser._id,
            id: dbUser._id,
            googleId: dbUser.googleId,
            email: dbUser.email,
            displayName: dbUser.displayName,
            photo: dbUser.photo,
            isPro: dbUser.isPro,
            stripeCustomerId: dbUser.stripeCustomerId,
            aiCredits: dbUser.aiCredits
          };
        }
      }
      done(null, userData);
    } catch (err) {
      console.error('deserializeUser error:', err.message);
      done(null, { id, googleId: id });
    }
  });
}

// ──────────────────────────────────────────────
// 3. Locations data (safe loading)
// ──────────────────────────────────────────────
let LOCATIONS = [];
const DEFAULT_LOCATION_ID = 'jerusalem';
try {
  const LOCATIONS_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'locations.json'), 'utf-8'));
  LOCATIONS = LOCATIONS_DATA.locations || [];
  console.log(`✅ Loaded ${LOCATIONS.length} locations from data file`);
} catch (locErr) {
  console.error('⚠️ Failed to load locations.json:', locErr.message);
  console.error('⚠️ Using empty locations array. Location features may be limited.');
  LOCATIONS = [];
}

// ──────────────────────────────────────────────
// 4. Persistent schedule storage per user (file-backed for anonymous, MongoDB for logged-in)
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
  // 1. JWT Bearer token auth (email/password users)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) return decoded.id;
    } catch (err) {
      // Invalid token - fall through to session check
    }
  }
  // 2. Session-based auth (passport / Google OAuth)
  if (req.isAuthenticated && req.isAuthenticated()) {
    const fullUser = req.session?.passport?.user;
    return fullUser?._id || fullUser?.id || fullUser?.googleId || 'anonymous';
  }
  return 'anonymous';
}

// ── Semantic Router (fast vs smart track classification)
const { classifyRequest } = require('./services/semanticRouter');

// ──────────────────────────────────────────────
// AI Credit System (Pay As You Go / PAYG)
// ──────────────────────────────────────────────

/**
 * Check if the user has AI credits remaining.
 * Anonymous/guest users are NOT subject to credit enforcement —
 * guest usage limits are handled on the frontend.
 * @returns {Promise<{allowed: boolean, credits: number|null, error?: string}>}
 */
async function checkAICredits(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { allowed: true, credits: null };
  }
  try {
    const user = await User.findById(userId);
    if (!user) return { allowed: true, credits: null };
    const credits = user.aiCredits;
    if (credits === undefined || credits === null || credits > 0) {
      return { allowed: true, credits };
    }
    return {
      allowed: false,
      credits: 0,
      error: 'נגמרו לך הקרדיטים! אנא רכוש חבילת פעולות נוספת כדי להמשיך להשתמש ב-AI.'
    };
  } catch (err) {
    console.error('Failed to check AI credits:', err.message);
    return { allowed: true, credits: null }; // Fail-open on DB errors
  }
}

/**
 * Deduct 1 AI credit from the user. Only called AFTER a successful AI request.
 * @returns {Promise<number|null>} The remaining credits, or null if not applicable.
 */
async function deductAICredit(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  try {
    const updated = await User.findByIdAndUpdate(
      userId,
      { $inc: { aiCredits: -1 } },
      { new: true }
    );
    return updated?.aiCredits ?? null;
  } catch (err) {
    console.error('Failed to deduct AI credit:', err.message);
    return null;
  }
}

function getUserSchedule(userId) {
  if (!userSchedules.has(userId)) {
    userSchedules.set(userId, getDefaultSchedule());
    saveSchedulesNow();
  }
  return userSchedules.get(userId);
}

// ──────────────────────────────────────────────
// Helper: Save schedule to MongoDB for logged-in users
// ──────────────────────────────────────────────
async function saveScheduleToMongo(userId, schedule) {
  try {
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await User.findByIdAndUpdate(userId, { schedule });
    }
  } catch (err) {
    console.error('Failed to save schedule to MongoDB:', err.message);
  }
}

// ──────────────────────────────────────────────
// Shabbat Service (accurate astronomical calculation)
// ──────────────────────────────────────────────
const shabbatService = require('./services/shabbatService');

/**
 * Check if an event's startDate falls within Shabbat.
 * Parses a date string or Date object.
 * @param {string|Date} startDate - The start date/time of the event.
 * @returns {{ isBlocked: boolean, message: string }}
 */
function checkShabbatBlock(startDate) {
  const date = startDate instanceof Date ? startDate : new Date(startDate);
  if (isNaN(date.getTime())) return { isBlocked: false, message: '' };

  if (shabbatService.isShabbatTime(date).isShabbat) {
    return {
      isBlocked: true,
      message: 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.'
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
  return shabbatService.isShabbatDay(day);
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
// AI functions are now imported from ./services/aiService.js
// This includes: parseWithGemini, rescheduleWithGemini, cleanTitle

// ──────────────────────────────────────────────
// 9. AI Reschedule Engine
// ──────────────────────────────────────────────
// rescheduleWithGemini is now imported from ./services/aiService.js

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
  // Normalize to 0-1439 range for midnight-crossing events (e.g., 23:30 + 1h = 24:30 → 00:30)
  const normalized = totalMinutes % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
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
  : ['profile', 'email', 'https://www.googleapis.com/auth/calendar'];

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
  (req, res, next) => {
    const rawUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://calendai-q59p.onrender.com';
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${rawUrl}/?error=auth_failed`,
      failWithError: true
    }, (err, user, info) => {
      if (err) {
        console.error('=== GOOGLE CALLBACK AUTH ERROR ===');
        console.error('Error name:', err.name);
        console.error('Error message:', err.message);
        console.error('Stack trace:', err.stack);
        console.error('Info:', JSON.stringify(info || {}));
        console.error('Query params:', JSON.stringify(req.query));
        console.error('==================================');
        return res.redirect(`${rawUrl}/?error=auth_failed`);
      }
      if (!user) {
        console.error('=== GOOGLE CALLBACK: NO USER ===');
        console.error('Info:', JSON.stringify(info || {}));
        console.error('Query params:', JSON.stringify(req.query));
        console.error('==================================');
        return res.redirect(`${rawUrl}/?error=auth_failed`);
      }

      // ── Stateless JWT: no req.logIn, no session ──
      console.log("OAuth User authenticated:", req.user);
      console.log('=== GOOGLE CALLBACK: USER RECEIVED ===');
      console.log('req.user exists:', !!user);
      console.log('User ID:', user._id || user.id);
      console.log('Display Name:', user.displayName);
      console.log('Email:', user.email);
      console.log('JWT_SECRET is set:', !!process.env.JWT_SECRET);
      console.log('=====================================');

      const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://calendai-q59p.onrender.com';

      try {
        // Create a JWT token with 7-day expiry containing the user's _id
        const jwtSecret = process.env.JWT_SECRET || 'calendai_secret';
        const token = jwt.sign({ id: user._id || user.id }, jwtSecret, { expiresIn: '30d' });

        console.log("Generated JWT Token:", token ? "SUCCESS" : "FAILED");
        console.log('=== GOOGLE CALLBACK: JWT CREATED ===');
        console.log('Token (first 30 chars):', token.substring(0, 30) + '...');
        const redirectUrl = `${FRONTEND_URL}?token=${token}`;
        console.log("Redirecting to:", redirectUrl);
        console.log('=====================================');

        res.redirect(redirectUrl);
      } catch (jwtErr) {
        console.error('=== GOOGLE CALLBACK: JWT CREATION FAILED ===');
        console.error('Error:', jwtErr.message);
        console.error('Stack:', jwtErr.stack);
        console.error('JWT_SECRET available:', !!process.env.JWT_SECRET);
        console.error('user object:', JSON.stringify({ _id: user._id, id: user.id, displayName: user.displayName }));
        console.error('============================================');
        const errorRedirectUrl = `${FRONTEND_URL}/?error=${encodeURIComponent(jwtErr.message)}`;
        console.log("Redirecting to (error):", errorRedirectUrl);
        res.redirect(errorRedirectUrl);
      }
    })(req, res, next);
  }
);

app.get('/api/auth/me', async (req, res) => {
  // Prevent caching of auth state - forces browser to always check with server
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Support both session-based auth (passport) and JWT token auth (Authorization: Bearer)
  const authHeader = req.headers.authorization;
  let userId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // JWT token-based authentication
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'calendai_secret');
      userId = decoded.id;
    } catch (err) {
      // Return 401 Unauthorized for invalid/expired tokens so the frontend
      // can distinguish between "no user" and "invalid token" and clear storage accordingly.
      return res.status(401).json({ user: null, error: 'Invalid or expired token' });
    }
  } else if (req.isAuthenticated && req.isAuthenticated()) {
    // Session-based authentication (passport)
    const sessionUser = req.session.passport?.user;
    userId = sessionUser?._id || sessionUser?.id || sessionUser?.googleId;
  }

  if (!userId) {
    return res.json({ user: null });
  }

  // Fetch fresh user data from MongoDB
  let freshUser = null;
  try {
    let dbUser = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      dbUser = await User.findById(userId).catch(() => null);
    }
    if (!dbUser) {
      dbUser = await User.findOne({ googleId: userId }).catch(() => null);
    }
    if (dbUser) {
      freshUser = {
        _id: dbUser._id,
        id: dbUser._id,
        googleId: dbUser.googleId,
        email: dbUser.email,
        displayName: dbUser.displayName,
        photo: dbUser.photo,
        isPro: dbUser.isPro,
        stripeCustomerId: dbUser.stripeCustomerId,
        aiCredits: dbUser.aiCredits
      };
    }
  } catch (err) {
    console.error('Failed to fetch fresh user data:', err.message);
  }

  res.json({ user: freshUser });
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

// ── Email/Password Auth Endpoints ──

/**
 * POST /api/auth/register
 * Register a new user with email and password.
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      displayName: name || email.split('@')[0]
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      ok: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        aiCredits: user.aiCredits
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password.
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check if user has a password (might be Google-only account)
    if (!user.password) {
      return res.status(401).json({ error: 'This account uses Google login. Please sign in with Google.' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      ok: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        aiCredits: user.aiCredits
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
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
    { expiresIn: '30d' }
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

  // FUTURE-ONLY SUGGESTIONS (CRITICAL): For events scheduled TODAY, never suggest
  // free hours that start in the past — only suggest windows from the current time onward.
  const todayName = getTodayDayName();
  const isToday = options.day === todayName || options.day === 'Today';
  const currentMin = getCurrentMinutes();

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
      // For today, ignore busy slots that have completely passed
      .filter(s => !isToday || s.end > currentMin)
      .sort((a, b) => a.start - b.start);

    const duration = newEnd - newStart;

    // ── Find the closest free slot BEFORE the requested time ──
    let beforeSlot = null;
    let cursor = isToday ? Math.max(dayStart, currentMin) : dayStart;
    for (const slot of busySlots) {
      if (slot.start >= newStart) break; // Stop once we pass the requested time
      if (cursor + duration <= slot.start) {
        beforeSlot = cursor;
      }
      cursor = Math.max(cursor, slot.end);
    }
    // Also check before the first busy slot
    if (busySlots.length > 0 && busySlots[0].start >= newStart) {
      // The requested time is before the first busy slot
      // Check if there's room before the first busy slot
      if (cursor + duration <= busySlots[0].start && cursor < newStart) {
        beforeSlot = cursor;
      }
    }
    // Check if there's room from cursor to the requested time
    if (beforeSlot === null && cursor + duration <= newStart && cursor < newStart) {
      beforeSlot = cursor;
    }

    if (beforeSlot !== null) {
      const hours = Math.floor(beforeSlot / 60);
      const mins = beforeSlot % 60;
      const endHours = Math.floor((beforeSlot + duration) / 60);
      const endMins = (beforeSlot + duration) % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const endAmpm = endHours >= 12 ? 'PM' : 'AM';
      const displayH = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
      const displayEndH = endHours > 12 ? endHours - 12 : (endHours === 0 ? 12 : endHours);
      suggestions.push({
        startTime: `${String(displayH).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`,
        endTime: `${String(displayEndH).padStart(2, '0')}:${String(endMins).padStart(2, '0')} ${endAmpm}`,
        label: 'לפני'
      });
    }

    // ── Find the closest free slot AFTER the requested time ──
    let afterSlot = null;
    cursor = isToday ? Math.max(dayStart, currentMin) : dayStart;
    for (const slot of busySlots) {
      if (cursor + duration <= slot.start && cursor >= newEnd) {
        afterSlot = cursor;
        break;
      }
      cursor = Math.max(cursor, slot.end);
    }
    if (afterSlot === null && cursor + duration <= dayEnd && cursor >= newEnd && (!isToday || cursor >= currentMin)) {
      afterSlot = cursor;
    }

    if (afterSlot !== null) {
      const hours = Math.floor(afterSlot / 60);
      const mins = afterSlot % 60;
      const endHours = Math.floor((afterSlot + duration) / 60);
      const endMins = (afterSlot + duration) % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const endAmpm = endHours >= 12 ? 'PM' : 'AM';
      const displayH = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
      const displayEndH = endHours > 12 ? endHours - 12 : (endHours === 0 ? 12 : endHours);
      suggestions.push({
        startTime: `${String(displayH).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`,
        endTime: `${String(displayEndH).padStart(2, '0')}:${String(endMins).padStart(2, '0')} ${endAmpm}`,
        label: 'אחרי'
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
  
  // FUTURE-ONLY SLOTS (CRITICAL): For today, never offer free windows in the past —
  // only suggest slots from the current time onward.
  const todayName = getTodayDayName();
  const isToday = dayName === todayName || dayName === 'Today';
  const currentMin = getCurrentMinutes();
  
  const busySlots = dayEvents
    .map(e => {
      let start = timeToMinutes(e.startTime);
      let end = timeToMinutes(e.endTime);
      if (start !== null && end !== null) {
        // Handle midnight-crossing events (e.g., sleep 11:00 PM → 07:00 AM: end=420 < start=1380)
        if (end <= start) {
          end += 1440; // Add 24 hours to end time so it's on the "next day"
        }
      }
      return { start, end };
    })
    .filter(s => s.start !== null && s.end !== null)
    // For today, ignore busy slots that have completely passed
    .filter(s => !isToday || s.end > currentMin)
    .sort((a, b) => a.start - b.start);
  
  const freeSlots = [];
  // For today, start scanning from the current time — never from a past time
  let cursor = isToday ? Math.max(dayStart, currentMin) : dayStart;
  
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

app.post('/api/schedule/add-to-free-slot', async (req, res) => {
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
    
    // ── HARD SHABBAT GUARD: Block adding events on Saturday ──
    if (isShabbat(actualDay)) {
      return res.status(400).json({
        isBlocked: true,
        blockedMessage: 'שבת שלום 🕯️ המערכת אינה מאפשרת קביעת פעילויות בשבת. נשמח לתאם למוצאי השבת או ליום חול.'
      });
    }
    
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
    
    // Save to MongoDB for logged-in users
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await saveScheduleToMongo(userId, schedule);
    }
    
    res.json({ ok: true, event: newEvent });
  } catch (error) {
    console.error('Failed to add event to free slot:', error);
    res.status(500).json({ error: 'Failed to add event.' });
  }
});

app.put('/api/schedule/event', async (req, res) => {
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
      
      // Save to MongoDB for logged-in users
      if (mongoose.Types.ObjectId.isValid(userId)) {
        await saveScheduleToMongo(userId, schedule);
      }
      
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

  const { text, recurrence, location, eventType, duration } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text input is required.' });
  }

  try {
    const userId = getUserId(req);
    
    // ── PAYG CREDIT CHECK: Block if user has no AI credits left ──
    const creditCheck = await checkAICredits(userId);
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }
    
    const schedule = getUserSchedule(userId);
    const todayName = getTodayDayName();

    // Build busy slots array from existing schedule for conflict-aware AI
    const busySlots = [];
    for (const [day, events] of Object.entries(schedule)) {
      if (Array.isArray(events) && events.length > 0) {
        for (const ev of events) {
          if (ev.startTime && ev.endTime) {
            busySlots.push({
              day,
              startTime: ev.startTime,
              endTime: ev.endTime,
              title: ev.title || ''
            });
          }
        }
      }
    }

    // ── SEMANTIC ROUTING: Classify the request as Fast Track or Smart Track ──
    const classification = classifyRequest(text);
    console.log(`[Semantic Router] Route: ${classification.route} | Reason: ${classification.reason} | Text: "${text.slice(0, 60)}..."`);

    let parsedResult;
    if (classification.route === 'fast') {
      // FAST TRACK: User specified a specific time → no need to fetch busy slots,
      // just parse and schedule immediately (speed is the priority).
      parsedResult = await parseWithGemini(text, { eventType, duration });
    } else {
      // SMART TRACK: User made a general request → inject busy slots into the AI
      // prompt with the 15-minute buffer instruction.
      parsedResult = await parseWithGeminiSmart(text, { eventType, duration, busySlots, schedule });
    }
    
    // Handle Shabbat block response from AI
    if (parsedResult.isBlocked === true) {
      return res.status(400).json({
        isBlocked: true,
        blockedMessage: parsedResult.blockedMessage || 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.',
        replyMessage: parsedResult.blockedMessage || 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.',
        events: []
      });
    }

    // Handle CONFLICT response: user requested a time that is already taken.
    // The server MUST NOT save any event and MUST NOT deduct an AI credit.
    if (parsedResult.hasConflict === true) {
      return res.status(409).json({
        hasConflict: true,
        conflictMessage: parsedResult.conflictMessage || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?',
        replyMessage: parsedResult.replyMessage || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?',
        events: []
      });
    }

    const { events: parsedEvents, replyMessage } = parsedResult;

    const locationId = location || DEFAULT_LOCATION_ID;
    const locData = LOCATIONS.find(loc => loc.id === locationId);
    const locationOptions = locData ? {
      dayStart: locData.defaultDayStart,
      dayEnd: locData.defaultDayEnd
    } : {};

    const addedEvents = [];
    const conflictWarnings = [];
    const shabbatFilteredEvents = [];

    for (const event of parsedEvents) {
      let day = event.day || todayName;
      if (day === 'Today') {
        day = todayName;
      }

      // ── HARD SHABBAT GUARD: Filter out any event scheduled on Saturday ──
      if (isShabbat(day)) {
        console.warn(`[Shabbat Guard] Blocked event "${event.title}" with day "${day}" from being saved.`);
        shabbatFilteredEvents.push(event);
        continue;
      }

      let eventRecurrence = event.recurrence || recurrence || 'weekly';
      if (event.isSleep) {
        eventRecurrence = 'daily';
      }

      // Auto-set createdMonth for yearly events so they only repeat in the correct month
      const createdMonth = new Date().getMonth();

      // If eventType was specified from the frontend, override duration accordingly
      const effectiveEventType = eventType || event.eventType || 'activity';
      const effectiveDuration = effectiveEventType === 'notification' ? 0 : (duration || event.duration || 60);

      const eventWithRecurrence = {
        ...event,
        day: day,
        recurrence: eventRecurrence,
        location: locationId,
        eventType: effectiveEventType,
        duration: effectiveDuration,
        ...(eventRecurrence === 'yearly' && { createdMonth })
      };

      // For notification type: override endTime to be 0 duration (same as startTime)
      if (effectiveEventType === 'notification') {
        eventWithRecurrence.endTime = eventWithRecurrence.startTime;
        eventWithRecurrence.isReminder = true;
      // For activity type: if a duration was specified from frontend, recalculate endTime
      } else if (duration && duration > 0 && eventWithRecurrence.startTime) {
        const startMatch = eventWithRecurrence.startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (startMatch) {
          let sh = parseInt(startMatch[1], 10);
          const sm = parseInt(startMatch[2], 10);
          if (startMatch[3].toUpperCase() === 'PM' && sh !== 12) sh += 12;
          if (startMatch[3].toUpperCase() === 'AM' && sh === 12) sh = 0;
          const totalStartMinutes = sh * 60 + sm;
          const totalEndMinutes = totalStartMinutes + duration;
          const eh = Math.floor((totalEndMinutes % 1440) / 60);
          const em = totalEndMinutes % 60;
          const eAmpm = eh >= 12 ? 'PM' : 'AM';
          const eDisplayH = eh > 12 ? eh - 12 : (eh === 0 ? 12 : eh);
          eventWithRecurrence.endTime = `${String(eDisplayH).padStart(2, '0')}:${String(em).padStart(2, '0')} ${eAmpm}`;
        }
      }

      if (schedule[day]) {
        const { hasConflict, conflicts, suggestions } = detectConflicts(eventWithRecurrence, schedule[day], { ...locationOptions, day });
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
    
    // Save to MongoDB for logged-in users
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await saveScheduleToMongo(userId, schedule);
    }

    // ── PAYG CREDIT DEDUCTION: Only charge AFTER a successful AI response ──
    const remainingCredits = await deductAICredit(userId);

    // ── GOOGLE CALENDAR SYNC: Automatically sync each added event to Google Calendar ──
    // This is non-blocking — failures are logged but never crash the response.
    const googleSyncResults = await Promise.allSettled(
      addedEvents.map(ev => syncEventToGoogleCalendar(userId, ev, locationId))
    );
    const googleSyncSuccessCount = googleSyncResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const googleSyncFailedCount = googleSyncResults.filter(r => r.status === 'fulfilled' && !r.value.success).length;

    res.json({ 
      events: addedEvents,
      replyMessage: replyMessage || `נוספו ${addedEvents.length} אירועים.`,
      totalEvents: Object.values(schedule).reduce((sum, arr) => sum + arr.length, 0),
      conflicts: conflictWarnings.length > 0 ? conflictWarnings : undefined,
      aiCredits: remainingCredits,
      googleCalendar: {
        synced: googleSyncSuccessCount,
        failed: googleSyncFailedCount,
        total: addedEvents.length,
        link: googleSyncSuccessCount > 0 ? 'https://calendar.google.com' : undefined
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to parse schedule.' });
  }
});

// ──────────────────────────────────────────────
// 8d. Quick Add endpoint for Siri / Apple Shortcuts / voice integrations
// ──────────────────────────────────────────────

/**
 * POST /api/events/quick-add
 * Accepts free-text input (voice or typed) and uses AI to parse, schedule,
 * and return a structured JSON response. Designed for Siri Shortcuts integration.
 * Body: { text: "string" }
 * Auth: Bearer Token (required)
 * Response: { success: true, message: "string", event: eventData }
 */
app.post('/api/events/quick-add', aiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Text input is required.' });
    }

    // Authenticate via Bearer token (same logic as /api/auth/me)
    const authHeader = req.headers.authorization;
    let userId = null;
    let userData = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
        // Fetch fresh user data for display name
        if (mongoose.Types.ObjectId.isValid(userId)) {
          const dbUser = await User.findById(userId).lean().catch(() => null);
          if (dbUser) {
            userData = dbUser;
          }
        }
      } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
      }
    } else if (req.isAuthenticated && req.isAuthenticated()) {
      const sessionUser = req.session?.passport?.user;
      userId = sessionUser?._id || sessionUser?.id || sessionUser?.googleId || 'anonymous';
      userData = sessionUser;
    } else {
      return res.status(401).json({ success: false, error: 'Authentication required. Provide a Bearer token.' });
    }

    // ── PAYG CREDIT CHECK: Block if user has no AI credits left ──
    const creditCheck = await checkAICredits(userId);
    if (!creditCheck.allowed) {
      return res.status(402).json({ success: false, error: creditCheck.error });
    }

    // Get the user's schedule for context-aware AI
    const effectiveUserId = userId || 'anonymous';
    const schedule = getUserSchedule(effectiveUserId);
    const todayName = getTodayDayName();

    // Build busy slots array from existing schedule for conflict-aware AI
    const busySlots = [];
    for (const [day, events] of Object.entries(schedule)) {
      if (Array.isArray(events) && events.length > 0) {
        for (const ev of events) {
          if (ev.startTime && ev.endTime) {
            busySlots.push({
              day,
              startTime: ev.startTime,
              endTime: ev.endTime,
              title: ev.title || ''
            });
          }
        }
      }
    }

    // ── SEMANTIC ROUTING: Classify the request as Fast Track or Smart Track ──
    const classification = classifyRequest(text);
    console.log(`[Semantic Router][Quick-Add] Route: ${classification.route} | Reason: ${classification.reason} | Text: "${text.slice(0, 60)}..."`);

    let parsedResult;
    if (classification.route === 'fast') {
      // FAST TRACK: User specified a specific time → no need to fetch busy slots
      parsedResult = await parseWithGemini(text, { busySlots: [], schedule: {} });
    } else {
      // SMART TRACK: User made a general request → inject busy slots with 15-min buffer
      parsedResult = await parseWithGeminiSmart(text, { busySlots, schedule });
    }
    
    // Handle Shabbat block response from AI
    if (parsedResult.isBlocked === true) {
      return res.status(400).json({ 
        success: false, 
        isBlocked: true,
        blockedMessage: parsedResult.blockedMessage || 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.',
        message: parsedResult.blockedMessage || 'האפליקציה אינה קובעת פגישות במהלך השבת. נשמח לתאם מועד לפני כניסת השבת או במוצאי השבת.',
        events: []
      });
    }

    // Handle CONFLICT response: user requested a time that is already taken.
    // The server MUST NOT save any event and MUST NOT deduct an AI credit.
    if (parsedResult.hasConflict === true) {
      return res.status(409).json({
        success: false,
        hasConflict: true,
        conflictMessage: parsedResult.conflictMessage || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?',
        message: parsedResult.replyMessage || 'יש כבר פעילות בזמן הזה. האם להוסיף בכל זאת או לקבוע לזמן אחר?',
        events: []
      });
    }

    const { events: parsedEvents, replyMessage } = parsedResult;

    if (!parsedEvents || parsedEvents.length === 0) {
      return res.status(400).json({ success: false, error: 'Could not parse any events from the provided text.' });
    }

    // (schedule already loaded above)

    const addedEvents = [];
    const shabbatFilteredEvents = [];

    for (const event of parsedEvents) {
      let day = event.day || todayName;
      if (day === 'Today') {
        day = todayName;
      }

      // ── HARD SHABBAT GUARD: Filter out any event scheduled on Saturday ──
      if (isShabbat(day)) {
        console.warn(`[Shabbat Guard] Quick-add blocked event "${event.title}" with day "${day}".`);
        shabbatFilteredEvents.push(event);
        continue;
      }

      const eventRecurrence = event.recurrence || 'once';

      // Auto-set createdMonth for yearly events
      const createdMonth = new Date().getMonth();

      const eventWithRecurrence = {
        ...event,
        day,
        recurrence: eventRecurrence,
        location: DEFAULT_LOCATION_ID,
        ...(eventRecurrence === 'yearly' && { createdMonth })
      };

      // Add to schedule
      if (schedule[day]) {
        schedule[day].push(eventWithRecurrence);
      } else {
        schedule['Today'].push(eventWithRecurrence);
      }

      addedEvents.push(eventWithRecurrence);
    }

    // If ALL events were filtered out for Shabbat, return an error
    if (addedEvents.length === 0 && shabbatFilteredEvents.length > 0) {
      return res.status(400).json({
        success: false,
        isBlocked: true,
        blockedMessage: 'שבת שלום 🕯️ המערכת אינה מאפשרת קביעת פעילויות בשבת. נשמח לתאם למוצאי השבת או ליום חול.',
        events: []
      });
    }

    syncTodayWithCurrentDay(schedule);
    saveSchedulesNow();

    // Save to MongoDB for logged-in users
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      await saveScheduleToMongo(userId, schedule);
    }

    // Build a friendly message for the response
    const firstEvent = addedEvents[0];
    const eventCount = addedEvents.length;
    const displayName = userData?.displayName || userData?.email || '';

    let message;
    if (eventCount === 1) {
      message = replyMessage || `האירוע "${firstEvent.title}" נקבע בהצלחה ליום ${firstEvent.day} בשעה ${firstEvent.startTime}.`;
    } else {
      message = replyMessage || `${eventCount} אירועים נוספו בהצלחה.`;
    }

    // ── PAYG CREDIT DEDUCTION: Only charge AFTER a successful AI response ──
    const remainingCredits = await deductAICredit(userId);

    // ── GOOGLE CALENDAR SYNC: Automatically sync each added event to Google Calendar ──
    // This is non-blocking — failures are logged but never crash the response.
    const googleSyncResults = await Promise.allSettled(
      addedEvents.map(ev => syncEventToGoogleCalendar(userId, ev, DEFAULT_LOCATION_ID))
    );
    const googleSyncSuccessCount = googleSyncResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const googleSyncFailedCount = googleSyncResults.filter(r => r.status === 'fulfilled' && !r.value.success).length;

    res.json({
      success: true,
      message,
      events: addedEvents,
      count: eventCount,
      aiCredits: remainingCredits,
      googleCalendar: {
        synced: googleSyncSuccessCount,
        failed: googleSyncFailedCount,
        total: addedEvents.length,
        link: googleSyncSuccessCount > 0 ? 'https://calendar.google.com' : undefined
      }
    });

  } catch (error) {
    console.error('Quick-add endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to process quick-add request.' });
  }
});

// ──────────────────────────────────────────────
// 9. Google Calendar Integration
// ──────────────────────────────────────────────

/**
 * Helper: Refresh Google access token and save to DB.
 * Sets up token refresh handler on the OAuth2 client.
 * @param {Object} user - The user document with googleAccessToken and googleRefreshToken
 * @returns {Promise<google.auth.OAuth2>} Configured OAuth2 client with auto-refresh
 */
async function createOAuth2ClientWithRefresh(user) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken || undefined
  });

  // Auto-refresh tokens: when Google issues a new access token, save it to DB
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      try {
        await User.findByIdAndUpdate(user._id, {
          googleAccessToken: tokens.access_token,
          ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {})
        });
        console.log(`[Google Calendar] Tokens refreshed for user ${user._id}`);
      } catch (err) {
        console.error('[Google Calendar] Failed to save refreshed tokens:', err.message);
      }
    }
  });

  // Force refresh if the current access token might be expired
  try {
    const tokenInfo = oauth2Client.credentials;
    if (tokenInfo.refresh_token && tokenInfo.expiry_date && tokenInfo.expiry_date < Date.now()) {
      console.log('[Google Calendar] Access token expired, refreshing...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    }
  } catch (refreshErr) {
    console.warn('[Google Calendar] Token refresh pre-check failed:', refreshErr.message);
    // Continue anyway — the actual API call will trigger a retry
  }

  return oauth2Client;
}

async function syncEventToGoogleCalendar(userId, event, locationId) {
  // Only sync for logged-in users with valid ObjectId
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return { success: false, error: 'Not a logged-in user' };
  }
  try {
    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
      return { success: false, error: 'No Google token stored' };
    }

    const locId = locationId || DEFAULT_LOCATION_ID;
    const locData = LOCATIONS.find(loc => loc.id === locId);
    const timeZone = locData ? locData.timezone : 'Asia/Jerusalem';

    // Create OAuth2 client with auto-refresh capability
    const oauth2Client = await createOAuth2ClientWithRefresh(user);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Parse the event's day and time into a Date object
    const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const targetDay = dayMap[event.day];
    if (targetDay === undefined) {
      return { success: false, error: 'Invalid day for Google Calendar event.' };
    }

    const today = new Date();
    const eventDate = new Date(today);
    // Calculate the next occurrence of the target day
    eventDate.setDate(today.getDate() + ((targetDay + 7 - today.getDay()) % 7));

    // Parse start/end times from "HH:MM AM/PM" format
    const startMatch = event.startTime && event.startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const endMatch = event.endTime && event.endTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!startMatch) return { success: false, error: 'Invalid startTime format' };

    let startHour = parseInt(startMatch[1], 10);
    const startMinute = parseInt(startMatch[2], 10);
    if (startMatch[3].toUpperCase() === 'PM' && startHour !== 12) startHour += 12;
    if (startMatch[3].toUpperCase() === 'AM' && startHour === 12) startHour = 0;

    const startDateTime = new Date(eventDate);
    startDateTime.setHours(startHour, startMinute, 0, 0);

    let endDateTime;
    if (endMatch) {
      let endHour = parseInt(endMatch[1], 10);
      const endMinute = parseInt(endMatch[2], 10);
      if (endMatch[3].toUpperCase() === 'PM' && endHour !== 12) endHour += 12;
      if (endMatch[3].toUpperCase() === 'AM' && endHour === 12) endHour = 0;
      endDateTime = new Date(eventDate);
      endDateTime.setHours(endHour, endMinute, 0, 0);
    } else {
      // Default to 1 hour if no endTime
      endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    }

    // Build request body
    const isReminderEvent = event.isReminder === true || event.eventType === 'reminder' || event.eventType === 'notification';
    const requestBody = {
      summary: event.title || 'CalendAI Event',
      description: event.description || `Created by CalendAI for ${event.day}`,
      start: { dateTime: startDateTime.toISOString(), timeZone },
      end: { dateTime: endDateTime.toISOString(), timeZone },
    };

    // Force popup reminders for notification/reminder events so the user gets a ping
    if (isReminderEvent) {
      requestBody.reminders = {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 0 } // pops exactly at event start time
        ]
      };
    }

    // Build RRULE for recurring events
    if (event.recurrence) {
      let freq = null;
      switch (event.recurrence) {
        case 'daily': freq = 'DAILY'; break;
        case 'weekly': freq = 'WEEKLY'; break;
        case 'monthly': freq = 'MONTHLY'; break;
        case 'yearly': freq = 'YEARLY'; break;
        case 'forever': freq = 'DAILY'; break;
      }
      if (freq) {
        requestBody.recurrence = [`RRULE:FREQ=${freq}`];
      }
    }

    await calendar.events.insert({
      calendarId: 'primary',
      requestBody,
    });

    return { success: true };
  } catch (error) {
    // Log but never crash - event is already saved locally
    console.error('Google Calendar sync failed (non-fatal):', error.message);
    if (error.code === 401 || error.code === 403) {
      console.warn('Google token may be expired for user:', userId);
    }
    return { success: false, error: error.message };
  }
}

// POST /api/add-to-google-calendar - Add an event to the user's Google Calendar
app.post('/api/add-to-google-calendar', async (req, res) => {
  // Support both session-based auth (Google OAuth) and JWT token auth (email/password)
  let accessToken = null;

  // 1. Try JWT Bearer token auth first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) {
        // Look up the user's Google access token from MongoDB
        const user = await User.findById(decoded.id).catch(() => null);
        if (user && user.googleAccessToken) {
          accessToken = user.googleAccessToken;
        }
      }
    } catch (err) {
      // Invalid token - fall through to session check
    }
  }

  // 2. Fall back to session-based auth (passport / Google OAuth)
  if (!accessToken) {
    if (req.isAuthenticated && req.isAuthenticated() && req.session.passport?.user?.accessToken) {
      accessToken = req.session.passport.user.accessToken;
    }
  }

  if (!accessToken) {
    return res.status(401).json({ error: 'User not authenticated or Google Calendar token missing.' });
  }

  const { event, location } = req.body;
  if (!event || !event.title || !event.startTime || !event.day) {
    return res.status(400).json({ error: 'Invalid event data provided.' });
  }

  const locationId = location || DEFAULT_LOCATION_ID;
  const locData = LOCATIONS.find(loc => loc.id === locationId);
  const timeZone = locData ? locData.timezone : 'Asia/Jerusalem';

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
    const isReminderEvent = event.isReminder === true || event.eventType === 'reminder' || event.eventType === 'notification';
    const requestBody = {
      summary: event.title,
      start: { dateTime: startDateTime.toISOString(), timeZone },
      end: { dateTime: endDateTime.toISOString(), timeZone },
    };

    // Force popup reminders for notification/reminder events so the user gets a ping
    if (isReminderEvent) {
      requestBody.reminders = {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 0 } // pops exactly at event start time
        ]
      };
    }
    
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

  const { reason, customText } = req.body;
  const effectiveReason = reason || customText || '';
  if (!effectiveReason.trim()) {
    return res.status(400).json({ error: 'Reason or customText is required.' });
  }

  try {
    const userId = getUserId(req);
    
    // ── PAYG CREDIT CHECK: Block if user has no AI credits left ──
    const creditCheck = await checkAICredits(userId);
    if (!creditCheck.allowed) {
      return res.status(402).json({ error: creditCheck.error });
    }
    
    const currentSchedule = getUserSchedule(userId);
    const result = await rescheduleWithGemini(currentSchedule, effectiveReason);

    userSchedules.set(userId, result.newSchedule);
    saveSchedulesNow();
    
    // Save to MongoDB for logged-in users
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await saveScheduleToMongo(userId, result.newSchedule);
    }

    // ── PAYG CREDIT DEDUCTION: Only charge AFTER a successful AI response ──
    const remainingCredits = await deductAICredit(userId);

    res.json({
      summary: result.summary,
      newSchedule: result.newSchedule,
      aiCredits: remainingCredits
    });
  } catch (error) {
    console.error('Gemini reschedule failed, using fallback:', error.message);
    // Fallback: extract delay minutes from text and use mathematical shift
    try {
      const userId = getUserId(req);
      const currentSchedule = getUserSchedule(userId);

      // Try to extract delay minutes from the reason text
      const delayMatch = effectiveReason.match(/(\d+)\s*(דקות|דקה|minutes|minute|min)/i);
      const delayMinutes = delayMatch ? parseInt(delayMatch[1], 10) : 30;

      const result = shiftScheduleForward(currentSchedule, delayMinutes);

      userSchedules.set(userId, result.newSchedule);
      saveSchedulesNow();
      
      // Save to MongoDB for logged-in users
      if (mongoose.Types.ObjectId.isValid(userId)) {
        await saveScheduleToMongo(userId, result.newSchedule);
      }

      res.json({
        summary: result.summary,
        newSchedule: result.newSchedule,
        fallback: true
      });
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError.message);
      res.status(500).json({ error: 'Failed to reschedule. Please try again.' });
    }
  }
});

app.post('/api/reschedule/shift', async (req, res) => {
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
    
    // Save to MongoDB for logged-in users
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await saveScheduleToMongo(userId, result.newSchedule);
    }

    res.json({
      summary: result.summary,
      newSchedule: result.newSchedule
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to shift schedule.' });
  }
});

app.post('/api/reschedule/merge-gaps', async (req, res) => {
  try {
    const userId = getUserId(req);
    const currentSchedule = getUserSchedule(userId);
    const result = mergeGaps(currentSchedule);

    if (result.totalMergedMinutes > 0) {
      userSchedules.set(userId, result.newSchedule);
      saveSchedulesNow();
      
      // Save to MongoDB for logged-in users
      if (mongoose.Types.ObjectId.isValid(userId)) {
        await saveScheduleToMongo(userId, result.newSchedule);
      }
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

function addBreaksBetweenEvents(schedule) {
  const todayName = getTodayDayName();
  const newSchedule = JSON.parse(JSON.stringify(schedule));
  const todayEvents = newSchedule[todayName] || [];
  
  if (todayEvents.length < 2) {
    return { newSchedule, summary: 'אין מספיק אירועים להוספת הפסקות.' };
  }
  
  const currentMin = getCurrentMinutes();
  
  const sorted = todayEvents
    .map((e, idx) => ({ ...e, originalIndex: idx }))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  
  let shiftAccumulated = 0;
  let breaksAdded = 0;
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    
    const currentEnd = timeToMinutes(current.endTime);
    const nextStart = timeToMinutes(next.startTime);
    
    if (currentEnd === null || nextStart === null) continue;
    
    // Apply any accumulated shift from previous iterations
    const adjustedCurrentEnd = currentEnd + shiftAccumulated;
    const adjustedNextStart = nextStart + shiftAccumulated;
    
    // Only process future events
    if (adjustedCurrentEnd < currentMin) continue;
    
    const gap = adjustedNextStart - adjustedCurrentEnd;
    
    if (gap < 10) {
      // Need to push the next event forward to create a 10-minute break
      const neededShift = 10 - gap;
      shiftAccumulated += neededShift;
      breaksAdded++;
    }
  }
  
  if (shiftAccumulated === 0) {
    return { newSchedule, summary: 'כל האירועים כבר עם הפסקה של 10 דקות לפחות.' };
  }
  
  // Apply the accumulated shift to all events from the first shifted one onward
  let appliedShift = 0;
  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const oldStart = timeToMinutes(event.startTime);
    const oldEnd = timeToMinutes(event.endTime);
    if (oldStart === null || oldEnd === null) continue;
    
    if (i > 0) {
      const prevEnd = timeToMinutes(sorted[i - 1].endTime);
      if (prevEnd !== null && oldStart < prevEnd + 10) {
        // This event needs to be shifted
        const gap = oldStart - prevEnd;
        const neededShift = 10 - gap;
        appliedShift += neededShift;
      }
    }
    
    if (appliedShift > 0) {
      event.startTime = minutesToTime(oldStart + appliedShift);
      event.endTime = minutesToTime(oldEnd + appliedShift);
    }
  }
  
  newSchedule[todayName] = sorted.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  syncTodayWithCurrentDay(newSchedule);
  
  return {
    newSchedule,
    summary: `הוספתי ${breaksAdded} הפסקות של 10 דקות בין האירועים להיום.`,
    breaksAdded
  };
}

function postponeUncompletedToTomorrow(schedule) {
  const todayName = getTodayDayName();
  const newSchedule = JSON.parse(JSON.stringify(schedule));
  const todayEvents = newSchedule[todayName] || [];
  
  if (todayEvents.length === 0) {
    return { newSchedule, summary: 'אין אירועים להיום לדחות.' };
  }
  
  const currentMin = getCurrentMinutes();
  
  // Find tomorrow's day name
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayIndex = dayNames.indexOf(todayName);
  const tomorrowName = dayNames[(todayIndex + 1) % 7];
  
  // Find events that are past their start time or currently happening
  const uncompletedEvents = todayEvents.filter(event => {
    const eventStart = timeToMinutes(event.startTime);
    return eventStart !== null && eventStart <= currentMin;
  });
  
  if (uncompletedEvents.length === 0) {
    return { newSchedule, summary: 'אין משימות שלא בוצעו לדחות למחר.' };
  }
  
  // Remove uncompleted events from today
  newSchedule[todayName] = todayEvents.filter(event => {
    const eventStart = timeToMinutes(event.startTime);
    return eventStart === null || eventStart > currentMin;
  });
  
  // Schedule them tomorrow starting at 09:00 AM
  let cursor = 9 * 60; // 09:00 AM
  const tomorrowEvents = newSchedule[tomorrowName] || [];
  
  // Find the latest end time of existing tomorrow events
  for (const ev of tomorrowEvents) {
    const evEnd = timeToMinutes(ev.endTime);
    if (evEnd !== null && evEnd > cursor) {
      cursor = evEnd;
    }
  }
  
  const postponedEvents = [];
  for (const event of uncompletedEvents) {
    const duration = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
    const eventDuration = duration > 0 ? duration : 60;
    
    const newStart = cursor;
    const newEnd = cursor + eventDuration;
    
    const postponedEvent = {
      ...event,
      day: tomorrowName,
      startTime: minutesToTime(newStart),
      endTime: minutesToTime(newEnd)
    };
    
    tomorrowEvents.push(postponedEvent);
    postponedEvents.push(postponedEvent);
    cursor = newEnd + 10; // Add 10 min gap between postponed events
  }
  
  newSchedule[tomorrowName] = tomorrowEvents;
  syncTodayWithCurrentDay(newSchedule);
  
  return {
    newSchedule,
    summary: `דחיתי ${postponedEvents.length} משימות שלא בוצעו למחר (${tomorrowName}) החל מ-09:00.`,
    postponedCount: postponedEvents.length,
    tomorrowName
  };
}

app.post('/api/reschedule/add-breaks', async (req, res) => {
  try {
    const userId = getUserId(req);
    const currentSchedule = getUserSchedule(userId);
    const result = addBreaksBetweenEvents(currentSchedule);

    if (result.breaksAdded > 0) {
      userSchedules.set(userId, result.newSchedule);
      saveSchedulesNow();
      if (mongoose.Types.ObjectId.isValid(userId)) {
        await saveScheduleToMongo(userId, result.newSchedule);
      }
    }

    res.json({
      summary: result.summary,
      newSchedule: result.breaksAdded > 0 ? result.newSchedule : currentSchedule,
      breaksAdded: result.breaksAdded || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add breaks.' });
  }
});

app.post('/api/reschedule/postpone-tomorrow', async (req, res) => {
  try {
    const userId = getUserId(req);
    const currentSchedule = getUserSchedule(userId);
    const result = postponeUncompletedToTomorrow(currentSchedule);

    if (result.postponedCount > 0) {
      userSchedules.set(userId, result.newSchedule);
      saveSchedulesNow();
      if (mongoose.Types.ObjectId.isValid(userId)) {
        await saveScheduleToMongo(userId, result.newSchedule);
      }
    }

    res.json({
      summary: result.summary,
      newSchedule: result.postponedCount > 0 ? result.newSchedule : currentSchedule,
      postponedCount: result.postponedCount || 0,
      tomorrowName: result.tomorrowName
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to postpone tasks.' });
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

app.put('/api/schedule', async (req, res) => {
  const { schedule } = req.body;
  if (!schedule) {
    return res.status(400).json({ error: 'schedule is required.' });
  }
  const userId = getUserId(req);
  userSchedules.set(userId, schedule);
  saveSchedulesNow();
  
  // Save to MongoDB for logged-in users
  if (mongoose.Types.ObjectId.isValid(userId)) {
    await saveScheduleToMongo(userId, schedule);
  }
  
  res.json({ ok: true, message: 'Schedule restored.' });
});

app.get('/api/schedule', async (req, res) => {
  const userId = getUserId(req);
  
  // For logged-in users, try to load schedule from MongoDB first
  if (mongoose.Types.ObjectId.isValid(userId)) {
    try {
      const user = await User.findById(userId);
      if (user && user.schedule) {
        // Update the in-memory cache with MongoDB data
        userSchedules.set(userId, user.schedule);
        syncTodayWithCurrentDay(user.schedule);
        return res.json({ schedule: user.schedule });
      }
    } catch (err) {
      console.error('Failed to load schedule from MongoDB:', err.message);
    }
  }
  
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

app.delete('/api/schedule/clear', async (req, res) => {
  const userId = getUserId(req);
  userSchedules.set(userId, getDefaultSchedule());
  saveSchedulesNow();
  
  // Save to MongoDB for logged-in users
  if (mongoose.Types.ObjectId.isValid(userId)) {
    await saveScheduleToMongo(userId, getDefaultSchedule());
  }
  
  res.json({ ok: true, message: 'Schedule cleared.' });
});

app.delete('/api/schedule/event', async (req, res) => {
  const { day, index } = req.body;
  if (!day || index === undefined) {
    return res.status(400).json({ error: 'day and index are required.' });
  }
  const userId = getUserId(req);
  const schedule = getUserSchedule(userId);
  if (schedule[day] && schedule[day][index]) {
    schedule[day].splice(index, 1);
    saveSchedulesNow();
    
    // Save to MongoDB for logged-in users
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await saveScheduleToMongo(userId, schedule);
    }
    
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
    const suitableSlots = freeSlots.filter(s => s.durationMinutes >= durationMinutes);

    res.json({
      hasSuggestion: suitableSlots.length > 0,
      freeSlots: suitableSlots,
      suggestion: suitableSlots.length > 0
        ? null
        : { type: 'no_free_slot', message: 'No free slots available. Try another day.' },
      aiMessage: suitableSlots.length > 0
        ? `מצאתי ${suitableSlots.length} חלונות פנויים ביום ${actualDay}.`
        : `לא מצאתי חלונות פנויים ביום ${actualDay}. נסה יום אחר.`
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
// 9d. Dynamic Booking Link Endpoints
// ──────────────────────────────────────────────

/**
 * POST /api/booking/create-link
 * Creates a dynamic booking link with specific time slots and duration.
 * Returns a unique ID that can be used in the URL for guest booking.
 * Supports two modes:
 *   1. Multi-slot (legacy): { slots: [{hour,minute}], day, duration }
 *   2. Locked time (new):   { startTime, endTime, meetingType, day, duration }
 */
app.post('/api/booking/create-link', (req, res) => {
  try {
    const { subject, duration, slots, day, hostName, startTime, endTime, meetingType, guestTimezone } = req.body;
    
    // Determine if this is a locked (single exact time) or multi-slot booking
    const isLocked = !!(startTime && endTime);
    
    if (!isLocked && (!slots || !Array.isArray(slots) || slots.length === 0)) {
      return res.status(400).json({ error: 'Either slots array or startTime/endTime are required.' });
    }
    if (!duration || !day) {
      return res.status(400).json({ error: 'duration and day are required.' });
    }

    const userId = getUserId(req);
    const bookingId = 'dyn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const bookingData = {
      id: bookingId,
      hostId: userId,
      hostName: hostName || 'Host',
      subject: subject || 'Meeting',
      meetingType: meetingType || null,
      duration,
      day,
      isLocked,
      startTime: isLocked ? startTime : null,
      endTime: isLocked ? endTime : null,
      guestTimezone: guestTimezone || null,
      slots: isLocked 
        ? [] 
        : slots.map(s => ({ hour: s.hour, minute: s.minute, booked: false })),
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    const bookingDir = path.join(DATA_DIR, 'bookings');
    if (!fs.existsSync(bookingDir)) {
      fs.mkdirSync(bookingDir, { recursive: true });
    }

    const bookingFile = path.join(bookingDir, `${bookingId}.json`);
    fs.writeFileSync(bookingFile, JSON.stringify(bookingData, null, 2));

    const link = `${CLIENT_URL}/book/${bookingId}`;

    res.json({ ok: true, bookingId, link, booking: bookingData });
  } catch (err) {
    console.error('Create booking link error:', err);
    res.status(500).json({ error: 'Failed to create booking link.' });
  }
});

/**
 * GET /api/booking/:id
 * Returns the booking data for a given dynamic booking ID.
 * Used by the guest view. Supports two modes:
 *   1. Locked time: returns isLocked=true + startTime/endTime/meetingType
 *   2. Multi-slot: returns slots array for guest to choose
 */
app.get('/api/booking/:id', (req, res) => {
  try {
    const { id } = req.params;
    const bookingFile = path.join(DATA_DIR, 'bookings', `${id}.json`);

    if (!fs.existsSync(bookingFile)) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = JSON.parse(fs.readFileSync(bookingFile, 'utf-8'));

    if (booking.status !== 'active') {
      return res.status(410).json({ error: 'This booking link has expired.', booking });
    }

    // Return available slots only (not booked) for multi-slot mode
    const availableSlots = booking.slots.filter(s => !s.booked);

    res.json({
      ok: true,
      booking: {
        id: booking.id,
        hostName: booking.hostName,
        subject: booking.subject,
        meetingType: booking.meetingType || null,
        duration: booking.duration,
        day: booking.day,
        isLocked: booking.isLocked || false,
        startTime: booking.isLocked ? booking.startTime : null,
        endTime: booking.isLocked ? booking.endTime : null,
        guestTimezone: booking.guestTimezone || null,
        createdAt: booking.createdAt
      },
      slots: availableSlots
    });
  } catch (err) {
    console.error('Get booking error:', err);
    res.status(500).json({ error: 'Failed to get booking.' });
  }
});

/**
 * POST /api/booking/:id/confirm
 * Confirms a booking by a guest. Supports two modes:
 *   1. Locked time (isLocked=true): uses booking.startTime/endTime directly
 *   2. Multi-slot (isLocked=false): uses slotIndex to pick which slot
 */
app.post('/api/booking/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { slotIndex, guestName, guestEmail, guestPhone, guestNotes } = req.body;

    if (!guestName) {
      return res.status(400).json({ error: 'guestName is required.' });
    }

    const bookingFile = path.join(DATA_DIR, 'bookings', `${id}.json`);

    if (!fs.existsSync(bookingFile)) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = JSON.parse(fs.readFileSync(bookingFile, 'utf-8'));

    if (booking.status !== 'active') {
      return res.status(410).json({ error: 'This booking link has expired.' });
    }

    let startTimeStr, endTimeStr;
    const formatTime12 = (h, m) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    };

    if (booking.isLocked) {
      // Locked time mode: use the exact startTime/endTime from the booking
      startTimeStr = booking.startTime;
      endTimeStr = booking.endTime;
    } else {
      // Multi-slot mode: use slotIndex to pick the slot
      if (slotIndex === undefined) {
        return res.status(400).json({ error: 'slotIndex is required for multi-slot booking.' });
      }
      if (slotIndex < 0 || slotIndex >= booking.slots.length) {
        return res.status(400).json({ error: 'Invalid slot index.' });
      }

      const slot = booking.slots[slotIndex];
      if (slot.booked) {
        return res.status(409).json({ error: 'This slot is already booked.' });
      }

      // Mark slot as booked
      slot.booked = true;
      slot.bookedBy = guestName;
      slot.bookedByEmail = guestEmail || '';
      slot.bookedByPhone = guestPhone || '';
      slot.bookedByNotes = guestNotes || '';
      slot.bookedAt = new Date().toISOString();

      const startHour = slot.hour;
      const startMin = slot.minute;
      const endMinTotal = startHour * 60 + startMin + booking.duration;
      const endHour = Math.floor(endMinTotal / 60);
      const endMin = endMinTotal % 60;

      startTimeStr = formatTime12(startHour, startMin);
      endTimeStr = formatTime12(endHour, endMin);
    }

    // Mark booking as completed
    booking.status = 'completed';
    booking.confirmedBy = guestName;
    booking.confirmedAt = new Date().toISOString();

    // Save booking update
    fs.writeFileSync(bookingFile, JSON.stringify(booking, null, 2));

    // Add the event to the host's schedule
    const hostSchedule = getUserSchedule(booking.hostId);
    const dayName = booking.day;

    const newEvent = {
      title: `${booking.subject} - ${guestName}`,
      day: dayName,
      startTime: startTimeStr,
      endTime: endTimeStr,
      recurrence: 'once',
      location: DEFAULT_LOCATION_ID,
      guestName: guestName,
      guestEmail: guestEmail || '',
      guestPhone: guestPhone || '',
      guestNotes: guestNotes || '',
      meetingType: booking.meetingType || null,
      bookingId: id
    };

    if (hostSchedule[dayName]) {
      hostSchedule[dayName].push(newEvent);
    } else {
      hostSchedule['Today'].push(newEvent);
    }

    syncTodayWithCurrentDay(hostSchedule);
    saveSchedulesNow();
    
    // Save to MongoDB for logged-in users
    if (mongoose.Types.ObjectId.isValid(booking.hostId)) {
      await saveScheduleToMongo(booking.hostId, hostSchedule);
    }

    res.json({
      ok: true,
      message: 'Booking confirmed successfully!',
      event: newEvent,
      booking
    });
  } catch (err) {
    console.error('Confirm booking error:', err);
    res.status(500).json({ error: 'Failed to confirm booking.' });
  }
});

// ──────────────────────────────────────────────
// 9e. Expiration & Extension Notification
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
app.post('/api/schedule/extend-event', async (req, res) => {
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
    
    // Save to MongoDB for logged-in users
    if (mongoose.Types.ObjectId.isValid(userId)) {
      await saveScheduleToMongo(userId, schedule);
    }
    
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
// 10b. Lemon Squeezy Payments (AI Credits Purchase)
// ──────────────────────────────────────────────
// CalendAI uses Lemon Squeezy for all payment processing.
// The /api/payments/create-checkout route is defined in ./routes/paymentRoutes.js
// and handles creating Lemon Squeezy checkout sessions for AI credit purchases.
// Stripe is NOT used — all payment logic is handled via Lemon Squeezy.

/**
 * POST /api/payments/webhook
 * Receives payment webhook events from Lemon Squeezy.
 *
 * - Lemon Squeezy: On order_created → credits the user with 100 AI credits.
 *
 * This route is intentionally NOT protected by auth middleware — the requests
 * come from Lemon Squeezy's servers, not from the client.
 * CalendAI uses Lemon Squeezy exclusively for payment processing (not Stripe).
 */
app.post('/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // ──────────────────────────────────────────────
    // Lemon Squeezy sends `x-signature` header for HMAC verification.
    // ──────────────────────────────────────────────
    const lemonSqueezySignature = req.headers['x-signature'];

    if (!lemonSqueezySignature) {
      return res.status(400).json({ error: 'Missing webhook signature header.' });
    }

    try {
      const rawBody = req.body; // Buffer from express.raw()

      // Verify HMAC-SHA256 signature using the Lemon Squeezy webhook secret
      const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
      if (!secret) {
        console.error('Lemon Squeezy webhook: LEMON_SQUEEZY_WEBHOOK_SECRET is not configured.');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const receivedSignature = String(lemonSqueezySignature || '');

      // Use timing-safe comparison to prevent timing attacks
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const receivedBuffer = Buffer.from(receivedSignature, 'hex');
      const signaturesMatch =
        expectedBuffer.length === receivedBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

      if (!signaturesMatch) {
        console.error('Lemon Squeezy webhook: Invalid signature.');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Signature is valid — parse the JSON payload
      const payload = JSON.parse(rawBody.toString('utf-8'));

      // Only process successful order_created events
      const eventName = payload?.meta?.event_name;
      if (eventName !== 'order_created') {
        return res.status(200).json({ received: true });
      }

      const userId = payload?.meta?.custom_data?.user_id || payload?.meta?.custom_data?.userId;
      if (!userId) {
        console.warn('Lemon Squeezy webhook: No userId found in custom_data.');
        return res.status(200).json({ received: true });
      }

      // Find the user in MongoDB and credit them with 100 AI credits
      let user = null;
      if (mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findOne({ googleId: userId });
      }

      if (!user) {
        console.warn(`Lemon Squeezy webhook: User ${userId} not found in MongoDB.`);
        return res.status(200).json({ received: true });
      }

      user.aiCredits = (user.aiCredits || 0) + 100;
      await user.save();
      console.log(`✅ Lemon Squeezy: Credited user ${user._id} with 100 AI credits (total: ${user.aiCredits}).`);

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Lemon Squeezy webhook processing failed:', err.message);
      return res.status(400).json({ error: 'Webhook processing failed' });
    }
  }
);

// ──────────────────────────────────────────────
// 10c. Time Analytics Endpoint (Pro-ready)
// ──────────────────────────────────────────────

/**
 * GET /api/schedule/analytics
 * Computes weekly time analytics: how many minutes/hours were spent this week
 * in each category (work, workout, sleep, meetings, tasks) based on event titles.
 * Returns a JSON object with the weekly statistics.
 */
app.get('/api/schedule/analytics', async (req, res) => {
  try {
    const userId = getUserId(req);
    const schedule = getUserSchedule(userId);
    const todayName = getTodayDayName();

    // Compute the start of the current week (Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);

    // Category classification based on title keywords
    function classifyEvent(title) {
      const lower = (title || '').toLowerCase();
      // Work-related
      if (/עבודה|work|משרד|office|פרויקט|project|קוד|code|דדליין|deadline|לקוח|client|מייל|email|דוא"ל|שיחת עבודה|meeting|meet|פגישת עבודה|כנס|conference|שיעור|lesson|study|לימודים|קורס|course|הרצאה|lecture|תכנות|programming|פיתוח|development|מנהל|manager|boss|עמית|colleague|תדרוך|briefing|סקrum|scrum|standup/.test(lower)) {
        return 'work';
      }
      // Workout / Sport
      if (/אימון|workout|חדר כושר|gym|ריצה|run|running|יוגה|yoga|פילאטיס|pilates|שחייה|swim|swimming|כדורגל|football|כדורסל|basketball|טניס|tennis|רכיבה|cycling|bike|הליכה|walk|walking|ספורט|sport|מתח|pull.up|push.up|שכיבות|סקוואט|squat|crossfit|pilates|meditation|מדיטציה|פיתוח גוף|bodybuilding|מתיחות|stretching/.test(lower)) {
        return 'workout';
      }
      // Sleep
      if (/שינה|sleep|לילה|night|bedtime|bed/.test(lower)) {
        return 'sleep';
      }
      // Meetings (general)
      if (/פגישה|meeting|appointment|קבע|פגישת|שיחת|שיחה|zoom|שיחת זום|וידאו|video|call|phone|טלפון|ועידה|conference call|קבוצת|group|סשן|session|התייעצות|consultation|ייעוץ|coaching|אימון אישי|therapy|טיפול|פסיכולוג|psychologist|רופא|doctor|dentist|שיננית|hygienist|טיפול|treatment/.test(lower)) {
        return 'meetings';
      }
      // Tasks / Errands
      if (/קניות|shopping|סידורים|errands|משימה|task|todo|לעשות|do|לקנות|buy|לתקן|fix|לשלם|pay|חשבון|bill|בנק|bank|דואר|post|mail|סופר|supermarket|מכולת|grocery|בית מרקחת|pharmacy|ניקוי|clean|cleaning|כביסה|laundry|לבשל|cook|cooking|ארוחה|meal|לאכול|eat|אוכל|food|להכין|prepare|לסדר|organize|לארגן|arrange|להזמין|order|להחזיר|return|להשאיל|borrow|לתת|give|לקחת|take|להוציא|take.out|איסוף|pickup|drop.off/.test(lower)) {
        return 'tasks';
      }
      return 'other';
    }

    // Helper: parse time string to minutes
    function parseTimeToMin(timeStr) {
      if (!timeStr) return 0;
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return 0;
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const meridiem = match[3].toUpperCase();
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }

    // Aggregate analytics
    const categoryMinutes = {
      work: 0,
      workout: 0,
      sleep: 0,
      meetings: 0,
      tasks: 0,
      other: 0
    };
    const categoryCounts = {
      work: 0,
      workout: 0,
      sleep: 0,
      meetings: 0,
      tasks: 0,
      other: 0
    };

    // Process all events from all days
    for (const dayKey of Object.keys(schedule)) {
      if (dayKey === 'Today') continue;
      const dayEvents = schedule[dayKey] || [];
      for (const event of dayEvents) {
        const category = classifyEvent(event.title);
        const startMin = parseTimeToMin(event.startTime);
        const endMin = parseTimeToMin(event.endTime);
        let duration = 0;
        if (endMin > startMin) {
          duration = endMin - startMin;
        } else if (endMin < startMin) {
          // Midnight-crossing event (e.g., sleep 23:00 - 07:00)
          duration = (24 * 60 - startMin) + endMin;
        } else {
          // Default 60 minutes if time parsing fails
          duration = 60;
        }

        // For recurring events, multiply by the number of occurrences per week
        let multiplier = 1;
        if (event.recurrence === 'daily' || event.recurrence === 'forever') {
          multiplier = 7; // Every day of the week
        }
        // Weekly events already appear once per week per day-key

        categoryMinutes[category] += duration * multiplier;
        categoryCounts[category] += 1 * multiplier;
      }
    }

    // Convert to hours (rounded to 1 decimal)
    const categoryHours = {};
    for (const cat of Object.keys(categoryMinutes)) {
      categoryHours[cat] = Math.round((categoryMinutes[cat] / 60) * 10) / 10;
    }

    res.json({
      totalMinutes: Object.values(categoryMinutes).reduce((a, b) => a + b, 0),
      totalHours: Math.round(Object.values(categoryMinutes).reduce((a, b) => a + b, 0) / 60 * 10) / 10,
      categoryMinutes,
      categoryHours,
      categoryCounts,
      weekStart: weekStart.toISOString(),
      today: todayName
    });
  } catch (error) {
    console.error('Failed to compute analytics:', error);
    res.status(500).json({ error: 'Failed to compute schedule analytics.' });
  }
});

// ──────────────────────────────────────────────
// 10d. Siri / iOS Shortcuts Route
// ──────────────────────────────────────────────
const eventRoutes = require('./routes/eventRoutes');
app.use('/api/events', eventRoutes);

// ── Lemon Squeezy Payment Routes ──
const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payments', paymentRoutes);

// ──────────────────────────────────────────────
// 11. Health & Fallback
// ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'CalendAI backend is running.' });
});

// ── Shabbat Status Endpoint ──
// Returns the current Shabbat status so the frontend can display Shabbat banner.
app.get('/api/shabbat/status', (_req, res) => {
  res.json(shabbatService.getShabbatStatus());
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