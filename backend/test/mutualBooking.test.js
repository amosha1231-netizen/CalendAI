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
const { cancelMutualSession } = require('../routes/mutualRoutes');

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

// ── 2. cancelMutualSession: atomic cancel never decides its rollback from a stale read ──
test('cancelMutualSession: a session still mid-confirm (processing) is marked cancelled, no completed-session rollback attempted', async () => {
  const host = await User.create({ email: 'mutual-host-3@test.com' });
  const invitee = await User.create({ email: 'mutual-invitee-3@test.com' });
  const session = await MutualBooking.create({
    sessionId: 'mut-cancel-processing-1',
    hostId: host._id,
    inviteeId: invitee._id,
    inviteeEmail: invitee.email,
    duration: 30,
    status: 'processing',
  });

  const result = await cancelMutualSession(session.sessionId);
  assert.equal(result.alreadyCancelled, false);

  const final = await MutualBooking.findOne({ sessionId: session.sessionId });
  assert.equal(final.status, 'cancelled');
});

test('cancelMutualSession: cancelling an already-completed session rolls back its mirrored schedule entries on both sides', async () => {
  const host = await User.create({ email: 'mutual-host-4@test.com', schedule: {} });
  const invitee = await User.create({ email: 'mutual-invitee-4@test.com', schedule: {} });
  const session = await MutualBooking.create({
    sessionId: 'mut-cancel-completed-1',
    hostId: host._id,
    inviteeId: invitee._id,
    inviteeEmail: invitee.email,
    duration: 30,
    status: 'completed',
    hostEventId: 'h-evt-1',
    inviteeEventId: 'i-evt-1',
  });
  const hostEvent = { title: 'Meeting', day: 'Monday', startTime: '10:00 AM', endTime: '10:30 AM', mutualSessionId: session.sessionId };
  const inviteeEvent = { ...hostEvent };
  await Promise.all([
    User.updateOne({ _id: host._id }, { $push: { 'schedule.Monday': hostEvent } }),
    User.updateOne({ _id: invitee._id }, { $push: { 'schedule.Monday': inviteeEvent } }),
  ]);

  const result = await cancelMutualSession(session.sessionId);
  assert.equal(result.alreadyCancelled, false);

  const final = await MutualBooking.findOne({ sessionId: session.sessionId });
  assert.equal(final.status, 'cancelled');

  const [hostAfter, inviteeAfter] = await Promise.all([
    User.findById(host._id).lean(),
    User.findById(invitee._id).lean(),
  ]);
  assert.ok(!(hostAfter.schedule?.Monday || []).some(e => e.mutualSessionId === session.sessionId), 'host schedule entry must be pulled');
  assert.ok(!(inviteeAfter.schedule?.Monday || []).some(e => e.mutualSessionId === session.sessionId), 'invitee schedule entry must be pulled');
});

test('cancelMutualSession: racing against a concurrent /confirm completion never loses the rollback or resurrects a cancelled session', async () => {
  const host = await User.create({ email: 'mutual-host-5@test.com', schedule: {} });
  const invitee = await User.create({ email: 'mutual-invitee-5@test.com', schedule: {} });
  const session = await MutualBooking.create({
    sessionId: 'mut-cancel-race-1',
    hostId: host._id,
    inviteeId: invitee._id,
    inviteeEmail: invitee.email,
    duration: 30,
    status: 'processing',
  });

  // Mirrors what /confirm does before it attempts its own final status flip:
  // push the mirrored schedule entries first, then try to claim 'completed'.
  const hostEvent = { title: 'Meeting', day: 'Monday', startTime: '10:00 AM', endTime: '10:30 AM', mutualSessionId: session.sessionId };
  const inviteeEvent = { ...hostEvent };
  await Promise.all([
    User.updateOne({ _id: host._id }, { $push: { 'schedule.Monday': hostEvent } }),
    User.updateOne({ _id: invitee._id }, { $push: { 'schedule.Monday': inviteeEvent } }),
  ]);

  const confirmFinalWrite = () => MutualBooking.findOneAndUpdate(
    { sessionId: session.sessionId, status: 'processing' },
    { $set: { status: 'completed', hostEventId: 'h-evt-race', inviteeEventId: 'i-evt-race' } },
    { new: true }
  );

  const [confirmResult, cancelResult] = await Promise.all([confirmFinalWrite(), cancelMutualSession(session.sessionId)]);

  const final = await MutualBooking.findOne({ sessionId: session.sessionId });
  assert.equal(final.status, 'cancelled', 'the session must end up cancelled regardless of which write landed first');
  assert.equal(cancelResult.alreadyCancelled, false);

  if (confirmResult) {
    // /confirm's write landed first (it still saw 'processing' and flipped
    // to 'completed') — cancelMutualSession must then have observed
    // 'completed' as the true prior status (not a stale 'processing' read)
    // and rolled back the schedule entries /confirm had already pushed.
    const [hostAfter, inviteeAfter] = await Promise.all([
      User.findById(host._id).lean(),
      User.findById(invitee._id).lean(),
    ]);
    assert.ok(!(hostAfter.schedule?.Monday || []).some(e => e.mutualSessionId === session.sessionId),
      'a session confirmed then cancelled must not leave the host schedule entry behind');
    assert.ok(!(inviteeAfter.schedule?.Monday || []).some(e => e.mutualSessionId === session.sessionId),
      'a session confirmed then cancelled must not leave the invitee schedule entry behind');
  } else {
    // cancelMutualSession's atomic update landed first (status -> 'cancelled'
    // while still 'processing'), so /confirm's conditional write — which only
    // ever matches status:'processing' — found nothing to update and must
    // not have silently completed the session anyway.
    assert.equal(confirmResult, null, "/confirm's final write must not succeed once the session is already cancelled");
  }
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

test('provider booking: cancelling a confirmed booking with a synced calendar event frees the slot for re-booking', async () => {
  const providerId = new mongoose.Types.ObjectId();
  const confirmed = await ProviderBooking.create(
    providerBookingDoc({ providerId, status: 'confirmed', googleEventId: 'gcal-evt-123' })
  );
  assert.equal(confirmed.googleEventId, 'gcal-evt-123', 'googleEventId must round-trip so a later cancel can delete the right calendar event');

  // Mirrors what POST /api/providers/bookings/:id/cancel does once it has
  // deleted the calendar event and pulled the schedule entry.
  confirmed.status = 'cancelled';
  await confirmed.save();

  const rebooked = await ProviderBooking.create(providerBookingDoc({ providerId, status: 'processing' }));
  assert.ok(rebooked._id, 'the slot must be bookable again once the confirmed booking is cancelled');
});
