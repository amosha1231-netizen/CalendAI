// Run: node --test src/utils/nativeReminders.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReminderPings } from './nativeReminders.js';

test('buildReminderPings keeps the soonest future pings of active reminders', () => {
  const now = Date.parse('2026-11-26T08:00:00Z');
  const reminders = [
    { id: 'a', active: true, upcoming: ['2026-11-26T07:00:00Z', '2026-11-27T09:00:00Z', '2026-11-26T09:00:00Z'] },
    { id: 'b', active: false, upcoming: ['2026-11-26T08:30:00Z'] },
    { id: 'c', active: true, upcoming: ['2026-11-26T08:15:00Z', 'not a date'] },
    { id: 'd', active: true }
  ];
  const pings = buildReminderPings(reminders, now, 10);
  assert.deepEqual(pings.map(p => `${p.reminder.id}@${new Date(p.at).toISOString()}`), [
    'c@2026-11-26T08:15:00.000Z', 'a@2026-11-26T09:00:00.000Z', 'a@2026-11-27T09:00:00.000Z'
  ]);
  assert.equal(buildReminderPings(reminders, now, 2).length, 2);
  assert.deepEqual(buildReminderPings(null, now), []);
});
