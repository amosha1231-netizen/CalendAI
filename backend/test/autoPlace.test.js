// Placing events the user gave no time for. Pure, no Mongo.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { placeUntimedEvents } = require('../services/autoPlace');

// 2026-11-24 is a Tuesday; 2026-11-25 a Wednesday.
const opts = { todayName: 'Tuesday', todayIso: '2026-11-24', nowMinutes: 17 * 60 };
const ev = (title, startTime, endTime, timeSource = 'exact', extra = {}) =>
  ({ title, day: 'Wednesday', startTime, endTime, timeSource, ...extra });

test('an event without a time between two timed ones lands between them', () => {
  const out = placeUntimedEvents([
    ev('Rufin', '17:00', '17:45'),
    ev('Tanya', '17:30', '18:30', 'none'),
    ev('Torah class', '19:15', '20:00'),
  ], {}, opts);
  assert.equal(out[1].startTime, '17:45');
  assert.equal(out[1].endTime, '18:45');
  assert.equal(out[1].autoPlaced, true);
  assert.equal(out[0].startTime, '17:00');
  assert.equal(out[2].startTime, '19:15');
});

test('a free AI time is kept as is', () => {
  const out = placeUntimedEvents([ev('Gym', '09:00', '09:30', 'none')], {}, opts);
  assert.equal(out[0].startTime, '09:00');
  assert.equal(out[0].autoPlaced, undefined);
});

test('a taken AI time moves to the next free window that day', () => {
  const schedule = { Wednesday: [{ title: 'Work', day: 'Wednesday', startTime: '09:00 AM', endTime: '01:00 PM', recurrence: 'weekly' }] };
  const out = placeUntimedEvents([ev('Study', '09:00', '10:00', 'none')], schedule, opts);
  assert.equal(out[0].startTime, '13:00');
  assert.equal(out[0].endTime, '14:00');
});

test('a part of day stays inside its window', () => {
  const schedule = { Wednesday: [{ title: 'Class', day: 'Wednesday', startTime: '06:00 PM', endTime: '07:30 PM', recurrence: 'weekly' }] };
  const out = placeUntimedEvents([ev('Walk', '18:00', '18:30', 'part-of-day', { partOfDay: 'evening' })], schedule, opts);
  assert.equal(out[0].startTime, '19:30');
});

test('exact times, reminders and sleep are never moved', () => {
  const schedule = { Wednesday: [{ title: 'Work', day: 'Wednesday', startTime: '09:00', endTime: '17:00', recurrence: 'weekly' }] };
  const out = placeUntimedEvents([
    ev('Meeting', '10:00', '11:00'),
    ev('Pill', '10:00', '10:00', 'none', { isReminder: true }),
    ev('Sleep', '23:00', '07:00', 'none', { isSleep: true }),
  ], schedule, opts);
  assert.deepEqual(out.map(e => e.startTime), ['10:00', '10:00', '23:00']);
});

test('today, nothing is placed in the past', () => {
  const out = placeUntimedEvents([{ title: 'Read', day: 'Today', startTime: '09:00', endTime: '09:30', timeSource: 'none' }], {}, opts);
  assert.equal(out[0].startTime, '17:00');
});

test('events from older weeks do not block', () => {
  const schedule = { Wednesday: [{ title: 'Old', day: 'Wednesday', startTime: '09:00', endTime: '12:00', recurrence: 'once', targetDate: '2026-11-18' }] };
  const out = placeUntimedEvents([ev('Study', '09:00', '10:00', 'none')], schedule, opts);
  assert.equal(out[0].startTime, '09:00');
});
