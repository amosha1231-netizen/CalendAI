// ──────────────────────────────────────────────
// Characterization test for PUT /api/providers/me's service-array mapping
// (providerRoutes.js' mapServicesForSave). Pure function, no Mongo — unlike
// mutualBooking.test.js, this needs no MongoMemoryReplSet.
//
// Regression: providerServiceSchema (models/User.js) does NOT disable _id
// (unlike providerAvailabilitySchema, which does), so handing Mongoose a
// freshly-built plain object with no _id mints a brand new one. Before this
// fix, mapServicesForSave discarded whatever _id the client sent back, so
// *every* profile save — even one only editing the bio — reassigned new ids
// to all services, 404-ing any booking already in flight against the old
// serviceId (computeAvailableSlots/:book). The fix threads an existing valid
// _id through; a cast against the real User schema confirms Mongoose then
// actually keeps it instead of minting a new one.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { mapServicesForSave } = require('../routes/providerRoutes');
const User = require('../models/User');

test('mapServicesForSave: keeps an existing service\'s _id instead of dropping it', () => {
  const existingId = new mongoose.Types.ObjectId();
  const mapped = mapServicesForSave([
    { _id: existingId.toString(), name: 'Haircut', duration: 30, price: 50, active: true }
  ]);
  assert.equal(String(mapped[0]._id), String(existingId), 'the existing _id must be preserved, not dropped');
});

test('mapServicesForSave: a brand new service (no _id yet) is left without one', () => {
  const mapped = mapServicesForSave([{ name: 'New service', duration: 15, price: 0, active: true }]);
  assert.equal(mapped[0]._id, undefined, 'a new service must not be assigned an _id here — Mongoose mints it on cast');
});

test('mapServicesForSave: an invalid/malformed _id is dropped rather than passed through', () => {
  const mapped = mapServicesForSave([{ _id: 'not-an-object-id', name: 'X', duration: 15, price: 0, active: true }]);
  assert.equal(mapped[0]._id, undefined, 'a malformed _id must be ignored so Mongoose mints a valid one instead of casting it and erroring');
});

test('mapServicesForSave output, cast against the real User schema, keeps the existing _id and mints one for the new entry', () => {
  const existingId = new mongoose.Types.ObjectId();
  const mapped = mapServicesForSave([
    { _id: existingId.toString(), name: 'Haircut', duration: 30, price: 50, active: true },
    { name: 'Beard trim', duration: 15, price: 20, active: true }
  ]);

  // Constructing (not saving) a document runs the same subdocument casting
  // Mongoose applies on $set — no DB connection required.
  const user = new User({ email: 'provider@test.com', providerProfile: { services: mapped } });
  const [svc1, svc2] = user.providerProfile.services;

  assert.ok(svc1._id.equals(existingId), 'the pre-existing service keeps its original _id across the save');
  assert.ok(svc2._id, 'the new service is assigned an _id by Mongoose');
  assert.notEqual(String(svc2._id), String(existingId), 'the new service must not collide with the existing one\'s id');
});

test('mapServicesForSave: re-saving an unchanged service list is idempotent (same ids survive a second round-trip)', () => {
  const existingId = new mongoose.Types.ObjectId();
  const firstSave = mapServicesForSave([{ _id: existingId.toString(), name: 'Haircut', duration: 30, price: 50, active: true }]);
  const user1 = new User({ email: 'provider2@test.com', providerProfile: { services: firstSave } });
  const idsAfterFirstSave = user1.providerProfile.services.map(s => String(s._id));

  // Simulate the client round-tripping exactly what the server returned.
  const roundTripped = user1.providerProfile.services.map(s => s.toObject());
  const secondSave = mapServicesForSave(roundTripped);
  const user2 = new User({ email: 'provider2@test.com', providerProfile: { services: secondSave } });
  const idsAfterSecondSave = user2.providerProfile.services.map(s => String(s._id));

  assert.deepEqual(idsAfterSecondSave, idsAfterFirstSave, 'ids must stay stable across repeated saves of an unchanged service list');
});
