// ──────────────────────────────────────────────
// Routine Routes — personal routines, check-ins, stats, shared challenges
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Routine = require('../models/Routine');
const RoutineCheckin = require('../models/RoutineCheckin');
const User = require('../models/User');
const { getRequestTimeZone, DEFAULT_TIMEZONE } = require('../services/userLocation');
const stats = require('../services/routineStats');

const JWT_SECRET = require('../config/jwtSecret');

const MAX_STEPS = 20;
const MAX_ROUTINES_PER_USER = 50;
const MAX_REST_SECONDS = 600;
const LOOKBACK_DAYS = 120;
const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'any'];
const COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose', 'slate'];

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
    res.status(401).json({ error: 'עליך להתחבר כדי להשתמש ברוטינות.' });
    return null;
  }
  return String(userId);
}

function userTimeZone(req) {
  return getRequestTimeZone(req) || DEFAULT_TIMEZONE;
}

function todayFor(req) {
  return stats.dateKeyInZone(new Date(), userTimeZone(req));
}

function newShareCode() {
  return crypto.randomBytes(6).toString('base64url');
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Validate the editable fields of a routine. Existing steps keep their ids
 * (so past check-ins still count) when the client sends them back.
 */
function parseRoutineInput(body, existing) {
  const title = cleanText(body.title, 80);
  if (!title) return { error: 'נדרש שם לרוטינה.' };

  const rawSteps = Array.isArray(body.steps) ? body.steps.slice(0, MAX_STEPS) : [];
  const existingIds = new Set(existing ? existing.steps.map(s => String(s._id)) : []);
  const steps = rawSteps
    .map(s => {
      const step = { title: cleanText(s && s.title, 80), emoji: cleanText(s && s.emoji, 16) };
      if (s && s._id && existingIds.has(String(s._id))) step._id = s._id;
      return step;
    })
    .filter(s => s.title);
  if (steps.length === 0) return { error: 'הוסף לפחות שלב אחד.' };

  const days = Array.isArray(body.days)
    ? [...new Set(body.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  const kind = body.kind === 'challenge' ? 'challenge' : 'routine';
  const challengeDays = kind === 'challenge'
    ? Math.min(365, Math.max(1, parseInt(body.challengeDays, 10) || 21))
    : null;
  const restSeconds = Math.min(MAX_REST_SECONDS, Math.max(0, parseInt(body.restSeconds, 10) || 0));

  return {
    value: {
      title,
      description: cleanText(body.description, 300),
      emoji: cleanText(body.emoji, 16) || '✨',
      color: COLORS.includes(body.color) ? body.color : 'indigo',
      steps,
      days: days.length === 7 ? [] : days,
      timeOfDay: TIMES_OF_DAY.includes(body.timeOfDay) ? body.timeOfDay : 'any',
      kind,
      challengeDays,
      restSeconds,
      isPublic: body.isPublic === true
    }
  };
}

function firstName(user) {
  const name = (user && (user.displayName || (user.email || '').split('@')[0])) || '';
  return name.trim().split(/\s+/)[0] || '—';
}

/** What a client sees of a routine; owner details only by first name. */
function serializeRoutine(routine, userId, extra = {}) {
  const r = routine.toObject ? routine.toObject() : routine;
  const uid = userId ? String(userId) : '';
  return {
    _id: String(r._id),
    title: r.title,
    description: r.description,
    emoji: r.emoji,
    color: r.color,
    steps: (r.steps || []).map(s => ({ _id: String(s._id), title: s.title, emoji: s.emoji })),
    days: r.days || [],
    timeOfDay: r.timeOfDay,
    kind: r.kind,
    challengeDays: r.challengeDays,
    restSeconds: r.restSeconds || 0,
    isPublic: r.isPublic,
    shareCode: r.shareCode,
    participantCount: r.participantCount || (r.participants || []).length,
    isOwner: !!uid && String(r.ownerId) === uid,
    isMember: !!uid && !!stats.participantFor(r, uid),
    createdAt: r.createdAt,
    ...extra
  };
}

async function findRoutine(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Routine.findById(id);
}

/** Routines this user owns or joined, with today's ticks and progress. */
async function loadMyRoutines(userId, today) {
  const routines = await Routine.find({ 'participants.userId': new mongoose.Types.ObjectId(userId) })
    .sort({ createdAt: 1 })
    .limit(MAX_ROUTINES_PER_USER * 2);
  const checkins = routines.length
    ? await RoutineCheckin.find({
        userId: new mongoose.Types.ObjectId(userId),
        routineId: { $in: routines.map(r => r._id) },
        date: { $gte: stats.addDays(today, -(LOOKBACK_DAYS - 1)), $lte: today }
      }).lean()
    : [];
  return { routines, checkins };
}

// ── My routines ──────────────────────────────

/** GET /api/routines — my routines with today's state. */
router.get('/', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const today = todayFor(req);
    const { routines, checkins } = await loadMyRoutines(userId, today);
    const todayChecks = new Map(checkins.filter(c => c.date === today).map(c => [String(c.routineId), c]));
    res.json({
      today,
      routines: routines.map(r => serializeRoutine(r, userId, {
        doneStepIds: (todayChecks.get(String(r._id))?.doneStepIds || []).map(String),
        progress: stats.routineProgress(r, userId, checkins.filter(c => String(c.routineId) === String(r._id)), today, LOOKBACK_DAYS)
      }))
    });
  } catch (err) {
    console.error('List routines error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הרוטינות.' });
  }
});

/** POST /api/routines — create a routine or challenge. */
router.post('/', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const parsed = parseRoutineInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const owned = await Routine.countDocuments({ ownerId: userId });
    if (owned >= MAX_ROUTINES_PER_USER) {
      return res.status(400).json({ error: 'הגעת למספר הרוטינות המרבי.' });
    }

    const routine = await Routine.create({
      ...parsed.value,
      ownerId: userId,
      shareCode: newShareCode(),
      participants: [{ userId, startDate: todayFor(req), timeZone: userTimeZone(req) }],
      participantCount: 1
    });
    res.status(201).json({ routine: serializeRoutine(routine, userId, { doneStepIds: [] }) });
  } catch (err) {
    console.error('Create routine error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת הרוטינה.' });
  }
});

/** GET /api/routines/stats?days=30 — "how am I doing". */
router.get('/stats', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const today = todayFor(req);
    const { routines, checkins } = await loadMyRoutines(userId, today);
    res.json(stats.computeStats({ routines, checkins, userId, today, days }));
  } catch (err) {
    console.error('Routine stats error:', err);
    res.status(500).json({ error: 'שגיאה בחישוב ההתקדמות.' });
  }
});

// ── Discover & share ─────────────────────────

/** GET /api/routines/public?q=&kind= — public routines and challenges, most joined first. */
router.get('/public', async (req, res) => {
  try {
    const userId = getUserId(req);
    const filter = { isPublic: true };
    if (req.query.kind === 'routine' || req.query.kind === 'challenge') filter.kind = req.query.kind;
    const q = cleanText(req.query.q, 60);
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ title: { $regex: escaped, $options: 'i' } }, { 'steps.title': { $regex: escaped, $options: 'i' } }];
    }
    const routines = await Routine.find(filter)
      .sort({ participantCount: -1, createdAt: -1 })
      .limit(40)
      .select('-participants')
      .lean();
    const owners = await User.find({ _id: { $in: routines.map(r => r.ownerId) } }).select('displayName email').lean();
    const ownerNames = new Map(owners.map(u => [String(u._id), firstName(u)]));
    // isMember needs participants; look it up for this user only.
    const mine = userId
      ? new Set((await Routine.find({ _id: { $in: routines.map(r => r._id) }, 'participants.userId': userId }).select('_id').lean()).map(r => String(r._id)))
      : new Set();
    res.json({
      routines: routines.map(r => ({
        ...serializeRoutine(r, userId),
        isMember: mine.has(String(r._id)),
        ownerName: ownerNames.get(String(r.ownerId)) || '—'
      }))
    });
  } catch (err) {
    console.error('Public routines error:', err);
    res.status(500).json({ error: 'שגיאה בחיפוש רוטינות.' });
  }
});

/** GET /api/routines/share/:code — preview of a shared routine (no sign-in needed). */
router.get('/share/:code', async (req, res) => {
  try {
    const code = cleanText(req.params.code, 32);
    const routine = code ? await Routine.findOne({ shareCode: code }) : null;
    if (!routine) return res.status(404).json({ error: 'הרוטינה לא נמצאה.' });
    const owner = await User.findById(routine.ownerId).select('displayName email').lean();
    res.json({ routine: serializeRoutine(routine, getUserId(req), { ownerName: firstName(owner) }) });
  } catch (err) {
    console.error('Shared routine error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הרוטינה.' });
  }
});

// ── One routine ──────────────────────────────

/** PUT /api/routines/:id — edit (owner only). */
router.put('/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const routine = await findRoutine(req.params.id);
    if (!routine) return res.status(404).json({ error: 'הרוטינה לא נמצאה.' });
    if (String(routine.ownerId) !== userId) return res.status(403).json({ error: 'רק יוצר הרוטינה יכול לערוך אותה.' });

    const parsed = parseRoutineInput(req.body || {}, routine);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    Object.assign(routine, parsed.value, { updatedAt: new Date() });
    await routine.save();
    res.json({ routine: serializeRoutine(routine, userId) });
  } catch (err) {
    console.error('Update routine error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון הרוטינה.' });
  }
});

/** DELETE /api/routines/:id — owner deletes it for everyone; others leave it. */
router.delete('/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const routine = await findRoutine(req.params.id);
    if (!routine) return res.status(404).json({ error: 'הרוטינה לא נמצאה.' });
    if (String(routine.ownerId) === userId) {
      await RoutineCheckin.deleteMany({ routineId: routine._id });
      await routine.deleteOne();
      return res.json({ ok: true, deleted: true });
    }
    await Routine.updateOne(
      { _id: routine._id, 'participants.userId': userId },
      { $pull: { participants: { userId: new mongoose.Types.ObjectId(userId) } }, $inc: { participantCount: -1 } }
    );
    await RoutineCheckin.deleteMany({ routineId: routine._id, userId });
    res.json({ ok: true, left: true });
  } catch (err) {
    console.error('Delete routine error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת הרוטינה.' });
  }
});

/**
 * POST /api/routines/:id/check — { stepId, done, date? }
 * Tick or untick a step. `date` may be today or yesterday (late marking).
 */
router.post('/:id/check', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const routine = await findRoutine(req.params.id);
    if (!routine || !stats.participantFor(routine, userId)) {
      return res.status(404).json({ error: 'הרוטינה לא נמצאה.' });
    }
    const { stepId, done } = req.body || {};
    if (!routine.steps.some(s => String(s._id) === String(stepId))) {
      return res.status(400).json({ error: 'השלב לא נמצא.' });
    }
    const today = todayFor(req);
    const date = req.body.date || today;
    if (!stats.isDateKey(date) || (date !== today && date !== stats.addDays(today, -1))) {
      return res.status(400).json({ error: 'אפשר לסמן רק את היום או את אתמול.' });
    }

    const key = { routineId: routine._id, userId: new mongoose.Types.ObjectId(userId), date };
    const change = done === false
      ? { $pull: { doneStepIds: String(stepId) } }
      : { $addToSet: { doneStepIds: String(stepId) } };
    let checkin;
    try {
      checkin = await RoutineCheckin.findOneAndUpdate(key, { ...change, $set: { updatedAt: new Date() } }, { upsert: true, new: true });
    } catch (err) {
      // Two first ticks at once can race on the unique index; the retry finds the row.
      if (err.code !== 11000) throw err;
      checkin = await RoutineCheckin.findOneAndUpdate(key, { ...change, $set: { updatedAt: new Date() } }, { new: true });
    }
    const completed = stats.isComplete(routine, checkin);
    if (checkin.completed !== completed) {
      checkin.completed = completed;
      await checkin.save();
    }
    // Keep the participant's zone current for the leaderboard's "today".
    const tz = userTimeZone(req);
    if (stats.participantFor(routine, userId).timeZone !== tz) {
      await Routine.updateOne({ _id: routine._id, 'participants.userId': key.userId }, { $set: { 'participants.$.timeZone': tz } });
    }
    res.json({
      date,
      doneStepIds: checkin.doneStepIds.map(String),
      done: stats.doneCount(routine, checkin),
      total: routine.steps.length,
      completed
    });
  } catch (err) {
    console.error('Routine check error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת הסימון.' });
  }
});

/** POST /api/routines/:id/join — { code? } join a public routine, or a private one by its share code. */
router.post('/:id/join', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const routine = await findRoutine(req.params.id);
    const code = req.body && req.body.code;
    if (!routine || (!routine.isPublic && code !== routine.shareCode)) {
      return res.status(404).json({ error: 'הרוטינה לא נמצאה.' });
    }
    if (stats.participantFor(routine, userId)) {
      return res.json({ routine: serializeRoutine(routine, userId), alreadyMember: true });
    }
    const uid = new mongoose.Types.ObjectId(userId);
    const updated = await Routine.findOneAndUpdate(
      { _id: routine._id, 'participants.userId': { $ne: uid } },
      {
        $push: { participants: { userId: uid, startDate: todayFor(req), timeZone: userTimeZone(req) } },
        $inc: { participantCount: 1 }
      },
      { new: true }
    );
    res.json({ routine: serializeRoutine(updated || routine, userId, { doneStepIds: [] }) });
  } catch (err) {
    console.error('Join routine error:', err);
    res.status(500).json({ error: 'שגיאה בהצטרפות.' });
  }
});

/** POST /api/routines/:id/copy — { code? } make my own editable copy. */
router.post('/:id/copy', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const source = await findRoutine(req.params.id);
    const code = req.body && req.body.code;
    if (!source || (!source.isPublic && code !== source.shareCode && !stats.participantFor(source, userId))) {
      return res.status(404).json({ error: 'הרוטינה לא נמצאה.' });
    }
    const owned = await Routine.countDocuments({ ownerId: userId });
    if (owned >= MAX_ROUTINES_PER_USER) {
      return res.status(400).json({ error: 'הגעת למספר הרוטינות המרבי.' });
    }
    const routine = await Routine.create({
      title: source.title,
      description: source.description,
      emoji: source.emoji,
      color: source.color,
      steps: source.steps.map(s => ({ title: s.title, emoji: s.emoji })),
      days: source.days,
      timeOfDay: source.timeOfDay,
      kind: source.kind,
      challengeDays: source.challengeDays,
      restSeconds: source.restSeconds || 0,
      isPublic: false,
      ownerId: userId,
      shareCode: newShareCode(),
      participants: [{ userId, startDate: todayFor(req), timeZone: userTimeZone(req) }],
      participantCount: 1,
      copiedFrom: source._id
    });
    res.status(201).json({ routine: serializeRoutine(routine, userId, { doneStepIds: [] }) });
  } catch (err) {
    console.error('Copy routine error:', err);
    res.status(500).json({ error: 'שגיאה בהעתקת הרוטינה.' });
  }
});

/** GET /api/routines/:id/leaderboard — how everyone in a shared routine is doing. */
router.get('/:id/leaderboard', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const routine = await findRoutine(req.params.id);
    if (!routine || (!routine.isPublic && !stats.participantFor(routine, userId))) {
      return res.status(404).json({ error: 'הרוטינה לא נמצאה.' });
    }
    const participants = routine.participants.slice(0, 200);
    const ids = participants.map(p => p.userId);
    const earliest = stats.addDays(todayFor(req), -(LOOKBACK_DAYS));
    const [users, checkins] = await Promise.all([
      User.find({ _id: { $in: ids } }).select('displayName email photo').lean(),
      RoutineCheckin.find({ routineId: routine._id, userId: { $in: ids }, date: { $gte: earliest } }).lean()
    ]);
    const userMap = new Map(users.map(u => [String(u._id), u]));
    const byUser = new Map();
    for (const c of checkins) {
      const k = String(c.userId);
      if (!byUser.has(k)) byUser.set(k, []);
      byUser.get(k).push(c);
    }

    const rows = participants.map(p => {
      const uid = String(p.userId);
      const today = stats.dateKeyInZone(new Date(), p.timeZone || userTimeZone(req));
      const progress = stats.routineProgress(routine, uid, byUser.get(uid) || [], today, LOOKBACK_DAYS);
      const user = userMap.get(uid);
      return {
        name: firstName(user),
        photo: (user && user.photo) || '',
        isMe: uid === userId,
        isOwner: uid === String(routine.ownerId),
        todayDone: progress.todayDone,
        todayTotal: progress.todayTotal,
        completedDays: progress.completedDays,
        currentStreak: progress.currentStreak,
        rate: progress.rate,
        challenge: progress.challenge || null
      };
    });
    rows.sort((a, b) => b.completedDays - a.completedDays || b.currentStreak - a.currentStreak || b.todayDone - a.todayDone);
    res.json({ routine: serializeRoutine(routine, userId), participants: rows.slice(0, 100) });
  } catch (err) {
    console.error('Routine leaderboard error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הטבלה.' });
  }
});

module.exports = router;
