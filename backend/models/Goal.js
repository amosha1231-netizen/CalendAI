// ──────────────────────────────────────────────
// Goal Model — Public Goals & Challenges
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['joined', 'completed'], default: 'joined' },
  completedAt: { type: Date },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastCheckInDate: { type: String, default: null } // 'YYYY-MM-DD'
}, { _id: false });

const messageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  type: { type: String, enum: ['note', 'checkin', 'milestone', 'encouragement'], default: 'note' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const goalSchema = new mongoose.Schema({
  title: { type: String, required: true },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scheduleTime: { type: String }, // e.g., "05:00 AM" or "23:00"
  day: { type: String }, // Sunday, Monday, etc.
  isPublic: { type: Boolean, default: true },
  category: { type: String, default: 'general' }, // workout, study, work, sleep, general
  participants: [participantSchema],
  messages: [messageSchema], // text-only discussion messages
  createdAt: { type: Date, default: Date.now }
});

// Text index for keyword search
goalSchema.index({ title: 'text', category: 'text' });
// Index for fetching public goals sorted by newest
goalSchema.index({ isPublic: 1, createdAt: -1 });

const Goal = mongoose.models.Goal || mongoose.model('Goal', goalSchema);

module.exports = Goal;