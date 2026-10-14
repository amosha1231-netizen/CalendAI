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
  intersectFree, mergeIntervals, getLocalScheduleBusy, getLocationTimeZone, todayIsoInTimeZone
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
