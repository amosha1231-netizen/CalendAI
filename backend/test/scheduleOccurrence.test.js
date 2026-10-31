// ──────────────────────────────────────────────
// Which local-schedule events block time on a given date — shared by
// /api/schedule/free-slots and mutual availability. Pure, no Mongo.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getScheduleEventsForDate, eventOccursOnDate, isZeroDurationEvent } = require('../services/scheduleOccurrence');

// 2026-10-27 is a Tuesday.
const TODAY = '2026-10-27';

test('reminders (endTime === startTime) never block time', () => {
  const schedule = { Tuesday: [
    { title: 'Take pills', day: 'Tuesday', startTime: '09:00 AM', endTime: '09:00 AM', recurrence: 'weekly', eventType: 'notification', isReminder: true },
    { title: 'Ping', day: 'Tuesday', startTime: '10:00 AM', endTime: '10:00 AM', recurrence: 'weekly' }
  ] };
  assert.deepEqual(getScheduleEventsForDate(schedule, TODAY, TODAY), []);
  assert.equal(isZeroDurationEvent({ startTime: '10:00 AM', endTime: '11:00 AM' }), false);
});

test('a one-off event without targetDate only blocks its next occurrence', () => {
  const ev = { title: 'Dentist', day: 'Thursday', startTime: '10:00 AM', endTime: '11:00 AM', recurrence: 'once' };
  assert.equal(eventOccursOnDate(ev, '2026-10-29', TODAY), true);
  assert.equal(eventOccursOnDate(ev, '2026-11-05', TODAY), false);
});

test('a dated event with no recurrence is a one-off', () => {
  const ev = { day: 'Monday', startTime: '09:00 AM', endTime: '10:00 AM', targetDate: '2026-11-02' };
  assert.equal(eventOccursOnDate(ev, '2026-11-02', TODAY), true);
  assert.equal(eventOccursOnDate(ev, '2026-11-09', TODAY), false);
});

test('targetDate stored as a full ISO timestamp still matches its day', () => {
  const ev = { day: 'Monday', startTime: '09:00 AM', endTime: '10:00 AM', recurrence: 'once', targetDate: '2026-11-02T00:00:00.000Z' };
  assert.equal(eventOccursOnDate(ev, '2026-11-02', TODAY), true);
});

test('monthly events only block the first week of the month', () => {
  const ev = { day: 'Tuesday', startTime: '09:00 AM', endTime: '10:00 AM', recurrence: 'monthly' };
  assert.equal(eventOccursOnDate(ev, '2026-11-03', TODAY), true);
  assert.equal(eventOccursOnDate(ev, '2026-11-10', TODAY), false);
});

test('yearly events only block their created month', () => {
  const ev = { day: 'Tuesday', startTime: '09:00 AM', endTime: '10:00 AM', recurrence: 'yearly', createdMonth: 2 };
  assert.equal(eventOccursOnDate(ev, '2026-10-27', TODAY), false);
  assert.equal(eventOccursOnDate(ev, '2027-03-02', TODAY), true);
});

test('weekly events block every week; daily events block every day once', () => {
  const daily = { title: 'Gym', day: 'Sunday', startTime: '07:00 AM', endTime: '08:00 AM', recurrence: 'daily' };
  const schedule = {
    Sunday: [daily],
    Monday: [{ ...daily, day: 'Monday' }],
    Tuesday: [{ title: 'Class', day: 'Tuesday', startTime: '06:00 PM', endTime: '08:00 PM', recurrence: 'weekly' }],
    Today: [{ title: 'Class', day: 'Tuesday', startTime: '06:00 PM', endTime: '08:00 PM', recurrence: 'weekly' }]
  };
  const titles = getScheduleEventsForDate(schedule, '2026-11-03', TODAY).map(e => e.title).sort();
  assert.deepEqual(titles, ['Class', 'Gym']);
});
