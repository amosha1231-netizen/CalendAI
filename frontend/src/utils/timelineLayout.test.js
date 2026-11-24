// Run: node --test src/utils/timelineLayout.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutDay, eventSpan, formatDuration } from './timelineLayout.js';

const toMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : -1; };
const hours = Array.from({ length: 24 }, (_, i) => i);
const ev = (title, startTime, endTime) => ({ title, startTime, endTime });
const layout = (events, expanded = [], reminders = []) => layoutDay({
  events, reminders, hours, timeToMinutes: toMin, keyOf: e => e.title,
  reminderHour: r => r.hour, expandedKeys: new Set(expanded),
});
const titlesAt = (rows, hour) => rows.find(r => r.hour === hour)?.items.map(i => i.event.title);

test('a 7-hour night is one card, and the hours inside it are folded', () => {
  const rows = layout([ev('sleep', '00:00', '07:00'), ev('meet', '09:00', '10:00')]);
  assert.deepEqual(titlesAt(rows, 0), ['sleep']);
  for (let h = 1; h <= 6; h++) assert.equal(rows.find(r => r.hour === h), undefined);
  assert.deepEqual(titlesAt(rows, 7), []);
  assert.deepEqual(titlesAt(rows, 9), ['meet']);
  const all = rows.flatMap(r => r.items.map(i => i.event.title));
  assert.deepEqual(all, ['sleep', 'meet']);
});

test('an event inside a folded long event is nested in it', () => {
  const rows = layout([ev('work', '10:00', '14:00'), ev('haircut', '11:00', '11:30')], [], [{ hour: 12, id: 'r' }]);
  const work = rows.find(r => r.hour === 10).items[0];
  assert.equal(work.isLong, true);
  assert.deepEqual(work.children.map(c => c.event.title), ['haircut']);
  assert.deepEqual(work.childReminders.map(r => r.id), ['r']);
  assert.deepEqual(titlesAt(rows, 14), []);
});

test('unfolded, the hours come back and nested events go to their own rows', () => {
  const rows = layout([ev('work', '10:00', '14:00'), ev('haircut', '11:00', '11:30')], ['work']);
  assert.deepEqual(titlesAt(rows, 10), ['work']);
  assert.deepEqual(titlesAt(rows, 11), ['haircut']);
  assert.equal(rows.length, 24);
});

test('a short event that crosses an hour is drawn once, not in every hour', () => {
  const rows = layout([ev('call', '10:30', '11:30')]);
  assert.deepEqual(titlesAt(rows, 10), ['call']);
  assert.deepEqual(titlesAt(rows, 11), []);
  assert.equal(rows.length, 24);
});

test('an event ending at :30 still hides only the hours it covers', () => {
  const rows = layout([ev('trip', '08:00', '10:30')]);
  assert.equal(rows.find(r => r.hour === 9), undefined);
  assert.equal(rows.find(r => r.hour === 10), undefined);
  assert.ok(rows.find(r => r.hour === 11));
});

test('a night past midnight folds to the end of the day with its real duration', () => {
  assert.deepEqual(eventSpan(ev('sleep', '23:00', '07:00'), toMin), { start: 1380, end: 1440, duration: 480 });
  const rows = layout([ev('nap', '22:00', '06:00')]);
  assert.equal(rows.find(r => r.hour === 23), undefined);
  assert.equal(formatDuration(480, 'he'), '8 שעות');
  assert.equal(formatDuration(90, 'en'), '1.5h');
});
