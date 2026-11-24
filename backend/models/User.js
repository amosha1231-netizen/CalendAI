const mongoose = require('mongoose');
const pricing = require('../config/pricing');

const providerServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  duration: { type: Number, required: true, min: 5, max: 480 }, // minutes
  price: { type: Number, default: 0, min: 0 },
  color: { type: String, default: '#6366f1' },
  active: { type: Boolean, default: true }
});

const providerAvailabilitySchema = new mongoose.Schema({
  day: { type: String, required: true, enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
  startTime: { type: String, required: true }, // e.g. "09:00 AM"
  endTime: { type: String, required: true }
}, { _id: false });

const userSchema = new mongoose.Schema({
  googleId: { type: String, sparse: true },
  microsoftId: { type: String, sparse: true },
  appleId: { type: String, index: { unique: true, sparse: true } }, // Sign in with Apple `sub`
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  displayName: { type: String },
  photo: { type: String },
  googleAccessToken: { type: String },
  googleRefreshToken: { type: String },
  microsoftAccessToken: { type: String },
  microsoftRefreshToken: { type: String },
  isPro: { type: Boolean, default: false }, // mirror of proExpiresAt > now; read through isProActive()
  proExpiresAt: { type: Date }, // Pro is active until this time (see services/subscriptions.js)
  proSource: { type: String }, // 'lemonsqueezy' | 'app_store' | 'play_store'
  lemonSubscriptionId: { type: String, index: true, sparse: true },
  lemonCustomerPortalUrl: { type: String },
  stripeCustomerId: { type: String },
  aiCredits: { type: Number, default: () => pricing.signupPoints }, // Signup gift (config/pricing.js); token-based PAYG
  aiCreditsLedger: { type: Array, default: [] }, // Array of { timestamp, action, promptTokens, completionTokens, totalTokens, costCredits, rawCostUSD, costUSD, modelName }
  schedule: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      Sunday: [],
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Today: []
    }
  },
  scheduleRevision: { type: Number, default: 0 },
  providerProfile: {
    enabled: { type: Boolean, default: false },
    businessName: { type: String, default: '' },
    bio: { type: String, default: '' },
    category: { type: String, default: 'general' },
    locationId: { type: String, default: 'jerusalem' },
    services: { type: [providerServiceSchema], default: [] },
    availability: { type: [providerAvailabilitySchema], default: [] }
  },
  siriKeyHash: { type: String, index: { unique: true, sparse: true } }, // SHA-256 of the personal Siri/Shortcuts key
  siriKeyCreatedAt: { type: Date },
  // Evening digest: a push the evening before with tomorrow's schedule (services/eveningDigest).
  eveningDigest: {
    enabled: { type: Boolean, default: false },
    time: { type: String, default: '21:00' }, // "HH:mm" in `timezone`
    timezone: { type: String },
    lang: { type: String, default: 'he' },
    nextFireAt: { type: Date },
    lastSentAt: { type: Date }
  },
  createdAt: { type: Date, default: Date.now }
});

// Index for the public provider directory browse/search queries.
userSchema.index({ 'providerProfile.enabled': 1, 'providerProfile.category': 1 });
userSchema.index({ 'eveningDigest.enabled': 1, 'eveningDigest.nextFireAt': 1 }, { sparse: true });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
