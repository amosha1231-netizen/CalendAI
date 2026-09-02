// ──────────────────────────────────────────────
// Goal Routes — Public Goals & Challenges
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Goal = require('../models/Goal');

const JWT_SECRET = process.env.JWT_SECRET || 'calendai-jwt-secret-change-in-production';

/**
 * Extract user ID from JWT Bearer token or session.
 * Returns null if not authenticated.
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
 * POST /api/goals/create
 * Create a new public goal/challenge.
 * Body: { title, scheduleTime, day, category }
 */
router.post('/create', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי ליצור אתגר.' });
    }

    const { title, scheduleTime, day, category } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'נדרשת כותרת לאתגר.' });
    }

    const goal = await Goal.create({
      title: title.trim(),
      creatorId: new mongoose.Types.ObjectId(userId),
      scheduleTime: scheduleTime || '',
      day: day || '',
      category: category || 'general',
      participants: [{
        userId: new mongoose.Types.ObjectId(userId),
        status: 'joined',
        completedAt: null
      }]
    });

    res.status(201).json({ ok: true, goal });
  } catch (err) {
    console.error('Create goal error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת האתגר.' });
  }
});

/**
 * GET /api/goals/search
 * Search public goals by keyword.
 * Query: ?q=keyword&category=workout
 */
router.get('/search', async (req, res) => {
  try {
    const { q, category } = req.query;
    const filter = { isPublic: true };

    // Text search on title
    if (q && q.trim()) {
      filter.$text = { $search: q.trim() };
    }

    // Category filter
    if (category && category !== 'all') {
      filter.category = category;
    }

    const goals = await Goal.find(filter)
      .populate('creatorId', 'displayName photo email')
      .populate('participants.userId', 'displayName photo')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Format participants count
    const formatted = goals.map(g => ({
      ...g,
      participantCount: g.participants?.length || 0,
      completedCount: g.participants?.filter(p => p.status === 'completed').length || 0
    }));

    res.json({ goals: formatted, count: formatted.length });
  } catch (err) {
    console.error('Search goals error:', err);
    // Fallback: if text search fails (e.g., no text index), do a regex search
    try {
      const { q, category } = req.query;
      const filter = { isPublic: true };
      if (q && q.trim()) {
        filter.title = { $regex: q.trim(), $options: 'i' };
      }
      if (category && category !== 'all') {
        filter.category = category;
      }
      const goals = await Goal.find(filter)
        .populate('creatorId', 'displayName photo email')
        .populate('participants.userId', 'displayName photo')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      const formatted = goals.map(g => ({
        ...g,
        participantCount: g.participants?.length || 0,
        completedCount: g.participants?.filter(p => p.status === 'completed').length || 0
      }));
      res.json({ goals: formatted, count: formatted.length });
    } catch (fallbackErr) {
      console.error('Search goals fallback error:', fallbackErr);
      res.status(500).json({ error: 'שגיאה בחיפוש אתגרים.' });
    }
  }
});

/**
 * GET /api/goals/active
 * Get all active public goals (no search query, just browse).
 */
router.get('/active', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isPublic: true };
    if (category && category !== 'all') {
      filter.category = category;
    }

    const goals = await Goal.find(filter)
      .populate('creatorId', 'displayName photo email')
      .populate('participants.userId', 'displayName photo')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const formatted = goals.map(g => ({
      ...g,
      participantCount: g.participants?.length || 0,
      completedCount: g.participants?.filter(p => p.status === 'completed').length || 0
    }));

    res.json({ goals: formatted, count: formatted.length });
  } catch (err) {
    console.error('Active goals error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת אתגרים.' });
  }
});

/**
 * POST /api/goals/:id/join
 * Join a public goal. Adds the event slot to the user's calendar schedule
 * in a designated color/profile (green for challenges).
 */
router.post('/:id/join', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי להצטרף לאתגר.' });
    }

    const goal = await Goal.findById(req.params.id);
    if (!goal) {
      return res.status(404).json({ error: 'האתגר לא נמצא.' });
    }

    // Check if user already joined
    const alreadyJoined = goal.participants.some(
      p => p.userId.toString() === userId
    );
    if (alreadyJoined) {
      return res.status(409).json({ error: 'כבר הצטרפת לאתגר זה.', goal });
    }

    // Add participant
    goal.participants.push({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'joined',
      completedAt: null
    });
    await goal.save();

    // ── Add the challenge event to the user's schedule (green-tagged) ──
    // Load the user's schedule from the file-based store or MongoDB
    // We access the schedule via the req.app's getUserSchedule function
    const getUserSchedule = req.app.get('getUserSchedule');
    const saveSchedulesNow = req.app.get('saveSchedulesNow');
    const saveScheduleToMongo = req.app.get('saveScheduleToMongo');
    const syncTodayWithCurrentDay = req.app.get('syncTodayWithCurrentDay');

    if (getUserSchedule && goal.scheduleTime && goal.day) {
      const schedule = getUserSchedule(userId);
      if (!schedule[goal.day]) {
        schedule[goal.day] = [];
      }

      // Calculate end time (default 1 hour)
      const startMatch = goal.scheduleTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      let endTime = '';
      if (startMatch) {
        let sh = parseInt(startMatch[1], 10);
        const sm = parseInt(startMatch[2], 10);
        if (startMatch[3].toUpperCase() === 'PM' && sh !== 12) sh += 12;
        if (startMatch[3].toUpperCase() === 'AM' && sh === 12) sh = 0;
        const totalStart = sh * 60 + sm;
        const totalEnd = (totalStart + 60) % 1440;
        const eh = Math.floor(totalEnd / 60);
        const em = totalEnd % 60;
        const eAmpm = eh >= 12 ? 'PM' : 'AM';
        const eDisplayH = eh > 12 ? eh - 12 : (eh === 0 ? 12 : eh);
        endTime = `${String(eDisplayH).padStart(2, '0')}:${String(em).padStart(2, '0')} ${eAmpm}`;
      }

      const challengeEvent = {
        title: `🏆 ${goal.title}`,
        day: goal.day,
        startTime: goal.scheduleTime,
        endTime: endTime || '',
        recurrence: 'weekly',
        location: 'jerusalem',
        eventType: 'activity',
        isChallenge: true,
        challengeGoalId: goal._id.toString(),
        challengeCreatorId: goal.creatorId.toString()
      };

      schedule[goal.day].push(challengeEvent);

      if (syncTodayWithCurrentDay) {
        syncTodayWithCurrentDay(schedule);
      }
      if (saveSchedulesNow) {
        saveSchedulesNow();
      }
      if (saveScheduleToMongo && mongoose.Types.ObjectId.isValid(userId)) {
        await saveScheduleToMongo(userId, schedule);
      }
    }

    const populated = await Goal.findById(goal._id)
      .populate('creatorId', 'displayName photo email')
      .populate('participants.userId', 'displayName photo')
      .lean();

    const result = {
      ...populated,
      participantCount: populated.participants?.length || 0,
      completedCount: populated.participants?.filter(p => p.status === 'completed').length || 0
    };

    res.json({ ok: true, goal: result, message: 'הצטרפת לאתגר בהצלחה! 🎉' });
  } catch (err) {
    console.error('Join goal error:', err);
    res.status(500).json({ error: 'שגיאה בהצטרפות לאתגר.' });
  }
});

/**
 * POST /api/goals/:id/toggle-completion
 * Toggle check-in/completion status for a goal.
 */
router.post('/:id/toggle-completion', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי לעדכן סטטוס.' });
    }

    const goal = await Goal.findById(req.params.id);
    if (!goal) {
      return res.status(404).json({ error: 'האתגר לא נמצא.' });
    }

    const participant = goal.participants.find(
      p => p.userId.toString() === userId
    );
    if (!participant) {
      return res.status(400).json({ error: 'אינך משתתף באתגר זה.' });
    }

    // Toggle status
    if (participant.status === 'completed') {
      participant.status = 'joined';
      participant.completedAt = null;
    } else {
      participant.status = 'completed';
      participant.completedAt = new Date();
    }

    await goal.save();

    const populated = await Goal.findById(goal._id)
      .populate('creatorId', 'displayName photo email')
      .populate('participants.userId', 'displayName photo')
      .lean();

    const result = {
      ...populated,
      participantCount: populated.participants?.length || 0,
      completedCount: populated.participants?.filter(p => p.status === 'completed').length || 0
    };

    res.json({
      ok: true,
      goal: result,
      newStatus: participant.status,
      message: participant.status === 'completed'
        ? 'כל הכבוד! סימנת כבוצע ✅'
        : 'הסטטוס שוחזר.'
    });
  } catch (err) {
    console.error('Toggle completion error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון סטטוס.' });
  }
});

/**
 * GET /api/goals/my
 * Get goals the current user has joined.
 */
router.get('/my', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר.' });
    }

    const goals = await Goal.find({
      'participants.userId': new mongoose.Types.ObjectId(userId)
    })
      .populate('creatorId', 'displayName photo email')
      .populate('participants.userId', 'displayName photo')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = goals.map(g => ({
      ...g,
      participantCount: g.participants?.length || 0,
      completedCount: g.participants?.filter(p => p.status === 'completed').length || 0,
      myStatus: g.participants?.find(p => p.userId._id.toString() === userId)?.status || 'joined'
    }));

    res.json({ goals: formatted, count: formatted.length });
  } catch (err) {
    console.error('My goals error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת האתגרים שלי.' });
  }
});

module.exports = router;