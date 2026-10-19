// ──────────────────────────────────────────────
// Reminder Model — one-off and recurring pings ("every day at 8: take a pill")
// Times are wall-clock times in the user's own IANA zone; nextFireAt is the
// precomputed instant the dispatcher looks for (see services/reminderSchedule).
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 200 },
  emoji: { type: String, default: '🔔' },
  time: { type: String, required: true }, // "HH:mm", 24h
  frequency: { type: String, enum: ['once', 'daily', 'weekly', 'monthly'], required: true },
  daysOfWeek: { type: [Number], default: [] }, // weekly: 0 = Sunday … 6 = Saturday
  dayOfMonth: { type: Number }, // monthly
  date: { type: String }, // once: YYYY-MM-DD in the user's zone
  timezone: { type: String, required: true },
  rrule: { type: String },
  skipShabbat: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  nextFireAt: { type: Date },
  lastFiredAt: { type: Date },
  source: { type: String, enum: ['ai', 'manual'], default: 'manual' },
  sourceText: { type: String, maxlength: 500 }
}, { timestamps: true });

reminderSchema.index({ active: 1, nextFireAt: 1 });

module.exports = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);
