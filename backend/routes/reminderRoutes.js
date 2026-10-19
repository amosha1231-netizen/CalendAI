// ──────────────────────────────────────────────
// Reminder Routes — recurring reminders and Web Push subscriptions
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Reminder = require('../models/Reminder');
const PushSubscription = require('../models/PushSubscription');
const { getRequestTimeZone, buildLocation, DEFAULT_TIMEZONE } = require('../services/userLocation');
const schedule = require('../services/reminderSchedule');
const shabbatService = require('../services/shabbatService');
const webPush = require('../services/webPush');

const JWT_SECRET = require('../config/jwtSecret');

const MAX_REMINDERS_PER_USER = 100;
const MAX_SUBSCRIPTIONS_PER_USER = 10;
const EDITABLE = ['title', 'emoji', 'time', 'frequency', 'daysOfWeek', 'dayOfMonth', 'date', 'skipShabbat'];

/** User id from the JWT Bearer token or the session (same as goalRoutes). */
function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded && decoded.id) return decoded.id;
    } catch (err) {
      return null;
    }
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    const fullUser = req.session?.passport?.user;
    const id = fullUser?._id || fullUser?.id;
    if (id) return id;
  }
  return null;
}

function requireUser(req, res) {
  const userId = getUserId(req);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(401).json({ error: 'עליך להתחבר כדי לשמור תזכורות.' });
    return null;
  }
  return String(userId);
}

/** True when `instant` falls within Shabbat in the given time zone. */
function isShabbatAt(instant, timeZone) {
  try {
    return shabbatService.isShabbatTime(instant, buildLocation({ timeZone })).isShabbat === true;
  } catch (e) {
    return false;
  }
}

function nextFireFor(reminder, after = new Date()) {
  return schedule.computeNextFire(reminder, after, {
    isBlocked: instant => isShabbatAt(instant, reminder.timezone) // never on Shabbat
  });
}

const INVALID_MESSAGES = {
  title: 'חסר תוכן לתזכורת.',
  time: 'שעה לא תקינה.',
  frequency: 'תדירות לא תקינה.',
  daysOfWeek: 'בחר לפחות יום אחד.',
  dayOfMonth: 'יום בחודש לא תקין.',
  date: 'תאריך לא תקין.'
};

/**
 * Create reminders for a user from already-sanitized-or-raw specs.
 * Used by the routes below and by /api/parse-schedule for AI-created reminders.
 */
async function createReminders(userId, specs, { timeZone, source = 'manual', sourceText } = {}) {
  const count = await Reminder.countDocuments({ userId });
  const room = Math.max(0, MAX_REMINDERS_PER_USER - count);
  const created = [];
  for (const spec of specs.slice(0, room)) {
    const { value } = schedule.sanitizeReminderInput(spec, { timeZone });
    if (!value) continue;
    const nextFireAt = nextFireFor(value);
    if (!nextFireAt) continue;
    const doc = await Reminder.create({
      ...value,
      userId,
      rrule: schedule.toRRule(value),
      nextFireAt,
      source,
      sourceText: sourceText ? String(sourceText).slice(0, 500) : undefined
    });
    created.push(serialize(doc));
  }
  return created;
}

function serialize(doc) {
  const r = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(r._id),
    title: r.title,
    emoji: r.emoji || '🔔',
    time: r.time,
    frequency: r.frequency,
    daysOfWeek: r.daysOfWeek || [],
    dayOfMonth: r.dayOfMonth || null,
    date: r.date || null,
    timezone: r.timezone,
    rrule: r.rrule || null,
    skipShabbat: r.skipShabbat !== false,
    active: r.active !== false,
    nextFireAt: r.nextFireAt || null,
    lastFiredAt: r.lastFiredAt || null,
    source: r.source || 'manual',
    createdAt: r.createdAt
  };
}

// GET /api/reminders — the user's reminders, soonest first, plus push status
router.get('/', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const docs = await Reminder.find({ userId }).lean();
    const list = docs.map(serialize).sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (a.nextFireAt ? new Date(a.nextFireAt).getTime() : Infinity) - (b.nextFireAt ? new Date(b.nextFireAt).getTime() : Infinity);
    });
    const subscriptions = await PushSubscription.countDocuments({ userId });
    res.json({ reminders: list, push: { available: webPush.isConfigured(), publicKey: webPush.getPublicKey(), subscriptions } });
  } catch (err) {
    console.error('List reminders error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת התזכורות.' });
  }
});

// POST /api/reminders — create one reminder
router.post('/', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const timeZone = getRequestTimeZone(req) || DEFAULT_TIMEZONE;
    const { value, error } = schedule.sanitizeReminderInput(req.body || {}, { timeZone });
    if (error) return res.status(400).json({ error: INVALID_MESSAGES[error] || 'תזכורת לא תקינה.', field: error });
    if (await Reminder.countDocuments({ userId }) >= MAX_REMINDERS_PER_USER) {
      return res.status(400).json({ error: `אפשר לשמור עד ${MAX_REMINDERS_PER_USER} תזכורות.` });
    }
    const nextFireAt = nextFireFor(value);
    if (!nextFireAt) return res.status(400).json({ error: 'המועד שבחרת כבר עבר.', field: 'date' });
    const doc = await Reminder.create({ ...value, userId, rrule: schedule.toRRule(value), nextFireAt, source: 'manual' });
    res.status(201).json({ reminder: serialize(doc) });
  } catch (err) {
    console.error('Create reminder error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת התזכורת.' });
  }
});

// PATCH /api/reminders/:id — edit fields and/or pause (active: false) / resume
router.patch('/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'התזכורת לא נמצאה.' });
  try {
    const doc = await Reminder.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ error: 'התזכורת לא נמצאה.' });

    const merged = { ...serialize(doc) };
    for (const key of EDITABLE) if (req.body && req.body[key] !== undefined) merged[key] = req.body[key];
    // Editing keeps the reminder in the zone it was made in, unless the app sends a new one.
    const timeZone = getRequestTimeZone(req) || doc.timezone;
    const { value, error } = schedule.sanitizeReminderInput(merged, { timeZone });
    if (error) return res.status(400).json({ error: INVALID_MESSAGES[error] || 'תזכורת לא תקינה.', field: error });

    const active = typeof req.body?.active === 'boolean' ? req.body.active : doc.active;
    const nextFireAt = active ? nextFireFor(value) : null;
    if (active && !nextFireAt) return res.status(400).json({ error: 'המועד שבחרת כבר עבר.', field: 'date' });

    Object.assign(doc, value, { active, nextFireAt, rrule: schedule.toRRule(value) });
    await doc.save();
    res.json({ reminder: serialize(doc) });
  } catch (err) {
    console.error('Update reminder error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון התזכורת.' });
  }
});

// DELETE /api/reminders/:id
router.delete('/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'התזכורת לא נמצאה.' });
  try {
    const result = await Reminder.deleteOne({ _id: req.params.id, userId });
    if (!result.deletedCount) return res.status(404).json({ error: 'התזכורת לא נמצאה.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete reminder error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת התזכורת.' });
  }
});

// POST /api/reminders/push/subscribe — save this browser's push subscription
router.post('/push/subscribe', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const sub = req.body && req.body.subscription;
  const endpoint = sub && typeof sub.endpoint === 'string' ? sub.endpoint : '';
  const keys = sub && sub.keys;
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  if (!webPush.isConfigured()) return res.status(503).json({ error: 'Push notifications are not configured on the server.' });
  try {
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { $set: { userId, endpoint, keys: { p256dh: keys.p256dh.slice(0, 200), auth: keys.auth.slice(0, 200) }, userAgent: String(req.get('user-agent') || '').slice(0, 300) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // Keep only the newest few browsers per user.
    const extra = await PushSubscription.find({ userId }).sort({ updatedAt: -1 }).skip(MAX_SUBSCRIPTIONS_PER_USER).select('_id').lean();
    if (extra.length) await PushSubscription.deleteMany({ _id: { $in: extra.map(s => s._id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Could not save push subscription.' });
  }
});

// POST /api/reminders/push/unsubscribe — forget this browser
router.post('/push/unsubscribe', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const endpoint = req.body && typeof req.body.endpoint === 'string' ? req.body.endpoint : '';
  try {
    await PushSubscription.deleteOne({ userId, endpoint });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove push subscription.' });
  }
});

// POST /api/reminders/push/test — send a test ping to all the user's browsers
router.post('/push/test', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  if (!webPush.isConfigured()) return res.status(503).json({ error: 'Push notifications are not configured on the server.' });
  try {
    const subs = await PushSubscription.find({ userId }).lean();
    const lang = req.body && req.body.lang === 'he' ? 'he' : 'en';
    let sent = 0;
    for (const sub of subs) {
      const result = await webPush.send(sub, {
        type: 'test',
        title: lang === 'he' ? '🔔 CalendAI' : '🔔 CalendAI',
        body: lang === 'he' ? 'ההתראות עובדות. כך תיראה תזכורת.' : 'Notifications work. This is how a reminder looks.',
        tag: `reminder-test-${Date.now()}`,
        url: '/?reminders=1'
      });
      if (result.ok) sent++;
      else if (result.gone) await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
    }
    res.json({ ok: sent > 0, sent });
  } catch (err) {
    console.error('Push test error:', err);
    res.status(500).json({ error: 'Could not send a test notification.' });
  }
});

module.exports = router;
module.exports.createReminders = createReminders;
module.exports.isShabbatAt = isShabbatAt;
module.exports.serialize = serialize;
