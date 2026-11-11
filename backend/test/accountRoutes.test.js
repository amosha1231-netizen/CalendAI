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
  t.mock.method(mutualRoutes, 'cancelMutualSession', async (sessionId) => {
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
