// ──────────────────────────────────────────────
// Event Model — Multi-Tenancy Isolated
// Every document is strictly bound to a userId.
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  day: { type: String, required: true }, // Sunday, Monday, ...
  startTime: { type: String },
  endTime: { type: String },
  recurrence: { type: String, default: 'once' },
  location: { type: String, default: 'jerusalem' },
  eventType: { type: String, default: 'activity' },
  duration: { type: Number, default: 60 },
  isSleep: { type: Boolean, default: false },
  isReminder: { type: Boolean, default: false },
  reminderMinutesBefore: { type: Number, default: 0 },
  targetDate: { type: Date },
  createdMonth: { type: Number },
  hasAdvice: { type: Boolean, default: false },
  aiAdvice: { type: String },
  guestName: { type: String },
  bookingId: { type: String },
  recurrenceEndType: { type: String, default: 'never' },
  recurrenceEndDate: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for efficient multi-tenant queries
eventSchema.index({ userId: 1, day: 1 });

// Use existing model if already compiled (prevents OverwriteModelError on hot reload)
const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);

module.exports = Event;