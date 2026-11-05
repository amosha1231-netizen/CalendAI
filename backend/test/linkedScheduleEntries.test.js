// ──────────────────────────────────────────────
// PUT /api/schedule (the frontend's Undo) restores a client-side snapshot.
// Booking-linked entries (mutual meetings / provider bookings) must come from
// the stored schedule, not the snapshot. Pure, no Mongo.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { preserveLinkedEntries, isLinkedEntry } = require('../services/linkedScheduleEntries');

const plain = (title) => ({ title, startTime: '09:00 AM', endTime: '10:00 AM', recurrence: 'weekly' });
const mutual = (id) => ({ title: 'Meeting', startTime: '11:00 AM', endTime: '11:30 AM', recurrence: 'once', mutualSessionId: id });
const provider = (id) => ({ title: 'Haircut', startTime: '02:00 PM', endTime: '02:30 PM', recurrence: 'once', providerBookingId: id });

test('undo snapshot taken before a booking was confirmed does not drop the booking', () => {
  const snapshot = { Monday: [plain('Gym')], Tuesday: [], Today: [plain('Gym')] };
  const stored = { Monday: [plain('Gym'), plain('New AI event'), mutual('s1')], Tuesday: [provider('b1')], Today: [plain('Gym'), mutual('s1')] };
  const result = preserveLinkedEntries(snapshot, stored);
  assert.deepEqual(result.Monday.map(e => e.title), ['Gym', 'Meeting']);
  assert.equal(result.Monday[1].mutualSessionId, 's1');
  assert.equal(result.Tuesday[0].providerBookingId, 'b1');
  assert.equal(result.Today.filter(isLinkedEntry).length, 1);
});

test('undo snapshot holding a since-cancelled booking does not resurrect it', () => {
  const snapshot = { Monday: [plain('Gym'), mutual('s1')], Wednesday: [provider('b1')] };
  const stored = { Monday: [plain('Gym')], Wednesday: [] };
  const result = preserveLinkedEntries(snapshot, stored);
  assert.deepEqual(result.Monday, [plain('Gym')]);
  assert.deepEqual(result.Wednesday, []);
});

test('a rewritten schedule that retimes a linked entry has the real time restored', () => {
  // Mirrors POST /api/reschedule: the AI rewrites the whole schedule with no
  // idea a mutualSessionId/providerBookingId entry mirrors a real
  // appointment, and could move it to a "better" slot — the merged result
  // must keep the entry's real (stored) time, not whatever the rewrite
  // produced for it.
  const movedMutual = { ...mutual('s1'), startTime: '03:00 PM', endTime: '03:30 PM' };
  const rewritten = { Monday: [plain('Gym'), movedMutual] };
  const stored = { Monday: [plain('Gym'), mutual('s1')] };
  const result = preserveLinkedEntries(rewritten, stored);
  const kept = result.Monday.find(e => e.mutualSessionId === 's1');
  assert.equal(kept.startTime, '11:00 AM');
  assert.equal(kept.endTime, '11:30 AM');
});

test('unlinked entries come from the snapshot as before', () => {
  const snapshot = { Monday: [plain('Old')], Friday: [plain('Fri')] };
  const stored = { Monday: [plain('New')], Friday: [] };
  assert.deepEqual(preserveLinkedEntries(snapshot, stored), snapshot);
});

test('a non-object schedule is rejected', () => {
  assert.equal(preserveLinkedEntries('x', {}), null);
  assert.equal(preserveLinkedEntries([plain('a')], {}), null);
  assert.equal(preserveLinkedEntries(null, {}), null);
});
