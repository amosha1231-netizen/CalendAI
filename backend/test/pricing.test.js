const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');

const pricing = require('../config/pricing');
const { calculateCost } = require('../services/tokenTracker');
const { parseModelsPayload, getModelPrice, refreshModelPrices, _setLivePrices } = require('../services/modelPricing');
const User = require('../models/User');

afterEach(() => {
  delete process.env.OPENROUTER_MARKUP_MULTIPLIER;
  _setLivePrices(new Map());
});

test('defaults: Pro 3000/month, signup 300, markup 3', () => {
  const saved = process.env.PRO_MONTHLY_CREDITS;
  delete process.env.PRO_MONTHLY_CREDITS;
  try {
    assert.equal(pricing.proMonthlyPoints, 3000);
    assert.equal(pricing.signupPoints, 300);
    assert.equal(pricing.markup, 3);
    assert.equal(new User({ email: 'a@example.com' }).aiCredits, 300);
  } finally {
    if (saved !== undefined) process.env.PRO_MONTHLY_CREDITS = saved;
  }
});

test('charges the real provider cost × 3 when OpenRouter reports it', () => {
  // Measured Nov 15: 11,096 tokens cost $0.00367.
  const c = calculateCost({ prompt_tokens: 10800, completion_tokens: 296, cost: 0.00367 }, 'deepseek/deepseek-chat');
  assert.equal(c.pricingSource, 'provider-cost');
  assert.equal(c.rawCostUSD, 0.00367);
  assert.equal(c.costCredits, 11.01);
});

test('markup comes from the env var when set', () => {
  process.env.OPENROUTER_MARKUP_MULTIPLIER = '4';
  const c = calculateCost({ prompt_tokens: 1, completion_tokens: 1, cost: 0.005 }, 'x/y');
  assert.equal(c.costCredits, 20);
});

test('without a reported cost, uses the live OpenRouter price, then the fallback table', () => {
  const usage = { prompt_tokens: 1_000_000, completion_tokens: 0 };
  const fb = calculateCost(usage, 'deepseek/deepseek-chat');
  assert.equal(fb.pricingSource, 'fallback-price');
  assert.equal(fb.rawCostUSD, pricing.fallbackModelPrices['deepseek/deepseek-chat'].input);

  _setLivePrices([['deepseek/deepseek-chat', { input: 0.5, output: 2 }]]);
  const live = calculateCost(usage, 'deepseek/deepseek-chat');
  assert.equal(live.pricingSource, 'live-price');
  assert.equal(live.rawCostUSD, 0.5);
  assert.equal(live.costCredits, 1500);
});

test('a zero or missing cost never charges less than the minimum', () => {
  const c = calculateCost({ prompt_tokens: 0, completion_tokens: 0, cost: 0 }, 'deepseek/deepseek-chat');
  assert.equal(c.costCredits, pricing.minPointsPerRequest);
});

test('parses OpenRouter /models prices (USD per token) into USD per 1M tokens', () => {
  const map = parseModelsPayload({ data: [
    { id: 'deepseek/deepseek-chat', pricing: { prompt: '0.0000003', completion: '0.00000085' } },
    { id: 'broken', pricing: { prompt: 'x' } }
  ] });
  assert.equal(map.size, 1);
  assert.ok(Math.abs(map.get('deepseek/deepseek-chat').input - 0.3) < 1e-9);
  assert.ok(Math.abs(map.get('deepseek/deepseek-chat').output - 0.85) < 1e-9);
});

test('a failed price refresh keeps the previous prices', async () => {
  _setLivePrices([['m', { input: 1, output: 1 }]]);
  const ok = await refreshModelPrices(async () => ({ ok: false, status: 500 }));
  assert.equal(ok, false);
  assert.equal(getModelPrice('m').source, 'live-price');
});
