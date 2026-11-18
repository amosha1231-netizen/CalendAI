// What each paid option costs and what it gives, for the "packages" screen.
// Prices are read from Lemon Squeezy itself (the variant the checkout sells),
// so the screen can never show a different price from the payment page.
const pricing = require('../config/pricing');
const { lemonProVariantId } = require('./subscriptions');

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // variantId -> { at, value }

function creditsVariantId() {
  return process.env.LEMON_SQUEEZY_VARIANT_ID?.trim() || '2035157';
}

/** { amount, interval } from a Lemon Squeezy variant, or null. amount is in major units (₪). */
async function fetchVariantPrice(variantId, { fetchImpl = fetch, apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim(), now = Date.now() } = {}) {
  if (!variantId || !apiKey) return null;
  const hit = cache.get(variantId);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  try {
    const res = await fetchImpl(`https://api.lemonsqueezy.com/v1/variants/${encodeURIComponent(variantId)}`, {
      headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const a = body?.data?.attributes || {};
    const cents = Number(a.price);
    const value = Number.isFinite(cents) && cents > 0
      ? { amount: Math.round(cents) / 100, interval: a.is_subscription ? (a.interval || 'month') : null }
      : null;
    cache.set(variantId, { at: now, value });
    return value;
  } catch (err) {
    console.warn(`[plans] price for variant ${variantId} unavailable: ${err.message}`);
    return null;
  }
}

// About how many points one AI request uses (real cost × 3, measured Nov 2026).
const POINTS_PER_ACTION = 12;

async function getPlans(opts = {}) {
  const currency = (process.env.LEMON_SQUEEZY_CURRENCY || 'ILS').trim().toUpperCase();
  const proVariant = lemonProVariantId();
  const [pro, pack] = await Promise.all([
    proVariant ? fetchVariantPrice(proVariant, opts) : Promise.resolve(null),
    fetchVariantPrice(creditsVariantId(), opts)
  ]);
  const actions = points => Math.floor(points / POINTS_PER_ACTION);
  return {
    currency,
    signupPoints: pricing.signupPoints,
    pointsPerAction: POINTS_PER_ACTION,
    plans: [
      {
        id: 'pro',
        available: !!proVariant,
        points: pricing.proMonthlyPoints,
        actions: actions(pricing.proMonthlyPoints),
        price: pro ? pro.amount : null,
        interval: 'month'
      },
      {
        id: 'credits',
        available: true,
        points: pricing.creditPackPoints,
        actions: actions(pricing.creditPackPoints),
        price: pack ? pack.amount : null,
        interval: null
      }
    ]
  };
}

module.exports = { getPlans, fetchVariantPrice, POINTS_PER_ACTION, _cache: cache };
