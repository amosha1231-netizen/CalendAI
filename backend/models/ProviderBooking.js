// ──────────────────────────────────────────────
// ProviderBooking Model — Public Provider Directory Reservations
// Separate from the legacy single-use-link Booking.js (boot-critical,
// left untouched). Slots here are virtual (computed from the provider's
// weekly availability) until a reservation is created.
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const providerBookingSchema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  providerName: { type: String, default: 'Provider' },
  serviceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  serviceName: { type: String, required: true },
  duration: { type: Number, required: true, min: 5, max: 480 },
  price: { type: Number, default: 0 },
  date: { type: String, required: true }, // 'YYYY-MM-DD'
  day: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  bookedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  guestName: { type: String, required: true },
  guestEmail: String,
  guestPhone: String,
  guestNotes: String,
  status: { type: String, enum: ['processing', 'confirmed', 'cancelled'], default: 'processing', index: true },
  confirmedAt: Date
}, { timestamps: true });

// Atomic double-booking guard: only one non-cancelled reservation may hold
// a given provider+date+startTime. A duplicate insert attempt fails with a
// Mongo E11000 error, which route handlers treat as "slot already taken".
providerBookingSchema.index(
  { providerId: 1, date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'cancelled' } } }
);

module.exports = mongoose.models.ProviderBooking || mongoose.model('ProviderBooking', providerBookingSchema);
