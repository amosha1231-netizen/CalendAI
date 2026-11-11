const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const ProcessedPaymentEvent = require('../models/ProcessedPaymentEvent');
const { isRevenueCatSubscriptionEvent, revenueCatEventEffect, applyEntitlement } = require('../services/subscriptions');

/**
 * RevenueCat webhook: credits AI credits bought inside the iOS / Android app
 * (Apple / Google in-app purchase). The website keeps using Lemon Squeezy
 * (/api/payments/webhook); both add to the same User.aiCredits.
 *
 * Env:
 *   REVENUECAT_WEBHOOK_AUTH   the exact "Authorization header value" set in
 *                             RevenueCat > Integrations > Webhooks (required)
 *   IAP_PRODUCT_CREDITS       optional "productId=credits,..." map, e.g.
 *                             "calendai_credits_100=100". Without it, a number
 *                             in the product id is used, else 100.
 *   REVENUECAT_SANDBOX_CREDITS  "0" to ignore sandbox / TestFlight purchases.
 *                             On by default so App Review's test purchase works.
 *
 * Events handled:
 *   NON_RENEWING_PURCHASE  consumable credit pack bought  -> add credits
 *   CANCELLATION           store refunded that purchase   -> take them back (not below 0)
 *   Pro subscription events (they carry expiration_at_ms): INITIAL_PURCHASE,
 *   RENEWAL, CANCELLATION, EXPIRATION, ... -> services/subscriptions.js
 *   (Pro on/off and the monthly credit allowance).
 * Everything else is acknowledged and ignored.
 */

const DEFAULT_PACK_CREDITS = 100;

function authOk(req) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH?.trim();
  if (!expected) return { ok: false, status: 500, error: 'Webhook auth not configured' };
  const received = String(req.headers.authorization || '').trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: 'Invalid authorization' };
  }
  return { ok: true };
}

function creditsForProduct(productId) {
  const map = String(process.env.IAP_PRODUCT_CREDITS || '');
  for (const part of map.split(',')) {
    const [id, n] = part.split('=').map((x) => (x || '').trim());
    if (id && id === productId && Number(n) > 0) return Number(n);
  }
  const m = String(productId || '').match(/(\d+)/);
  if (m && Number(m[1]) > 0 && Number(m[1]) <= 100000) return Number(m[1]);
  return DEFAULT_PACK_CREDITS;
}

async function findUser(event) {
  const ids = [event.app_user_id, event.original_app_user_id, ...(Array.isArray(event.aliases) ? event.aliases : [])];
  for (const id of ids) {
    if (id && mongoose.Types.ObjectId.isValid(String(id))) {
      const user = await User.findById(String(id)).select('_id').lean();
      if (user) return user;
    }
  }
  return null;
}

async function applyCredits({ eventKey, orderId, userId, delta }) {
  const dbSession = await mongoose.startSession();
  try {
    await ProcessedPaymentEvent.init();
    await dbSession.withTransaction(async () => {
      await ProcessedPaymentEvent.create([{ eventKey, orderId, userId, credits: delta }], { session: dbSession });
      const update = delta >= 0
        ? { $inc: { aiCredits: delta } }
        // Refund: take the pack back, but never below zero.
        : [{ $set: { aiCredits: { $max: [0, { $add: [{ $ifNull: ['$aiCredits', 0] }, delta] }] } } }];
      const updated = await User.findByIdAndUpdate(userId, update, { new: true, session: dbSession });
      if (!updated) throw new Error('Payment user disappeared during crediting.');
    });
    return { duplicate: false };
  } catch (err) {
    if (err?.code === 11000) return { duplicate: true };
    throw err;
  } finally {
    await dbSession.endSession();
  }
}

router.post('/', async (req, res) => {
  const auth = authOk(req);
  if (!auth.ok) {
    if (auth.status === 500) console.error('RevenueCat webhook: REVENUECAT_WEBHOOK_AUTH is not configured.');
    return res.status(auth.status).json({ error: auth.error });
  }

  const event = req.body?.event;
  if (!event || typeof event !== 'object') return res.status(400).json({ error: 'Missing event.' });

  const type = event.type;
  if (event.environment === 'SANDBOX' && process.env.REVENUECAT_SANDBOX_CREDITS === '0') {
    return res.status(200).json({ received: true, ignored: 'sandbox' });
  }

  if (isRevenueCatSubscriptionEvent(event)) {
    const effect = revenueCatEventEffect(event);
    if (effect.kind === 'ignore') return res.status(200).json({ received: true, ignored: type || 'unknown' });
    try {
      const user = await findUser(event);
      if (!user) {
        console.warn(`RevenueCat webhook: no user for app_user_id ${event.app_user_id}`);
        return res.status(404).json({ error: 'User not found.' });
      }
      const result = await applyEntitlement({ User, ProcessedPaymentEvent, user, effect });
      console.log(`✅ RevenueCat Pro ${type} (${event.store || 'store'}${event.environment === 'SANDBOX' ? ', sandbox' : ''}) for user ${user._id}${result.duplicate ? ' (duplicate)' : ''}.`);
      return res.status(200).json({ received: true, duplicate: !!result.duplicate });
    } catch (err) {
      console.error('RevenueCat subscription webhook failed:', err.message);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  if (type !== 'NON_RENEWING_PURCHASE' && type !== 'CANCELLATION') {
    return res.status(200).json({ received: true, ignored: type || 'unknown' });
  }

  const transactionId = event.transaction_id || event.original_transaction_id;
  if (!transactionId) return res.status(400).json({ error: 'Missing transaction id.' });

  try {
    const user = await findUser(event);
    if (!user) {
      // 404 makes RevenueCat retry later, e.g. if the account is created a moment after.
      console.warn(`RevenueCat webhook: no user for app_user_id ${event.app_user_id}`);
      return res.status(404).json({ error: 'User not found.' });
    }

    const credits = creditsForProduct(event.product_id);
    if (type === 'CANCELLATION') {
      // Only take back credits that this webhook actually gave for that transaction.
      const original = await ProcessedPaymentEvent.findOne({ eventKey: `revenuecat:${transactionId}` }).lean();
      if (!original) return res.status(200).json({ received: true, ignored: 'no matching purchase' });
      const result = await applyCredits({
        eventKey: `revenuecat-refund:${transactionId}`,
        orderId: String(transactionId),
        userId: user._id,
        delta: -Math.abs(original.credits || credits)
      });
      console.log(`↩️ RevenueCat refund for user ${user._id}, transaction ${transactionId}${result.duplicate ? ' (duplicate)' : ''}.`);
      return res.status(200).json({ received: true, duplicate: result.duplicate });
    }

    const result = await applyCredits({
      eventKey: `revenuecat:${transactionId}`,
      orderId: String(transactionId),
      userId: user._id,
      delta: credits
    });
    console.log(`✅ RevenueCat (${event.store || 'store'}${event.environment === 'SANDBOX' ? ', sandbox' : ''}): +${credits} credits for user ${user._id}, transaction ${transactionId}${result.duplicate ? ' (duplicate)' : ''}.`);
    return res.status(200).json({ received: true, duplicate: result.duplicate });
  } catch (err) {
    console.error('RevenueCat webhook processing failed:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
module.exports._test = { creditsForProduct, authOk };
