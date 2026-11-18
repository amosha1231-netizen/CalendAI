const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const plans = require('../services/planPrices');

beforeEach(() => {
  plans._cache.clear();
  delete process.env.LEMON_SQUEEZY_PRO_VARIANT_ID;
  delete process.env.LEMON_SQUEEZY_VARIANT_ID;
});

const fakeFetch = prices => async url => {
  const id = url.split('/').pop();
  if (!(id in prices)) return { ok: false, status: 404 };
  return { ok: true, json: async () => ({ data: { attributes: prices[id] } }) };
};

test('reads the real price of each variant from Lemon Squeezy', async () => {
  process.env.LEMON_SQUEEZY_PRO_VARIANT_ID = '111';
  process.env.LEMON_SQUEEZY_VARIANT_ID = '222';
  const r = await plans.getPlans({ apiKey: 'k', fetchImpl: fakeFetch({ 111: { price: 2900, is_subscription: true, interval: 'month' }, 222: { price: 1990 } }) });
  const pro = r.plans.find(p => p.id === 'pro');
  const pack = r.plans.find(p => p.id === 'credits');
  assert.equal(pro.price, 29);
  assert.equal(pro.available, true);
  assert.equal(pack.price, 19.9);
  assert.equal(pro.points, 3000);
  assert.equal(pack.points, 1500);
  assert.equal(pro.actions, 250);
});

test('Pro is marked unavailable until its subscription variant is set', async () => {
  const r = await plans.getPlans({ apiKey: 'k', fetchImpl: fakeFetch({ 2035157: { price: 1990 } }) });
  const pro = r.plans.find(p => p.id === 'pro');
  assert.equal(pro.available, false);
  assert.equal(pro.price, null);
  assert.equal(r.plans.find(p => p.id === 'credits').price, 19.9);
});

test('no API key or a failed call gives a null price, never an error', async () => {
  assert.equal(await plans.fetchVariantPrice('1', { apiKey: '' }), null);
  assert.equal(await plans.fetchVariantPrice('2', { apiKey: 'k', fetchImpl: async () => { throw new Error('down'); } }), null);
});
