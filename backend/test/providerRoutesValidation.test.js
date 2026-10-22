// ──────────────────────────────────────────────
// Characterization tests for providerRoutes.js' HTTP-level request
// validation and authorization branches on the routes nothing else in
// test/ exercises end-to-end:
//   - PUT /api/providers/me          (services/availability validation)
//   - GET /api/providers/:id/availability (id/date/serviceId validation, 404s)
//   - POST /api/providers/:id/book   (validation, 404s, the 409 "slot taken" path)
//   - POST /api/providers/bookings/:id/cancel (auth/ownership branches)
//
// providerSearch.test.js only covers GET / (browse) and escapeRegex;
// providerGoogleAvailability.test.js only calls computeAvailableSlots()
// directly (not via HTTP); providerProfile.test.js only covers
// mapServicesForSave(). None of them touch the routes above, which is where
// this feature's money-adjacent booking/cancel logic and auth checks live.
//
// Same no-MongoMemoryReplSet pattern as mutualRoutesValidation.test.js:
// Mongoose model statics are stubbed with t.mock.method, and the
// server.js-provided req.app.get(...) helpers (timeToMinutes,
// getAuthenticatedUserId, etc.) are supplied directly via app.set() on a
// bare Express app standing in for server.js.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');

const providerRoutesPath = require.resolve('../routes/providerRoutes');
const User = require('../models/User');
const ProviderBooking = require('../models/ProviderBooking');
const mutualAvailability = require('../services/mutualAvailability');
const { selfLosesOverlapRace } = require('../routes/providerRoutes');

function freshProviderRoutes() {
  delete require.cache[providerRoutesPath];
  return require(providerRoutesPath);
}

// Mirrors server.js' own helper (see providerGoogleAvailability.test.js'
// identical copy, kept local here too so this file has no cross-file
// dependency on another test's helper).
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function startApp(router, {
  userId = null,
  getTodayDayName = () => 'Monday',
  syncEventToGoogleCalendar = async () => ({ success: true, eventId: 'gcal-evt-test' })
} = {}) {
  const app = express();
  app.use(express.json());
  app.set('timeToMinutes', timeToMinutes);
  app.set('getAuthenticatedUserId', () => userId);
  app.set('getDefaultSchedule', () => ({}));
  app.set('getTodayDayName', getTodayDayName);
  app.set('syncEventToGoogleCalendar', syncEventToGoogleCalendar);
  app.set('DEFAULT_LOCATION_ID', 'jerusalem');
  app.set('getUserSchedule', () => null);
  app.set('saveSchedulesNow', () => {});
  app.use('/api/providers', router);
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

// ── PUT /api/providers/me ──
test('PUT /me: unauthenticated request is rejected before any DB write', async (t) => {
  t.mock.method(User, 'findByIdAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId: null });
  try {
    const res = await fetch(`${base}/api/providers/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true })
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('PUT /me: a service with a missing name is rejected before any DB write', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findByIdAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ services: [{ name: '  ', duration: 30 }] })
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('PUT /me: a service duration outside 5..480 is rejected', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findByIdAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    for (const duration of [1, 481, 'abc']) {
      const res = await fetch(`${base}/api/providers/me`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: [{ name: 'Haircut', duration }] })
      });
      assert.equal(res.status, 400, `duration ${JSON.stringify(duration)} must be rejected`);
    }
  } finally {
    server.close();
  }
});

test('PUT /me: a negative service price is rejected', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findByIdAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ services: [{ name: 'Haircut', duration: 30, price: -5 }] })
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('PUT /me: Saturday is rejected as an availability day (Shabbat is never bookable)', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findByIdAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability: [{ day: 'Saturday', startTime: '09:00 AM', endTime: '05:00 PM' }] })
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('PUT /me: an availability row whose end is not after its start is rejected', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findByIdAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability: [{ day: 'Monday', startTime: '05:00 PM', endTime: '09:00 AM' }] })
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('PUT /me: more than MAX_SERVICES services is rejected', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findByIdAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const services = Array.from({ length: 21 }, (_, i) => ({ name: `Service ${i}`, duration: 30 }));
    const res = await fetch(`${base}/api/providers/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ services })
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('PUT /me: a valid payload reaches User.findByIdAndUpdate and round-trips the saved profile', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findByIdAndUpdate', (id, update) => ({
    select: () => ({
      lean: async () => ({ providerProfile: { enabled: true, services: update.$set['providerProfile.services'] } })
    })
  }));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, services: [{ name: 'Haircut', duration: 30, price: 50 }] })
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.providerProfile.enabled, true);
  } finally {
    server.close();
  }
});

// ── GET /api/providers/me ──
// Nothing else in test/ exercises this route: providerProfile.test.js only
// unit-tests mapServicesForSave(), and PUT /me above never calls GET /me.
test('GET /me: unauthenticated request is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findById', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId: null });
  try {
    const res = await fetch(`${base}/api/providers/me`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('GET /me: an account that no longer exists is a 404', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => null }) }));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /me: a signed-in user with no provider profile yet gets null, not a 500', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: userId }) }) }));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data, { ok: true, providerProfile: null });
  } finally {
    server.close();
  }
});

test('GET /me: an existing profile round-trips as-is', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const providerProfile = { enabled: true, businessName: 'Dana\'s Studio', services: [] };
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: userId, providerProfile }) }) }));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data.providerProfile, providerProfile);
  } finally {
    server.close();
  }
});

// ── GET /api/providers/:id ──
// providerSearch.test.js only covers the browse list (GET /); the single
// public-profile route (used by ProviderBookingView.jsx to load a provider
// before showing its services) has no coverage anywhere else.
test('GET /:id: a malformed provider id is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const res = await fetch(`${base}/api/providers/not-a-valid-id`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /:id: an unknown or disabled provider is a 404', async (t) => {
  t.mock.method(User, 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const res = await fetch(`${base}/api/providers/${new mongoose.Types.ObjectId()}`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /:id: an enabled provider\'s inactive services are filtered out of the public response', async (t) => {
  const activeId = new mongoose.Types.ObjectId();
  const inactiveId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => ({
    select: () => ({
      lean: async () => ({
        _id: new mongoose.Types.ObjectId(),
        displayName: 'Dana',
        providerProfile: {
          businessName: 'Dana\'s Studio', bio: 'Haircuts', category: 'barber', locationId: 'jerusalem',
          services: [
            { _id: activeId, name: 'Haircut', duration: 30, price: 50, active: true },
            { _id: inactiveId, name: 'Retired service', duration: 30, price: 50, active: false }
          ]
        }
      })
    })
  }));
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const res = await fetch(`${base}/api/providers/${new mongoose.Types.ObjectId()}`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.provider.services.length, 1);
    assert.equal(data.provider.services[0]._id, activeId.toString());
  } finally {
    server.close();
  }
});

// ── GET /api/providers/:id/availability ──
test('GET /:id/availability: a malformed provider id is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const res = await fetch(`${base}/api/providers/not-a-valid-id/availability?date=2026-12-01&serviceId=${new mongoose.Types.ObjectId()}`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /:id/availability: a malformed date is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/availability?date=not-a-date&serviceId=${new mongoose.Types.ObjectId()}`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /:id/availability: a missing/malformed serviceId is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/availability?date=2026-12-01&serviceId=not-valid`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /:id/availability: an unknown/disabled provider is a 404', async (t) => {
  t.mock.method(User, 'findOne', () => Promise.resolve(null));
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/availability?date=2026-12-01&serviceId=${new mongoose.Types.ObjectId()}`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /:id/availability: a past date is rejected relative to the provider\'s own location timezone', async (t) => {
  const serviceId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: new mongoose.Types.ObjectId(),
    providerProfile: { locationId: 'jerusalem', services: [{ _id: serviceId, name: 'Haircut', duration: 30, active: true }], availability: [] }
  }));
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/availability?date=2020-01-01&serviceId=${serviceId}`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET /:id/availability: a serviceId that does not belong to this provider (or is inactive) is a 404', async (t) => {
  const otherServiceId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: new mongoose.Types.ObjectId(),
    providerProfile: {
      locationId: 'jerusalem',
      services: [{ _id: otherServiceId, name: 'Haircut', duration: 30, active: false }],
      availability: []
    }
  }));
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/availability?date=2026-12-01&serviceId=${otherServiceId}`);
    assert.equal(res.status, 404, 'an inactive service must not be bookable even if the id matches');
  } finally {
    server.close();
  }
});

// ── POST /api/providers/:id/book ──
test('POST /:id/book: a missing guestName is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: new mongoose.Types.ObjectId().toString(), date: '2026-12-01', startTime: '10:00 AM' })
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('POST /:id/book: an over-length guestNotes is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: new mongoose.Types.ObjectId().toString(), date: '2026-12-01', startTime: '10:00 AM',
        guestName: 'Guest', guestNotes: 'x'.repeat(2001)
      })
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('POST /:id/book: an over-length guestEmail or guestPhone is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const base_body = { serviceId: new mongoose.Types.ObjectId().toString(), date: '2026-12-01', startTime: '10:00 AM', guestName: 'Guest' };
    const resEmail = await fetch(`${base}/api/providers/${id}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base_body, guestEmail: 'x'.repeat(201) })
    });
    assert.equal(resEmail.status, 400);
    const resPhone = await fetch(`${base}/api/providers/${id}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base_body, guestPhone: 'x'.repeat(51) })
    });
    assert.equal(resPhone.status, 400);
  } finally {
    server.close();
  }
});

test('POST /:id/book: an unknown/disabled provider is a 404', async (t) => {
  t.mock.method(User, 'findOne', () => Promise.resolve(null));
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: new mongoose.Types.ObjectId().toString(), date: '2026-12-01', startTime: '10:00 AM', guestName: 'Guest' })
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('POST /:id/book: a slot that is no longer available is a 409, not a silent booking', async (t) => {
  const serviceId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: new mongoose.Types.ObjectId(),
    googleAccessToken: null,
    schedule: {},
    providerProfile: {
      locationId: 'jerusalem',
      // Monday 2026-12-07 availability 09:00-09:30 only — the client asks for 10:00, which can't match.
      services: [{ _id: serviceId, name: 'Haircut', duration: 30, active: true }],
      availability: [{ day: 'Monday', startTime: '09:00 AM', endTime: '09:30 AM' }]
    }
  }));
  t.mock.method(ProviderBooking, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const createMock = t.mock.method(ProviderBooking, 'create', () => { throw new Error('must not create a booking for an unavailable slot'); });

  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: serviceId.toString(), date: '2026-12-07', startTime: '10:00 AM', guestName: 'Guest' })
    });
    assert.equal(res.status, 409);
    assert.equal(createMock.mock.callCount(), 0);
  } finally {
    server.close();
  }
});

// ── selfLosesOverlapRace: deterministic tiebreak for the post-insert overlap recheck ──
// Two different-duration services can slice to different startTimes, so the
// unique providerId+date+startTime index alone can't stop two concurrent
// bookings from overlapping. Without a deterministic tiebreak, two requests
// that both insert before either runs its recheck would each see only the
// other as "the" conflict and both self-delete, losing the slot entirely
// instead of leaving exactly one booking standing.
test('selfLosesOverlapRace: a booking with a later createdAt than its overlapping conflict loses', () => {
  const selfId = new mongoose.Types.ObjectId();
  const otherId = new mongoose.Types.ObjectId();
  const loses = selfLosesOverlapRace(
    { _id: selfId, createdAt: new Date('2026-01-01T00:00:01.000Z') },
    [{ _id: otherId, createdAt: new Date('2026-01-01T00:00:00.000Z') }]
  );
  assert.equal(loses, true, 'the booking created after its conflict must be the one that self-deletes');
});

test('selfLosesOverlapRace: a booking with an earlier createdAt than its overlapping conflict wins (survives)', () => {
  const selfId = new mongoose.Types.ObjectId();
  const otherId = new mongoose.Types.ObjectId();
  const loses = selfLosesOverlapRace(
    { _id: selfId, createdAt: new Date('2026-01-01T00:00:00.000Z') },
    [{ _id: otherId, createdAt: new Date('2026-01-01T00:00:01.000Z') }]
  );
  assert.equal(loses, false, 'the booking created before its conflict must not self-delete');
});

test('selfLosesOverlapRace: a tie on createdAt is broken by _id, and both sides of the comparison agree', () => {
  const idA = new mongoose.Types.ObjectId('000000000000000000000001');
  const idB = new mongoose.Types.ObjectId('000000000000000000000002');
  const sameInstant = new Date('2026-01-01T00:00:00.000Z');

  const aLoses = selfLosesOverlapRace({ _id: idA, createdAt: sameInstant }, [{ _id: idB, createdAt: sameInstant }]);
  const bLoses = selfLosesOverlapRace({ _id: idB, createdAt: sameInstant }, [{ _id: idA, createdAt: sameInstant }]);

  assert.notEqual(aLoses, bLoses, 'exactly one side of a tied race must lose so exactly one booking survives');
  assert.equal(bLoses, true, 'the larger _id loses the tiebreak (smaller _id wins)');
});

test('POST /:id/book: a booking that slips in between the availability read and this request\'s own insert — the later-created one self-deletes with a 409', async (t) => {
  const serviceId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: providerId,
    googleAccessToken: null,
    schedule: {},
    providerProfile: {
      locationId: 'jerusalem',
      services: [{ _id: serviceId, name: 'Massage', duration: 45, active: true }],
      availability: [{ day: 'Monday', startTime: '09:00 AM', endTime: '11:00 AM' }]
    }
  }));
  // A conflicting booking that overlaps the requested 09:00-09:45 AM slot but
  // wasn't there yet when computeAvailableSlots read the DB (1st find() call
  // below returns nothing, so 09:00 AM is offered as free) — only landing by
  // the time the post-insert recheck runs (2nd find() call). Different
  // startTime/duration than this request, so the unique index never caught it.
  const conflictingOther = {
    _id: new mongoose.Types.ObjectId(),
    startTime: '09:15 AM',
    endTime: '09:45 AM',
    createdAt: new Date('2026-12-07T09:00:00.000Z')
  };
  let findCallCount = 0;
  t.mock.method(ProviderBooking, 'find', () => {
    findCallCount += 1;
    const rows = findCallCount === 1 ? [] : [conflictingOther];
    return { select: () => ({ lean: async () => rows }) };
  });
  const createdBooking = {
    _id: new mongoose.Types.ObjectId(),
    createdAt: new Date('2026-12-07T09:00:01.000Z'), // after the conflict above
  };
  t.mock.method(ProviderBooking, 'create', () => Promise.resolve(createdBooking));
  const deleteMock = t.mock.method(ProviderBooking, 'deleteOne', () => Promise.resolve({ deletedCount: 1 }));

  const { server, base } = startApp(freshProviderRoutes());
  try {
    const res = await fetch(`${base}/api/providers/${providerId}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: serviceId.toString(), date: '2026-12-07', startTime: '09:00 AM', guestName: 'Guest' })
    });
    assert.equal(res.status, 409);
    assert.equal(findCallCount, 2, 'expected one find() for availability and one for the post-insert overlap recheck');
    assert.equal(deleteMock.mock.callCount(), 1, 'the losing (later-created) booking must delete itself');
    assert.equal(deleteMock.mock.calls[0].arguments[0]._id, createdBooking._id, 'it must delete its own document, not the conflicting one');
  } finally {
    server.close();
  }
});

// A booking's "Today" schedule-mirror decision must come from the PROVIDER's
// own location timezone (see providerRoutes.js' providerTodayDayName), not
// server.js's generic getTodayDayName() app helper — that one resolves from
// the *requesting* visitor's own timezone (server.js's request-scoped
// AsyncLocalStorage), which is right for a user managing their own schedule
// but wrong for an anonymous guest, in any timezone, booking a provider
// elsewhere. This test fakes "now" to a real instant that is Monday in
// Asia/Jerusalem, and deliberately lies via the getTodayDayName stub with a
// different day — the push must still land in schedule.Today, proving the
// route never consults that stub for this decision.
test('POST /:id/book: a successful booking\'s "Today" push is decided by the provider\'s own location timezone, not the getTodayDayName app helper', async (t) => {
  const serviceId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  // 2026-12-07T08:00:00Z = 10:00 AM in Asia/Jerusalem (UTC+2 in December),
  // which is Monday Dec 7 — the exact day being booked.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-12-07T08:00:00Z').getTime() });
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: providerId,
    googleAccessToken: null,
    schedule: {},
    scheduleRevision: 0,
    providerProfile: {
      locationId: 'jerusalem',
      services: [{ _id: serviceId, name: 'Haircut', duration: 30, active: true }],
      availability: [{ day: 'Monday', startTime: '09:00 AM', endTime: '11:00 AM' }]
    }
  }));
  t.mock.method(ProviderBooking, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const createdBooking = {
    _id: new mongoose.Types.ObjectId(),
    createdAt: new Date('2026-12-07T08:00:01.000Z'),
    day: 'Monday',
    async save() { return this; },
    toObject() { return { _id: this._id, status: this.status }; }
  };
  t.mock.method(ProviderBooking, 'create', () => Promise.resolve(createdBooking));
  const updateOneMock = t.mock.method(User, 'updateOne', () => Promise.resolve({ matchedCount: 1 }));

  // Deliberately wrong day — if the route ever fell back to consulting this,
  // the "Today" push below would not happen and the test would fail.
  const { server, base } = startApp(freshProviderRoutes(), { getTodayDayName: () => 'Wednesday' });
  try {
    const res = await fetch(`${base}/api/providers/${providerId}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: serviceId.toString(), date: '2026-12-07', startTime: '10:00 AM', guestName: 'Guest' })
    });
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(updateOneMock.mock.callCount(), 1);
    const [, update] = updateOneMock.mock.calls[0].arguments;
    assert.ok(update.$push['schedule.Monday'], 'the booked day itself must always be pushed');
    assert.ok(update.$push['schedule.Today'], 'the provider\'s own location timezone (Asia/Jerusalem) says today is Monday, so schedule.Today must be pushed even though the getTodayDayName stub lies with a different day');
  } finally {
    server.close();
    mock.timers.reset();
  }
});

// Neither test above ever reaches these two failure branches: the schedule
// push's own optimistic-concurrency check (saveResult.matchedCount === 0,
// i.e. the provider's schedule changed between the availability read and
// this write), and a Google Calendar sync failure after the schedule push
// already landed. Both must undo whatever already happened (the booking
// document, and — for the second — the schedule push too) rather than
// leaving an orphaned booking/schedule entry with no calendar event. Without
// coverage, a regression that skipped either rollback would pass every
// other test in this suite.
test('POST /:id/book: the schedule push losing its optimistic-concurrency race deletes the booking and surfaces a 409', async (t) => {
  const serviceId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: providerId,
    googleAccessToken: null,
    schedule: {},
    scheduleRevision: 0,
    providerProfile: {
      locationId: 'jerusalem',
      services: [{ _id: serviceId, name: 'Haircut', duration: 30, active: true }],
      availability: [{ day: 'Monday', startTime: '09:00 AM', endTime: '11:00 AM' }]
    }
  }));
  t.mock.method(ProviderBooking, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const createdBooking = { _id: new mongoose.Types.ObjectId(), day: 'Monday', createdAt: new Date('2026-12-07T09:00:00.000Z') };
  t.mock.method(ProviderBooking, 'create', () => Promise.resolve(createdBooking));
  const deleteMock = t.mock.method(ProviderBooking, 'deleteOne', () => Promise.resolve({ deletedCount: 1 }));
  // The provider's schedule changed (another write bumped scheduleRevision)
  // between the availability read and this push, so the conditional update
  // below matches nothing.
  const updateOneMock = t.mock.method(User, 'updateOne', () => Promise.resolve({ matchedCount: 0 }));

  const { server, base } = startApp(freshProviderRoutes());
  try {
    const res = await fetch(`${base}/api/providers/${providerId}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: serviceId.toString(), date: '2026-12-07', startTime: '09:00 AM', guestName: 'Guest' })
    });
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.match(data.error, /לוח הזמנים של נותן השירות השתנה/);
    assert.equal(updateOneMock.mock.callCount(), 1, 'only the one failed push — no rollback pull is needed since nothing was ever persisted');
    assert.equal(deleteMock.mock.callCount(), 1, 'the orphaned booking document must be deleted, never left dangling with no schedule entry');
    assert.equal(deleteMock.mock.calls[0].arguments[0]._id, createdBooking._id);
  } finally {
    server.close();
  }
});

test('POST /:id/book: a Google Calendar sync failure after the schedule push already landed rolls back both the push and the booking', async (t) => {
  const serviceId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: providerId,
    googleAccessToken: 'tok-provider',
    schedule: {},
    scheduleRevision: 0,
    providerProfile: {
      locationId: 'jerusalem',
      services: [{ _id: serviceId, name: 'Haircut', duration: 30, active: true }],
      availability: [{ day: 'Monday', startTime: '09:00 AM', endTime: '11:00 AM' }]
    }
  }));
  t.mock.method(ProviderBooking, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  // The provider has Google connected, so computeAvailableSlots' own
  // freebusy cross-check must be stubbed too — otherwise it throws its own
  // 502 ("can't check the provider's Google Calendar") before this test
  // ever reaches the sync-failure branch it's actually targeting.
  t.mock.method(mutualAvailability, 'getFreeBusyForDay', async () => []);
  const createdBooking = { _id: new mongoose.Types.ObjectId(), day: 'Monday', createdAt: new Date('2026-12-07T09:00:00.000Z') };
  t.mock.method(ProviderBooking, 'create', () => Promise.resolve(createdBooking));
  const deleteMock = t.mock.method(ProviderBooking, 'deleteOne', () => Promise.resolve({ deletedCount: 1 }));
  const updateOneMock = t.mock.method(User, 'updateOne', () => Promise.resolve({ matchedCount: 1 }));

  const { server, base } = startApp(freshProviderRoutes(), {
    syncEventToGoogleCalendar: async () => ({ success: false, error: 'Quota exceeded' })
  });
  try {
    const res = await fetch(`${base}/api/providers/${providerId}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: serviceId.toString(), date: '2026-12-07', startTime: '09:00 AM', guestName: 'Guest' })
    });
    const data = await res.json();
    assert.equal(res.status, 502);
    assert.match(data.error, /הוספה ליומן Google נכשלה/);
    assert.equal(updateOneMock.mock.callCount(), 2, '1 successful push + 1 rollback pull undoing it');
    assert.deepEqual(updateOneMock.mock.calls[1].arguments[1], { $pull: { 'schedule.Monday': { providerBookingId: createdBooking._id.toString() } } });
    assert.equal(deleteMock.mock.callCount(), 1, 'the booking document must still be deleted even though the failure happened after the push');
    assert.equal(deleteMock.mock.calls[0].arguments[0]._id, createdBooking._id);
  } finally {
    server.close();
  }
});

test('POST /:id/book: a past date is rejected relative to the provider\'s own location timezone', async (t) => {
  const serviceId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: new mongoose.Types.ObjectId(),
    providerProfile: { locationId: 'jerusalem', services: [{ _id: serviceId, name: 'Haircut', duration: 30, active: true }], availability: [] }
  }));
  const { server, base } = startApp(freshProviderRoutes());
  try {
    const id = new mongoose.Types.ObjectId();
    const res = await fetch(`${base}/api/providers/${id}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: serviceId.toString(), date: '2020-01-01', startTime: '10:00 AM', guestName: 'Guest' })
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

// ── POST /api/providers/bookings/:id/cancel ──
test('POST /bookings/:id/cancel: unauthenticated request is rejected', async (t) => {
  t.mock.method(ProviderBooking, 'findById', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId: null });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${new mongoose.Types.ObjectId()}/cancel`, { method: 'POST' });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /bookings/:id/cancel: a malformed booking id is a 400', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(ProviderBooking, 'findById', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/not-a-valid-id/cancel`, { method: 'POST' });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('POST /bookings/:id/cancel: a non-existent booking is a 404', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(ProviderBooking, 'findById', () => Promise.resolve(null));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${new mongoose.Types.ObjectId()}/cancel`, { method: 'POST' });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('POST /bookings/:id/cancel: a user who is neither the provider nor the booking guest is refused with 403', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const booking = {
    providerId: new mongoose.Types.ObjectId(),
    bookedByUserId: new mongoose.Types.ObjectId(),
    status: 'confirmed'
  };
  t.mock.method(ProviderBooking, 'findById', () => Promise.resolve(booking));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${new mongoose.Types.ObjectId()}/cancel`, { method: 'POST' });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('POST /bookings/:id/cancel: cancelling an already-cancelled booking is idempotent, not an error', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const booking = { providerId: userId, bookedByUserId: null, status: 'cancelled' };
  t.mock.method(ProviderBooking, 'findById', () => Promise.resolve(booking));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${new mongoose.Types.ObjectId()}/cancel`, { method: 'POST' });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.alreadyCancelled, true);
  } finally {
    server.close();
  }
});

test('POST /bookings/:id/cancel: the booking\'s own provider can cancel a processing (not-yet-confirmed) booking', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const booking = {
    providerId: userId,
    bookedByUserId: null,
    status: 'processing',
    save: async () => {}
  };
  t.mock.method(ProviderBooking, 'findById', () => Promise.resolve(booking));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${new mongoose.Types.ObjectId()}/cancel`, { method: 'POST' });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(booking.status, 'cancelled');
  } finally {
    server.close();
  }
});

test('POST /bookings/:id/cancel: the guest who made the booking (bookedByUserId) can cancel it even though they are not the provider', async (t) => {
  const guestUserId = new mongoose.Types.ObjectId();
  const booking = {
    providerId: new mongoose.Types.ObjectId(),
    bookedByUserId: guestUserId,
    status: 'processing',
    save: async () => {}
  };
  t.mock.method(ProviderBooking, 'findById', () => Promise.resolve(booking));
  const { server, base } = startApp(freshProviderRoutes(), { userId: guestUserId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${new mongoose.Types.ObjectId()}/cancel`, { method: 'POST' });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(booking.status, 'cancelled');
  } finally {
    server.close();
  }
});
