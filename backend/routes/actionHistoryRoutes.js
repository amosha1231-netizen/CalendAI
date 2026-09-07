// ──────────────────────────────────────────────
// Action History Routes — GET history, undo actions
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const ActionHistory = require('../models/ActionHistory');

// ── Deps needed for undo (Google Calendar delete) ──
const mongoose = require('mongoose');
const { google } = require('googleapis');

// ── JWT verification (same logic as server.js) ──
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'calendai-jwt-secret-change-in-production';

/**
 * Helper: Extract authenticated user ID from request.
 * Supports JWT Bearer token and session-based auth.
 */
function getAuthUserId(req) {
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
 * GET /api/action-history
 * Returns the user's action history, sorted newest first.
 * Supports optional ?search=query to filter by prompt text.
 */
router.get('/', async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const { search } = req.query;
    const filter = { userId: new mongoose.Types.ObjectId(userId) };

    if (search && search.trim()) {
      // Case-insensitive search on promptText
      filter.promptText = { $regex: search.trim(), $options: 'i' };
    }

    const history = await ActionHistory.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ history });
  } catch (error) {
    console.error('Failed to fetch action history:', error);
    res.status(500).json({ error: 'Failed to fetch action history.' });
  }
});

/**
 * Helper: Delete a Google Calendar event by its event ID
 */
async function deleteGoogleCalendarEvent(userId, googleEventId) {
  try {
    const User = mongoose.model('User');
    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
      return { success: false, error: 'No Google token' };
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID?.trim(),
      process.env.GOOGLE_CLIENT_SECRET?.trim()
    );
    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken || undefined
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to delete Google Calendar event:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * POST /api/action-history/:id/undo
 * Undoes a history action by deleting created events from Google Calendar
 * and marking the history entry as undone.
 * Body: { restoreSchedule: boolean (optional) }
 */
router.post('/:id/undo', async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid ID.' });
    }

    const historyEntry = await ActionHistory.findOne({
      _id: req.params.id,
      userId: new mongoose.Types.ObjectId(userId)
    });

    if (!historyEntry) {
      return res.status(404).json({ error: 'History entry not found.' });
    }

    if (historyEntry.undoneAt) {
      return res.status(400).json({ error: 'This action has already been undone.' });
    }

    // Delete events from Google Calendar
    const deleteResults = [];
    if (historyEntry.createdEventIds && historyEntry.createdEventIds.length > 0) {
      for (const eventId of historyEntry.createdEventIds) {
        const result = await deleteGoogleCalendarEvent(userId, eventId);
        deleteResults.push({ eventId, success: result.success, error: result.error });
      }
    }

    // Mark as undone
    historyEntry.undoneAt = new Date();
    historyEntry.undoNote = `Undone via API. Deleted ${deleteResults.filter(r => r.success).length}/${deleteResults.length} events.`;
    await historyEntry.save();

    res.json({
      success: true,
      message: `Undid action. Deleted ${deleteResults.filter(r => r.success).length} events from calendar.`,
      deleteResults
    });
  } catch (error) {
    console.error('Failed to undo action:', error);
    res.status(500).json({ error: 'Failed to undo action.' });
  }
});

module.exports = router;