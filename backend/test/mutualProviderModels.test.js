// ──────────────────────────────────────────────
// Schema-level invariant tests for MutualBooking and ProviderBooking —
// duration bounds, status enums, and required fields. These are pure
// Mongoose validateSync() checks (no actual write), so — like
// mutualAvailability.test.js — this file needs no MongoMemoryReplSet and
// keeps passing even when that download is unavailable (e.g. a
// sandboxed/offline CI run with no network access to fetch the mongod
// binary).
//
// The route layer (mutualRoutes.js/providerRoutes.js) already rejects
// out-of-range values with its own JS checks before a document is ever
// constructed, so these schema constraints are a second, independent line
// of defense — one no existing test exercises directly. Without this file,
// a future edit that accidentally loosens (or a merge that drops) one of
// these `min`/`max`/`enum`/`required` schema options would have nothing
// red to show for it.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const MutualBooking = require('../models/MutualBooking');
const ProviderBooking = require('../models/ProviderBooking');

function validMutualBookingFields(overrides = {}) {
  return {
    sessionId: 'mut_abc123',
    hostId: new mongoose.Types.ObjectId(),
    inviteeId: new mongoose.Types.ObjectId(),
    inviteeEmail: 'invitee@test.com',
    duration: 30,
    ...overrides
  };
}

function validProviderBookingFields(overrides = {}) {
  return {
    providerId: new mongoose.Types.ObjectId(),
    serviceId: new mongoose.Types.ObjectId(),
    serviceName: 'Haircut',
    duration: 30,
    date: '2026-12-01',
    day: 'Tuesday',
    startTime: '10:00 AM',
    endTime: '10:30 AM',
    guestName: 'Guest',
    ...overrides
  };
}

// ── MutualBooking ──

test('MutualBooking: a fully-valid document passes schema validation', () => {
  const doc = new MutualBooking(validMutualBookingFields());
  assert.equal(doc.validateSync(), undefined);
});

test('MutualBooking: duration below 1 or above 1440 fails schema validation', () => {
  assert.ok(new MutualBooking(validMutualBookingFields({ duration: 0 })).validateSync()?.errors?.duration,
    'duration 0 must be rejected (min: 1)');
  assert.ok(new MutualBooking(validMutualBookingFields({ duration: 1441 })).validateSync()?.errors?.duration,
    'duration 1441 must be rejected (max: 1440)');
  assert.equal(new MutualBooking(validMutualBookingFields({ duration: 1 })).validateSync(), undefined, 'duration 1 (the floor) is valid');
  assert.equal(new MutualBooking(validMutualBookingFields({ duration: 1440 })).validateSync(), undefined, 'duration 1440 (the ceiling) is valid');
});

test('MutualBooking: status only accepts the four known enum values', () => {
  for (const status of ['active', 'processing', 'completed', 'cancelled']) {
    assert.equal(new MutualBooking(validMutualBookingFields({ status })).validateSync(), undefined, `status "${status}" must be valid`);
  }
  const err = new MutualBooking(validMutualBookingFields({ status: 'bogus' })).validateSync();
  assert.ok(err?.errors?.status, 'an unknown status string must be rejected');
});

test('MutualBooking: status defaults to "active" when omitted', () => {
  const doc = new MutualBooking(validMutualBookingFields());
  assert.equal(doc.status, 'active');
});

test('MutualBooking: sessionId, hostId, inviteeId, inviteeEmail and duration are all required', () => {
  for (const field of ['sessionId', 'hostId', 'inviteeId', 'inviteeEmail', 'duration']) {
    const fields = validMutualBookingFields();
    delete fields[field];
    const err = new MutualBooking(fields).validateSync();
    assert.ok(err?.errors?.[field], `missing "${field}" must fail validation`);
  }
});

// ── ProviderBooking ──

test('ProviderBooking: a fully-valid document passes schema validation', () => {
  const doc = new ProviderBooking(validProviderBookingFields());
  assert.equal(doc.validateSync(), undefined);
});

test('ProviderBooking: duration below 5 or above 480 fails schema validation', () => {
  assert.ok(new ProviderBooking(validProviderBookingFields({ duration: 4 })).validateSync()?.errors?.duration,
    'duration 4 must be rejected (min: 5)');
  assert.ok(new ProviderBooking(validProviderBookingFields({ duration: 481 })).validateSync()?.errors?.duration,
    'duration 481 must be rejected (max: 480)');
  assert.equal(new ProviderBooking(validProviderBookingFields({ duration: 5 })).validateSync(), undefined, 'duration 5 (the floor) is valid');
  assert.equal(new ProviderBooking(validProviderBookingFields({ duration: 480 })).validateSync(), undefined, 'duration 480 (the ceiling) is valid');
});

test('ProviderBooking: status only accepts the three known enum values', () => {
  for (const status of ['processing', 'confirmed', 'cancelled']) {
    assert.equal(new ProviderBooking(validProviderBookingFields({ status })).validateSync(), undefined, `status "${status}" must be valid`);
  }
  const err = new ProviderBooking(validProviderBookingFields({ status: 'bogus' })).validateSync();
  assert.ok(err?.errors?.status, 'an unknown status string must be rejected');
});

test('ProviderBooking: status defaults to "processing" when omitted', () => {
  const doc = new ProviderBooking(validProviderBookingFields());
  assert.equal(doc.status, 'processing');
});

test('ProviderBooking: providerId, serviceId, serviceName, duration, date, day, startTime, endTime and guestName are all required', () => {
  for (const field of ['providerId', 'serviceId', 'serviceName', 'duration', 'date', 'day', 'startTime', 'endTime', 'guestName']) {
    const fields = validProviderBookingFields();
    delete fields[field];
    const err = new ProviderBooking(fields).validateSync();
    assert.ok(err?.errors?.[field], `missing "${field}" must fail validation`);
  }
});
