const assert = require('node:assert/strict');
const { test } = require('node:test');
const s = require('../services/taskStatusStats');

test('summarize counts statuses and the done rate', () => {
  const r = s.summarize([{ status: 'done' }, { status: 'done' }, { status: 'postponed' }, { status: 'missed' }, { status: 'bogus' }]);
  assert.deepEqual(r, { done: 2, postponed: 1, missed: 1, total: 4, rate: 50 });
});

test('summarize with nothing marked has a null rate', () => {
  assert.deepEqual(s.summarize([]), { done: 0, postponed: 0, missed: 0, total: 0, rate: null });
});

test('parseRange validates dates and length', () => {
  assert.deepEqual(s.parseRange('2026-11-01', '2026-11-07'), { from: '2026-11-01', to: '2026-11-07' });
  assert.ok(s.parseRange('2026-11-07', '2026-11-01').error);
  assert.ok(s.parseRange('2026-11-1', '2026-11-07').error);
  assert.ok(s.parseRange('2024-01-01', '2026-01-01').error);
});

test('isStatus and cleanKey', () => {
  assert.equal(s.isStatus('done'), true);
  assert.equal(s.isStatus('skipped'), false);
  assert.equal(s.cleanKey('  09:00|Gym  '), '09:00|Gym');
  assert.equal(s.cleanKey(5), '');
  assert.equal(s.cleanKey('x'.repeat(300)).length, 200);
});
