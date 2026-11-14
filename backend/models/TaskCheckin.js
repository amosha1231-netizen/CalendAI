const mongoose = require('mongoose');

// How one calendar task went on one day: done, postponed or not done.
// Calendar events repeat by weekday, so the status belongs to (task, date),
// where `key` identifies the task inside that day (start time + title).
const taskCheckinSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD'
  key: { type: String, required: true },
  title: { type: String, default: '' },
  startTime: { type: String, default: '' },
  status: { type: String, enum: ['done', 'postponed', 'missed'], required: true },
  updatedAt: { type: Date, default: Date.now }
});

taskCheckinSchema.index({ userId: 1, date: 1, key: 1 }, { unique: true });

module.exports = mongoose.models.TaskCheckin || mongoose.model('TaskCheckin', taskCheckinSchema);
