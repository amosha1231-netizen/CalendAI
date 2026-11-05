// ──────────────────────────────────────────────
// Unit tests for services/scheduleCache.js.
//
// Regression this guards: the /api/reschedule family of routes read the
// in-memory userSchedules cache via getUserSchedule() without ever
// reloading it from MongoDB first. getUserSchedule() auto-vivifies an
// *empty* default schedule on a cache miss (e.g. right after a server
// restart), so those routes would silently overwrite a user's real stored
// schedule with an empty one — including every mutual/provider-linked
// entry preserveLinkedEntries exists to protect, since that protection
// only works if the "current schedule" it's given is actually current.
// warmScheduleCache/fetchStoredSchedule mirror runQuickAdd's own
// already-proven cold-start guard (server.js) so the reschedule routes can
// reuse it without duplicating the logic inline.
//
// No MongoMemoryReplSet needed: User.findById is a fake object passed in
// directly (fetchStoredSchedule/warmScheduleCache take their Mongo deps as
// arguments), same spirit as mutualRoutesValidation.test.js's
// t.mock.method(User, 'findById', ...) but without needing the real model.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');

const { fetchStoredSchedule, warmScheduleCache, isEffectivelyEmpty } = require('../services/scheduleCache');

function fakeUserWithSchedule(schedule) {
  return {
    findById: () => ({
      select: () => ({
        lean: async () => (schedule ? { schedule } : null)
      })
    })
  };
}

function fakeUserThatThrows(message) {
  return {
    findById: () => ({
      select: () => ({
        lean: async () => { throw new Error(message); }
      })
    })
  };
}

const validId = new mongoose.Types.ObjectId().toString();

test('fetchStoredSchedule: returns the stored schedule for a valid user with one', async () => {
  const schedule = { Sunday: [{ title: 'Real meeting', startTime: '09:00', endTime: '10:00' }] };
  const User = fakeUserWithSchedule(schedule);
  const result = await fetchStoredSchedule({ mongoose, User, userId: validId, source: 'test' });
  assert.deepEqual(result, schedule);
});

test('fetchStoredSchedule: returns null for an invalid/anonymous userId without touching Mongo', async () => {
  const User = {
    findById: () => { throw new Error('must not be reached for an invalid id'); }
  };
  assert.equal(await fetchStoredSchedule({ mongoose, User, userId: 'anonymous', source: 'test' }), null);
  assert.equal(await fetchStoredSchedule({ mongoose, User, userId: undefined, source: 'test' }), null);
});

test('fetchStoredSchedule: returns null when the user has no stored schedule', async () => {
  const User = fakeUserWithSchedule(null);
  const result = await fetchStoredSchedule({ mongoose, User, userId: validId, source: 'test' });
  assert.equal(result, null);
});

test('fetchStoredSchedule: swallows a Mongo lookup error and returns null instead of throwing', async () => {
  const User = fakeUserThatThrows('connection reset');
  const result = await fetchStoredSchedule({ mongoose, User, userId: validId, source: 'test' });
  assert.equal(result, null);
});

test('warmScheduleCache: sets the cache entry from Mongo when a stored schedule exists', async () => {
  const schedule = { Monday: [{ title: 'Doctor', startTime: '11:00', endTime: '11:30' }] };
  const User = fakeUserWithSchedule(schedule);
  const userSchedules = new Map([[validId, { Sunday: [] }]]); // stale/empty cache entry
  await warmScheduleCache({ mongoose, User, userSchedules, userId: validId, source: 'test' });
  assert.deepEqual(userSchedules.get(validId), schedule);
});

test('warmScheduleCache: leaves the cache untouched when Mongo has nothing to offer (no overwrite with a blank schedule)', async () => {
  const User = fakeUserWithSchedule(null);
  const existing = { Sunday: [{ title: 'Already cached', startTime: '08:00', endTime: '08:30' }] };
  const userSchedules = new Map([[validId, existing]]);
  await warmScheduleCache({ mongoose, User, userSchedules, userId: validId, source: 'test' });
  assert.deepEqual(userSchedules.get(validId), existing, 'a failed/empty Mongo lookup must never blank out an already-cached schedule');
});

test('warmScheduleCache: a cold cache (cache miss) for a logged-in user is populated from Mongo before any route reads it', async () => {
  // This is the exact scenario the bug this file guards against: after a
  // server restart userSchedules is empty for every user until something
  // repopulates it. Simulating that cold-start moment directly.
  const schedule = { Tuesday: [{ title: 'Provider booking', startTime: '14:00', endTime: '14:30', providerBookingId: 'abc123' }] };
  const User = fakeUserWithSchedule(schedule);
  const userSchedules = new Map(); // nothing cached yet, as after a restart
  await warmScheduleCache({ mongoose, User, userSchedules, userId: validId, source: 'test' });
  assert.deepEqual(userSchedules.get(validId), schedule, 'the linked entry must be loaded, not lost to a cold cache');
});

test('isEffectivelyEmpty: treats the default all-empty-arrays shape (and a cache miss) as empty, a schedule with any event as not', () => {
  assert.equal(isEffectivelyEmpty(undefined), true);
  assert.equal(isEffectivelyEmpty(null), true);
  assert.equal(isEffectivelyEmpty({}), true);
  assert.equal(isEffectivelyEmpty({ Sunday: [], Monday: [], Today: [] }), true);
  assert.equal(isEffectivelyEmpty({ Sunday: [{ title: 'Real' }] }), false);
});

test('warmScheduleCache: never overwrites an already-warm cache entry, even with a concurrent write racing the Mongo read', async () => {
  // Regression for the bug this fix closes: warmScheduleCache used to
  // unconditionally re-fetch from Mongo and blindly Map.set() the result on
  // every call, not just on a genuine cold-cache miss. Because the Mongo
  // read is async, any other request that mutated this same cached object
  // in place (exactly what mutualRoutes.js/providerRoutes.js's best-effort
  // confirm-side cache sync does — getUserSchedule(id) then push the new
  // event directly onto the returned object) during that read's flight time
  // got silently reverted the instant the stale read resolved and replaced
  // the whole Map entry — permanently losing a just-confirmed mutual
  // meeting/provider booking from both the cache and (via the caller's own
  // unconditional saveScheduleToMongo right after) MongoDB itself.
  const staleFromMongo = { Wednesday: [{ title: 'Stale, pre-confirm snapshot' }] };
  const User = fakeUserWithSchedule(staleFromMongo);
  let findByIdCalls = 0;
  const countingUser = {
    findById: (...args) => {
      findByIdCalls += 1;
      return User.findById(...args);
    }
  };
  // Simulate the real shape: an already-warm cache entry that a concurrent
  // confirm route has *already* pushed a new, real event onto in place —
  // i.e. the up-to-date state warmScheduleCache must not clobber.
  const warmAndUpToDate = { Wednesday: [{ title: 'Just-confirmed mutual meeting', mutualSessionId: 'sess1' }] };
  const userSchedules = new Map([[validId, warmAndUpToDate]]);

  await warmScheduleCache({ mongoose, User: countingUser, userSchedules, userId: validId, source: 'test' });

  assert.equal(findByIdCalls, 0, 'an already-warm cache must never trigger a Mongo read at all, closing the race window');
  assert.deepEqual(userSchedules.get(validId), warmAndUpToDate, 'the concurrently-written, up-to-date entry must survive untouched');
});
