// ──────────────────────────────────────────────
// Characterization tests for DELETE /api/account (accountRoutes.js).
// No MongoMemoryReplSet: every Mongoose model static is stubbed, same
// pattern providerSearch.test.js/providerGoogleAvailability.test.js use.
//
// Regression this covers: account deletion used to hard-delete every
// MutualBooking the deleting user was part of with a single deleteMany,
// without ever rolling back the session the way POST /sessions/:id/cancel
// does. A 'completed' mutual session mirrors a schedule entry (and a synced
// Google Calendar event) onto BOTH the host's and the invitee's accounts —
// deleting the only MutualBooking document for it without that rollback
// would leave the OTHER (surviving) party with a live Google Calendar event
// and schedule entry forever, with no session left for them to even cancel
// it themselves. Fixed by routing every non-cancelled session through the
// same cancelMutualSession used by the real cancel route before the
// deleteMany removes the (now already rolled-back) documents.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = require('../config/jwtSecret');
const User = require('../models/User');
const Event = require('../models/Event');
const Reminder = require('../models/Reminder');
const DailyLog = require('../models/DailyLog');
const ExpectedExpense = require('../models/ExpectedExpense');
const ActionHistory = require('../models/ActionHistory');
const PushSubscription = require('../models/PushSubscription');
const OAuthHandoff = require('../models/OAuthHandoff');
const Routine = require('../models/Routine');
const RoutineCheckin = require('../models/RoutineCheckin');
const Goal = require('../models/Goal');
const Booking = require('../models/Booking');
const MutualBooking = require('../models/MutualBooking');
const ProviderBooking = require('../models/ProviderBooking');
const mutualRoutes = require('../routes/mutualRoutes');
const googleCalendarService = require('../services/googleCalendar');
const { google } = require('googleapis');
const accountRoutes = require('../routes/accountRoutes');

function tokenFor(id) {
  return jwt.sign({ id: String(id) }, JWT_SECRET);
}

function authed(id) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFor(id)}` };
}

function startApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/account', accountRoutes);
  const server = app.listen(0);
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

// Stubs every deleteMany/updateMany/deleteOne this route touches besides
// MutualBooking.find + User.findById, which each test sets up itself.
// MutualBooking.deleteMany is deliberately left out — each test below stubs
// it itself, since the first one asserts on when it runs relative to the
// rollback.
function stubEverythingElse(t) {
  for (const Model of [Event, Reminder, DailyLog, ExpectedExpense, ActionHistory, PushSubscription, OAuthHandoff, RoutineCheckin, Booking, ProviderBooking]) {
    t.mock.method(Model, 'deleteMany', async () => ({ deletedCount: 0 }));
  }
  t.mock.method(Routine, 'deleteMany', async () => ({ deletedCount: 0 }));
  t.mock.method(Routine, 'updateMany', async () => ({ modifiedCount: 0 }));
  t.mock.method(Goal, 'deleteMany', async () => ({ deletedCount: 0 }));
  t.mock.method(Goal, 'updateMany', async () => ({ modifiedCount: 0 }));
  t.mock.method(ProviderBooking, 'updateMany', async () => ({ modifiedCount: 0 }));
  // Default: no confirmed provider bookings, so the Google-event-cleanup
  // block is a no-op. Tests that care about that block override this.
  t.mock.method(ProviderBooking, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(User, 'deleteOne', async () => ({ deletedCount: 1 }));
}

test('DELETE /api/account: every non-cancelled mutual session is rolled back via cancelMutualSession before the MutualBooking docs are removed', async (t) => {
  const userId = new mongoose.Types.ObjectId();
  const liveSessionId = 'session-live';
  const alreadyCancelledSessionId = 'session-cancelled';

  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: userId, googleRefreshToken: null, googleAccessToken: null }) }) }));
  // Only the non-cancelled session should come back from this filtered find —
  // the route itself asks for status: { $ne: 'cancelled' }, so a correctly
  // written stub only needs to prove the call shape, but to also prove the
  // route never processes an already-cancelled one we return just the live one.
  t.mock.method(MutualBooking, 'find', (query) => {
    assert.deepEqual(query.$or, [{ hostId: userId }, { inviteeId: userId }]);
    assert.deepEqual(query.status, { $ne: 'cancelled' });
    return { select: () => ({ lean: async () => [{ sessionId: liveSessionId }] }) };
  });

  const cancelCalls = [];
  t.mock.method(mutualRoutes, 'cancelMutualSession', async (sessionId, app) => {
    // rollbackCompletedSession (which this forwards to) depends on this second
    // argument for its own in-memory schedule-cache cleanup
    // (app.get('getUserSchedule') / app.get('saveSchedulesNow')) — assert it's
    // really the request's Express app, not dropped or reordered, since a
    // mock that only captured sessionId would pass even if the route stopped
    // passing it.
    assert.equal(typeof app?.get, 'function', 'the real Express app (with .get) must be forwarded as the second argument');
    cancelCalls.push(sessionId);
    return { alreadyCancelled: false };
  });

  let mutualDeleteManyRanAfterRollback = false;
  stubEverythingElse(t);
  t.mock.method(MutualBooking, 'deleteMany', async () => {
    mutualDeleteManyRanAfterRollback = cancelCalls.length === 1;
    return { deletedCount: 1 };
  });

  const { server, base } = startApp();
  try {
    const res = await fetch(`${base}/api/account`, {
      method: 'DELETE', headers: authed(userId), body: JSON.stringify({ confirm: 'DELETE' })
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);

    assert.deepEqual(cancelCalls, [liveSessionId], 'cancelMutualSession must be called exactly once, for the live session only');
    assert.equal(mutualDeleteManyRanAfterRollback, true, 'the MutualBooking documents must only be removed after the rollback already ran');
  } finally {
    server.close();
  }
});

test('DELETE /api/account: a user with no mutual sessions never calls cancelMutualSession', async (t) => {
  const userId = new mongoose.Types.ObjectId();

  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: userId, googleRefreshToken: null, googleAccessToken: null }) }) }));
  t.mock.method(MutualBooking, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(MutualBooking, 'deleteMany', async () => ({ deletedCount: 0 }));
  t.mock.method(mutualRoutes, 'cancelMutualSession', () => {
    throw new Error('must not be called when there are no sessions to roll back');
  });
  stubEverythingElse(t);

  const { server, base } = startApp();
  try {
    const res = await fetch(`${base}/api/account`, {
      method: 'DELETE', headers: authed(userId), body: JSON.stringify({ confirm: 'DELETE' })
    });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test('DELETE /api/account: a rollback failure for one session is logged and does not block the account deletion', async (t) => {
  const userId = new mongoose.Types.ObjectId();

  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: userId, googleRefreshToken: null, googleAccessToken: null }) }) }));
  t.mock.method(MutualBooking, 'find', () => ({ select: () => ({ lean: async () => [{ sessionId: 'broken-session' }] }) }));
  t.mock.method(MutualBooking, 'deleteMany', async () => ({ deletedCount: 0 }));
  t.mock.method(mutualRoutes, 'cancelMutualSession', async () => { throw new Error('Google Calendar is down'); });
  stubEverythingElse(t);

  const { server, base } = startApp();
  try {
    const res = await fetch(`${base}/api/account`, {
      method: 'DELETE', headers: authed(userId), body: JSON.stringify({ confirm: 'DELETE' })
    });
    const data = await res.json();
    assert.equal(res.status, 200, 'a single session rollback failure must not fail the whole account deletion');
    assert.equal(data.success, true);
  } finally {
    server.close();
  }
});

// Regression this covers: a confirmed ProviderBooking where the deleting
// user is the provider can carry a synced Google Calendar event with the
// guest listed as an attendee (syncEventToGoogleCalendar sets
// sendUpdates: 'all' whenever the guest gave an email), so Google mirrors
// that invite onto the guest's own calendar even though they may have no
// CalendAI account at all. The bulk ProviderBooking.deleteMany never
// deleted that event — unlike the provider's own single-booking cancel
// route, which always does. Fixed by deleting it first, the same way.
test('DELETE /api/account: a confirmed provider booking\'s Google Calendar event is deleted before the booking docs are removed', async (t) => {
  const userId = new mongoose.Types.ObjectId();

  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: userId, googleRefreshToken: 'refresh-tok', googleAccessToken: 'access-tok' }) }) }));
  t.mock.method(MutualBooking, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(MutualBooking, 'deleteMany', async () => ({ deletedCount: 0 }));

  t.mock.method(googleCalendarService, 'createOAuth2ClientWithRefresh', async () => ({}));
  const deletedEventIds = [];
  t.mock.method(google, 'calendar', () => ({
    events: { delete: async ({ eventId }) => { deletedEventIds.push(eventId); } }
  }));

  // stubEverythingElse sets its own default ProviderBooking.find (no
  // confirmed bookings), so this test's own mock must be applied AFTER it
  // runs, or it would silently get overwritten back to that default.
  stubEverythingElse(t);
  t.mock.method(ProviderBooking, 'find', (query) => {
    assert.equal(String(query.providerId), String(userId));
    assert.equal(query.status, 'confirmed');
    return { select: () => ({ lean: async () => [{ googleEventId: 'evt-keep' }, { googleEventId: null }] }) };
  });
  let providerDeleteManyRanAfterEventCleanup = false;
  t.mock.method(ProviderBooking, 'deleteMany', async () => {
    providerDeleteManyRanAfterEventCleanup = deletedEventIds.length === 1;
    return { deletedCount: 1 };
  });

  const { server, base } = startApp();
  try {
    const res = await fetch(`${base}/api/account`, {
      method: 'DELETE', headers: authed(userId), body: JSON.stringify({ confirm: 'DELETE' })
    });
    assert.equal(res.status, 200);
    // Only the booking with a real googleEventId gets a delete call — the
    // null one (never synced, or sync failed) is silently skipped, same as
    // every other Google-cleanup path in this codebase.
    assert.deepEqual(deletedEventIds, ['evt-keep']);
    assert.equal(providerDeleteManyRanAfterEventCleanup, true, 'the ProviderBooking documents must only be removed after the Google event is already deleted');
  } finally {
    server.close();
  }
});

// Note on an ordering fix made alongside the event-deletion fix above but
// not covered by its own test: both this event-deletion step and the
// mutual-session rollback above it reuse the deleting user's own Google
// credentials, so in the real route they now run BEFORE the best-effort
// token-revoke call a few lines below — revoking first would make every one
// of those calls fail with an invalid_grant. No other test in this suite
// mocks global fetch (the mechanism that call uses), and doing so here would
// mean intercepting every fetch in the test process, including this test
// file's own request to its local test server — not worth the risk of
// cross-test interference for an ordering that's otherwise plain to see by
// reading accountRoutes.js top to bottom.
