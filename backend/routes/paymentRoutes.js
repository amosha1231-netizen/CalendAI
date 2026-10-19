const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = require('../config/jwtSecret');

/**
 * POST /api/payments/create-checkout
 * Creates a Lemon Squeezy checkout session for purchasing AI credits.
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

    const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID?.trim() || '2035157';

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

module.exports = router;