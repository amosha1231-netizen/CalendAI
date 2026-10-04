const mongoose = require('mongoose');

const processedPaymentEventSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  credits: { type: Number, required: true },
  processedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.ProcessedPaymentEvent || mongoose.model('ProcessedPaymentEvent', processedPaymentEventSchema);
