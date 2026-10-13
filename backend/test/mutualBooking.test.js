// ──────────────────────────────────────────────
// Characterization tests for peer-to-peer mutual scheduling:
//   1. intersectFree() — pure interval-math correctness (no I/O).
//   2. Mutual session slot claim must be atomic (no double-confirm of one
//      session), mirroring the existing Booking double-claim invariant.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test, before, after, beforeEach, mock } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const MutualBooking = require('../models/MutualBooking');
const ProviderBooking = require('../models/ProviderBooking');
const {
  intersectFree, mergeIntervals, getLocalScheduleBusy, getLocationTimeZone, todayIsoInTimeZone
} = require('../services/mutualAvailability');

let replSet;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await ProviderBooking.init(); // ensure the unique partial index is built before the double-booking tests run
});

after(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    MutualBooking.deleteMany({}),
    ProviderBooking.deleteMany({}),
  ]);
});

// ── 1. intersectFree(): pure interval math ──
test('intersectFree: finds the gap between two users\' busy blocks', () => {
  // Host busy 09:00-10:00 (540-600), invitee busy 10:30-11:00 (630-660).
  // Window 09:00-12:00 (540-720), need >= 30 min.
  const busyHost = [{ start: 540, end: 600 }];
  const busyInvitee = [{ start: 630, end: 660 }];
  const free = intersectFree(busyHost, busyInvitee, 540, 720, 30);

  assert.deepEqual(free, [
    { start: 600, end: 630 },
    { start: 660, end: 720 },
  ]);
});

test('intersectFree: overlapping busy blocks from both users merge correctly', () => {
  const busyHost = [{ start: 540, end: 600 }, { start: 660, end: 700 }];
  const busyInvitee = [{ start: 580, end: 650 }];
  // Union of busy: 540-650 (540-600 merges with 580-650), 660-700.
  const free = intersectFree(busyHost, busyInvitee, 540, 720, 5);

  assert.deepEqual(free, [
    { start: 650, end: 660 },
    { start: 700, end: 720 },
  ]);
});

test('intersectFree: drops gaps shorter than the requested duration', () => {
  const busyHost = [{ start: 540, end: 600 }];
  const busyInvitee = [{ start: 610, end: 720 }]; // only a 10-minute gap remains
  const free = intersectFree(busyHost, busyInvitee, 540, 720, 30);

  assert.deepEqual(free, []);
});

test('intersectFree: fully busy day (either side) yields no free slots', () => {
  const busyHost = [{ start: 0, end: 1440 }];
  const free = intersectFree(busyHost, [], 540, 720, 15);
  assert.deepEqual(free, []);
});

test('intersectFree: a gap exactly equal to the requested duration is kept, one minute short is dropped', () => {
  const busyHost = [{ start: 540, end: 600 }]; // free 600-630 is exactly 30 min
  assert.deepEqual(intersectFree(busyHost, [], 540, 630, 30), [{ start: 600, end: 630 }]);
  assert.deepEqual(intersectFree(busyHost, [], 540, 629, 30), []);
});

test('mergeIntervals: adjacent intervals that only touch at the boundary merge into one', () => {
  // [540,600) and [600,660) touch exactly at 600 — must merge, not stay separate.
  assert.deepEqual(mergeIntervals([{ start: 540, end: 600 }, { start: 600, end: 660 }]), [{ start: 540, end: 660 }]);
});

test('mergeIntervals: zero-length and inverted intervals are dropped', () => {
  assert.deepEqual(mergeIntervals([{ start: 600, end: 600 }, { start: 700, end: 650 }, { start: 540, end: 560 }]), [{ start: 540, end: 560 }]);
});

// ── getLocalScheduleBusy(): local-only schedule events must count as busy ──
// Mutual availability used to check Google freebusy only. Events added via
// /api/schedule/add-to-free-slot (or a provider booking for a provider with
// no Google Calendar connected) never reach Google, so without this they'd
// be invisible to mutual scheduling and get double-booked.
test('getLocalScheduleBusy: a one-off event on a matching targetDate counts as busy', () => {
  const user = { schedule: { Monday: [{ startTime: '09:00 AM', endTime: '10:00 AM', targetDate: '2026-11-02' }] } };
  assert.deepEqual(getLocalScheduleBusy(user, '2026-11-02', 'Monday'), [{ start: 540, end: 600 }]);
});

test('getLocalScheduleBusy: a one-off event is ignored on a different date', () => {
  const user = { schedule: { Monday: [{ startTime: '09:00 AM', endTime: '10:00 AM', targetDate: '2026-11-02' }] } };
  assert.deepEqual(getLocalScheduleBusy(user, '2026-11-09', 'Monday'), []);
});

test('getLocalScheduleBusy: a recurring event with no targetDate counts as busy every week', () => {
  const user = { schedule: { Monday: [{ startTime: '09:00 AM', endTime: '10:00 AM' }] } };
  assert.deepEqual(getLocalScheduleBusy(user, '2026-11-02', 'Monday'), [{ start: 540, end: 600 }]);
  assert.deepEqual(getLocalScheduleBusy(user, '2026-11-09', 'Monday'), [{ start: 540, end: 600 }]);
});

test('getLocalScheduleBusy: malformed or missing schedule yields no busy intervals', () => {
  assert.deepEqual(getLocalScheduleBusy({}, '2026-11-02', 'Monday'), []);
  assert.deepEqual(getLocalScheduleBusy({ schedule: {} }, '2026-11-02', 'Monday'), []);
  assert.deepEqual(getLocalScheduleBusy(null, '2026-11-02', 'Monday'), []);
  const user = { schedule: { Monday: [{ startTime: 'garbage', endTime: 'garbage' }] } };
  assert.deepEqual(getLocalScheduleBusy(user, '2026-11-02', 'Monday'), []);
});

// ── getLocationTimeZone() / todayIsoInTimeZone(): the location-aware "today"
// mutualRoutes.js and providerRoutes.js use to gate past-date confirms/bookings.
// A naive `new Date().toISOString().slice(0,10)` (server/UTC day) gets this
// wrong right around UTC midnight for any location not on UTC — this is what
// moving those checks to location time (instead of server time) fixes.
test('getLocationTimeZone: resolves a known location id, and falls back to the default for an unknown one', () => {
  assert.equal(getLocationTimeZone('newyork'), 'America/New_York');
  assert.equal(getLocationTimeZone('does-not-exist'), 'Asia/Jerusalem');
  assert.equal(getLocationTimeZone(undefined), 'Asia/Jerusalem');
});

test('todayIsoInTimeZone: resolves the calendar day in the given timezone, not the server/UTC day', () => {
  // 2026-11-02T02:30:00Z is already Nov 2 in UTC, but still 21:30 on Nov 1
  // in America/New_York (UTC-5 in November) — a UTC-day check would wrongly
  // treat a New-York "today" booking for Nov 1 as being in the past.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-02T02:30:00Z').getTime() });
  try {
    assert.equal(todayIsoInTimeZone('UTC'), '2026-11-02');
    assert.equal(todayIsoInTimeZone('America/New_York'), '2026-11-01');
  } finally {
    mock.timers.reset();
  }
});

// ── 2. Mutual session claim: atomic active → processing transition ──
test('mutual session claim: host and invitee racing to confirm — only one wins', async () => {
  const host = await User.create({ email: 'mutual-host@test.com', googleAccessToken: 'tok-host' });
  const invitee = await User.create({ email: 'mutual-invitee@test.com', googleAccessToken: 'tok-invitee' });
  const session = await MutualBooking.create({
    sessionId: 'mut-race-1',
    hostId: host._id,
    inviteeId: invitee._id,
    inviteeEmail: invitee.email,
    duration: 30,
    status: 'active',
  });

  const claim = () => MutualBooking.findOneAndUpdate(
    { sessionId: session.sessionId, status: 'active' },
    { $set: { status: 'processing' } },
    { new: true }
  );

  const [a, b] = await Promise.all([claim(), claim()]);
  const successes = [a, b].filter(Boolean);

  assert.equal(successes.length, 1, 'exactly one of the two concurrent claims should succeed');

  const final = await MutualBooking.findOne({ sessionId: session.sessionId });
  assert.equal(final.status, 'processing');
});

test('mutual session claim: a cancelled session cannot be claimed', async () => {
  const host = await User.create({ email: 'mutual-host-2@test.com' });
  const invitee = await User.create({ email: 'mutual-invitee-2@test.com' });
  const session = await MutualBooking.create({
    sessionId: 'mut-cancelled-1',
    hostId: host._id,
    inviteeId: invitee._id,
    inviteeEmail: invitee.email,
    duration: 30,
    status: 'cancelled',
  });

  const claim = await MutualBooking.findOneAndUpdate(
    { sessionId: session.sessionId, status: 'active' },
    { $set: { status: 'processing' } },
    { new: true }
  );

  assert.equal(claim, null, 'a non-active session must be refused a claim');
});

// ── 3. Provider booking slot claim: unique partial index guards against double-booking ──
function providerBookingDoc(overrides = {}) {
  return {
    providerId: new mongoose.Types.ObjectId(),
    serviceId: new mongoose.Types.ObjectId(),
    serviceName: 'Haircut',
    duration: 30,
    date: '2026-12-01',
    day: 'Tuesday',
    startTime: '10:00 AM',
    endTime: '10:30 AM',
    guestName: 'Guest',
    status: 'processing',
    ...overrides,
  };
}

test('provider booking: two guests racing for the same provider+date+startTime — only one claims it', async () => {
  const providerId = new mongoose.Types.ObjectId();
  const claim = () => ProviderBooking.create(providerBookingDoc({ providerId }));

  const results = await Promise.allSettled([claim(), claim()]);
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'exactly one of the two concurrent slot claims should succeed');
  assert.equal(rejected.length, 1, 'the losing claim must be refused');
  assert.equal(rejected[0].reason.code, 11000, 'the loser must fail on the unique providerId+date+startTime index, not some other error');

  const count = await ProviderBooking.countDocuments({ providerId, date: '2026-12-01', startTime: '10:00 AM' });
  assert.equal(count, 1, 'only one booking document should exist for that provider+date+startTime');
});

test('provider booking: a cancelled booking does not block re-booking the same slot', async () => {
  const providerId = new mongoose.Types.ObjectId();
  await ProviderBooking.create(providerBookingDoc({ providerId, status: 'cancelled' }));

  // The unique index has a partial filter excluding status:'cancelled', so this must succeed.
  const rebooked = await ProviderBooking.create(providerBookingDoc({ providerId, status: 'processing' }));
  assert.ok(rebooked._id, 'a new booking for the same provider+date+startTime must be allowed once the prior one is cancelled');
});
