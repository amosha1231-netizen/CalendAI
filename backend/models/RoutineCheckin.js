const mongoose = require('mongoose');

// One user's ticks on one routine for one day (the day in the user's zone).
const routineCheckinSchema = new mongoose.Schema({
  routineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Routine', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD'
  doneStepIds: { type: [String], default: [] },
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});

routineCheckinSchema.index({ routineId: 1, userId: 1, date: 1 }, { unique: true });
routineCheckinSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.models.RoutineCheckin || mongoose.model('RoutineCheckin', routineCheckinSchema);
