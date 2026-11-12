// ──────────────────────────────────────────────
// Task Status Routes — mark a calendar task done / postponed / not done for a day
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const TaskCheckin = require('../models/TaskCheckin');
const { isDateKey, isStatus, cleanKey, parseRange, summarize } = require('../services/taskStatusStats');

const JWT_SECRET = require('../config/jwtSecret');

/** User id from the JWT Bearer token or the session (same as routineRoutes). */
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
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  return String(userId);
}

function toItem(doc) {
  return { date: doc.date, key: doc.key, title: doc.title, startTime: doc.startTime, status: doc.status };
}

// GET /api/task-status?from=YYYY-MM-DD&to=YYYY-MM-DD → { items, summary }
router.get('/', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const range = parseRange(req.query.from, req.query.to);
  if (range.error) return res.status(400).json({ error: range.error });
  try {
    const docs = await TaskCheckin.find({ userId, date: { $gte: range.from, $lte: range.to } }).lean();
    const items = docs.map(toItem);
    res.json({ items, summary: summarize(items) });
  } catch (err) {
    console.error('[GET /api/task-status]', err.message);
    res.status(500).json({ error: 'Failed to load task statuses.' });
  }
});

// PUT /api/task-status { date, key, title, startTime, status } — status null/'' clears the mark.
router.put('/', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const body = req.body || {};
  const date = body.date;
  const key = cleanKey(body.key);
  if (!isDateKey(date) || !key) return res.status(400).json({ error: 'date and key are required.' });
  try {
    if (!body.status) {
      await TaskCheckin.deleteOne({ userId, date, key });
      return res.json({ ok: true, item: null });
    }
    if (!isStatus(body.status)) return res.status(400).json({ error: 'Invalid status.' });
    const doc = await TaskCheckin.findOneAndUpdate(
      { userId, date, key },
      {
        $set: {
          status: body.status,
          title: typeof body.title === 'string' ? body.title.slice(0, 200) : '',
          startTime: typeof body.startTime === 'string' ? body.startTime.slice(0, 20) : '',
          updatedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, item: toItem(doc) });
  } catch (err) {
    console.error('[PUT /api/task-status]', err.message);
    res.status(500).json({ error: 'Failed to save task status.' });
  }
});

module.exports = router;
