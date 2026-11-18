const mongoose = require('mongoose');

const bookingSlotSchema = new mongoose.Schema({
  hour: { type: Number, required: true, min: 0, max: 23 },
  minute: { type: Number, required: true, min: 0, max: 59 },
  // Per-slot date (YYYY-MM-DD) so one link can offer times on several days.
  // Older links leave it empty and use the booking-level `date`/`day`.
  date: String,
  booked: { type: Boolean, default: false },
  bookedBy: String,
  bookedByEmail: String,
  bookedByPhone: String,
  bookedByNotes: String,
  bookedAt: Date
}, { _id: false });

// Group links: each friend marks every offered time that works for them.
const bookingResponseSchema = new mongoose.Schema({
  key: { type: String, required: true },
  name: { type: String, required: true },
  email: String,
  phone: String,
  slotIndexes: { type: [Number], default: [] },
  at: { type: Date, default: Date.now }
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
  hostTimezone: String,
  slots: { type: [bookingSlotSchema], default: [] },
  // Who the host sent the link to (optional): an email or a phone number.
  inviteeContact: String,
  inviteeContactType: { type: String, enum: ['email', 'phone', null], default: null },
  // How many friends (besides the host) the meeting is for. Above 1, the
  // link collects everyone's times and books the one that suits all of them.
  groupSize: { type: Number, default: 1, min: 1, max: 20 },
  responses: { type: [bookingResponseSchema], default: [] },
  status: { type: String, enum: ['active', 'processing', 'completed'], default: 'active', index: true },
  confirmedBy: String,
  confirmedAt: Date
}, { timestamps: true });

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
