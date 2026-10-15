// ──────────────────────────────────────────────
// PushSubscription Model — a browser's Web Push endpoint for a user
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  userAgent: { type: String, maxlength: 300 },
  lastSuccessAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);
