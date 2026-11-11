const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const mongoose = require('mongoose');

const JWT_SECRET = require('../config/jwtSecret');
const User = require('../models/User');
const {
  isProActive,
  lemonProVariantId
} = require('../services/subscriptions');

/** CalendAI user id from the Bearer JWT, or null. */
function userIdFromBearer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    return decoded.id || decoded._id || null;
  } catch (err) {
    return null;
  }
}

/**
 * POST /api/payments/create-checkout
 * Creates a Lemon Squeezy checkout session.
 * Body: { lang, product: 'pro' | 'credits' }. 'pro' is the monthly
 * subscription (LEMON_SQUEEZY_PRO_VARIANT_ID); 'credits' is the one-time
 * 100-credit pack (LEMON_SQUEEZY_VARIANT_ID).
 * Protected — requires valid JWT token in Authorization header.
 */
router.post('/create-checkout', async (req, res) => {
  const isHe = (req.body?.lang || 'he') === 'he';
  // Shown to the user as-is, so keep it readable and say what to fix.
  const msg = (he, en) => (isHe ? he : en);
  try {
    // ── Authenticate user via JWT ──
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: msg('יש להתחבר מחדש כדי לרכוש קרדיטים.', 'Please log in again to buy credits.') });
    }

    const token = authHeader.split(' ')[1];
    let userId;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id || decoded._id;
    } catch (err) {
      return res.status(401).json({ error: msg('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.', 'Your login expired. Log in again and retry.') });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    // Also support session-based auth (passport)
    if (!userId && req.isAuthenticated && req.isAuthenticated()) {
      const sessionUser = req.session?.passport?.user;
      userId = sessionUser?._id || sessionUser?.id || sessionUser?.googleId;
    }

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    // ── Lemon Squeezy API Key check ──
    const apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim();
    if (!apiKey) {
      console.error('LEMON_SQUEEZY_API_KEY is not configured');
      return res.status(500).json({ error: msg('שירות התשלום לא מוגדר בשרת (חסר LEMON_SQUEEZY_API_KEY).', 'Payment service not configured on the server (LEMON_SQUEEZY_API_KEY is missing).') });
    }

    const storeId = process.env.LEMON_SQUEEZY_STORE_ID?.trim();
    if (!storeId) {
      console.error('LEMON_SQUEEZY_STORE_ID is not configured');
      return res.status(500).json({ error: msg('שירות התשלום לא מוגדר בשרת (חסר LEMON_SQUEEZY_STORE_ID).', 'Payment service not configured on the server (LEMON_SQUEEZY_STORE_ID is missing).') });
    }

    const creditsVariantId = process.env.LEMON_SQUEEZY_VARIANT_ID?.trim() || '2035157';
    let variantId = creditsVariantId;
    if (req.body?.product === 'pro') {
      // Until the subscription product exists in Lemon Squeezy, keep selling
      // the credit pack so the button never breaks.
      variantId = lemonProVariantId() || creditsVariantId;
      if (!lemonProVariantId()) console.warn('LEMON_SQUEEZY_PRO_VARIANT_ID is not set; Pro checkout falls back to the credit pack.');
    }

    // Include language preference in checkout custom data
    // so the Lemon Squeezy checkout page and webhook can respect it
    const userLang = req.body?.lang || 'he';

    // ── Build Lemon Squeezy Checkout API request ──
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              custom: {
                userId: userId.toString(),
                lang: userLang
              }
            },
            // Without an explicit redirect, "back to store" sends the buyer to the
            // store URL configured in Lemon Squeezy, which may be a different
            // (old) domain where the user's login token does not exist.
            product_options: {
              redirect_url: `${req.app.get('frontendUrl') || ''}/?payment=success`
            },
            // Lets the frontend open the checkout as an in-app overlay (Lemon.js).
            checkout_options: {
              embed: true
            }
          },
          relationships: {
            store: {
              data: {
                type: 'stores',
                id: storeId
              }
            },
            variant: {
              data: {
                type: 'variants',
                id: variantId
              }
            }
          }
        }
      })
    });

    let data = null;
    try { data = await response.json(); } catch (e) {}

    if (!response.ok) {
      console.error('Lemon Squeezy API error:', response.status, JSON.stringify(data));
      // e.g. 401 = wrong API key, 404 = store/variant not found (often a test-mode key with a live variant or vice versa).
      const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || '';
      return res.status(502).json({
        error: msg('Lemon Squeezy דחה את יצירת דף התשלום', 'Lemon Squeezy rejected the checkout') +
          ` (${response.status}${detail ? `: ${detail}` : ''})`,
        details: data
      });
    }

    // ── Extract the checkout URL from the response ──
    // Lemon Squeezy returns data in JSON:API format
    const checkoutUrl = data?.data?.attributes?.url;

    if (!checkoutUrl) {
      console.error('Lemon Squeezy response missing URL:', JSON.stringify(data));
      return res.status(500).json({ error: 'Invalid response from payment provider.' });
    }

    console.log(`✅ Lemon Squeezy checkout created for user ${userId}`);
    res.json({ url: checkoutUrl });
  } catch (err) {
    console.error('Failed to create Lemon Squeezy checkout:', err.message);
    res.status(500).json({ error: msg('שגיאה ביצירת דף התשלום. נסה שוב מאוחר יותר.', 'Failed to create checkout session. Please try again later.') });
  }
});

/**
 * POST /api/payments/revenuecat-sync
 * Called by the app right after a purchase or "Restore purchases", so Pro
 * turns on without waiting for the webhook. Reads the subscriber from the
 * RevenueCat REST API (REVENUECAT_SECRET_KEY) and stores the Pro expiry.
 * Credits are only granted by the webhook (routes/revenuecatRoutes.js),
 * which is idempotent per event.
 */
router.post('/revenuecat-sync', async (req, res) => {
  const userId = userIdFromBearer(req);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return res.status(401).json({ error: 'Not authenticated.' });
  const secret = process.env.REVENUECAT_SECRET_KEY?.trim();
  if (!secret) return res.status(500).json({ error: 'REVENUECAT_SECRET_KEY is not configured.' });

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: 'User account not found.' });

    const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(String(user._id))}`, {
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' }
    });
    if (!rcRes.ok) {
      console.error('RevenueCat sync failed:', rcRes.status);
      return res.status(502).json({ error: 'Could not reach the purchase service.' });
    }
    const data = await rcRes.json();
    const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || 'pro';
    const ent = data?.subscriber?.entitlements?.[entitlementId];
    const expires = ent?.expires_date ? new Date(ent.expires_date) : null;
    if (expires && !Number.isNaN(expires.getTime())) {
      const sub = data?.subscriber?.subscriptions?.[ent.product_identifier];
      const store = sub?.store === 'play_store' ? 'play_store' : sub?.store === 'app_store' ? 'app_store' : 'revenuecat';
      // Never shorten a later expiry that came from another source.
      if (!user.proExpiresAt || new Date(user.proExpiresAt).getTime() < expires.getTime()) {
        await User.updateOne({ _id: user._id }, { $set: { proExpiresAt: expires, isPro: expires.getTime() > Date.now(), proSource: store } });
        user.proExpiresAt = expires;
      }
    }
    const fresh = await User.findById(user._id).lean();
    return res.json({ isPro: isProActive(fresh), proExpiresAt: fresh?.proExpiresAt || null, aiCredits: fresh?.aiCredits });
  } catch (err) {
    console.error('RevenueCat sync error:', err.message);
    return res.status(500).json({ error: 'Sync failed.' });
  }
});

module.exports = router;