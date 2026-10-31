const mongoose = require('mongoose');

// A routine (e.g. "Morning routine": brush teeth, workout, ...) or a
// challenge (a routine with a fixed number of days). Public ones can be
// found and joined by others; any one can be shared by its link code.
const stepSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 80 },
  emoji: { type: String, default: '', maxlength: 16 }
});

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  joinedAt: { type: Date, default: Date.now },
  startDate: { type: String, required: true }, // 'YYYY-MM-DD' in the participant's zone
  timeZone: { type: String, default: '' } // their zone, for "today" on the leaderboard
}, { _id: false });

const routineSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', trim: true, maxlength: 300 },
  emoji: { type: String, default: '✨', maxlength: 16 },
  color: { type: String, default: 'indigo', maxlength: 20 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  steps: { type: [stepSchema], default: [] },
  days: { type: [Number], default: [] }, // 0 = Sunday … 6 = Saturday; empty = every day
  timeOfDay: { type: String, enum: ['morning', 'afternoon', 'evening', 'any'], default: 'any' },
  kind: { type: String, enum: ['routine', 'challenge'], default: 'routine' },
  challengeDays: { type: Number, min: 1, max: 365, default: null },
  restSeconds: { type: Number, min: 0, max: 600, default: 0 }, // rest timer per tap; 0 = off
  isPublic: { type: Boolean, default: false, index: true },
  shareCode: { type: String, required: true, unique: true },
  participants: { type: [participantSchema], default: [] }, // includes the owner
  participantCount: { type: Number, default: 1 },
  copiedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Routine', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

routineSchema.index({ 'participants.userId': 1 });
routineSchema.index({ isPublic: 1, participantCount: -1 });

module.exports = mongoose.models.Routine || mongoose.model('Routine', routineSchema);
