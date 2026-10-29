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
const { winsOverlapRace } = require('../routes/providerRoutes');

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

test('PUT /me: a non-string availability startTime/endTime is rejected with 400, not a 500 crash', async (t) => {
  // Regression: timeToMinutes(row.startTime) called `.match()` on the value
  // with no typeof guard, so a non-string (e.g. an object) threw a
  // TypeError caught by the route's own try/catch and surfaced as a bare
  // 500 instead of the normal 400 validation response every other
  // malformed-availability-row case gets.
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findByIdAndUpdate', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability: [{ day: 'Monday', startTime: {}, endTime: '09:00 AM' }] })
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

// ── GET /api/providers/my-bookings ──
// Nothing else in test/ exercises this route: it's the provider-side list
// ProviderProfileEditor.jsx's "Upcoming bookings" panel reads.
test('GET /my-bookings: unauthenticated request is rejected before any DB lookup', async (t) => {
  t.mock.method(User, 'findById', () => { throw new Error('must not be reached'); });
  t.mock.method(ProviderBooking, 'find', () => { throw new Error('must not be reached'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId: null });
  try {
    const res = await fetch(`${base}/api/providers/my-bookings`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('GET /my-bookings: queries by providerId, excludes cancelled, filters to today-or-later, and sorts by date/startTime', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: userId, providerProfile: { locationId: 'jerusalem' } }) }) }));
  let capturedQuery = null;
  let capturedSort = null;
  const bookings = [{ _id: new mongoose.Types.ObjectId(), date: '2026-12-01', startTime: '10:00 AM' }];
  t.mock.method(ProviderBooking, 'find', (query) => {
    capturedQuery = query;
    return {
      sort: (sortArg) => {
        capturedSort = sortArg;
        return { lean: async () => bookings };
      }
    };
  });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/my-bookings`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data.bookings, JSON.parse(JSON.stringify(bookings)));
    assert.equal(data.count, 1);
    assert.equal(capturedQuery.providerId, userId);
    assert.deepEqual(capturedQuery.status, { $ne: 'cancelled' });
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(capturedQuery.date.$gte), 'date.$gte must be a YYYY-MM-DD string');
    assert.deepEqual(capturedSort, { date: 1, startTime: 1 });
  } finally {
    server.close();
  }
});

test('GET /my-bookings: an account that no longer exists still resolves (falls back to the default location timezone) instead of 500ing', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => null }) }));
  t.mock.method(ProviderBooking, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/my-bookings`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(data.bookings, []);
    assert.equal(data.count, 0);
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

// ── winsOverlapRace: deterministic resolution for the post-insert overlap recheck ──
// Two different-duration services can slice to different startTimes, so the
// unique providerId+date+startTime index alone can't stop two concurrent
// bookings from overlapping. Without a deterministic, whole-group resolution,
// two requests that both insert before either runs its recheck would each see
// only the other as "the" conflict and both self-delete, losing the slot
// entirely instead of leaving exactly one booking standing.
test('winsOverlapRace: a booking with a later createdAt than its overlapping conflict loses', () => {
  const selfId = new mongoose.Types.ObjectId();
  const otherId = new mongoose.Types.ObjectId();
  const wins = winsOverlapRace(
    { _id: selfId, createdAt: new Date('2026-01-01T00:00:01.000Z'), start: 600, end: 630 },
    [{ _id: otherId, createdAt: new Date('2026-01-01T00:00:00.000Z'), start: 600, end: 630 }]
  );
  assert.equal(wins, false, 'the booking created after its conflict must be the one that self-deletes');
});

test('winsOverlapRace: a booking with an earlier createdAt than its overlapping conflict wins (survives)', () => {
  const selfId = new mongoose.Types.ObjectId();
  const otherId = new mongoose.Types.ObjectId();
  const wins = winsOverlapRace(
    { _id: selfId, createdAt: new Date('2026-01-01T00:00:00.000Z'), start: 600, end: 630 },
    [{ _id: otherId, createdAt: new Date('2026-01-01T00:00:01.000Z'), start: 600, end: 630 }]
  );
  assert.equal(wins, true, 'the booking created before its conflict must not self-delete');
});

test('winsOverlapRace: a tie on createdAt is broken by _id, and both sides of the comparison agree', () => {
  const idA = new mongoose.Types.ObjectId('000000000000000000000001');
  const idB = new mongoose.Types.ObjectId('000000000000000000000002');
  const sameInstant = new Date('2026-01-01T00:00:00.000Z');

  const aWins = winsOverlapRace(
    { _id: idA, createdAt: sameInstant, start: 600, end: 630 },
    [{ _id: idB, createdAt: sameInstant, start: 600, end: 630 }]
  );
  const bWins = winsOverlapRace(
    { _id: idB, createdAt: sameInstant, start: 600, end: 630 },
    [{ _id: idA, createdAt: sameInstant, start: 600, end: 630 }]
  );

  assert.notEqual(aWins, bWins, 'exactly one side of a tied race must win so exactly one booking survives');
  assert.equal(bWins, false, 'the larger _id loses the tiebreak (smaller _id wins)');
});

test('winsOverlapRace: a booking with no overlapping others always wins, regardless of createdAt', () => {
  const selfId = new mongoose.Types.ObjectId();
  const otherId = new mongoose.Types.ObjectId();
  const wins = winsOverlapRace(
    { _id: selfId, createdAt: new Date('2026-01-01T00:00:05.000Z'), start: 600, end: 630 },
    [{ _id: otherId, createdAt: new Date('2026-01-01T00:00:00.000Z'), start: 700, end: 730 }]
  );
  assert.equal(wins, true, 'bookings that never overlap in time must never affect each other\'s outcome');
});

// A overlaps B, B overlaps C, but A and C do not overlap each other — a chain,
// not a clique. B (youngest-conflicting... here oldest wins, so B loses to A)
// must lose, but C — once B is gone — never actually conflicted with anyone
// that survives, so C must win too. A pairwise-only check (resolving each
// candidate only against its own *direct* overlaps) gets this wrong: C's
// recheck can still see B as a live conflict (B hasn't self-deleted yet) and
// wrongly concludes it must lose as well, leaving the provider with only A
// booked instead of both A and C.
test('winsOverlapRace: a 3-way overlap chain (A-B, B-C, not A-C) keeps both ends and drops only the middle', () => {
  const idA = new mongoose.Types.ObjectId('000000000000000000000001');
  const idB = new mongoose.Types.ObjectId('000000000000000000000002');
  const idC = new mongoose.Types.ObjectId('000000000000000000000003');
  const a = { _id: idA, createdAt: new Date('2026-01-01T00:00:00.000Z'), start: 540, end: 600 }; // 09:00-10:00
  const b = { _id: idB, createdAt: new Date('2026-01-01T00:00:01.000Z'), start: 570, end: 630 }; // 09:30-10:30, overlaps A and C
  const c = { _id: idC, createdAt: new Date('2026-01-01T00:00:02.000Z'), start: 600, end: 660 }; // 10:00-11:00

  assert.equal(winsOverlapRace(a, [b, c]), true, 'the oldest booking in the chain must survive');
  assert.equal(winsOverlapRace(b, [a, c]), false, 'the middle booking, conflicting with both ends, must lose');
  assert.equal(winsOverlapRace(c, [a, b]), true, 'the newest booking must survive once the middle is excluded — it never conflicted with the survivor');
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
    status: 'processing'
  };
  t.mock.method(ProviderBooking, 'create', () => Promise.resolve(createdBooking));
  // The final confirm step is now an atomic findOneAndUpdate conditioned on
  // status still being 'processing' (not a plain createdBooking.save()) —
  // see the lost-update race fix in providerRoutes.js. The mock returns a
  // document with the fields the response relies on (toObject()).
  const confirmMock = t.mock.method(ProviderBooking, 'findOneAndUpdate', async (filter, update) => {
    assert.deepEqual(filter, { _id: createdBooking._id, status: 'processing' });
    return {
      ...createdBooking,
      ...update.$set,
      toObject() { return { _id: createdBooking._id, status: update.$set.status }; }
    };
  });
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
  // Pin "today" to a Wednesday before the booked Monday (not the day being
  // booked, and not in the past relative to it) so the schedule.Today
  // push/pull never enters this test's assertions — without this, the test
  // only passed by coincidence on real-world days that weren't Monday in
  // Asia/Jerusalem.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-12-02T08:00:00Z').getTime() });
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
    mock.timers.reset();
  }
});

// Regression test for the lost-update race fixed alongside
// POST /bookings/:id/cancel's own atomic update: a cancel can land on this
// exact document between this request's schedule push/Google sync and its
// final confirm. Before the fix, the confirm step was a plain
// createdBooking.status = 'confirmed'; await createdBooking.save(), which
// would silently resurrect the just-cancelled booking as confirmed with no
// check on its current status. Simulated here by having the mocked
// findOneAndUpdate (conditioned on status still being 'processing') return
// null, exactly as the real driver would once a concurrent cancel has
// already flipped the document to 'cancelled'.
test('POST /:id/book: a concurrent cancel winning the race before this request\'s own confirm step rolls back the schedule push instead of resurrecting the booking as confirmed', async (t) => {
  const serviceId = new mongoose.Types.ObjectId();
  const providerId = new mongoose.Types.ObjectId();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-12-02T08:00:00Z').getTime() });
  t.mock.method(User, 'findOne', () => Promise.resolve({
    _id: providerId,
    googleAccessToken: null, // no Google sync in play — isolates the status-race fix itself
    schedule: {},
    scheduleRevision: 0,
    providerProfile: {
      locationId: 'jerusalem',
      services: [{ _id: serviceId, name: 'Haircut', duration: 30, active: true }],
      availability: [{ day: 'Monday', startTime: '09:00 AM', endTime: '11:00 AM' }]
    }
  }));
  t.mock.method(ProviderBooking, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const createdBooking = { _id: new mongoose.Types.ObjectId(), day: 'Monday', createdAt: new Date('2026-12-07T09:00:00.000Z'), status: 'processing' };
  t.mock.method(ProviderBooking, 'create', () => Promise.resolve(createdBooking));
  const deleteMock = t.mock.method(ProviderBooking, 'deleteOne', () => Promise.resolve({ deletedCount: 1 }));
  const updateOneMock = t.mock.method(User, 'updateOne', () => Promise.resolve({ matchedCount: 1 }));
  // A concurrent POST /bookings/:id/cancel already committed its own atomic
  // update, flipping this document to 'cancelled' — so the confirm's filter
  // (status: 'processing') no longer matches.
  const confirmMock = t.mock.method(ProviderBooking, 'findOneAndUpdate', async (filter) => {
    assert.deepEqual(filter, { _id: createdBooking._id, status: 'processing' });
    return null;
  });

  const { server, base } = startApp(freshProviderRoutes());
  try {
    const res = await fetch(`${base}/api/providers/${providerId}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: serviceId.toString(), date: '2026-12-07', startTime: '09:00 AM', guestName: 'Guest' })
    });
    const data = await res.json();
    assert.equal(res.status, 409, JSON.stringify(data));
    assert.match(data.error, /בוטלה/);
    assert.equal(confirmMock.mock.callCount(), 1);
    assert.equal(updateOneMock.mock.callCount(), 2, '1 successful push + 1 rollback pull undoing it, since the confirm never committed');
    assert.deepEqual(updateOneMock.mock.calls[1].arguments[1], { $pull: { 'schedule.Monday': { providerBookingId: createdBooking._id.toString() } } });
    assert.equal(deleteMock.mock.callCount(), 1, 'the booking document must still be removed rather than left confirmed with no corresponding calendar event');
    assert.equal(deleteMock.mock.calls[0].arguments[0]._id, createdBooking._id);
  } finally {
    server.close();
    mock.timers.reset();
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
  // The atomic cancel update's own filter (status: { $ne: 'cancelled' }) is
  // what makes this idempotent now — a document already 'cancelled' doesn't
  // match it, so the mock returns null exactly as the real driver would.
  t.mock.method(ProviderBooking, 'findOneAndUpdate', async (filter) => {
    assert.deepEqual(filter.status, { $ne: 'cancelled' });
    return null;
  });
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
  const bookingId = new mongoose.Types.ObjectId();
  const booking = { _id: bookingId, providerId: userId, bookedByUserId: null, status: 'processing' };
  t.mock.method(ProviderBooking, 'findById', () => Promise.resolve(booking));
  const updateMock = t.mock.method(ProviderBooking, 'findOneAndUpdate', async () => ({ ...booking, status: 'processing' }));
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${new mongoose.Types.ObjectId()}/cancel`, { method: 'POST' });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(updateMock.mock.callCount(), 1);
    assert.deepEqual(updateMock.mock.calls[0].arguments[0], { _id: bookingId, status: { $ne: 'cancelled' } });
    assert.deepEqual(updateMock.mock.calls[0].arguments[1], { $set: { status: 'cancelled', activeSlot: false } });
  } finally {
    server.close();
  }
});

test('POST /bookings/:id/cancel: the guest who made the booking (bookedByUserId) can cancel it even though they are not the provider', async (t) => {
  const guestUserId = new mongoose.Types.ObjectId();
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    providerId: new mongoose.Types.ObjectId(),
    bookedByUserId: guestUserId,
    status: 'processing'
  };
  t.mock.method(ProviderBooking, 'findById', () => Promise.resolve(booking));
  t.mock.method(ProviderBooking, 'findOneAndUpdate', async () => ({ ...booking, status: 'processing' }));
  const { server, base } = startApp(freshProviderRoutes(), { userId: guestUserId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${new mongoose.Types.ObjectId()}/cancel`, { method: 'POST' });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
  } finally {
    server.close();
  }
});

// Regression test for a lost-update race: POST /:id/book's own final confirm
// step used to be a plain read-then-save (createdBooking.status = 'confirmed';
// await createdBooking.save()) with no check on the document's current
// status, so a cancel that committed in between would get silently
// overwritten back to 'confirmed' by this stale in-memory object — see the
// atomic findOneAndUpdate guard added to that confirm step. This test
// exercises /bookings/:id/cancel's side in isolation: a cancel that lands
// while the booking is still 'processing' must not attempt the
// confirmed-only calendar/schedule rollback (there is nothing to roll back
// yet — the still-in-flight /:id/book request's own confirm step, guarded
// the same way, is responsible for undoing its own schedule push/Google
// event if it loses the race).
test('POST /bookings/:id/cancel: cancelling a still-processing booking skips the confirmed-only rollback entirely', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const bookingId = new mongoose.Types.ObjectId();
  const booking = { _id: bookingId, providerId: userId, bookedByUserId: null, status: 'processing' };
  t.mock.method(ProviderBooking, 'findById', () => Promise.resolve(booking));
  t.mock.method(ProviderBooking, 'findOneAndUpdate', async () => ({ ...booking, status: 'processing' }));
  const userFindByIdMock = t.mock.method(User, 'findById', () => { throw new Error('must not look up the provider for a rollback that should never start'); });
  const { server, base } = startApp(freshProviderRoutes(), { userId });
  try {
    const res = await fetch(`${base}/api/providers/bookings/${bookingId}/cancel`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal(userFindByIdMock.mock.callCount(), 0);
  } finally {
    server.close();
  }
});
