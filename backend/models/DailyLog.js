// ──────────────────────────────────────────────
// DailyLog Model — Personal Journal Entries
// Each document is a single day's journal entry for a user.
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const dailyLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true }, // YYYY-MM-DD format
  notes: { type: String, default: '' },   // Free-text journal entry
  mood: { type: String, default: '' },    // Optional mood emoji or label
  tags: [{ type: String }],               // e.g. ["work", "gym", "family"]
  dayEvents: [{                           // Snapshot of scheduled events for this day
    title: String,
    startTime: String,
    endTime: String,
    eventType: String,
    location: String
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index: one entry per user per date
dailyLogSchema.index({ userId: 1, date: 1 }, { unique: true });

// Pre-save hook to auto-update updatedAt
dailyLogSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const DailyLog = mongoose.models.DailyLog || mongoose.model('DailyLog', dailyLogSchema);

module.exports = DailyLog;