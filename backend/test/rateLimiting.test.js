// ──────────────────────────────────────────────
// Characterization tests for the abuse-rate-limiters added to the
// mutual/provider routes reachable without first proving ownership of
// anything (lookup is an email-enumeration oracle; book is open to
// anonymous guests; availability fans out to ~2 Google freebusy.query calls
// per day in range): mutualRoutes.js' mutualAbuseLimiter (GET /lookup,
// POST /sessions, GET /sessions/:id/availability) and providerRoutes.js'
// bookLimiter (POST /:id/book).
//
// Both limiters sit in front of the auth/validation that would otherwise
// reject these requests (401 for no token, 400 for a malformed provider
// id) — express-rate-limit still counts a request it never lets reach the
// route handler, so exceeding the limit flips the response to 429 without
// needing a live Mongo connection or a real account. No MongoMemoryReplSet
// needed, unlike mutualBooking.test.js.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const express = require('express');

const providerRoutes = require('../routes/providerRoutes');
const mutualRoutesPath = require.resolve('../routes/mutualRoutes');

// mutualAbuseLimiter is a single express-rate-limit instance shared by every
// route it guards (lookup, sessions, availability) — re-requiring the router
// fresh per test (busting the module cache) gives each test its own limiter
// state instead of inheriting a counter already run up by an earlier test
// in this same process/window.
function freshMutualRoutes() {
  delete require.cache[mutualRoutesPath];
  return require(mutualRoutesPath);
}

function startApp(routerPath, router) {
  const app = express();
  app.use(express.json());
  app.use(routerPath, router);
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('mutual /lookup: the 21st request in a minute (no auth) is rate-limited, not just unauthorized', async () => {
  const { server, base } = startApp('/api/mutual', freshMutualRoutes());
  try {
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      const res = await fetch(`${base}/api/mutual/lookup?email=nobody@example.com`);
      statuses.push(res.status);
    }
    // No Authorization header on any of them, so every request that gets
    // past the limiter is rejected by requireAuth with 401 — the limiter
    // itself fires strictly on request count, before requireAuth ever runs.
    assert.ok(statuses.slice(0, 20).every(s => s === 401), 'the first 20 requests should all reach requireAuth and get 401');
    assert.equal(statuses[20], 429, 'the 21st request within the window must be rate-limited');
  } finally {
    server.close();
  }
});

test('mutual /sessions/:id/availability: the 21st request in a minute (no auth) is rate-limited, not just unauthorized', async () => {
  const { server, base } = startApp('/api/mutual', freshMutualRoutes());
  try {
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      const res = await fetch(`${base}/api/mutual/sessions/does-not-exist/availability`);
      statuses.push(res.status);
    }
    assert.ok(statuses.slice(0, 20).every(s => s === 401), 'the first 20 requests should all reach requireAuth and get 401');
    assert.equal(statuses[20], 429, 'the 21st request within the window must be rate-limited');
  } finally {
    server.close();
  }
});

test('provider /:id/book: the 11th request in a minute is rate-limited, not just a validation error', async () => {
  const { server, base } = startApp('/api/providers', providerRoutes);
  try {
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      // A malformed id fails mongoose.Types.ObjectId.isValid() before any
      // Mongo query — exercising the limiter without needing a DB.
      const res = await fetch(`${base}/api/providers/not-a-valid-id/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: 'x', date: '2026-12-01', startTime: '10:00 AM', guestName: 'Guest' })
      });
      statuses.push(res.status);
    }
    assert.ok(statuses.slice(0, 10).every(s => s === 400), 'the first 10 requests should all reach the handler and fail validation with 400');
    assert.equal(statuses[10], 429, 'the 11th request within the window must be rate-limited');
  } finally {
    server.close();
  }
});
