const mongoose = require('mongoose');

const bookingSlotSchema = new mongoose.Schema({
  hour: { type: Number, required: true, min: 0, max: 23 },
  minute: { type: Number, required: true, min: 0, max: 59 },
  booked: { type: Boolean, default: false },
  bookedBy: String,
  bookedByEmail: String,
  bookedByPhone: String,
  bookedByNotes: String,
  bookedAt: Date
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true, index: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  hostName: { type: String, default: 'Host' },
  subject: { type: String, default: 'Meeting' },
  meetingType: String,
  duration: { type: Number, required: true, min: 1, max: 1440 },
  day: { type: String, required: true },
  date: String,
  isLocked: { type: Boolean, default: false },
  startTime: String,
  endTime: String,
  guestTimezone: String,
  locationId: { type: String, default: 'jerusalem' },
  slots: { type: [bookingSlotSchema], default: [] },
  status: { type: String, enum: ['active', 'processing', 'completed'], default: 'active', index: true },
  confirmedBy: String,
  confirmedAt: Date
}, { timestamps: true });

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
