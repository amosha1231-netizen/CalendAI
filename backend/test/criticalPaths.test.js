// ──────────────────────────────────────────────
// Characterization tests for CalendAI's three critical-surface invariants:
//   1. AI credit deduction must be atomic and fail-closed (no double-spend).
//   2. Payment webhook processing must be idempotent (no double-credit on retry).
//   3. Booking slot claims must be atomic (no double-booking of one slot).
//
// These exercise the exact MongoDB query patterns used in server.js against
// a real (in-memory) MongoDB replica set, so they catch regressions in the
// atomicity guarantees if server.js is ever refactored or extracted.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const Booking = require('../models/Booking');
const ProcessedPaymentEvent = require('../models/ProcessedPaymentEvent');

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
    Booking.deleteMany({}),
    ProcessedPaymentEvent.deleteMany({}),
  ]);
});

// ── 1. AI credit deduction: atomic, fail-closed ──
test('credit deduction: two concurrent requests for all remaining credits — only one succeeds, balance never goes negative', async () => {
  const user = await User.create({ email: 'credits@test.com', aiCredits: 10 });
  const cost = 10;

  const deduct = () => User.findOneAndUpdate(
    { _id: user._id, aiCredits: { $gte: cost } },
    { $inc: { aiCredits: -cost } },
    { new: true }
  );

  const [a, b] = await Promise.all([deduct(), deduct()]);
  const successes = [a, b].filter(Boolean);

  assert.equal(successes.length, 1, 'exactly one of the two concurrent deductions should succeed');

  const final = await User.findById(user._id);
  assert.equal(final.aiCredits, 0, 'balance must land at exactly 0, never negative');
});

test('credit deduction: insufficient balance is rejected without mutating the account', async () => {
  const user = await User.create({ email: 'poor@test.com', aiCredits: 5 });
  const cost = 10;

  const result = await User.findOneAndUpdate(
    { _id: user._id, aiCredits: { $gte: cost } },
    { $inc: { aiCredits: -cost } },
    { new: true }
  );

  assert.equal(result, null, 'deduction must be refused when balance is below cost');

  const unchanged = await User.findById(user._id);
  assert.equal(unchanged.aiCredits, 5, 'balance must be untouched on a refused deduction');
});

// ── 2. Payment webhook: idempotent crediting ──
async function processPaymentEvent({ eventKey, orderId, userId, credits }) {
  const dbSession = await mongoose.startSession();
  try {
    await ProcessedPaymentEvent.init();
    await dbSession.withTransaction(async () => {
      await ProcessedPaymentEvent.create([{ eventKey, orderId, userId, credits }], { session: dbSession });
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { aiCredits: credits } },
        { new: true, session: dbSession }
      );
      if (!updatedUser) throw new Error('Payment user disappeared during crediting.');
    });
    return { duplicate: false };
  } catch (err) {
    if (err?.code === 11000) return { duplicate: true };
    throw err;
  } finally {
    await dbSession.endSession();
  }
}

test('webhook: the same order_created event delivered twice only credits the user once', async () => {
  const user = await User.create({ email: 'payer@test.com', aiCredits: 0 });
  const event = { eventKey: 'order_created:12345', orderId: '12345', userId: user._id, credits: 100 };

  const [first, second] = await Promise.all([
    processPaymentEvent(event),
    processPaymentEvent(event),
  ]);

  const outcomes = [first, second];
  assert.equal(outcomes.filter(o => !o.duplicate).length, 1, 'exactly one delivery should process as new');
  assert.equal(outcomes.filter(o => o.duplicate).length, 1, 'the retry must be recognized as a duplicate');

  const finalUser = await User.findById(user._id);
  assert.equal(finalUser.aiCredits, 100, 'credits must be applied exactly once, not twice');

  const eventCount = await ProcessedPaymentEvent.countDocuments({ eventKey: event.eventKey });
  assert.equal(eventCount, 1, 'only one ProcessedPaymentEvent record should exist for this eventKey');
});

// ── 3. Booking slot claim: atomic active → processing transition ──
test('booking claim: two guests racing for the same link — only one claims it', async () => {
  const host = await User.create({ email: 'host@test.com' });
  const booking = await Booking.create({
    bookingId: 'bk-race-1',
    hostId: host._id,
    duration: 30,
    day: 'Sunday',
    status: 'active',
  });

  const claim = () => Booking.findOneAndUpdate(
    { bookingId: booking.bookingId, status: 'active' },
    { $set: { status: 'processing' } },
    { new: true }
  );

  const [a, b] = await Promise.all([claim(), claim()]);
  const successes = [a, b].filter(Boolean);

  assert.equal(successes.length, 1, 'exactly one of the two concurrent claims should succeed');

  const final = await Booking.findOne({ bookingId: booking.bookingId });
  assert.equal(final.status, 'processing');
});
