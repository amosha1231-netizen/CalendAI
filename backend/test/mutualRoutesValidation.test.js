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
const { google } = require('googleapis');

const JWT_SECRET = require('../config/jwtSecret');
const User = require('../models/User');
const MutualBooking = require('../models/MutualBooking');
const mutualAvailability = require('../services/mutualAvailability');
const googleCalendarService = require('../services/googleCalendar');
const mutualRoutesPath = require.resolve('../routes/mutualRoutes');

// mutualAbuseLimiter (POST /sessions) and the module-level JWT/session auth
// helper are shared per require — re-requiring fresh per test matches the
// isolation trick rateLimiting.test.js/providerSearch.test.js already use,
// so no test here can be flipped to 429 by an earlier test's requests.
function freshMutualRoutes() {
  delete require.cache[mutualRoutesPath];
  return require(mutualRoutesPath);
}

function startApp(router, { getUserSchedule, saveSchedulesNow } = {}) {
  const app = express();
  app.use(express.json());
  if (getUserSchedule) app.set('getUserSchedule', getUserSchedule);
  if (saveSchedulesNow) app.set('saveSchedulesNow', saveSchedulesNow);
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

test("POST /sessions: the host's own selected locationId is forwarded to the created session; omitted falls back to the default", async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', async () => ({ _id: hostId, email: 'host@test.com', googleAccessToken: 'tok' }));
  t.mock.method(User, 'findOne', async () => ({ _id: inviteeId, email: 'invitee@test.com', googleAccessToken: 'tok' }));
  const createCalls = [];
  t.mock.method(MutualBooking, 'create', async (doc) => { createCalls.push(doc); return doc; });

  const { server, base } = startApp(freshMutualRoutes());
  try {
    // The client (MutualScheduler.jsx) sends the host's own selectedLocation
    // preference as `locationId` — without that wiring, every mutual session
    // would silently use the 'jerusalem' default regardless of where either
    // party actually is, misjudging "today"/Shabbat cutoffs for both.
    const res1 = await fetch(`${base}/api/mutual/sessions`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ inviteeEmail: 'invitee@test.com', duration: 30, locationId: 'newyork' })
    });
    assert.equal(res1.status, 200);
    assert.equal(createCalls[0].locationId, 'newyork');

    const res2 = await fetch(`${base}/api/mutual/sessions`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ inviteeEmail: 'invitee@test.com', duration: 30 })
    });
    assert.equal(res2.status, 200);
    assert.equal(createCalls[1].locationId, 'jerusalem', 'an omitted locationId must still fall back to the default');
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

// No other test file drives POST /sessions/:id/confirm all the way through to
// a 200 — mutualBooking.test.js only exercises the atomic claim/cancel races
// directly against MutualBooking, never the full route (which also calls
// isSlotMutuallyFree, inserts two Google Calendar events, and pushes both
// users' local schedules). createOAuth2ClientWithRefresh and isSlotMutuallyFree
// are destructured by mutualRoutes.js at require time, so they're mocked on
// their source modules *before* freshMutualRoutes() forces a re-require (the
// same ordering mutualRoutes.js' own destructuring of mutualAvailability
// relies on elsewhere in this file); google.calendar is mutated on the shared
// googleapis singleton instead, which needs no re-require since mutualRoutes.js
// holds a reference to that same object, not a copy of the function.
test('POST /sessions/:id/confirm: a fully successful confirmation inserts both calendar events, pushes both schedules, and completes the session', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const existing = { sessionId: 'mut_x', duration: 30, locationId: 'jerusalem', hostId, inviteeId, subject: 'Sync' };
  const claimedSession = { ...existing, status: 'processing' };

  t.mock.method(MutualBooking, 'findOne', async () => existing);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async (filter, update) => {
    if (filter.status === 'active') return claimedSession;
    if (filter.status === 'processing') {
      return { ...claimedSession, status: 'completed', hostEventId: update.$set.hostEventId, inviteeEventId: update.$set.inviteeEventId, confirmedAt: update.$set.confirmedAt, lockedSlot: update.$set.lockedSlot };
    }
    throw new Error('unexpected findOneAndUpdate filter: ' + JSON.stringify(filter));
  });

  const hostUser = { _id: hostId, email: 'host@test.com', displayName: 'Host', googleAccessToken: 'tok-host', scheduleRevision: 0 };
  const inviteeUser = { _id: inviteeId, email: 'invitee@test.com', displayName: 'Invitee', googleAccessToken: 'tok-invitee', scheduleRevision: 0 };
  t.mock.method(User, 'findById', async (id) => (String(id) === String(hostId) ? hostUser : inviteeUser));
  const updateOneMock = t.mock.method(User, 'updateOne', async () => ({ matchedCount: 1 }));

  t.mock.method(mutualAvailability, 'isSlotMutuallyFree', async () => ({ free: true, timeZone: 'Asia/Jerusalem' }));
  t.mock.method(googleCalendarService, 'createOAuth2ClientWithRefresh', async () => ({}));

  const insertedEventIds = [];
  t.mock.method(google, 'calendar', () => ({
    events: {
      insert: async () => {
        const id = `evt-${insertedEventIds.length + 1}`;
        insertedEventIds.push(id);
        return { data: { id } };
      }
    }
  }));

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ date: '2099-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.session.status, 'completed');
    assert.equal(insertedEventIds.length, 2, 'both the host and invitee calendar events must be inserted');
    assert.equal(updateOneMock.mock.callCount(), 2, 'both the host and invitee schedules must be pushed');
  } finally {
    server.close();
  }
});

// providerRoutes.js' POST /:id/book and the legacy /api/booking/:id/confirm
// both mirror their MongoDB schedule push into server.js' in-memory
// getUserSchedule() cache (so a route that reads it without first reloading
// from Mongo, e.g. GET /api/schedule/expanded, doesn't serve stale data) —
// confirm must do the same for BOTH the host and the invitee, not just one.
test('POST /sessions/:id/confirm: a fully successful confirmation also syncs both the host\'s and invitee\'s in-memory schedule cache', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const existing = { sessionId: 'mut_cache', duration: 30, locationId: 'jerusalem', hostId, inviteeId, subject: 'Sync' };
  const claimedSession = { ...existing, status: 'processing' };

  t.mock.method(MutualBooking, 'findOne', async () => existing);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async (filter, update) => {
    if (filter.status === 'active') return claimedSession;
    if (filter.status === 'processing') {
      return { ...claimedSession, status: 'completed', hostEventId: update.$set.hostEventId, inviteeEventId: update.$set.inviteeEventId, confirmedAt: update.$set.confirmedAt, lockedSlot: update.$set.lockedSlot };
    }
    throw new Error('unexpected findOneAndUpdate filter: ' + JSON.stringify(filter));
  });

  const hostUser = { _id: hostId, email: 'host@test.com', displayName: 'Host', googleAccessToken: 'tok-host', scheduleRevision: 0 };
  const inviteeUser = { _id: inviteeId, email: 'invitee@test.com', displayName: 'Invitee', googleAccessToken: 'tok-invitee', scheduleRevision: 0 };
  t.mock.method(User, 'findById', async (id) => (String(id) === String(hostId) ? hostUser : inviteeUser));
  t.mock.method(User, 'updateOne', async () => ({ matchedCount: 1 }));
  t.mock.method(mutualAvailability, 'isSlotMutuallyFree', async () => ({ free: true, timeZone: 'Asia/Jerusalem' }));
  t.mock.method(googleCalendarService, 'createOAuth2ClientWithRefresh', async () => ({}));
  t.mock.method(google, 'calendar', () => ({ events: { insert: async () => ({ data: { id: 'evt-cache' } }) } }));

  const cacheByUser = { [String(hostId)]: { Tuesday: [] }, [String(inviteeId)]: { Tuesday: [] } };
  const getUserSchedule = (id) => cacheByUser[String(id)];
  let saveCalls = 0;
  const saveSchedulesNow = () => { saveCalls++; };

  const { server, base } = startApp(freshMutualRoutes(), { getUserSchedule, saveSchedulesNow });
  try {
    // 2099-12-01 is a Tuesday — the shared dayOfWeek pushToSchedule computes
    // from the ISO date, matching the cache entries seeded above.
    const res = await fetch(`${base}/api/mutual/sessions/mut_cache/confirm`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ date: '2099-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(cacheByUser[String(hostId)].Tuesday.length, 1, 'the host\'s cached Tuesday bucket must get the new event');
    assert.equal(cacheByUser[String(inviteeId)].Tuesday.length, 1, 'the invitee\'s cached Tuesday bucket must get the new event');
    assert.ok(cacheByUser[String(hostId)].Tuesday[0].title.includes('Invitee'), 'the host sees the invitee\'s name in the event title');
    assert.ok(cacheByUser[String(inviteeId)].Tuesday[0].title.includes('Host'), 'the invitee sees the host\'s name in the event title');
    assert.ok(saveCalls >= 1, 'saveSchedulesNow must be called after syncing the cache');
  } finally {
    server.close();
  }
});

// Neither the success test above nor mutualBooking.test.js' atomic-claim
// tests ever drive /confirm into its own failure/rollback branch — the one
// that re-checks isSlotMutuallyFree right before writing anything, and the
// claimed-session cleanup in the outer catch (rollbackCompletedSession +
// resetting status back to 'active'). Without this, a regression that made
// the race-guard rejection leak the claim (leaving the session stuck in
// 'processing' forever) would pass every other test in this suite.
test('POST /sessions/:id/confirm: the server-side race guard finding the slot no longer free surfaces as 409 and releases the claim back to active', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const existing = { sessionId: 'mut_x', duration: 30, locationId: 'jerusalem', hostId, inviteeId };
  const claimedSession = { ...existing, status: 'processing' };

  t.mock.method(MutualBooking, 'findOne', async () => existing);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async (filter) => {
    if (filter.status === 'active') return claimedSession;
    throw new Error('unexpected findOneAndUpdate filter: ' + JSON.stringify(filter));
  });
  const mutualUpdateOneMock = t.mock.method(MutualBooking, 'updateOne', async () => ({}));

  const hostUser = { _id: hostId, email: 'host@test.com', googleAccessToken: 'tok-host' };
  const inviteeUser = { _id: inviteeId, email: 'invitee@test.com', googleAccessToken: 'tok-invitee' };
  t.mock.method(User, 'findById', async (id) => (String(id) === String(hostId) ? hostUser : inviteeUser));
  const userUpdateOneMock = t.mock.method(User, 'updateOne', async () => ({ matchedCount: 1 }));

  t.mock.method(mutualAvailability, 'isSlotMutuallyFree', async () => ({ free: false, timeZone: 'Asia/Jerusalem' }));
  const insertMock = t.mock.fn(async () => { throw new Error('must not insert a Google Calendar event once the race guard rejects the slot'); });
  t.mock.method(google, 'calendar', () => ({ events: { insert: insertMock } }));

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ date: '2099-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /no longer available on both calendars/);
    assert.equal(insertMock.mock.callCount(), 0, 'no calendar event must be inserted once the race guard rejects the slot');
    assert.equal(mutualUpdateOneMock.mock.callCount(), 1, 'the claim must be released back to active, not left stuck in processing');
    assert.deepEqual(mutualUpdateOneMock.mock.calls[0].arguments[1], { $set: { status: 'active' } });
    assert.equal(userUpdateOneMock.mock.callCount(), 2, 'rollback must still attempt the schedule pull on both sides (a no-op here, since neither was ever pushed)');
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/confirm: a Google Calendar insertion failure deletes the already-inserted host event and releases the claim back to active', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const existing = { sessionId: 'mut_x', duration: 30, locationId: 'jerusalem', hostId, inviteeId };
  const claimedSession = { ...existing, status: 'processing' };

  t.mock.method(MutualBooking, 'findOne', async () => existing);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async (filter) => {
    if (filter.status === 'active') return claimedSession;
    throw new Error('unexpected findOneAndUpdate filter: ' + JSON.stringify(filter));
  });
  const mutualUpdateOneMock = t.mock.method(MutualBooking, 'updateOne', async () => ({}));

  const hostUser = { _id: hostId, email: 'host@test.com', googleAccessToken: 'tok-host' };
  const inviteeUser = { _id: inviteeId, email: 'invitee@test.com', googleAccessToken: 'tok-invitee' };
  t.mock.method(User, 'findById', async (id) => (String(id) === String(hostId) ? hostUser : inviteeUser));
  t.mock.method(User, 'updateOne', async () => ({ matchedCount: 1 }));

  t.mock.method(mutualAvailability, 'isSlotMutuallyFree', async () => ({ free: true, timeZone: 'Asia/Jerusalem' }));
  t.mock.method(googleCalendarService, 'createOAuth2ClientWithRefresh', async () => ({}));

  const deletedEventIds = [];
  let insertCallCount = 0;
  t.mock.method(google, 'calendar', () => ({
    events: {
      insert: async () => {
        insertCallCount += 1;
        if (insertCallCount === 1) return { data: { id: 'evt-host-1' } }; // host's insert succeeds
        throw new Error('Google API rate limit exceeded'); // invitee's insert fails
      },
      delete: async ({ eventId }) => { deletedEventIds.push(eventId); }
    }
  }));

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ date: '2099-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 502);
    assert.match(data.error, /Google Calendar insertion failed/);
    assert.deepEqual(deletedEventIds, ['evt-host-1'], 'the host event that was already inserted must be rolled back, never left orphaned on their calendar');
    assert.equal(mutualUpdateOneMock.mock.callCount(), 1, 'the claim must be released back to active, not left stuck in processing');
    assert.deepEqual(mutualUpdateOneMock.mock.calls[0].arguments[1], { $set: { status: 'active' } });
  } finally {
    server.close();
  }
});

// Neither of the two tests above ever reaches pushToSchedule's own
// optimistic-concurrency check (both calendar events insert fine in the
// first, and the gcal failure in the second happens before any push is
// attempted) — so a regression that let a lost scheduleRevision race fall
// through silently (never throwing, or throwing but leaking the claim/
// orphaning the already-inserted calendar events) would pass every other
// test in this suite. Covers both the host's push losing the race (invitee's
// push never even attempted) and the invitee's push losing it after the
// host's already landed.
test('POST /sessions/:id/confirm: the host schedule push losing its optimistic-concurrency race deletes both calendar events and releases the claim back to active', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const existing = { sessionId: 'mut_x', duration: 30, locationId: 'jerusalem', hostId, inviteeId };
  const claimedSession = { ...existing, status: 'processing' };

  t.mock.method(MutualBooking, 'findOne', async () => existing);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async (filter) => {
    if (filter.status === 'active') return claimedSession;
    throw new Error('unexpected findOneAndUpdate filter: ' + JSON.stringify(filter));
  });
  const mutualUpdateOneMock = t.mock.method(MutualBooking, 'updateOne', async () => ({}));

  const hostUser = { _id: hostId, email: 'host@test.com', googleAccessToken: 'tok-host', scheduleRevision: 0 };
  const inviteeUser = { _id: inviteeId, email: 'invitee@test.com', googleAccessToken: 'tok-invitee', scheduleRevision: 0 };
  t.mock.method(User, 'findById', async (id) => (String(id) === String(hostId) ? hostUser : inviteeUser));
  // Both calendar inserts succeed before either schedule push is attempted —
  // the host's push below is the first thing to fail.
  const userUpdateOneMock = t.mock.method(User, 'updateOne', async () => ({ matchedCount: 0 }));

  t.mock.method(mutualAvailability, 'isSlotMutuallyFree', async () => ({ free: true, timeZone: 'Asia/Jerusalem' }));
  t.mock.method(googleCalendarService, 'createOAuth2ClientWithRefresh', async () => ({}));

  const insertedEventIds = [];
  const deletedEventIds = [];
  t.mock.method(google, 'calendar', () => ({
    events: {
      insert: async () => {
        const id = `evt-${insertedEventIds.length + 1}`;
        insertedEventIds.push(id);
        return { data: { id } };
      },
      delete: async ({ eventId }) => { deletedEventIds.push(eventId); }
    }
  }));

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ date: '2099-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /host schedule changed/);
    assert.equal(insertedEventIds.length, 2, 'both calendar events must already have been inserted before the host push runs');
    assert.deepEqual(new Set(deletedEventIds), new Set(insertedEventIds), 'both already-inserted calendar events must be rolled back, never left orphaned');
    assert.equal(userUpdateOneMock.mock.callCount(), 3, '1 failed host push + 2 rollback schedule pulls (host and invitee)');
    assert.equal(mutualUpdateOneMock.mock.callCount(), 1, 'the claim must be released back to active, not left stuck in processing');
    assert.deepEqual(mutualUpdateOneMock.mock.calls[0].arguments[1], { $set: { status: 'active' } });
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/confirm: the invitee schedule push losing its optimistic-concurrency race (after the host\'s already landed) still rolls everything back', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const existing = { sessionId: 'mut_x', duration: 30, locationId: 'jerusalem', hostId, inviteeId };
  const claimedSession = { ...existing, status: 'processing' };

  t.mock.method(MutualBooking, 'findOne', async () => existing);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async (filter) => {
    if (filter.status === 'active') return claimedSession;
    throw new Error('unexpected findOneAndUpdate filter: ' + JSON.stringify(filter));
  });
  const mutualUpdateOneMock = t.mock.method(MutualBooking, 'updateOne', async () => ({}));

  const hostUser = { _id: hostId, email: 'host@test.com', googleAccessToken: 'tok-host', scheduleRevision: 0 };
  const inviteeUser = { _id: inviteeId, email: 'invitee@test.com', googleAccessToken: 'tok-invitee', scheduleRevision: 0 };
  t.mock.method(User, 'findById', async (id) => (String(id) === String(hostId) ? hostUser : inviteeUser));

  let updateOneCallCount = 0;
  const userUpdateOneMock = t.mock.method(User, 'updateOne', async () => {
    updateOneCallCount += 1;
    // 1st call: the host's own push, succeeds. 2nd call: the invitee's push,
    // loses its race. Later calls are the rollback's schedule pulls.
    if (updateOneCallCount === 2) return { matchedCount: 0 };
    return { matchedCount: 1 };
  });

  t.mock.method(mutualAvailability, 'isSlotMutuallyFree', async () => ({ free: true, timeZone: 'Asia/Jerusalem' }));
  t.mock.method(googleCalendarService, 'createOAuth2ClientWithRefresh', async () => ({}));

  const insertedEventIds = [];
  const deletedEventIds = [];
  t.mock.method(google, 'calendar', () => ({
    events: {
      insert: async () => {
        const id = `evt-${insertedEventIds.length + 1}`;
        insertedEventIds.push(id);
        return { data: { id } };
      },
      delete: async ({ eventId }) => { deletedEventIds.push(eventId); }
    }
  }));

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/confirm`, {
      method: 'POST', headers: authed(hostId),
      body: JSON.stringify({ date: '2099-12-01', startTime: '10:00 AM', endTime: '10:30 AM' })
    });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /invitee schedule changed/);
    assert.deepEqual(new Set(deletedEventIds), new Set(insertedEventIds), 'both already-inserted calendar events must be rolled back, even though the host\'s own push had already succeeded');
    assert.equal(userUpdateOneMock.mock.callCount(), 4, '1 successful host push + 1 failed invitee push + 2 rollback schedule pulls');
    assert.equal(mutualUpdateOneMock.mock.callCount(), 1, 'the claim must be released back to active, not left stuck in processing');
    assert.deepEqual(mutualUpdateOneMock.mock.calls[0].arguments[1], { $set: { status: 'active' } });
  } finally {
    server.close();
  }
});

// ── GET /api/mutual/lookup ──
// No test file touches this route directly today: rateLimiting.test.js only
// exercises its abuse limiter (unauthenticated, so every request it sends
// gets a 401 before `lookup`'s own found/hasGoogle branches ever run), and
// mutualBooking.test.js never calls the HTTP route at all. The actual
// found/not-found/hasGoogle response shape is this route's whole job (it's
// the account-enumeration-oracle surface the mutualAbuseLimiter comment in
// mutualRoutes.js is about), so it deserves its own coverage.
test('GET /lookup: a missing email is rejected before any DB lookup', async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/lookup?email=`, { headers: authed(callerId) });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /lookup: an unknown email resolves found:false without leaking anything else', async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/lookup?email=nobody@example.com`, { headers: authed(callerId) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data, { found: false, hasGoogle: false });
  } finally {
    server.close();
  }
});

test('GET /lookup: a known email with no Google Calendar connected resolves found:true, hasGoogle:false', async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => ({
    select: () => ({ lean: async () => ({ displayName: 'Dana', email: 'dana@example.com', googleAccessToken: null }) })
  }));
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/lookup?email=dana@example.com`, { headers: authed(callerId) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data, { found: true, hasGoogle: false, displayName: 'Dana' });
  } finally {
    server.close();
  }
});

test('GET /lookup: a known, Google-connected email resolves found:true, hasGoogle:true — never the raw token', async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => ({
    select: () => ({ lean: async () => ({ displayName: 'Dana', email: 'dana@example.com', googleAccessToken: 'secret-token-value' }) })
  }));
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/lookup?email=dana@example.com`, { headers: authed(callerId) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data, { found: true, hasGoogle: true, displayName: 'Dana' });
    assert.ok(!JSON.stringify(data).includes('secret-token-value'), 'the access token itself must never be exposed to the client');
  } finally {
    server.close();
  }
});

// ── GET /api/mutual/sessions/:id/availability ──
// Nothing else in test/ exercises this route over HTTP: mutualAvailability.test.js
// only unit-tests getMutualFreeSlots' pure math, and rateLimiting.test.js only
// drives it unauthenticated (every request there 401s before reaching any of
// these branches). The session-state/authorization/Google-connection gates and
// the success response shape are untested without this.
test('GET /sessions/:id/availability: a non-existent session is a 404', async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  t.mock.method(MutualBooking, 'findOne', async () => null);
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_missing/availability`, { headers: authed(callerId) });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /sessions/:id/availability: a user who is neither host nor invitee is refused with 403', async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  const session = {
    sessionId: 'mut_x', status: 'active',
    hostId: new mongoose.Types.ObjectId(), inviteeId: new mongoose.Types.ObjectId()
  };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  t.mock.method(User, 'findById', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/availability`, { headers: authed(callerId) });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('GET /sessions/:id/availability: a session still being confirmed (processing) is a 409, not a stale slot list', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const session = { sessionId: 'mut_x', status: 'processing', hostId, inviteeId: new mongoose.Types.ObjectId() };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/availability`, { headers: authed(hostId) });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /being confirmed/);
  } finally {
    server.close();
  }
});

test('GET /sessions/:id/availability: a completed or cancelled session is a 409', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const session = { sessionId: 'mut_x', status: 'completed', hostId, inviteeId: new mongoose.Types.ObjectId() };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/availability`, { headers: authed(hostId) });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /no longer active/);
  } finally {
    server.close();
  }
});

test('GET /sessions/:id/availability: a missing host or invitee account is a 404', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const session = { sessionId: 'mut_x', status: 'active', hostId, inviteeId: new mongoose.Types.ObjectId() };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  t.mock.method(User, 'findById', async () => null);
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/availability`, { headers: authed(hostId) });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /sessions/:id/availability: either side missing Google Calendar is a 409, never a bare slot list', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const session = { sessionId: 'mut_x', status: 'active', hostId, inviteeId };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  t.mock.method(User, 'findById', async (id) => (
    String(id) === String(hostId) ? { _id: hostId, googleAccessToken: 'tok-host' } : { _id: inviteeId, googleAccessToken: null }
  ));
  const freeSlotsMock = t.mock.method(mutualAvailability, 'getMutualFreeSlots', async () => { throw new Error('must not compute availability without both calendars connected'); });
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/availability`, { headers: authed(hostId) });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /must have Google Calendar connected/);
    assert.equal(freeSlotsMock.mock.callCount(), 0);
  } finally {
    server.close();
  }
});

test('GET /sessions/:id/availability: a successful lookup returns the computed days, and clamps an out-of-range rangeDays', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const session = { sessionId: 'mut_x', status: 'active', hostId, inviteeId, subject: 'Coffee', duration: 30, locationId: 'jerusalem' };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  t.mock.method(User, 'findById', async (id) => (
    String(id) === String(hostId) ? { _id: hostId, googleAccessToken: 'tok-host' } : { _id: inviteeId, googleAccessToken: 'tok-invitee' }
  ));
  const fakeDays = [{ date: '2026-12-01', day: 'Tuesday', freeSlots: [{ startTime: '10:00 AM', endTime: '10:30 AM', durationMinutes: 30 }] }];
  const freeSlotsMock = t.mock.method(mutualAvailability, 'getMutualFreeSlots', async (host, invitee, opts) => {
    assert.equal(opts.rangeDays, 14, 'rangeDays above the 14-day ceiling must be clamped down');
    assert.equal(opts.duration, 30);
    assert.equal(opts.locationId, 'jerusalem');
    return fakeDays;
  });
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/availability?rangeDays=999`, { headers: authed(hostId) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data, { ok: true, subject: 'Coffee', duration: 30, days: fakeDays });
    assert.equal(freeSlotsMock.mock.callCount(), 1);
  } finally {
    server.close();
  }
});

// ── POST /api/mutual/sessions/:id/cancel ──
// mutualBooking.test.js exercises cancelMutualSession() (the exported helper)
// directly against a real DB; it never calls the route itself, so the
// route's own auth/authorization layer (requireAuth + loadAuthorizedSession)
// in front of that helper has no coverage anywhere else.
test('POST /sessions/:id/cancel: unauthenticated request is rejected before any DB lookup', async (t) => {
  t.mock.method(MutualBooking, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/cancel`, { method: 'POST' });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/cancel: a non-existent session is a 404', async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  t.mock.method(MutualBooking, 'findOne', async () => null);
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_missing/cancel`, { method: 'POST', headers: authed(callerId) });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/cancel: a user who is neither host nor invitee is refused with 403, and the session is left untouched', async (t) => {
  const callerId = new mongoose.Types.ObjectId();
  const session = {
    sessionId: 'mut_x', status: 'active',
    hostId: new mongoose.Types.ObjectId(), inviteeId: new mongoose.Types.ObjectId()
  };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  const updateMock = t.mock.method(MutualBooking, 'findOneAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/cancel`, { method: 'POST', headers: authed(callerId) });
    assert.equal(res.status, 403);
    assert.equal(updateMock.mock.callCount(), 0);
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/cancel: cancelling an already-cancelled session is idempotent, not an error', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const session = { sessionId: 'mut_x', status: 'cancelled', hostId, inviteeId: new mongoose.Types.ObjectId() };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  const updateMock = t.mock.method(MutualBooking, 'findOneAndUpdate', () => { throw new Error('must not reach the atomic cancel update again'); });
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/cancel`, { method: 'POST', headers: authed(hostId) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data, { ok: true, alreadyCancelled: true });
    assert.equal(updateMock.mock.callCount(), 0, 'an already-cancelled session must short-circuit before the atomic update');
  } finally {
    server.close();
  }
});

test('POST /sessions/:id/cancel: the invitee (not just the host) is authorized to cancel an active session', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const session = { sessionId: 'mut_x', status: 'active', hostId, inviteeId };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async () => ({ ...session, status: 'cancelled' }));
  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/cancel`, { method: 'POST', headers: authed(inviteeId) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.alreadyCancelled, false);
  } finally {
    server.close();
  }
});

// mutualBooking.test.js' "cancelMutualSession: cancelling an already-completed
// session rolls back its mirrored schedule entries on both sides" exercises
// this same rollback, but with no googleAccessToken on either fixture user —
// so rollbackCompletedSession's two `if (eventId && user?.googleAccessToken)`
// branches (the actual Google Calendar event deletions) never run there.
// Nothing else in this suite drives POST /:id/cancel against a *completed*
// session either — every other /cancel test above uses 'active' or
// 'cancelled'. Without this test, a regression that stopped the cancel route
// from deleting a completed session's Google Calendar events (e.g. passing
// the wrong doc shape into rollbackCompletedSession, or losing the
// hostEventId/inviteeEventId off the pre-image) would pass every other test
// in this file.
test('POST /sessions/:id/cancel: cancelling a completed session deletes both Google Calendar events', async (t) => {
  const hostId = new mongoose.Types.ObjectId();
  const inviteeId = new mongoose.Types.ObjectId();
  const session = {
    sessionId: 'mut_x', status: 'completed', hostId, inviteeId,
    hostEventId: 'h-evt-1', inviteeEventId: 'i-evt-1'
  };
  t.mock.method(MutualBooking, 'findOne', async () => session);
  t.mock.method(MutualBooking, 'findOneAndUpdate', async (filter) => {
    assert.deepEqual(filter, { sessionId: 'mut_x', status: { $ne: 'cancelled' } });
    return session; // pre-image: still 'completed' the instant the update applied
  });

  const hostUser = { _id: hostId, googleAccessToken: 'tok-host' };
  const inviteeUser = { _id: inviteeId, googleAccessToken: 'tok-invitee' };
  t.mock.method(User, 'findById', async (id) => (String(id) === String(hostId) ? hostUser : inviteeUser));
  const userUpdateOneMock = t.mock.method(User, 'updateOne', async () => ({}));
  t.mock.method(googleCalendarService, 'createOAuth2ClientWithRefresh', async () => ({}));

  const deletedEventIds = [];
  t.mock.method(google, 'calendar', () => ({
    events: { delete: async ({ eventId }) => { deletedEventIds.push(eventId); } }
  }));

  const { server, base } = startApp(freshMutualRoutes());
  try {
    const res = await fetch(`${base}/api/mutual/sessions/mut_x/cancel`, { method: 'POST', headers: authed(hostId) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.alreadyCancelled, false);
    assert.deepEqual(deletedEventIds, ['h-evt-1', 'i-evt-1'], 'both the host\'s and invitee\'s Google Calendar events must be deleted, not left orphaned');
    assert.equal(userUpdateOneMock.mock.callCount(), 2, 'the mirrored schedule entry must be pulled from both the host\'s and invitee\'s User docs');
  } finally {
    server.close();
  }
});
