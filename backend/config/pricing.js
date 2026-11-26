// ──────────────────────────────────────────────
// AI pricing: the ONE place to change prices and allowances
// ──────────────────────────────────────────────
// How a request is charged:
//   points = provider's real cost in USD × MARKUP × POINTS_PER_DOLLAR
//
// The AI is Claude Haiku 5.5 on the Anthropic API (services/aiClient.js). Its
// cost per call is computed from the token counts Anthropic returns and
// CLAUDE_PRICES below; update those if Anthropic changes its prices.
// (Old OpenRouter path, used only until ANTHROPIC_API_KEY is set: the real cost
// OpenRouter reports in usage.cost, else its live price list, else
// FALLBACK_MODEL_PRICES.)
//
// Pro is ₪29/month (the price itself lives in Lemon Squeezy / the stores).
// At MARKUP 3, a Pro user who spends all 3,000 points costs at most
// 3000 / 1000 / 3 = $1.00 of AI (≈ ₪3.7), out of ≈ ₪21 net after VAT and fees.
//
// Env vars override the defaults below without a code change.
// ──────────────────────────────────────────────

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DEFAULTS = {
  // We charge this many times what the AI provider charged us.
  MARKUP: 3,
  // 1 point = $0.001 of charged value.
  POINTS_PER_DOLLAR: 1000,
  // Every request costs at least this many points.
  MIN_POINTS_PER_REQUEST: 1,
  // Free points for a new account.
  SIGNUP_POINTS: 300,
  // Pro tops the balance up to this every paid month (does not stack).
  PRO_MONTHLY_POINTS: 3000,
  // One-time point pack (web "buy credits" and store consumables without a size in their id).
  CREDIT_PACK_POINTS: 1500,
  // Owner accounts (OWNER_EMAILS) are refilled to this when they drop below it.
  OWNER_POINTS_FLOOR: 300,
  // How often to refresh OpenRouter's live price list.
  LIVE_PRICE_REFRESH_MS: 6 * 60 * 60 * 1000
};

/**
 * Last-resort prices in USD per 1M tokens, used only when OpenRouter reports
 * no cost AND its price list cannot be fetched. Kept a bit above the real
 * price so a fallback never undercharges. Checked against OpenRouter 2026-11-15
 * (deepseek-chat measured at ≈ $0.27–0.33 per 1M tokens, mostly input).
 */
const FALLBACK_MODEL_PRICES = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50 },
  'deepseek/deepseek-chat': { input: 0.35, output: 1.20 },
  default: { input: 1.00, output: 3.00 }
};

/**
 * Anthropic API prices in USD per 1M tokens (prompts up to 100K tokens).
 * Cache writes cost 1.25x input and cache reads 0.1x input (applied in
 * services/aiClient.js). Checked 2026-11-26.
 */
const CLAUDE_PRICES = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50 }
};

const pricing = {
  get markup() { return envNumber('OPENROUTER_MARKUP_MULTIPLIER', DEFAULTS.MARKUP); },
  get pointsPerDollar() { return DEFAULTS.POINTS_PER_DOLLAR; },
  get minPointsPerRequest() { return DEFAULTS.MIN_POINTS_PER_REQUEST; },
  get signupPoints() { return envNumber('SIGNUP_CREDITS', DEFAULTS.SIGNUP_POINTS); },
  get proMonthlyPoints() { return envNumber('PRO_MONTHLY_CREDITS', DEFAULTS.PRO_MONTHLY_POINTS); },
  get creditPackPoints() { return envNumber('CREDIT_PACK_CREDITS', DEFAULTS.CREDIT_PACK_POINTS); },
  get ownerPointsFloor() { return DEFAULTS.OWNER_POINTS_FLOOR; },
  get livePriceRefreshMs() { return DEFAULTS.LIVE_PRICE_REFRESH_MS; },
  fallbackModelPrices: FALLBACK_MODEL_PRICES,
  claudePrices: CLAUDE_PRICES,
  DEFAULTS
};

module.exports = pricing;
