const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const JWT_SECRET = require('../config/jwtSecret');
const User = require('../models/User');
const adminRoutes = require('../routes/adminRoutes');

let replSet;
let server;
let baseUrl;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  const app = express();
  app.use('/api/admin', adminRoutes);
  await new Promise(resolve => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  process.env.OWNER_EMAILS = 'owner@example.com';
  await User.deleteMany({});
});

const tokenFor = user => jwt.sign({ id: String(user._id) }, JWT_SECRET);
const get = token => fetch(`${baseUrl}/api/admin/my-ai-costs`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {}
});

test('owner sees only his own requests with their cost', async () => {
  const owner = await User.create({
    email: 'owner@example.com', googleId: 'g-owner', aiCredits: 100,
    aiCreditsLedger: [
      { timestamp: '2026-11-14T10:00:00.000Z', action: 'parse-schedule', requestText: 'פגישה מחר ב-10', totalTokens: 1200, rawCostUSD: 0.0002, providerCostUSD: 0.00031, costUSD: 0.0006, costCredits: 1 },
      { timestamp: '2026-11-13T10:00:00.000Z', action: 'quick-add', totalTokens: 800, rawCostUSD: 0.0001, costUSD: 0.0003, costCredits: 1 }
    ]
  });
  await User.create({
    email: 'someone@example.com', googleId: 'g-other', aiCredits: 50,
    aiCreditsLedger: [{ timestamp: '2026-11-14T11:00:00.000Z', action: 'parse-schedule', requestText: 'secret of another user', rawCostUSD: 1 }]
  });

  const res = await get(tokenFor(owner));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.totals.count, 2);
  assert.ok(Math.abs(body.totals.realCostUSD - 0.00041) < 1e-12);
  assert.equal(body.requests[0].requestText, 'פגישה מחר ב-10');
  assert.equal(body.requests[0].realCostIsExact, true);
  assert.equal(body.requests[1].requestText, null);
  assert.equal(body.requests[1].realCostIsExact, false);
  assert.ok(!JSON.stringify(body).includes('secret of another user'));
});

test('everyone else gets 404', async () => {
  const other = await User.create({ email: 'someone@example.com', googleId: 'g-other' });
  const passwordOnly = await User.create({ email: 'owner@example.com', password: 'x'.repeat(20) });
  assert.equal((await get()).status, 404, 'signed out');
  assert.equal((await get(tokenFor(other))).status, 404, 'regular user');
  assert.equal((await get(tokenFor(passwordOnly))).status, 404, 'owner email without Google is not trusted');
  assert.equal((await get('not-a-token')).status, 404, 'bad token');
});
