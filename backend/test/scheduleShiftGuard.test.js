// ──────────────────────────────────────────────
// shiftScheduleForward ("I'm running late") and mergeGaps ("merge gaps")
// in server.js already skip moving a confirmed mutual meeting / provider
// booking (mutualSessionId/providerBookingId) — but a flat shift applied to
// every *other* event could still push one of them into the now-unchanged
// frozen slot, creating a new overlap. These guard functions clamp each
// unlinked event's shift so that can never happen. Pure, no Mongo.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  isLinkedEvent,
  applyForwardShiftWithLinkedGuard,
  applyBackwardShiftWithLinkedGuard,
} = require('../services/scheduleShiftGuard');

const plain = (startMinutes, endMinutes) => ({ startMinutes, endMinutes });
const mutual = (startMinutes, endMinutes, id = 's1') => ({ startMinutes, endMinutes, mutualSessionId: id });
const provider = (startMinutes, endMinutes, id = 'b1') => ({ startMinutes, endMinutes, providerBookingId: id });

test('isLinkedEvent recognizes both marker fields and rejects plain events', () => {
  assert.equal(isLinkedEvent(mutual(0, 10)), true);
  assert.equal(isLinkedEvent(provider(0, 10)), true);
  assert.equal(isLinkedEvent(plain(0, 10)), false);
  assert.equal(isLinkedEvent(null), false);
});

test('applyForwardShiftWithLinkedGuard: with no linked events, shifts everything by the full delay', () => {
  const events = [plain(600, 630), plain(630, 660)];
  const result = applyForwardShiftWithLinkedGuard(events, 15);
  assert.deepEqual(result, [
    { startMinutes: 615, endMinutes: 645 },
    { startMinutes: 645, endMinutes: 675 },
  ]);
});

test('applyForwardShiftWithLinkedGuard: a linked event never moves', () => {
  const events = [mutual(630, 660)];
  const result = applyForwardShiftWithLinkedGuard(events, 15);
  assert.deepEqual(result, [{ startMinutes: 630, endMinutes: 660 }]);
});

test('applyForwardShiftWithLinkedGuard: regression — an unlinked event immediately before a linked one is not pushed into it', () => {
  // A: 10:00-10:30 (600-630), LINKED: 10:30-11:00 (630-660), delay 15 min.
  // Before the fix, A became 10:15-10:45 and overlapped LINKED by 15 min.
  const events = [plain(600, 630), mutual(630, 660)];
  const result = applyForwardShiftWithLinkedGuard(events, 15);
  assert.deepEqual(result[1], { startMinutes: 630, endMinutes: 660 }); // LINKED untouched
  assert.deepEqual(result[0], { startMinutes: 600, endMinutes: 630 }); // A: no room, stays put
  assert.ok(result[0].endMinutes <= result[1].startMinutes, 'A must not overlap LINKED');
});

test('applyForwardShiftWithLinkedGuard: a partial shift is applied when there is some, but not full, room', () => {
  // A: 09:00-09:30 (540-570), LINKED: 09:40-10:00 (580-600), delay 15 min.
  // Full shift would end A at 09:45 (585), past LINKED's start (580) — capped to 580.
  const events = [plain(540, 570), mutual(580, 600)];
  const result = applyForwardShiftWithLinkedGuard(events, 15);
  assert.deepEqual(result[0], { startMinutes: 550, endMinutes: 580 });
  assert.deepEqual(result[1], { startMinutes: 580, endMinutes: 600 });
});

test('applyForwardShiftWithLinkedGuard: events after a linked one are unaffected by it (always safe)', () => {
  const events = [mutual(600, 630), plain(630, 660)];
  const result = applyForwardShiftWithLinkedGuard(events, 15);
  assert.deepEqual(result[0], { startMinutes: 600, endMinutes: 630 });
  assert.deepEqual(result[1], { startMinutes: 645, endMinutes: 675 });
});

test('applyBackwardShiftWithLinkedGuard: with no linked events, shifts everything by the full amount', () => {
  const events = [plain(600, 630), plain(640, 670)];
  const result = applyBackwardShiftWithLinkedGuard(events, 30);
  assert.deepEqual(result, [
    { startMinutes: 570, endMinutes: 600 },
    { startMinutes: 610, endMinutes: 640 },
  ]);
});

test('applyBackwardShiftWithLinkedGuard: a linked event never moves', () => {
  const events = [mutual(600, 630)];
  const result = applyBackwardShiftWithLinkedGuard(events, 30);
  assert.deepEqual(result, [{ startMinutes: 600, endMinutes: 630 }]);
});

test('applyBackwardShiftWithLinkedGuard: regression — an unlinked event right after a linked one is not pulled into it', () => {
  // LINKED: 10:00-10:30 (600-630), B: 10:40-11:10 (640-670), merging a 30-min gap.
  // Before the fix, B became 10:10-10:40 and overlapped LINKED by 20 min.
  const events = [mutual(600, 630), plain(640, 670)];
  const result = applyBackwardShiftWithLinkedGuard(events, 30);
  assert.deepEqual(result[0], { startMinutes: 600, endMinutes: 630 }); // LINKED untouched
  assert.ok(result[1].startMinutes >= result[0].endMinutes, 'B must not overlap LINKED');
  assert.deepEqual(result[1], { startMinutes: 630, endMinutes: 660 }); // B: pulled back exactly to abut LINKED
});

test('applyBackwardShiftWithLinkedGuard: no room at all leaves the unlinked event untouched', () => {
  // LINKED ends exactly where B starts — zero room to pull B back.
  const events = [mutual(600, 640), plain(640, 670)];
  const result = applyBackwardShiftWithLinkedGuard(events, 30);
  assert.deepEqual(result[1], { startMinutes: 640, endMinutes: 670 });
});

test('applyBackwardShiftWithLinkedGuard: startIndex seeds the floor from the untouched event right before it', () => {
  const events = [mutual(600, 630), plain(640, 670)];
  const result = applyBackwardShiftWithLinkedGuard(events, 30, 1);
  assert.deepEqual(result[0], { startMinutes: 600, endMinutes: 630 });
  assert.deepEqual(result[1], { startMinutes: 630, endMinutes: 660 });
});
