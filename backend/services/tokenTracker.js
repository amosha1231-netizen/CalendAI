// ──────────────────────────────────────────────
// Token Usage Tracker & Pay-As-You-Go Calculator
// ──────────────────────────────────────────────
// Tracks token consumption from OpenRouter responses,
// calculates cost based on known model pricing,
// applies a markup multiplier, and converts to credits.
//
// 1 credit = $0.001 (0.1 cent)
// Markup multiplier: 3x (configurable via OPENROUTER_MARKUP_MULTIPLIER env var)
// ──────────────────────────────────────────────

/**
 * Known pricing for models used via OpenRouter (per 1M tokens).
 * Prices in USD.
 * Source: https://openrouter.ai/models/deepseek/deepseek-chat/pricing
 */
const MODEL_PRICING = {
  'deepseek/deepseek-chat': {
    input: 0.14,   // $0.14 per 1M input tokens
    output: 0.42,  // $0.42 per 1M output tokens
  },
  // Fallback pricing for unknown models (conservative estimate)
  'default': {
    input: 0.50,
    output: 1.00,
  }
};

/**
 * Default markup multiplier applied to raw cost.
 * 3x means the user is charged 3× the raw OpenRouter cost.
 */
const DEFAULT_MARKUP = 3;

/**
 * Credits per dollar — 1 credit = $0.001
 */
const CREDITS_PER_DOLLAR = 1000;

/**
 * Get the markup multiplier from environment or default.
 */
function getMarkupMultiplier() {
  const envVal = process.env.OPENROUTER_MARKUP_MULTIPLIER;
  if (envVal) {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MARKUP;
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

  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || (promptTokens + completionTokens);

  // Get pricing for the specific model, or fallback to default
  const pricing = MODEL_PRICING[modelName] || MODEL_PRICING['default'];

  // Calculate raw cost in USD
  const rawInputCost = (promptTokens / 1_000_000) * pricing.input;
  const rawOutputCost = (completionTokens / 1_000_000) * pricing.output;
  const rawCostUSD = rawInputCost + rawOutputCost;

  // Apply markup
  const markupMultiplier = getMarkupMultiplier();
  const costUSD = rawCostUSD * markupMultiplier;

  // Convert to credits (1 credit = $0.001)
  const costCredits = Math.ceil(costUSD * CREDITS_PER_DOLLAR * 100) / 100; // Round to 2 decimal places
  // Minimum charge: 1 credit (never charge 0)
  const finalCredits = Math.max(1, costCredits);

  return {
    rawCostUSD: roundTo6(rawCostUSD),
    costUSD: roundTo6(costUSD),
    costCredits: finalCredits,
    promptTokens,
    completionTokens,
    totalTokens,
    markupMultiplier,
    modelName: modelName || 'unknown',
    pricingUsed: pricing
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
    `  Raw cost: $${rawCostUSD.toFixed(6)}`,
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
  CREDITS_PER_DOLLAR
};