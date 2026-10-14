// ──────────────────────────────────────────────
// Characterization tests for peer-to-peer mutual scheduling's DB-backed
// invariants against a real (in-memory) MongoDB replica set:
//   1. Mutual session slot claim must be atomic (no double-confirm of one
//      session), mirroring the existing Booking double-claim invariant.
//   2. Provider booking slot claim: unique partial index guards against
//      double-booking.
//
// Pure interval/date math (intersectFree, mergeIntervals, getLocalScheduleBusy,
// getLocationTimeZone, todayIsoInTimeZone) lives in mutualAvailability.test.js
// instead, which needs no MongoMemoryReplSet.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const MutualBooking = require('../models/MutualBooking');
const ProviderBooking = require('../models/ProviderBooking');

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

// ── 1. Mutual session claim: atomic active → processing transition ──
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
