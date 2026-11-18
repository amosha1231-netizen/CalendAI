// Run: node --test src/utils/eventOccurrence.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsOnDate } from './eventOccurrence.js';

const today = new Date(2026, 10, 18); // Wednesday
const titles = (events, date) => eventsOnDate(events, date, today).map(e => e.title);

test('a one-off meeting shows on its date only, not on the same weekday every week', () => {
  const meeting = { title: 'meeting', day: 'Sunday', recurrence: 'once', targetDate: '2026-11-22' };
  assert.deepEqual(titles([meeting], new Date(2026, 10, 22)), ['meeting']);
  assert.deepEqual(titles([meeting], new Date(2026, 10, 29)), []);
  assert.deepEqual(titles([meeting], new Date(2026, 10, 15)), []);
});

test('a dated event with no recurrence (stored as a Date) is a one-off', () => {
  const ev = { title: 'old', day: 'Sunday', targetDate: '2026-11-22T00:00:00.000Z' };
  assert.deepEqual(titles([ev], new Date(2026, 10, 22)), ['old']);
  assert.deepEqual(titles([ev], new Date(2026, 10, 29)), []);
});

test('weekly events keep showing every week', () => {
  const ev = { title: 'gym', day: 'Sunday', recurrence: 'weekly' };
  assert.deepEqual(titles([ev], new Date(2026, 10, 22)), ['gym']);
  assert.deepEqual(titles([ev], new Date(2026, 11, 27)), ['gym']);
});

test('an undated one-off shows only in the coming week', () => {
  const ev = { title: 'once', day: 'Sunday', recurrence: 'once' };
  assert.deepEqual(titles([ev], new Date(2026, 10, 22)), ['once']);
  assert.deepEqual(titles([ev], new Date(2026, 10, 29)), []);
});
