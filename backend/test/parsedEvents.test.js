const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepareParsedEvent, sanitizeConfirmedEvents, MAX_CONFIRMED_EVENTS } = require('../services/parsedEvents');

const base = { title: 'Dentist', day: 'Monday', startTime: '10:00', endTime: '11:00' };

test('prepareParsedEvent resolves Today and defaults to a one-off event', () => {
  const ev = prepareParsedEvent({ ...base, day: 'Today' }, { todayName: 'Wednesday', locationId: 'jerusalem' });
  assert.equal(ev.day, 'Wednesday');
  assert.equal(ev.recurrence, 'once');
  assert.equal(ev.endTime, '11:00');
});

test('prepareParsedEvent keeps weekly for events the AI marked recurring', () => {
  const ev = prepareParsedEvent({ ...base, isRecurring: true }, { todayName: 'Wednesday', locationId: 'jerusalem' });
  assert.equal(ev.recurrence, 'weekly');
});

test('prepareParsedEvent applies a client duration only to AM/PM times', () => {
  const opts = { todayName: 'Monday', locationId: 'jerusalem', duration: 60 };
  assert.equal(prepareParsedEvent({ ...base, startTime: '06:00 PM', endTime: '06:30 PM' }, opts).endTime, '07:00 PM');
  assert.equal(prepareParsedEvent({ ...base, endTime: '12:30' }, opts).endTime, '12:30');
});

test('sanitizeConfirmedEvents keeps known fields and drops the rest', () => {
  const [ev] = sanitizeConfirmedEvents([{ ...base, recurrence: 'weekly', location: 'x', _id: 'y', conflicts: [{}] }]);
  assert.deepEqual(ev, { title: 'Dentist', summary: 'Dentist', day: 'Monday', startTime: '10:00', endTime: '11:00', recurrence: 'weekly', isRecurring: true, isReminder: false, isSleep: false });
});

test('sanitizeConfirmedEvents keeps reminder repeat details', () => {
  const [ev] = sanitizeConfirmedEvents([{ ...base, isReminder: true, recurrence: 'weekly', repeat: { frequency: 'weekly', daysOfWeek: ['Monday', 'Funday', 4] } }]);
  assert.equal(ev.isReminder, true);
  assert.deepEqual(ev.repeat, { frequency: 'weekly', daysOfWeek: ['Monday', 4] });
});

test('sanitizeConfirmedEvents rejects invalid lists', () => {
  assert.equal(sanitizeConfirmedEvents([]), null);
  assert.equal(sanitizeConfirmedEvents('nope'), null);
  assert.equal(sanitizeConfirmedEvents([{ ...base, title: '  ' }]), null);
  assert.equal(sanitizeConfirmedEvents([{ ...base, day: 'Someday' }]), null);
  assert.equal(sanitizeConfirmedEvents([{ ...base, startTime: 'soon' }]), null);
  assert.equal(sanitizeConfirmedEvents(Array(MAX_CONFIRMED_EVENTS + 1).fill(base)), null);
});
