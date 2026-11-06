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
  applyMinGapForwardWithLinkedGuard,
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

test('applyMinGapForwardWithLinkedGuard: with no linked events, cascades the needed shift forward to restore the minimum gap', () => {
  const events = [plain(540, 550), plain(552, 562)];
  const result = applyMinGapForwardWithLinkedGuard(events, 10);
  assert.deepEqual(result, [
    { startMinutes: 540, endMinutes: 550 },
    { startMinutes: 560, endMinutes: 570 },
  ]);
});

test('applyMinGapForwardWithLinkedGuard: a linked event is never moved even when too close to its predecessor', () => {
  const events = [plain(540, 550), mutual(552, 600)];
  const result = applyMinGapForwardWithLinkedGuard(events, 10);
  assert.deepEqual(result[0], { startMinutes: 540, endMinutes: 550 });
  assert.deepEqual(result[1], { startMinutes: 552, endMinutes: 600 }); // LINKED untouched
});

test('applyMinGapForwardWithLinkedGuard: a shift computed for (but never applied to) a frozen event does not carry forward to an event whose own gap is already fine', () => {
  // A: 09:00-09:05, B: 09:06-09:36 (gap 1 < 10, B would need +9 but B is
  // LINKED/frozen so it never moves), LINKED's own "needed" 9-min shift must
  // not leak into C's computation. C: 10:00-10:10 is already 24 min after
  // LINKED's real (unmoved) end — it needs no shift at all.
  const events = [plain(540, 545), mutual(546, 576), plain(600, 610)];
  const result = applyMinGapForwardWithLinkedGuard(events, 10);
  assert.deepEqual(result[1], { startMinutes: 546, endMinutes: 576 }); // LINKED untouched
  assert.deepEqual(result[2], { startMinutes: 600, endMinutes: 610 }); // C: unaffected, no bogus carried shift
});

test('applyMinGapForwardWithLinkedGuard: regression — a shift carried past one frozen event does not land a later unlinked event inside a second, further-along frozen event', () => {
  // P: 09:00-09:05, Q: 09:06-09:36 (gap 1 < 10, Q shifts to 09:15-09:45),
  // L1 (frozen): 09:48-10:00, C: 10:05-10:15 (gap 5 < 10 vs L1's real end),
  // L2 (frozen): 10:20-10:50.
  // Before the fix, the running shift was never reset at L1: C inherited
  // L1's own would-be-but-never-applied shift on top of its own, landing at
  // 10:26-10:36 — fully inside L2 (10:20-10:50). With the fix, the shift
  // resets to zero at every frozen event, so C only gets its own actually-
  // needed adjustment and stops exactly at L2's boundary.
  const events = [
    plain(540, 545),
    plain(546, 576),
    mutual(588, 600),
    plain(605, 615),
    provider(620, 650),
  ];
  const result = applyMinGapForwardWithLinkedGuard(events, 10);
  assert.deepEqual(result[1], { startMinutes: 555, endMinutes: 585 }); // Q: shifted by 9
  assert.deepEqual(result[2], { startMinutes: 588, endMinutes: 600 }); // L1: untouched
  assert.deepEqual(result[3], { startMinutes: 610, endMinutes: 620 }); // C: shifted by only 5, not 21
  assert.deepEqual(result[4], { startMinutes: 620, endMinutes: 650 }); // L2: untouched
  assert.ok(result[3].endMinutes <= result[4].startMinutes, 'C must not overlap L2');
});
