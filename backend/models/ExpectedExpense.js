// ──────────────────────────────────────────────
// ExpectedExpense Model — Upcoming / Planned Expenses
// Tracks costs the user expects from life events (weddings, trips, etc.)
// so they can be reviewed, edited, and marked paid later.
// ──────────────────────────────────────────────
const mongoose = require('mongoose');

const expectedExpenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  amount: { type: Number, default: null },
  currency: { type: String, default: 'ILS' },
  category: {
    type: String,
    enum: ['wedding', 'bar_mitzvah', 'trip', 'birthday', 'gift', 'holiday', 'other'],
    default: 'other'
  },
  expectedDate: { type: String, default: '' }, // 'YYYY-MM-DD', optional/unknown
  status: { type: String, enum: ['expected', 'paid', 'cancelled'], default: 'expected' },
  notes: { type: String, default: '' },
  sourceEventTitle: { type: String, default: '' }, // the calendar event title that suggested this expense, if any
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

expectedExpenseSchema.index({ userId: 1, status: 1, expectedDate: 1 });

const ExpectedExpense = mongoose.models.ExpectedExpense || mongoose.model('ExpectedExpense', expectedExpenseSchema);

module.exports = ExpectedExpense;
