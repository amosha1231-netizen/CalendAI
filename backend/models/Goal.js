// ──────────────────────────────────────────────
// Goal Model — Public Goals & Challenges
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['joined', 'completed'], default: 'joined' },
  completedAt: { type: Date }
}, { _id: false });

const goalSchema = new mongoose.Schema({
  title: { type: String, required: true },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scheduleTime: { type: String }, // e.g., "05:00 AM" or "23:00"
  day: { type: String }, // Sunday, Monday, etc.
  isPublic: { type: Boolean, default: true },
  category: { type: String, default: 'general' }, // workout, study, work, sleep, general
  participants: [participantSchema],
  createdAt: { type: Date, default: Date.now }
});

// Text index for keyword search
goalSchema.index({ title: 'text', category: 'text' });
// Index for fetching public goals sorted by newest
goalSchema.index({ isPublic: 1, createdAt: -1 });

const Goal = mongoose.models.Goal || mongoose.model('Goal', goalSchema);

module.exports = Goal;