const mongoose = require('mongoose');

const oauthHandoffSchema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.models.OAuthHandoff || mongoose.model('OAuthHandoff', oauthHandoffSchema);
