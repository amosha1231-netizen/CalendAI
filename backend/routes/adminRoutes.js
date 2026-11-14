// ──────────────────────────────────────────────
// Owner-only: what the owner's own AI requests cost
// ──────────────────────────────────────────────
// GET /api/admin/my-ai-costs
//
// Only accounts in OWNER_EMAILS (Google-linked, see services/ownerCredits.js)
// get an answer; everyone else gets a plain 404, as if the route did not exist.
// It returns ONLY the signed-in owner's own ledger. Request text is stored only
// for owner accounts (deductAICredit), so other users' requests are never
// stored, let alone shown here.
// ──────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = require('../config/jwtSecret');
const User = require('../models/User');
const { isOwnerAccount } = require('../services/ownerCredits');

const MAX_ROWS = 200;

function getAuthenticatedUserId(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      if (decoded && (decoded.id || decoded._id)) return decoded.id || decoded._id;
    } catch (err) {
      // fall through to the session
    }
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    const sessionUser = req.session?.passport?.user;
    const id = sessionUser?._id || sessionUser?.id;
    if (id) return id;
  }
  return null;
}

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

router.get('/my-ai-costs', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const notFound = () => res.status(404).json({ error: 'Not found' });
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return notFound();
    const user = await User.findById(userId).select('email googleId aiCreditsLedger').lean();
    if (!isOwnerAccount(user)) return notFound();

    const ledger = Array.isArray(user.aiCreditsLedger) ? user.aiCreditsLedger : [];
    const totals = { count: 0, realCostUSD: 0, estimatedCostUSD: 0, chargedUSD: 0, credits: 0, tokens: 0 };
    for (const e of ledger) {
      totals.count += 1;
      totals.realCostUSD += num(e.providerCostUSD ?? e.rawCostUSD);
      totals.estimatedCostUSD += num(e.rawCostUSD);
      totals.chargedUSD += num(e.costUSD);
      totals.credits += num(e.costCredits);
      totals.tokens += num(e.totalTokens);
    }

    const requests = ledger.slice(0, MAX_ROWS).map(e => ({
      timestamp: e.timestamp,
      action: e.action,
      requestText: typeof e.requestText === 'string' ? e.requestText : null,
      modelName: e.modelName,
      promptTokens: num(e.promptTokens),
      completionTokens: num(e.completionTokens),
      totalTokens: num(e.totalTokens),
      // OpenRouter's real charge when it reported one, otherwise our token-based estimate.
      realCostUSD: Number.isFinite(e.providerCostUSD) ? e.providerCostUSD : num(e.rawCostUSD),
      realCostIsExact: Number.isFinite(e.providerCostUSD),
      chargedUSD: num(e.costUSD),
      credits: num(e.costCredits)
    }));

    res.json({ totals, requests });
  } catch (err) {
    console.error('[admin] my-ai-costs failed:', err.message);
    res.status(500).json({ error: 'Failed to load costs' });
  }
});

module.exports = router;
