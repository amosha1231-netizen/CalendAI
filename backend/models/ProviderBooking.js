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
  guestEmail: { type: String, maxlength: 200 },
  guestPhone: { type: String, maxlength: 50 },
  guestNotes: { type: String, maxlength: 2000 },
  status: { type: String, enum: ['processing', 'confirmed', 'cancelled'], default: 'processing', index: true },
  confirmedAt: Date,
  googleEventId: String,
  // Mirrors `status !== 'cancelled'`, kept in sync below. MongoDB's
  // partialFilterExpression only supports equality-style operators
  // ($eq/$exists/$gt/$gte/$lt/$lte/$type/$and) — $ne is rejected at index
  // creation time — so the unique index below partials on this instead.
  activeSlot: { type: Boolean, default: true }
}, { timestamps: true });

providerBookingSchema.pre('save', function setActiveSlot(next) {
  this.activeSlot = this.status !== 'cancelled';
  next();
});

// Atomic double-booking guard: only one non-cancelled reservation may hold
// a given provider+date+startTime. A duplicate insert attempt fails with a
// Mongo E11000 error, which route handlers treat as "slot already taken".
// This only catches a collision at the exact same startTime — two services
// with different durations can produce overlapping slots at *different*
// startTimes, which this index does not see. providerRoutes.js' POST
// /:id/book does a secondary overlap re-check right after insert to narrow
// that gap (see the comment there); it is not a full fix (no transaction/lock).
providerBookingSchema.index(
  { providerId: 1, date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { activeSlot: true } }
);

module.exports = mongoose.models.ProviderBooking || mongoose.model('ProviderBooking', providerBookingSchema);
