// ──────────────────────────────────────────────
// Characterization tests for peer-to-peer mutual scheduling:
//   1. intersectFree() — pure interval-math correctness (no I/O).
//   2. Mutual session slot claim must be atomic (no double-confirm of one
//      session), mirroring the existing Booking double-claim invariant.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const MutualBooking = require('../models/MutualBooking');
const { intersectFree } = require('../services/mutualAvailability');

let replSet;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    MutualBooking.deleteMany({}),
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
