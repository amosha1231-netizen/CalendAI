// ──────────────────────────────────────────────
// DailyLog Routes — Personal Journal CRUD
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const DailyLog = require('../models/DailyLog');

const JWT_SECRET = process.env.JWT_SECRET || 'calendai_secret';

/**
 * Extract user ID from JWT Bearer token or session.
 */
function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
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

/**
 * POST /api/daily-log
 * Create or update a daily log entry for a specific date.
 * Body: { date: "YYYY-MM-DD", notes: "...", mood: "...", tags: [...] }
 * If an entry for that user + date already exists, it updates it.
 * Also auto-pulls the user's scheduled events for that day.
 */
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי לרשום יומן.' });
    }

    const { date, notes, mood, tags } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'נדרש תאריך.' });
    }

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'פורמט תאריך לא תקין. השתמש ב-YYYY-MM-DD.' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'מזהה משתמש לא תקין.' });
    }

    // Auto-pull today's events from the user's schedule in MongoDB
    // We lookup the User document and get the schedule for the matching day
    const User = mongoose.model('User');
    const user = await User.findById(userId).lean();
    let dayEvents = [];

    if (user && user.schedule) {
      // Convert YYYY-MM-DD to day name (e.g., "Monday")
      const dateObj = new Date(date + 'T12:00:00');
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[dateObj.getDay()];

      // Get events for that day from the schedule
      const scheduleEvents = user.schedule[dayName] || [];
      dayEvents = scheduleEvents.map(ev => ({
        title: ev.title || '',
        startTime: ev.startTime || '',
        endTime: ev.endTime || '',
        eventType: ev.eventType || 'activity',
        location: ev.location || ''
      }));
    }

    // Upsert: create or update the daily log for this user + date
    const log = await DailyLog.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId), date },
      {
        $set: {
          notes: notes || '',
          mood: mood || '',
          tags: tags || [],
          dayEvents,
          updatedAt: new Date()
        },
        $setOnInsert: {
          userId: new mongoose.Types.ObjectId(userId),
          date,
          createdAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ ok: true, log });
  } catch (err) {
    console.error('Create/update daily log error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'נתוני היומן לא תקינים.' });
    }
    res.status(500).json({ error: 'שגיאה בשמירת היומן.' });
  }
});

/**
 * GET /api/daily-log/:date
 * Get a specific day's log entry.
 * Params: date = "YYYY-MM-DD"
 */
router.get('/:date', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר.' });
    }

    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'פורמט תאריך לא תקין.' });
    }

    const log = await DailyLog.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      date
    }).lean();

    if (!log) {
      return res.json({ ok: true, log: null });
    }

    res.json({ ok: true, log });
  } catch (err) {
    console.error('Get daily log error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת היומן.' });
  }
});

/**
 * GET /api/daily-log
 * List all logs for the authenticated user, sorted by date descending.
 * Query params:
 *   ?limit=30 (default) — number of entries to return
 *   ?page=1  (default)  — pagination
 */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר.' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const logs = await DailyLog.find({
      userId: new mongoose.Types.ObjectId(userId)
    })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await DailyLog.countDocuments({
      userId: new mongoose.Types.ObjectId(userId)
    });

    res.json({
      ok: true,
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('List daily logs error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת רשימת היומנים.' });
  }
});

/**
 * DELETE /api/daily-log/:date
 * Delete a specific day's log entry.
 */
router.delete('/:date', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר.' });
    }

    const { date } = req.params;
    const result = await DailyLog.findOneAndDelete({
      userId: new mongoose.Types.ObjectId(userId),
      date
    });

    if (!result) {
      return res.status(404).json({ error: 'היומן לא נמצא.' });
    }

    res.json({ ok: true, message: 'היומן נמחק בהצלחה.' });
  } catch (err) {
    console.error('Delete daily log error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת היומן.' });
  }
});

/**
 * GET /api/daily-log/search
 * Search logs by text in notes field.
 * Query: ?q=keyword
 */
router.get('/search', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר.' });
    }

    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({ ok: true, logs: [] });
    }

    const regex = new RegExp(q.trim(), 'i');
    const logs = await DailyLog.find({
      userId: new mongoose.Types.ObjectId(userId),
      $or: [
        { notes: { $regex: regex } },
        { tags: { $regex: regex } }
      ]
    })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    res.json({ ok: true, logs, count: logs.length });
  } catch (err) {
    console.error('Search daily logs error:', err);
    res.status(500).json({ error: 'שגיאה בחיפוש ביומנים.' });
  }
});

module.exports = router;