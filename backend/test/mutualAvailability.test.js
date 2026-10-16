// ──────────────────────────────────────────────
// Characterization tests for mutual-availability's pure interval/date math:
//   intersectFree(), mergeIntervals(), getLocalScheduleBusy(),
//   getLocationTimeZone(), todayIsoInTimeZone().
// None of these touch Mongo, so — unlike mutualBooking.test.js — this file
// needs no MongoMemoryReplSet and keeps passing even when that download is
// unavailable (e.g. a sandboxed/offline CI run with no network access to
// fetch the mongod binary).
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test, mock } = require('node:test');
const {
  intersectFree, mergeIntervals, sliceIntoSlots, overlapsAny, getLocalScheduleBusy, getLocationTimeZone, todayIsoInTimeZone, isValidIsoDate,
  isSlotMutuallyFree
} = require('../services/mutualAvailability');

// ── intersectFree(): pure interval math ──
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

test('mergeIntervals: overlapping (not just adjacent) intervals merge into one range', () => {
  // Mirrors two overlapping provider-availability rows (e.g. 9-12 and 11-14) —
  // providerRoutes.js' computeAvailableSlots relies on this to avoid offering
  // the same slot startTime twice.
  assert.deepEqual(mergeIntervals([{ start: 540, end: 720 }, { start: 660, end: 840 }]), [{ start: 540, end: 840 }]);
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

// ── sliceIntoSlots(): shared slot-slicing rule used by both mutual free-time
// gaps (getMutualFreeSlots) and provider weekly-availability rows
// (providerRoutes.js' computeAvailableSlots) ──
test('sliceIntoSlots: cuts a single range into back-to-back duration-sized slots, dropping the remainder', () => {
  // 540-625 (85 min) at 30-min slots: 540-570, 570-600, 600-630 would overrun — only two fit.
  assert.deepEqual(sliceIntoSlots([{ start: 540, end: 625 }], 30), [
    { start: 540, end: 570 },
    { start: 570, end: 600 },
  ]);
});

test('sliceIntoSlots: a range exactly equal to the duration yields one slot, one minute short yields none', () => {
  assert.deepEqual(sliceIntoSlots([{ start: 540, end: 570 }], 30), [{ start: 540, end: 570 }]);
  assert.deepEqual(sliceIntoSlots([{ start: 540, end: 569 }], 30), []);
});

test('sliceIntoSlots: slices each input range independently, in order', () => {
  assert.deepEqual(sliceIntoSlots([{ start: 540, end: 600 }, { start: 660, end: 720 }], 30), [
    { start: 540, end: 570 },
    { start: 570, end: 600 },
    { start: 660, end: 690 },
    { start: 690, end: 720 },
  ]);
});

test('sliceIntoSlots: an empty range list yields no slots', () => {
  assert.deepEqual(sliceIntoSlots([], 30), []);
});

// ── overlapsAny(): shared strict-overlap predicate used by both
// computeAvailableSlots' free-slot filter and providerRoutes.js' POST
// /:id/book secondary double-booking re-check ──
test('overlapsAny: detects a genuine overlap', () => {
  assert.equal(overlapsAny(600, 630, [{ start: 615, end: 645 }]), true);
});

test('overlapsAny: ranges that only touch at a boundary do not count as overlapping', () => {
  assert.equal(overlapsAny(600, 630, [{ start: 630, end: 660 }]), false);
  assert.equal(overlapsAny(600, 630, [{ start: 540, end: 600 }]), false);
});

test('overlapsAny: no overlap against an empty or disjoint range list', () => {
  assert.equal(overlapsAny(600, 630, []), false);
  assert.equal(overlapsAny(600, 630, [{ start: 0, end: 100 }, { start: 700, end: 800 }]), false);
});

// ── Documents a real gap: ProviderBooking's unique index only guards an
// exact-startTime collision. Two services with different durations, sliced
// from the same availability window, land on different startTimes but can
// still overlap in time — the index alone would let both bookings through.
// This is exactly why providerRoutes.js' POST /:id/book re-checks overlap
// (via overlapsAny) against every other non-cancelled booking right after
// its insert, instead of relying on the index alone. ──
test('sliceIntoSlots: two different-duration services over the same window produce overlapping, differently-timed slots (the gap the index alone misses)', () => {
  const window = [{ start: 540, end: 600 }]; // 09:00-10:00
  const thirtyMinSlots = sliceIntoSlots(window, 30); // 09:00-09:30, 09:30-10:00
  const fortyFiveMinSlots = sliceIntoSlots(window, 45); // 09:00-09:45

  // Different startTimes (so the unique providerId+date+startTime index
  // would not catch a collision between them)...
  assert.notDeepEqual(thirtyMinSlots[1], fortyFiveMinSlots[0]);
  // ...yet the second 30-min slot (09:30-10:00) overlaps the 45-min slot (09:00-09:45).
  assert.equal(overlapsAny(thirtyMinSlots[1].start, thirtyMinSlots[1].end, [fortyFiveMinSlots[0]]), true);
});

// ── isValidIsoDate(): guards the 'YYYY-MM-DD' confirm/book inputs against
// JS Date's silent day-overflow (e.g. "2026-02-30" -> March 2), which a bare
// regex + Date.parse check would miss ──
test('isValidIsoDate: accepts well-formed calendar dates', () => {
  assert.equal(isValidIsoDate('2026-11-02'), true);
  assert.equal(isValidIsoDate('2026-02-28'), true);
  assert.equal(isValidIsoDate('2028-02-29'), true); // leap year
});

test('isValidIsoDate: rejects a calendar date that overflows (Feb 30 does not exist)', () => {
  assert.equal(isValidIsoDate('2026-02-30'), false);
  assert.equal(isValidIsoDate('2026-02-29'), false); // 2026 is not a leap year
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDate('2026-04-31'), false);
});

test('isValidIsoDate: rejects malformed, non-string, or empty input', () => {
  assert.equal(isValidIsoDate('2026-1-2'), false);
  assert.equal(isValidIsoDate('11/02/2026'), false);
  assert.equal(isValidIsoDate(''), false);
  assert.equal(isValidIsoDate(undefined), false);
  assert.equal(isValidIsoDate(null), false);
  assert.equal(isValidIsoDate(20261102), false);
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

// ── isSlotMutuallyFree(): server-side race-guard re-check the /confirm route
// relies on. getMutualFreeSlots() never *lists* a Shabbat day, but a direct
// API call (bypassing the UI) could still ask to confirm one — this must be
// rejected on its own, the same "HARD SHABBAT GUARD" every other AI/booking
// entry point in this app enforces, not merely assumed free because neither
// calendar happens to have a conflicting event that day. Fake, clearly-
// invalid Google credentials below prove the point: if the guard didn't
// short-circuit before the freebusy.query call, this would reject with a
// network/auth error (or hang) instead of resolving with free:false.
test('isSlotMutuallyFree: rejects a Saturday (Shabbat) slot without even checking the calendars', async () => {
  const host = { _id: 'host-1', googleAccessToken: 'fake' };
  const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
  const result = await isSlotMutuallyFree(host, invitee, {
    locationId: 'jerusalem',
    date: '2026-11-07', // a Saturday
    startTime: '10:00 AM',
    endTime: '10:30 AM'
  });
  assert.deepEqual(result, { free: false, timeZone: 'Asia/Jerusalem' });
});

// ── isSlotMutuallyFree(): the same "never confirm a slot that already
// started today" cutoff getMutualFreeSlots() applies when *listing* slots
// (via currentMinuteOfDay) must also be enforced here, independently, since
// this is the function the /confirm route's race-guard actually calls for a
// client-supplied date/time — a stale list or a direct API call could still
// submit an already-passed slot otherwise. Same proof technique as the
// Shabbat test above: fake credentials that would blow up if the function
// ever reached the freebusy.query call instead of short-circuiting first.
test('isSlotMutuallyFree: rejects a same-day slot that has already started, without checking the calendars', async () => {
  const host = { _id: 'host-1', googleAccessToken: 'fake' };
  const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
  // 2026-11-04 is a Wednesday (not Shabbat). Mock "now" to 10:00 Asia/Jerusalem
  // (08:00Z, Israel is UTC+2 in November) and ask to confirm a 09:00 AM slot.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-04T08:00:00Z').getTime() });
  try {
    const result = await isSlotMutuallyFree(host, invitee, {
      locationId: 'jerusalem',
      date: '2026-11-04',
      startTime: '09:00 AM',
      endTime: '09:30 AM'
    });
    assert.deepEqual(result, { free: false, timeZone: 'Asia/Jerusalem' });
  } finally {
    mock.timers.reset();
  }
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
