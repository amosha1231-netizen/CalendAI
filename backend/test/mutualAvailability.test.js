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
const { google } = require('googleapis');
const {
  intersectFree, mergeIntervals, sliceIntoSlots, overlapsAny, getLocalScheduleBusy, getLocationTimeZone, todayIsoInTimeZone,
  getTodayDayNameInTimeZone, isValidIsoDate, isSlotMutuallyFree, getMutualFreeSlots, getFreeBusyForDay, FRIDAY_SHABBAT_CUTOFF_MIN,
  minutesToTime12, parseClock12
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

test('getLocalScheduleBusy: a bare 24-hour AI-parsed event (no AM/PM marker) still counts as busy', () => {
  // aiService.js instructs the model to always return startTime/endTime in 24-hour
  // format ("17:00", not "05:00 PM"), and /api/parse-schedule stores that as-is —
  // without a 24-hour fallback these events were silently invisible to mutual scheduling.
  const user = { schedule: { Monday: [{ startTime: '17:00', endTime: '18:00', targetDate: '2026-11-02' }] } };
  assert.deepEqual(getLocalScheduleBusy(user, '2026-11-02', 'Monday'), [{ start: 1020, end: 1080 }]);
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

// ── isSlotMutuallyFree(): the Saturday guard above would miss a Friday
// meeting that starts before Shabbat but runs past candle-lighting — this
// is the same hard guard extended to Friday evening, proven with the same
// fake-credentials short-circuit technique (a real freebusy.query call
// would throw/hang on these tokens, so a free:false result with no thrown
// error proves the check ran before ever reaching Google). ──
test('isSlotMutuallyFree: rejects a Friday slot that runs past the Shabbat-start cutoff, without even checking the calendars', async () => {
  const host = { _id: 'host-1', googleAccessToken: 'fake' };
  const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
  // 2026-11-06 is a Friday. FRIDAY_SHABBAT_CUTOFF_MIN is 16:00 (960 min);
  // 15:45-16:15 starts before it but ends after, so it must be rejected.
  const result = await isSlotMutuallyFree(host, invitee, {
    locationId: 'jerusalem',
    date: '2026-11-06',
    startTime: '03:45 PM',
    endTime: '04:15 PM'
  });
  assert.deepEqual(result, { free: false, timeZone: 'Asia/Jerusalem' });
});

test('isSlotMutuallyFree: a Friday slot that ends exactly at the Shabbat-start cutoff is not rejected by the Friday guard', async () => {
  assert.equal(FRIDAY_SHABBAT_CUTOFF_MIN, 16 * 60);
  // Mock "now" well before this slot so the same-day-already-started cutoff
  // doesn't also reject it — isolating this test to the Friday guard alone.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-06T06:00:00Z').getTime() }); // 08:00 Asia/Jerusalem
  try {
    const host = { _id: 'host-1', googleAccessToken: 'fake' };
    const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
    // 15:30-16:00 ends exactly at the cutoff — must fall through to the
    // (here, fake-credentialed) freebusy check rather than being rejected
    // outright by the Friday guard, which rejects only endMin > cutoff.
    await assert.rejects(
      isSlotMutuallyFree(host, invitee, {
        locationId: 'jerusalem',
        date: '2026-11-06',
        startTime: '03:30 PM',
        endTime: '04:00 PM'
      }),
      'fake credentials must make this reach (and fail in) the real freebusy.query call, proving the Friday guard did not short-circuit it'
    );
  } finally {
    mock.timers.reset();
  }
});

// ── isSlotMutuallyFree(): HARD DAY-WINDOW GUARD. getFreeBusyForDay windows
// its freebusy.query to exactly [defaultDayStart, defaultDayEnd) — a request
// for a window outside that range would never have real conflicts fetched
// for it at all (not merely skipped by a Shabbat/Friday guard), so it must be
// rejected outright before ever reaching Google, the same short-circuit
// proof technique (fake credentials) used by the guards above. ──
test('isSlotMutuallyFree: rejects a slot starting before the location\'s day-start, without even checking the calendars', async () => {
  const host = { _id: 'host-1', googleAccessToken: 'fake' };
  const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
  // Jerusalem's defaultDayStart is 06:00; 2026-11-09 is a Monday (no other guard applies).
  const result = await isSlotMutuallyFree(host, invitee, {
    locationId: 'jerusalem',
    date: '2026-11-09',
    startTime: '05:30 AM',
    endTime: '06:00 AM'
  });
  assert.deepEqual(result, { free: false, timeZone: 'Asia/Jerusalem' });
});

test('isSlotMutuallyFree: rejects a slot ending after the location\'s day-end, without even checking the calendars', async () => {
  const host = { _id: 'host-1', googleAccessToken: 'fake' };
  const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
  // Jerusalem's defaultDayEnd is 23:00; 2026-11-09 is a Monday (no other guard applies).
  const result = await isSlotMutuallyFree(host, invitee, {
    locationId: 'jerusalem',
    date: '2026-11-09',
    startTime: '11:00 PM',
    endTime: '11:30 PM'
  });
  assert.deepEqual(result, { free: false, timeZone: 'Asia/Jerusalem' });
});

// ── isSlotMutuallyFree(): the actual freebusy-based decision. Every test
// above only exercises the short-circuit guards (Shabbat, already-started,
// Friday cutoff) via deliberately-invalid credentials that would blow up if
// the function ever reached the freebusy.query call — none of them actually
// prove the function correctly grants or denies a slot once it gets there.
// These mock google.calendar() (the same shared `googleapis` singleton
// getFreeBusyForDay() calls internally, per getFreeBusyForDay's own tests
// above) to exercise that real decision end-to-end. ──
test('isSlotMutuallyFree: both calendars fully free resolves free:true', async (t) => {
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: { query: async () => ({ data: { calendars: { primary: { busy: [] } } } }) }
  }));
  try {
    const host = { _id: 'host-1', googleAccessToken: 'fake' };
    const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
    const result = await isSlotMutuallyFree(host, invitee, {
      locationId: 'jerusalem',
      date: '2026-11-09', // a Monday
      startTime: '10:00 AM',
      endTime: '10:30 AM'
    });
    assert.deepEqual(result, { free: true, timeZone: 'Asia/Jerusalem' });
  } finally {
    calendarMock.mock.restore();
  }
});

test('isSlotMutuallyFree: a busy block on just one side (the invitee\'s) still rejects the slot', async (t) => {
  let callCount = 0;
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: {
      query: async () => {
        callCount++;
        // First call is the host's freebusy, second is the invitee's (see
        // isSlotMutuallyFree's Promise.all([getFreeBusyForDay(host, ...),
        // getFreeBusyForDay(invitee, ...)])) — busy only on the second.
        const busy = callCount === 2 ? [{ start: '2026-11-09T08:00:00Z', end: '2026-11-09T08:30:00Z' }] : [];
        return { data: { calendars: { primary: { busy } } } };
      }
    }
  }));
  try {
    const host = { _id: 'host-1', googleAccessToken: 'fake' };
    const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
    // 08:00-08:30 Asia/Jerusalem (UTC+2) is 10:00-10:30 local — matches the
    // invitee's busy block above exactly.
    const result = await isSlotMutuallyFree(host, invitee, {
      locationId: 'jerusalem',
      date: '2026-11-09',
      startTime: '10:00 AM',
      endTime: '10:30 AM'
    });
    assert.deepEqual(result, { free: false, timeZone: 'Asia/Jerusalem' });
  } finally {
    calendarMock.mock.restore();
  }
});

test('isSlotMutuallyFree: a conflict confined to the host\'s own local `schedule` (never synced to Google) still rejects the slot', async (t) => {
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: { query: async () => ({ data: { calendars: { primary: { busy: [] } } } }) }
  }));
  try {
    // Nothing on either Google calendar, but the host already has this exact
    // window booked locally (e.g. via /api/schedule/add-to-free-slot, which
    // never syncs to Google) — getLocalScheduleBusy must still catch it.
    const host = {
      _id: 'host-1', googleAccessToken: 'fake',
      schedule: { Monday: [{ startTime: '10:00 AM', endTime: '10:30 AM' }] }
    };
    const invitee = { _id: 'invitee-1', googleAccessToken: 'fake' };
    const result = await isSlotMutuallyFree(host, invitee, {
      locationId: 'jerusalem',
      date: '2026-11-09', // a Monday
      startTime: '10:00 AM',
      endTime: '10:30 AM'
    });
    assert.deepEqual(result, { free: false, timeZone: 'Asia/Jerusalem' });
  } finally {
    calendarMock.mock.restore();
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

test('getTodayDayNameInTimeZone: resolves the weekday in the given timezone, not the server/UTC day', () => {
  // Same instant as the todayIsoInTimeZone test above (2026-11-02T02:30:00Z):
  // already Monday Nov 2 in UTC, but still Sunday Nov 1, 21:30 in
  // America/New_York (UTC-5 in November) — providerRoutes.js/mutualRoutes.js
  // rely on exactly this divergence to decide a location's own "Today"
  // schedule bucket independently of the server's or a requesting visitor's
  // own timezone.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-02T02:30:00Z').getTime() });
  try {
    assert.equal(getTodayDayNameInTimeZone('UTC'), 'Monday');
    assert.equal(getTodayDayNameInTimeZone('America/New_York'), 'Sunday');
  } finally {
    mock.timers.reset();
  }
});

// ── getMutualFreeSlots(): the same-day "already started" cutoff (windowStartMin) ──
test('getMutualFreeSlots: clips today\'s window to the current time but leaves later days untouched', async () => {
  // 2026-01-05T08:00:00Z is 10:00 AM in Asia/Jerusalem, a Monday (no Shabbat
  // guard involved), so offset 0 is today (2026-01-05) and offset 1 is
  // tomorrow (2026-01-06, Tuesday).
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-05T08:00:00Z').getTime() });
  const calendarMock = mock.method(google, 'calendar', () => ({
    freebusy: { query: async () => ({ data: { calendars: { primary: { busy: [] } } } }) }
  }));
  try {
    const host = { _id: 'host-1', googleAccessToken: 'fake', googleRefreshToken: 'fake', schedule: {} };
    const invitee = { _id: 'invitee-1', googleAccessToken: 'fake', googleRefreshToken: 'fake', schedule: {} };

    const results = await getMutualFreeSlots(host, invitee, { locationId: 'jerusalem', duration: 30, rangeDays: 2 });

    const today = results.find(r => r.date === '2026-01-05');
    const tomorrow = results.find(r => r.date === '2026-01-06');

    assert.ok(today && today.freeSlots.length, 'today should still have free slots after the current time');
    assert.equal(today.freeSlots[0].startTime, '10:00 AM', 'today\'s first slot must not start before "now" (10:00), even though the location day starts at 06:00');

    assert.ok(tomorrow && tomorrow.freeSlots.length, 'tomorrow should have free slots');
    assert.equal(tomorrow.freeSlots[0].startTime, '06:00 AM', 'tomorrow is unaffected by today\'s current-time cutoff and starts at the location\'s normal day start');
  } finally {
    mock.timers.reset();
    calendarMock.mock.restore();
  }
});

test('getMutualFreeSlots: skips Saturday entirely and caps Friday at the Shabbat-start cutoff', async () => {
  // 2026-01-01T08:00:00Z is 10:00 AM in Asia/Jerusalem, a Thursday, so with
  // rangeDays=3 the window covers Thu 1/1, Fri 1/2 and Sat 1/3 — exactly the
  // Friday-cutoff/Saturday-skip combination isSlotMutuallyFree enforces
  // server-side, but which getMutualFreeSlots' own listing had no direct
  // coverage for until now (only the plain weekday-clipping test above did).
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-01T08:00:00Z').getTime() });
  const calendarMock = mock.method(google, 'calendar', () => ({
    freebusy: { query: async () => ({ data: { calendars: { primary: { busy: [] } } } }) }
  }));
  try {
    const host = { _id: 'host-1', googleAccessToken: 'fake', googleRefreshToken: 'fake', schedule: {} };
    const invitee = { _id: 'invitee-1', googleAccessToken: 'fake', googleRefreshToken: 'fake', schedule: {} };

    const results = await getMutualFreeSlots(host, invitee, { locationId: 'jerusalem', duration: 30, rangeDays: 3 });

    assert.ok(!results.some(r => r.date === '2026-01-03'), 'Saturday (Shabbat) must never appear in the results');

    const friday = results.find(r => r.date === '2026-01-02');
    assert.ok(friday && friday.freeSlots.length, 'Friday should still offer slots before the Shabbat-start cutoff');
    const lastSlot = friday.freeSlots[friday.freeSlots.length - 1];
    const [h, m] = lastSlot.endTime.replace(/\s*(AM|PM)/i, '').split(':').map(Number);
    const isPM = /PM/i.test(lastSlot.endTime);
    const endMin = ((isPM && h !== 12 ? h + 12 : (!isPM && h === 12 ? 0 : h)) * 60) + m;
    assert.ok(endMin <= FRIDAY_SHABBAT_CUTOFF_MIN, `Friday's last slot must end by the 16:00 cutoff, got ${lastSlot.endTime}`);
  } finally {
    mock.timers.reset();
    calendarMock.mock.restore();
  }
});

// ── getFreeBusyForDay(): the actual Google freebusy.query integration —
// every other test file (providerGoogleAvailability.test.js,
// getMutualFreeSlots' own test above) stubs this function out entirely, so
// its own clipping/clock-minute-conversion logic has never been exercised
// directly against a (mocked) freebusy.query response. ──
const user = { _id: 'u1', googleAccessToken: 'fake', googleRefreshToken: 'fake' };

test('getFreeBusyForDay: a busy block fully inside the window is returned in clock-minutes-of-day, as-is', async (t) => {
  // Query window 06:00-23:00 Asia/Jerusalem on 2026-11-02 (a Monday, UTC+2).
  // Busy 09:00-10:00 is fully inside it.
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: {
      query: async () => ({
        data: { calendars: { primary: { busy: [{ start: '2026-11-02T07:00:00Z', end: '2026-11-02T08:00:00Z' }] } } }
      })
    }
  }));
  try {
    const busy = await getFreeBusyForDay(user, '2026-11-02', '06:00', '23:00', 'Asia/Jerusalem');
    assert.deepEqual(busy, [{ start: 540, end: 600 }]); // 09:00-10:00
    assert.equal(calendarMock.mock.callCount(), 1);
  } finally {
    calendarMock.mock.restore();
  }
});

test('getFreeBusyForDay: a busy block that starts before the window is clipped to the window start', async (t) => {
  // Busy 04:00-07:00 Asia/Jerusalem; window starts at 06:00 — must clip to 06:00-07:00.
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: {
      query: async () => ({
        data: { calendars: { primary: { busy: [{ start: '2026-11-02T02:00:00Z', end: '2026-11-02T05:00:00Z' }] } } }
      })
    }
  }));
  try {
    const busy = await getFreeBusyForDay(user, '2026-11-02', '06:00', '23:00', 'Asia/Jerusalem');
    assert.deepEqual(busy, [{ start: 360, end: 420 }]); // 06:00-07:00
  } finally {
    calendarMock.mock.restore();
  }
});

test('getFreeBusyForDay: a busy block that ends after the window is clipped to the window end', async (t) => {
  // Busy 22:00-23:59 Asia/Jerusalem; window ends at 23:00 — must clip to 22:00-23:00.
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: {
      query: async () => ({
        data: { calendars: { primary: { busy: [{ start: '2026-11-02T20:00:00Z', end: '2026-11-02T21:59:00Z' }] } } }
      })
    }
  }));
  try {
    const busy = await getFreeBusyForDay(user, '2026-11-02', '06:00', '23:00', 'Asia/Jerusalem');
    assert.deepEqual(busy, [{ start: 1320, end: 1380 }]); // 22:00-23:00
  } finally {
    calendarMock.mock.restore();
  }
});

test('getFreeBusyForDay: a busy block entirely outside the window is dropped, not returned as a zero/negative-length range', async (t) => {
  // Busy 23:30-23:50 Asia/Jerusalem is entirely past the 06:00-23:00 window.
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: {
      query: async () => ({
        data: { calendars: { primary: { busy: [{ start: '2026-11-02T21:30:00Z', end: '2026-11-02T21:50:00Z' }] } } }
      })
    }
  }));
  try {
    const busy = await getFreeBusyForDay(user, '2026-11-02', '06:00', '23:00', 'Asia/Jerusalem');
    assert.deepEqual(busy, []);
  } finally {
    calendarMock.mock.restore();
  }
});

test('getFreeBusyForDay: no busy blocks at all resolves to an empty array', async (t) => {
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: { query: async () => ({ data: { calendars: { primary: { busy: [] } } } }) }
  }));
  try {
    const busy = await getFreeBusyForDay(user, '2026-11-02', '06:00', '23:00', 'Asia/Jerusalem');
    assert.deepEqual(busy, []);
  } finally {
    calendarMock.mock.restore();
  }
});

test('getFreeBusyForDay: a per-calendar `errors` field in an HTTP-200 response fails closed instead of reading as "nothing busy"', async (t) => {
  // Google's freebusy.query can return 200 OK with no `busy` array but an
  // `errors` array on the calendar entry (e.g. a revoked grant) — this must
  // throw, not silently resolve to [], or every caller (isSlotMutuallyFree,
  // getMutualFreeSlots, providerRoutes.js' computeAvailableSlots) would treat
  // this user as fully free and risk double-booking their real calendar.
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: {
      query: async () => ({
        data: { calendars: { primary: { errors: [{ domain: 'global', reason: 'notFound' }] } } }
      })
    }
  }));
  try {
    await assert.rejects(
      () => getFreeBusyForDay(user, '2026-11-02', '06:00', '23:00', 'Asia/Jerusalem'),
      /notFound/
    );
  } finally {
    calendarMock.mock.restore();
  }
});

test('getFreeBusyForDay: a response missing calendars.primary entirely fails closed instead of reading as "nothing busy"', async (t) => {
  // Every requested item id is supposed to get its own entry back (with
  // `busy` or `errors`) — an HTTP-200 response that omits `primary`
  // altogether is just as unusable as the explicit-`errors` case above, and
  // must not silently resolve to [] either.
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: { query: async () => ({ data: { calendars: {} } }) }
  }));
  try {
    await assert.rejects(
      () => getFreeBusyForDay(user, '2026-11-02', '06:00', '23:00', 'Asia/Jerusalem'),
      /missing calendars\.primary/
    );
  } finally {
    calendarMock.mock.restore();
  }
});

test('getFreeBusyForDay: queries Google with the window expressed as absolute instants in the right timezone', async (t) => {
  let capturedRequestBody = null;
  const calendarMock = t.mock.method(google, 'calendar', () => ({
    freebusy: {
      query: async (opts) => {
        capturedRequestBody = opts.requestBody;
        return { data: { calendars: { primary: { busy: [] } } } };
      }
    }
  }));
  try {
    await getFreeBusyForDay(user, '2026-11-02', '06:00', '23:00', 'Asia/Jerusalem');
    assert.equal(capturedRequestBody.timeMin, '2026-11-02T04:00:00.000Z'); // 06:00 Asia/Jerusalem (UTC+2)
    assert.equal(capturedRequestBody.timeMax, '2026-11-02T21:00:00.000Z'); // 23:00 Asia/Jerusalem
    assert.equal(capturedRequestBody.timeZone, 'Asia/Jerusalem');
    assert.deepEqual(capturedRequestBody.items, [{ id: 'primary' }]);
  } finally {
    calendarMock.mock.restore();
  }
});

// ── minutesToTime12() / parseClock12(): pure 12-hour clock conversion ──
// Load-bearing for every slot label shown to users and every startTime
// match done server-side (provider booking's unique-index claim, the post-
// insert overlap recheck, mutual availability slicing) — worth pinning down
// directly rather than only indirectly through the higher-level tests above.
test('minutesToTime12: midnight, noon and one-minute-to-midnight', () => {
  assert.equal(minutesToTime12(0), '12:00 AM');
  assert.equal(minutesToTime12(720), '12:00 PM');
  assert.equal(minutesToTime12(1439), '11:59 PM');
});

test('minutesToTime12: morning and afternoon hours convert correctly', () => {
  assert.equal(minutesToTime12(9 * 60 + 5), '09:05 AM');
  assert.equal(minutesToTime12(13 * 60 + 30), '01:30 PM');
  assert.equal(minutesToTime12(23 * 60 + 59), '11:59 PM');
});

test('minutesToTime12: wraps negative and >=1440 totals into a valid day', () => {
  assert.equal(minutesToTime12(-30), '11:30 PM'); // 30 min before midnight
  assert.equal(minutesToTime12(1440), '12:00 AM'); // exactly one day over
  assert.equal(minutesToTime12(1440 + 60), '01:00 AM');
});

test('parseClock12: round-trips every minute of the day through minutesToTime12', () => {
  for (let m = 0; m < 1440; m += 17) { // sample, not exhaustive — still covers every hour and both AM/PM
    assert.equal(parseClock12(minutesToTime12(m)), m, `round-trip failed for minute ${m}`);
  }
});

test('parseClock12: rejects malformed or out-of-range input instead of guessing', () => {
  assert.equal(parseClock12(''), null);
  assert.equal(parseClock12(null), null);
  assert.equal(parseClock12('13:00 AM'), null); // hour out of 1-12 range
  assert.equal(parseClock12('00:00 AM'), null); // hour must be 1-12, not 0
  assert.equal(parseClock12('09:60 AM'), null); // minutes out of range
  assert.equal(parseClock12('not a time'), null);
});

test('parseClock12: 12 AM is midnight and 12 PM is noon', () => {
  assert.equal(parseClock12('12:00 AM'), 0);
  assert.equal(parseClock12('12:00 PM'), 720);
  assert.equal(parseClock12('12:30 AM'), 30);
  assert.equal(parseClock12('12:30 PM'), 750);
});

test('parseClock12: falls back to 24-hour format when no AM/PM marker is present', () => {
  assert.equal(parseClock12('17:00'), 17 * 60);
  assert.equal(parseClock12('00:00'), 0);
  assert.equal(parseClock12('23:59'), 23 * 60 + 59);
  assert.equal(parseClock12('09:05'), 9 * 60 + 5);
  assert.equal(parseClock12('24:00'), null); // hour out of 0-23 range
  assert.equal(parseClock12('12:60'), null); // minutes out of range
});
