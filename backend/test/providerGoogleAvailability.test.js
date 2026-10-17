// ──────────────────────────────────────────────
// Characterization tests for computeAvailableSlots' Google Calendar check
// (providerRoutes.js). Pure unit tests with ProviderBooking.find and
// mutualAvailability.getFreeBusyForDay stubbed — no Mongo connection, no
// real Google API call, no MongoMemoryReplSet needed.
//
// Regression this covers: before this fix, a provider's public booking page
// only cross-checked existing ProviderBookings and the provider's local
// CalendAI `schedule` — never the provider's own Google Calendar. A personal
// appointment that lives only on Google (never round-tripped into CalendAI,
// e.g. something the provider added directly in Google Calendar) would still
// show as an open, bookable slot to the public. mutualAvailability.js's
// isSlotMutuallyFree/getMutualFreeSlots already treat a live Google freebusy
// check as load-bearing for both parties in a mutual meeting; providers
// deserve the same guard for themselves.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');

const mutualAvailability = require('../services/mutualAvailability');
const ProviderBooking = require('../models/ProviderBooking');
const { computeAvailableSlots } = require('../routes/providerRoutes');

// Mirrors providerRoutes.js' req.app.get('timeToMinutes') (server.js), which
// computeAvailableSlots reads off the request rather than importing directly.
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function fakeReq() {
  return { app: { get: (key) => (key === 'timeToMinutes' ? timeToMinutes : undefined) } };
}

function stubNoExistingBookings(t) {
  t.mock.method(ProviderBooking, 'find', () => ({
    select: () => ({ lean: async () => [] })
  }));
}

// 2026-11-02 is a Monday, and falls after this suite's "today" (2026-10-16),
// so none of these cases hit the same-day "already started" cutoff.
const MONDAY = '2026-11-02';

function providerWith(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    googleAccessToken: null,
    schedule: {},
    providerProfile: {
      locationId: 'jerusalem',
      availability: [{ day: 'Monday', startTime: '09:00 AM', endTime: '12:00 PM' }]
    },
    ...overrides
  };
}

const SERVICE_30MIN = { _id: new mongoose.Types.ObjectId(), duration: 30 };

test('computeAvailableSlots: no Google Calendar connected — the Google busy check is skipped entirely', async (t) => {
  stubNoExistingBookings(t);
  const freeBusyMock = t.mock.method(mutualAvailability, 'getFreeBusyForDay', async () => {
    throw new Error('must not be called when the provider has no googleAccessToken');
  });

  const { slots } = await computeAvailableSlots(fakeReq(), providerWith(), SERVICE_30MIN, MONDAY);

  assert.equal(freeBusyMock.mock.callCount(), 0);
  assert.equal(slots.length, 6, '09:00-12:00 in 30-min slots is 6 slots when nothing is busy');
});

test('computeAvailableSlots: a provider\'s own Google Calendar event blocks the overlapping slot, not just local schedule/ProviderBookings', async (t) => {
  stubNoExistingBookings(t);
  // 10:00-10:30 busy on Google only — nothing in `schedule` or ProviderBooking reflects it.
  t.mock.method(mutualAvailability, 'getFreeBusyForDay', async () => [{ start: 600, end: 630 }]);

  const provider = providerWith({ googleAccessToken: 'tok' });
  const { slots } = await computeAvailableSlots(fakeReq(), provider, SERVICE_30MIN, MONDAY);

  assert.ok(!slots.some(s => s.startTime === '10:00 AM'), 'the Google-busy 10:00-10:30 slot must not be offered');
  assert.equal(slots.length, 5, 'exactly one of the 6 slots is removed by the Google Calendar conflict');
});

test('computeAvailableSlots: a Google Calendar fetch failure fails closed instead of silently showing every slot as open', async (t) => {
  stubNoExistingBookings(t);
  t.mock.method(mutualAvailability, 'getFreeBusyForDay', async () => { throw new Error('token expired'); });

  const provider = providerWith({ googleAccessToken: 'tok' });

  await assert.rejects(
    computeAvailableSlots(fakeReq(), provider, SERVICE_30MIN, MONDAY),
    (err) => err.status === 502
  );
});

// ── Friday Shabbat-start cutoff (mutualAvailability.js' FRIDAY_SHABBAT_CUTOFF_MIN,
// shared with mutual scheduling's isSlotMutuallyFree/getMutualFreeSlots) must
// also clip a provider's own weekly availability — nothing stops a provider
// from saving a Friday row that runs well past candle-lighting (e.g. 09:00-18:00),
// and without this the public booking page would keep offering those slots. ──
// 2026-11-06 is a Friday, after this suite's "today" (2026-10-16).
const FRIDAY = '2026-11-06';

test('computeAvailableSlots: a Friday availability row extending past 16:00 is clipped at the Shabbat-start cutoff', async (t) => {
  stubNoExistingBookings(t);
  const freeBusyMock = t.mock.method(mutualAvailability, 'getFreeBusyForDay', async () => []);

  const provider = providerWith({
    providerProfile: {
      locationId: 'jerusalem',
      availability: [{ day: 'Friday', startTime: '09:00 AM', endTime: '06:00 PM' }]
    }
  });
  const { slots } = await computeAvailableSlots(fakeReq(), provider, SERVICE_30MIN, FRIDAY);

  assert.ok(slots.every(s => s.startTime !== '04:00 PM' && s.startTime !== '05:00 PM' && s.startTime !== '05:30 PM'),
    'no slot starting at or after 16:00 must be offered on Friday');
  assert.deepEqual(slots[slots.length - 1], { startTime: '03:30 PM', endTime: '04:00 PM' },
    'the last Friday slot must end exactly at the 16:00 Shabbat-start cutoff');
  assert.equal(freeBusyMock.mock.callCount(), 0, 'provider has no Google Calendar connected in this case');
});

test('computeAvailableSlots: a Friday availability row that starts after the Shabbat-start cutoff yields no slots at all', async (t) => {
  stubNoExistingBookings(t);
  const provider = providerWith({
    providerProfile: {
      locationId: 'jerusalem',
      availability: [{ day: 'Friday', startTime: '04:30 PM', endTime: '06:00 PM' }]
    }
  });
  const { slots } = await computeAvailableSlots(fakeReq(), provider, SERVICE_30MIN, FRIDAY);
  assert.deepEqual(slots, []);
});
