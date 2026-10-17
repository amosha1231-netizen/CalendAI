// ──────────────────────────────────────────────
// Characterization tests for mutualRoutes.js' HTTP-level request validation
// on POST /api/mutual/sessions and POST /api/mutual/sessions/:id/confirm.
//
// mutualBooking.test.js already covers the DB-backed atomic-claim invariants
// (via MongoMemoryReplSet) and cancelMutualSession's rollback race.
// rateLimiting.test.js covers the abuse limiters. Neither exercises the
// routes' own input validation and authorization branches over HTTP — this
// file does, following providerSearch.test.js/rateLimiting.test.js' pattern
// of mocking the Mongoose model statics instead of needing a live DB.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = require('../config/jwtSecret');
const User = require('../models/User');
const MutualBooking = require('../models/MutualBooking');
const mutualRoutesPath = require.resolve('../routes/mutualRoutes');

// mutualAbuseLimiter (POST /sessions) and the module-level JWT/session auth
// helper are shared per require — re-requiring fresh per test matches the
// isolation trick rateLimiting.test.js/providerSearch.test.js already use,
// so no test here can be flipped to 429 by an earlier test's requests.
function freshMutualRoutes() {
  delete require.cache[mutualRoutesPath];
  return require(mutualRoutesPath);
}

function startApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/mutual', router);
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

function tokenFor(id) {
  return jwt.sign({ id: String(id) }, JWT_SECRET);
}

function authed(id) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(id)}` };
}

// ── POST /api/mutual/sessions ──
test('POST /sessions: a missing inviteeEmail is rejected before any DB lookup', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', () => { throw new Error('must not be reached'); });

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions`, {
      method: 'POST', headers: authed(hostId), body: JSON.stringify({ duration: 30 })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /inviteeEmail is required/);
  } finally {
    server.close();
  }
});

test('POST /sessions: a duration outside 1..1440 is rejected before any DB lookup', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', () => { throw new Error('must not be reached'); });

  const { server, base } = startApp(freshMutualRoutes());
  try {
    for (const duration of [0, 1441, 'abc']) {
      const res = await fetch(`${base}/api/mutual/sessions`, {
        method: 'POST', headers: authed(hostId), body: JSON.stringify({ inviteeEmail: 'x@test.com', duration })
      });
      assert.equal(res.status, 400, `duration ${JSON.stringify(duration)} must be rejected`);
    }
  } finally {
    server.close();
  }
});

test('POST /sessions: a host without Google Calendar connected is refused before an invitee lookup', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', async () => ({ _id: hostId, googleAccessToken: null }));
  t.mock.method(User, 'findOne', () => { throw new Error('must not reach invitee lookup'); });

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions`, {
      method: 'POST', headers: authed(hostId), body: JSON.stringify({ inviteeEmail: 'x@test.com', duration: 30 })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /Connect your Google Calendar/);
  } finally {
    server.close();
  }
});

test('POST /sessions: inviting yourself is rejected', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const email = 'self@test.com';
  t.mock.method(User, 'findById', async () => ({ _id: hostId, email, googleAccessToken: 'tok' }));
  t.mock.method(User, 'findOne', async () => ({ _id: hostId, email, googleAccessToken: 'tok' }));

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions`, {
      method: 'POST', headers: authed(hostId), body: JSON.stringify({ inviteeEmail: email, duration: 30 })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /cannot schedule a mutual meeting with yourself/);
  } finally {
    server.close();
  }
});

test('POST /sessions: an invitee with no Google Calendar connected is refused', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', async () => ({ _id: hostId, email: 'host@test.com', googleAccessToken: 'tok' }));
  t.mock.method(User, 'findOne', async () => ({ _id: inviteeId, email: 'invitee@test.com', googleAccessToken: null }));

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions`, {
      method: 'POST', headers: authed(hostId), body: JSON.stringify({ inviteeEmail: 'invitee@test.com', duration: 30 })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /has not connected Google Calendar/);
  } finally {
    server.close();
  }
});

// ── POST /api/mutual/sessions/:id/confirm ──
test('POST /sessions/:id/confirm: an invalid date is rejected before any DB lookup', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(MutualBooking, 'findOne', () => { throw new Error('must not be reached'); });

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(userId),
      body: JSON.stringify({ date: '2026-02-30', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /valid ISO date/);
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/confirm: endTime at or before startTime is rejected before any DB lookup', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(MutualBooking, 'findOne', () => { throw new Error('must not be reached'); });

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(userId),
      body: JSON.stringify({ date: '2026-12-01', startTime: '10:30 AM', endTime: '10:00 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /Invalid time range/);
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/confirm: a non-existent session is a 404', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(MutualBooking, 'findOne', async () => null);

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_missing/confirm`, {
      method: 'POST', headers: authed(userId),
      body: JSON.stringify({ date: '2026-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 404);
    assert.match(data.error, /Session not found/);
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/confirm: a user who is neither host nor invitee is refused with 403', async (t) => {
  const outsiderId = new mongoose.Types.ObjectId();
  const existing = {
    sessionId: 'mut_x', duration: 30, locationId: 'jerusalem',
    hostId: new mongoose.Types.ObjectId(), inviteeId: new mongoose.Types.ObjectId()
  };
  t.mock.method(MutualBooking, 'findOne', async () => existing);

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(outsiderId),
      body: JSON.stringify({ date: '2026-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 403);
    assert.match(data.error, /Not authorized/);
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/confirm: a window whose length does not match the session duration is rejected', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const existing = {
    sessionId: 'mut_x', duration: 30, locationId: 'jerusalem',
    hostId, inviteeId: new mongoose.Types.ObjectId()
  };
  t.mock.method(MutualBooking, 'findOne', async () => existing);

  const { server, base } = startApp(freshMutualRoutes());
  try {
    // 60-minute window against a 30-minute session.
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ date: '2026-12-01', startTime: '10:00 AM', endTime: '11:00 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /exactly 30 minutes long/);
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/confirm: already-claimed (active -> processing lost the race) surfaces as 409, not a 500', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const existing = {
    sessionId: 'mut_x', duration: 30, locationId: 'jerusalem',
    hostId, inviteeId: new mongoose.Types.ObjectId()
  };
  t.mock.method(MutualBooking, 'findOne', async () => existing);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async () => null); // another request claimed it first

  const { server, base } = startApp(freshMutualRoutes());
  try {
    // Use a far-future date so the "past date" check never fires first.
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ date: '2099-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /already been claimed or cancelled/);
  } finally {
    server.close();
  }
});
