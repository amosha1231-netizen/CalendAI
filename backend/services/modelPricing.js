// ──────────────────────────────────────────────
// Live model prices from OpenRouter
// ──────────────────────────────────────────────
// Used only when an OpenRouter response does not report its real cost
// (usage.cost). Prices are cached in memory and refreshed periodically; until
// the first successful fetch, the fallback prices in config/pricing.js apply.
// ──────────────────────────────────────────────
const pricing = require('../config/pricing');

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const FETCH_TIMEOUT_MS = 10_000;

// model id -> { input, output } in USD per 1M tokens
let livePrices = new Map();
let lastRefreshAt = 0;
let timer = null;

/** Turn OpenRouter's /models payload into a price map (USD per 1M tokens). */
function parseModelsPayload(payload) {
  const map = new Map();
  const list = Array.isArray(payload?.data) ? payload.data : [];
  for (const m of list) {
    const id = typeof m?.id === 'string' ? m.id : null;
    const input = Number(m?.pricing?.prompt);
    const output = Number(m?.pricing?.completion);
    if (!id || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) continue;
    map.set(id, { input: input * 1_000_000, output: output * 1_000_000 });
  }
  return map;
}

async function refreshModelPrices(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(MODELS_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const map = parseModelsPayload(await res.json());
    if (map.size === 0) throw new Error('empty price list');
    livePrices = map;
    lastRefreshAt = Date.now();
    return true;
  } catch (err) {
    console.warn('[pricing] Could not refresh OpenRouter prices:', err.message);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Fetch now and then every LIVE_PRICE_REFRESH_MS. Safe to call once at boot. */
function startModelPriceRefresh() {
  if (timer) return;
  refreshModelPrices();
  timer = setInterval(refreshModelPrices, pricing.livePriceRefreshMs);
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * Price for a model, USD per 1M tokens.
 * @returns {{ input: number, output: number, source: 'live-price'|'fallback-price' }}
 */
function getModelPrice(modelName) {
  const live = modelName && livePrices.get(modelName);
  if (live) return { ...live, source: 'live-price' };
  const fb = pricing.fallbackModelPrices;
  return { ...(fb[modelName] || fb.default), source: 'fallback-price' };
}

/**
 * False only when OpenRouter's live list is loaded and does not hold this id
 * (a retired model). Before the first fetch every id counts as known.
 */
function isKnownModel(modelName) {
  if (livePrices.size === 0) return true;
  return livePrices.has(modelName);
}

// For tests.
function _setLivePrices(map) { livePrices = new Map(map); lastRefreshAt = Date.now(); }
function _lastRefreshAt() { return lastRefreshAt; }

module.exports = {
  refreshModelPrices,
  startModelPriceRefresh,
  getModelPrice,
  isKnownModel,
  parseModelsPayload,
  _setLivePrices,
  _lastRefreshAt
};
