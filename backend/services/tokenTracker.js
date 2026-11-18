// ──────────────────────────────────────────────
// Token Usage Tracker & Pay-As-You-Go Calculator
// ──────────────────────────────────────────────
// Turns one OpenRouter call into the points we charge for it:
//   points = real provider cost (USD) × markup × points-per-dollar
//
// The real cost is OpenRouter's usage.cost for that call. When it is missing,
// the tokens are priced from OpenRouter's live price list (services/modelPricing.js),
// or from the fallback table in config/pricing.js.
// All numbers (markup, points per dollar, fallbacks) live in config/pricing.js.
// ──────────────────────────────────────────────
const pricing = require('../config/pricing');
const { getModelPrice } = require('./modelPricing');

/** Kept for older callers: the fallback price table. */
const MODEL_PRICING = pricing.fallbackModelPrices;
const DEFAULT_MARKUP = pricing.DEFAULTS.MARKUP;
const CREDITS_PER_DOLLAR = pricing.pointsPerDollar;

function getMarkupMultiplier() {
  return pricing.markup;
}

/**
 * Calculate the cost of a single API call based on token usage.
 *
 * @param {Object} usage - The usage object from OpenRouter response.
 * @param {number} usage.prompt_tokens - Number of input tokens.
 * @param {number} usage.completion_tokens - Number of output tokens.
 * @param {number} [usage.total_tokens] - Total tokens (optional, computed if missing).
 * @param {string} [modelName] - The model name (e.g., 'deepseek/deepseek-chat').
 * @returns {Object} { rawCostUSD, costUSD, costCredits, promptTokens, completionTokens, totalTokens, markupMultiplier }
 */
function calculateCost(usage, modelName) {
  if (!usage || typeof usage !== 'object') {
    return {
      rawCostUSD: 0,
      costUSD: 0,
      costCredits: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      markupMultiplier: getMarkupMultiplier(),
      error: 'No usage data provided'
    };
  }

  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  if (![promptTokens, completionTokens].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new TypeError('Invalid token usage data');
  }
  const reportedTotal = Number(usage.total_tokens ?? 0);
  if (!Number.isSafeInteger(reportedTotal) || reportedTotal < 0) {
    throw new TypeError('Invalid total token usage');
  }
  const totalTokens = Math.max(reportedTotal, promptTokens + completionTokens);

  // Real cost OpenRouter charged for this call, when it reported one.
  const reportedCost = usage.cost == null ? NaN : Number(usage.cost);
  let rawCostUSD;
  let pricingSource;
  let pricingUsed = null;
  if (Number.isFinite(reportedCost) && reportedCost > 0) {
    rawCostUSD = reportedCost;
    pricingSource = 'provider-cost';
  } else {
    const price = getModelPrice(modelName);
    pricingUsed = { input: price.input, output: price.output };
    pricingSource = price.source;
    rawCostUSD = (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
  }

  const markupMultiplier = getMarkupMultiplier();
  const costUSD = rawCostUSD * markupMultiplier;

  // Points, rounded UP to 2 decimals so we never charge less than cost × markup.
  // toFixed strips float noise (1101.0000000002) so it does not round up a whole 0.01.
  const costCredits = Math.ceil(Number((costUSD * CREDITS_PER_DOLLAR * 100).toFixed(6))) / 100;
  const finalCredits = Math.max(pricing.minPointsPerRequest, costCredits);

  return {
    rawCostUSD: roundTo6(rawCostUSD),
    costUSD: roundTo6(costUSD),
    costCredits: finalCredits,
    promptTokens,
    completionTokens,
    totalTokens,
    markupMultiplier,
    modelName: modelName || 'unknown',
    pricingSource,
    pricingUsed
  };
}

/**
 * Round a number to 6 decimal places (micro-dollar precision).
 */
function roundTo6(num) {
  return Math.round(num * 1_000_000) / 1_000_000;
}

/**
 * Format a cost breakdown for console logging.
 */
function formatCostBreakdown(costInfo) {
  const { promptTokens, completionTokens, totalTokens, rawCostUSD, costUSD, costCredits, markupMultiplier, modelName } = costInfo;
  return [
    `[Token Usage] Model: ${modelName}`,
    `  Prompt tokens: ${promptTokens.toLocaleString()}`,
    `  Completion tokens: ${completionTokens.toLocaleString()}`,
    `  Total tokens: ${totalTokens.toLocaleString()}`,
    `  Raw cost: $${rawCostUSD.toFixed(6)} (${costInfo.pricingSource || 'unknown'})`,
    `  Markup: ${markupMultiplier}x`,
    `  Charged cost: $${costUSD.toFixed(6)}`,
    `  Credits deducted: ${costCredits}`
  ].join('\n');
}

module.exports = {
  calculateCost,
  formatCostBreakdown,
  MODEL_PRICING,
  DEFAULT_MARKUP,
  CREDITS_PER_DOLLAR,
  getMarkupMultiplier
};
