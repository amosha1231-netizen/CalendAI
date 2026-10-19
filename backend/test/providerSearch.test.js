// ──────────────────────────────────────────────
// Characterization tests for GET /api/providers (browse)'s search-query
// handling (providerRoutes.js). No MongoMemoryReplSet: User.find is stubbed,
// same pattern providerGoogleAvailability.test.js uses for ProviderBooking.find.
//
// Regression this covers: `q` was passed straight into a Mongo $regex with
// only a length cap (`q.trim().slice(0, 100)`, misleadingly named `safe`) —
// no escaping of regex metacharacters. This route is public, unauthenticated,
// and (until this fix) had no rate limiter, so a crafted pattern like
// "(a+)+$" wasn't just a weird search, it was a catastrophic-backtracking
// regex handed straight to the server's regex engine on every request.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const express = require('express');

const providerRoutesPath = require.resolve('../routes/providerRoutes');
const providerRoutes = require(providerRoutesPath);
const User = require('../models/User');
const { escapeRegex } = providerRoutes;

// browseLimiter is a single express-rate-limit instance shared by every
// request GET / sees — re-requiring the router fresh per test (busting the
// module cache, same trick rateLimiting.test.js uses for mutualRoutes) gives
// each test its own limiter state instead of inheriting a counter already
// run up by an earlier test in this same process/window.
function freshProviderRoutes() {
  delete require.cache[providerRoutesPath];
  return require(providerRoutesPath);
}

// ── escapeRegex(): pure string escaping ──
test('escapeRegex: escapes every regex metacharacter so the string matches only literally', () => {
  assert.equal(escapeRegex('(a+)+$'), '\\(a\\+\\)\\+\\$');
  assert.equal(escapeRegex('a.b*c?'), 'a\\.b\\*c\\?');
  assert.equal(escapeRegex('[test]{1,2}'), '\\[test\\]\\{1,2\\}');
  assert.equal(escapeRegex('plain text'), 'plain text', 'a string with no metacharacters is unchanged');
});

test('escapeRegex: the escaped output actually matches the original string literally as a RegExp source', () => {
  const malicious = '(a+)+$.*[barber]';
  const escaped = escapeRegex(malicious);
  const re = new RegExp(escaped, 'i');
  assert.ok(re.test(`hello ${malicious} world`), 'the escaped pattern must still find the literal substring');
  assert.ok(!re.test('hello world'), 'and must not match unrelated text as if the metacharacters were live');
});

// ── GET / (browse): the $regex filter actually sent to Mongo is escaped ──
function startApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/providers', router);
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('GET /api/providers?q=...: a regex-metacharacter search term is escaped before reaching Mongo', async (t) => {
  let capturedFilter = null;
  t.mock.method(User, 'find', (filter) => {
    capturedFilter = filter;
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) };
  });

  const { server, base } = startApp(freshProviderRoutes());
  try {
    const res = await fetch(`${base}/api/providers?${new URLSearchParams({ q: '(a+)+$' })}`);
    assert.equal(res.status, 200);
    assert.ok(capturedFilter, 'the route must have reached User.find');
    const businessNameClause = capturedFilter.$or.find(c => c['providerProfile.businessName']);
    assert.equal(
      businessNameClause['providerProfile.businessName'].$regex,
      '\\(a\\+\\)\\+\\$',
      'the $regex value sent to Mongo must be the escaped form, not the raw user input'
    );
  } finally {
    server.close();
  }
});

test('GET /api/providers: the 31st request in a minute is rate-limited', async (t) => {
  t.mock.method(User, 'find', () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) }));

  const { server, base } = startApp(freshProviderRoutes());
  try {
    const statuses = [];
    for (let i = 0; i < 31; i++) {
      const res = await fetch(`${base}/api/providers`);
      statuses.push(res.status);
    }
    assert.ok(statuses.slice(0, 30).every(s => s === 200), 'the first 30 requests should all succeed');
    assert.equal(statuses[30], 429, 'the 31st request within the window must be rate-limited');
  } finally {
    server.close();
  }
});
