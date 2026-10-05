const mongoose = require('mongoose');

const mutualBookingSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  inviteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  inviteeEmail: { type: String, required: true },
  subject: { type: String, default: 'Meeting' },
  duration: { type: Number, required: true, min: 1, max: 1440 },
  locationId: { type: String, default: 'jerusalem' },
  status: { type: String, enum: ['active', 'processing', 'completed', 'cancelled'], default: 'active', index: true },
  lockedSlot: {
    date: String,
    startTime: String,
    endTime: String,
    timeZone: String
  },
  hostEventId: String,
  inviteeEventId: String,
  confirmedAt: Date
}, { timestamps: true });

module.exports = mongoose.models.MutualBooking || mongoose.model('MutualBooking', mutualBookingSchema);
