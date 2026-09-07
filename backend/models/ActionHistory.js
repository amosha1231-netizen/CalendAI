// ──────────────────────────────────────────────
// ActionHistory Model — Logs user actions & requests
// Linked to userId, stores prompt text and created event IDs.
// Supports undo: events can be marked undone with an undo timestamp.
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const actionHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  promptText: { type: String, required: true },
  createdEventIds: [{ type: String }], // Array of Google Calendar event IDs or internal event identifiers
  actionType: { type: String, enum: ['parse', 'quick-add', 'manual-add', 'reschedule'], default: 'parse' },
  undoneAt: { type: Date, default: null }, // If set, this action was undone
  undoNote: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

// Index for efficient queries: sort by newest first per user
actionHistorySchema.index({ userId: 1, createdAt: -1 });

const ActionHistory = mongoose.models.ActionHistory || mongoose.model('ActionHistory', actionHistorySchema);

module.exports = ActionHistory;