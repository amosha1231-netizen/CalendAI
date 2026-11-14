// Tests for routes/revenuecatRoutes.js (in-app purchase -> AI credits).
// No database: the pure helpers are tested directly, and the HTTP branches
// that answer before touching Mongo (auth, ignored events, missing ids) are
// exercised on a bare Express app. Crediting itself uses the same
// transaction + ProcessedPaymentEvent idempotency as the Lemon Squeezy webhook.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');

const routes = require('../routes/revenuecatRoutes');
const { creditsForProduct } = routes._test;

async function post(body, auth) {
  const app = express();
  app.use(express.json());
  app.use('/hook', routes);
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test('creditsForProduct: env map wins, then a number in the id, then 100', () => {
  const saved = process.env.IAP_PRODUCT_CREDITS;
  try {
    process.env.IAP_PRODUCT_CREDITS = 'big_pack=500, small=50';
    assert.equal(creditsForProduct('big_pack'), 500);
    assert.equal(creditsForProduct('small'), 50);
    assert.equal(creditsForProduct('calendai_credits_300'), 300);
    assert.equal(creditsForProduct('credits'), 100);
    assert.equal(creditsForProduct(undefined), 100);
  } finally {
    if (saved === undefined) delete process.env.IAP_PRODUCT_CREDITS; else process.env.IAP_PRODUCT_CREDITS = saved;
  }
});

test('webhook: refuses when the secret is not configured or does not match', async () => {
  const saved = process.env.REVENUECAT_WEBHOOK_AUTH;
  try {
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    assert.equal((await post({ event: { type: 'NON_RENEWING_PURCHASE' } }, 'x')).status, 500);
    process.env.REVENUECAT_WEBHOOK_AUTH = 'Bearer right';
    assert.equal((await post({ event: { type: 'NON_RENEWING_PURCHASE' } }, 'Bearer wrong')).status, 401);
    assert.equal((await post({ event: { type: 'NON_RENEWING_PURCHASE' } })).status, 401);
  } finally {
    if (saved === undefined) delete process.env.REVENUECAT_WEBHOOK_AUTH; else process.env.REVENUECAT_WEBHOOK_AUTH = saved;
  }
});

test('webhook: other event types, sandbox opt-out and missing ids answer without crediting', async () => {
  const saved = { auth: process.env.REVENUECAT_WEBHOOK_AUTH, sb: process.env.REVENUECAT_SANDBOX_CREDITS };
  try {
    process.env.REVENUECAT_WEBHOOK_AUTH = 'secret';
    let r = await post({ event: { type: 'TEST' } }, 'secret');
    assert.equal(r.status, 200);
    assert.equal(r.body.ignored, 'TEST');

    r = await post({}, 'secret');
    assert.equal(r.status, 400);

    process.env.REVENUECAT_SANDBOX_CREDITS = '0';
    r = await post({ event: { type: 'NON_RENEWING_PURCHASE', environment: 'SANDBOX', transaction_id: 't1' } }, 'secret');
    assert.equal(r.body.ignored, 'sandbox');
    delete process.env.REVENUECAT_SANDBOX_CREDITS;

    r = await post({ event: { type: 'NON_RENEWING_PURCHASE', app_user_id: 'abc' } }, 'secret');
    assert.equal(r.status, 400);
  } finally {
    if (saved.auth === undefined) delete process.env.REVENUECAT_WEBHOOK_AUTH; else process.env.REVENUECAT_WEBHOOK_AUTH = saved.auth;
    if (saved.sb === undefined) delete process.env.REVENUECAT_SANDBOX_CREDITS; else process.env.REVENUECAT_SANDBOX_CREDITS = saved.sb;
  }
});
