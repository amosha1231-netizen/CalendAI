const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'calendai-jwt-secret-change-in-production';

/**
 * POST /api/payments/create-checkout
 * Creates a Lemon Squeezy checkout session for purchasing AI credits.
 * Protected — requires valid JWT token in Authorization header.
 */
router.post('/create-checkout', async (req, res) => {
  try {
    // ── Authenticate user via JWT ──
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const token = authHeader.split(' ')[1];
    let userId;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id || decoded._id;
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
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
      return res.status(500).json({ error: 'Payment service not configured.' });
    }

    const storeId = '1301102';
    const variantId = '2035157';

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
                userId: userId.toString()
              }
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

    const data = await response.json();

    if (!response.ok) {
      console.error('Lemon Squeezy API error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: 'Failed to create checkout session.',
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
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

module.exports = router;