const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const User = require('../models/User');
const { isOwnerAccount, refillOwnerCredits, OWNER_CREDIT_FLOOR } = require('../services/ownerCredits');

let replSet;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
});

after(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  process.env.OWNER_EMAILS = ' Owner@Example.com , second@example.com';
  await User.deleteMany({});
});

test('owner match needs a listed email and a Google-linked account', () => {
  assert.equal(isOwnerAccount({ email: 'owner@example.com', googleId: 'g1' }), true);
  assert.equal(isOwnerAccount({ email: 'owner@example.com' }), false, 'password-only account is not trusted');
  assert.equal(isOwnerAccount({ email: 'someone@example.com', googleId: 'g2' }), false);
  delete process.env.OWNER_EMAILS;
  assert.equal(isOwnerAccount({ email: 'owner@example.com', googleId: 'g1' }), false, 'empty list grants nothing');
});

test('owner at zero credits is refilled; other users are untouched', async () => {
  const owner = await User.create({ email: 'owner@example.com', googleId: 'g1', aiCredits: 0 });
  const other = await User.create({ email: 'other@example.com', googleId: 'g2', aiCredits: 0 });

  assert.equal(await refillOwnerCredits(User, owner), OWNER_CREDIT_FLOOR);
  assert.equal(await refillOwnerCredits(User, other), 0);

  assert.equal((await User.findById(owner._id)).aiCredits, OWNER_CREDIT_FLOOR);
  assert.equal((await User.findById(other._id)).aiCredits, 0);
});

test('owner balance above the floor is left as is', async () => {
  const owner = await User.create({ email: 'owner@example.com', googleId: 'g1', aiCredits: 250 });
  assert.equal(await refillOwnerCredits(User, owner), 250);
  assert.equal((await User.findById(owner._id)).aiCredits, 250);
});
