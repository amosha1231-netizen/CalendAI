const assert = require('node:assert/strict');
const { test } = require('node:test');
const fc = require('../services/featuredChallenges');

test('every built-in challenge has a unique key, both titles and a length', () => {
  const keys = new Set();
  for (const c of fc.FEATURED) {
    assert.ok(c.key && !keys.has(c.key), `duplicate or missing key ${c.key}`);
    keys.add(c.key);
    assert.ok(c.title && c.titleEn && c.emoji, c.key);
    assert.ok(c.days > 0 && c.days <= 365, c.key);
  }
  assert.ok(fc.FEATURED.length >= 15);
});

test('search filter matches every word in Hebrew or English fields and skips private tasks', () => {
  const f = fc.buildSearchFilter('  מים  ליטר ', 'all');
  assert.equal(f.isPublic, true);
  assert.deepEqual(f.kind, { $ne: 'task' });
  assert.equal(f.$and.length, 2);
  assert.equal(f.$and[0].$or[0].title.$regex, 'מים');
  assert.equal(f.category, undefined);
  assert.equal(fc.buildSearchFilter('', 'health').category, 'health');
  assert.equal(fc.buildSearchFilter('').$and, undefined);
});

test('regex special characters in the query are escaped', () => {
  assert.equal(fc.escapeRegex('a.b*(c)'), 'a\\.b\\*\\(c\\)');
});

test('seeding upserts by key and never touches participants', async () => {
  const calls = [];
  const Goal = { updateOne: async (...args) => { calls.push(args); } };
  const n = await fc.seedFeaturedChallenges(Goal, [{ key: 'k1', title: 'כותרת', titleEn: 'T', days: 7, emoji: 'x' }, { title: 'no key' }]);
  assert.equal(n, 1);
  const [filter, update, opts] = calls[0];
  assert.deepEqual(filter, { featuredKey: 'k1' });
  assert.equal(update.$set.durationDays, 7);
  assert.equal(update.$set.participants, undefined);
  assert.deepEqual(update.$setOnInsert.participants, []);
  assert.equal(opts.upsert, true);
});
