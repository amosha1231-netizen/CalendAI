const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: { type: String, sparse: true },
  microsoftId: { type: String, sparse: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  displayName: { type: String },
  photo: { type: String },
  googleAccessToken: { type: String },
  googleRefreshToken: { type: String },
  microsoftAccessToken: { type: String },
  microsoftRefreshToken: { type: String },
  isPro: { type: Boolean, default: false },
  stripeCustomerId: { type: String },
  aiCredits: { type: Number, default: 100 }, // Freemium: 100 free AI credits for new users (token-based PAYG)
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
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
