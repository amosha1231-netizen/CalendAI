// ──────────────────────────────────────────────
// Expected Expense Routes — Personal CRUD
// Lets a user track, edit, and resolve upcoming expenses
// (e.g. suggested after scheduling a wedding or trip).
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ExpectedExpense = require('../models/ExpectedExpense');

const JWT_SECRET = require('../config/jwtSecret');

const ALLOWED_CATEGORIES = ['wedding', 'bar_mitzvah', 'trip', 'birthday', 'gift', 'holiday', 'other'];
const ALLOWED_STATUSES = ['expected', 'paid', 'cancelled'];

/**
 * Extract user ID from JWT Bearer token or session.
 */
function getUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) return decoded.id;
    } catch (err) {
      return null;
    }
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    const fullUser = req.session?.passport?.user;
    const id = fullUser?._id || fullUser?.id;
    if (id) return id;
  }
  return null;
}

/**
 * GET /api/expenses/summary
 * Totals for the expected-expenses category screen.
 * Registered before /:id so "summary" is never read as an id.
 */
router.get('/summary', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי לראות הוצאות.' });
    }

    const expenses = await ExpectedExpense.find({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'expected'
    }).lean();

    const totalExpected = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const byCategory = {};
    for (const cat of ALLOWED_CATEGORIES) byCategory[cat] = 0;
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] || 0) + (e.amount || 0);
    }

    res.json({ ok: true, totalExpected, count: expenses.length, byCategory });
  } catch (err) {
    console.error('Expense summary error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת סיכום ההוצאות.' });
  }
});

/**
 * GET /api/expenses
 * List expected expenses for the authenticated user.
 * Query: ?status=expected|paid|cancelled (default: all)
 */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי לראות הוצאות.' });
    }

    const { status } = req.query;
    const filter = { userId: new mongoose.Types.ObjectId(userId) };
    if (status && ALLOWED_STATUSES.includes(status)) {
      filter.status = status;
    }

    const expenses = await ExpectedExpense.find(filter)
      .sort({ expectedDate: 1, createdAt: -1 })
      .lean();

    res.json({ ok: true, expenses, count: expenses.length });
  } catch (err) {
    console.error('List expected expenses error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת ההוצאות הצפויות.' });
  }
});

/**
 * POST /api/expenses
 * Create a new expected expense.
 * Body: { title, amount?, currency?, category?, expectedDate?, notes?, sourceEventTitle? }
 */
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי להוסיף הוצאה.' });
    }

    const { title, amount, currency, category, expectedDate, notes, sourceEventTitle } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'נדרשת כותרת להוצאה.' });
    }

    const expense = await ExpectedExpense.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: title.trim(),
      amount: (amount === '' || amount === undefined || amount === null) ? null : Number(amount),
      currency: currency || 'ILS',
      category: ALLOWED_CATEGORIES.includes(category) ? category : 'other',
      expectedDate: expectedDate || '',
      notes: notes || '',
      sourceEventTitle: sourceEventTitle || ''
    });

    res.status(201).json({ ok: true, expense });
  } catch (err) {
    console.error('Create expected expense error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'נתוני ההוצאה לא תקינים.' });
    }
    res.status(500).json({ error: 'שגיאה ביצירת ההוצאה.' });
  }
});

/**
 * PUT /api/expenses/:id
 * Update an expected expense (edit fields and/or change status, e.g. mark as paid).
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי לעדכן הוצאה.' });
    }

    const { title, amount, currency, category, expectedDate, notes, status } = req.body;
    const update = { updatedAt: new Date() };
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'נדרשת כותרת להוצאה.' });
      update.title = title.trim();
    }
    if (amount !== undefined) update.amount = (amount === '' || amount === null) ? null : Number(amount);
    if (currency !== undefined) update.currency = currency;
    if (category !== undefined) {
      if (!ALLOWED_CATEGORIES.includes(category)) return res.status(400).json({ error: 'קטגוריה לא תקינה.' });
      update.category = category;
    }
    if (expectedDate !== undefined) update.expectedDate = expectedDate;
    if (notes !== undefined) update.notes = notes;
    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) return res.status(400).json({ error: 'סטטוס לא תקין.' });
      update.status = status;
    }

    const expense = await ExpectedExpense.findOneAndUpdate(
      { _id: req.params.id, userId: new mongoose.Types.ObjectId(userId) },
      { $set: update },
      { new: true }
    );

    if (!expense) {
      return res.status(404).json({ error: 'ההוצאה לא נמצאה.' });
    }

    res.json({ ok: true, expense });
  } catch (err) {
    console.error('Update expected expense error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'נתוני ההוצאה לא תקינים.' });
    }
    res.status(500).json({ error: 'שגיאה בעדכון ההוצאה.' });
  }
});

/**
 * DELETE /api/expenses/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'עליך להתחבר כדי למחוק הוצאה.' });
    }

    const result = await ExpectedExpense.findOneAndDelete({
      _id: req.params.id,
      userId: new mongoose.Types.ObjectId(userId)
    });

    if (!result) {
      return res.status(404).json({ error: 'ההוצאה לא נמצאה.' });
    }

    res.json({ ok: true, message: 'ההוצאה נמחקה בהצלחה.' });
  } catch (err) {
    console.error('Delete expected expense error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת ההוצאה.' });
  }
});

module.exports = router;
