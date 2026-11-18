const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeGroupSize, openSlots, groupStatus, responderKey, slotIsPast, nowInZone
} = require('../services/groupBooking');

// Wed 2026-11-18 09:00 in Jerusalem (UTC+2).
const NOW = new Date('2026-11-18T07:00:00Z');

function booking(extra = {}) {
  return {
    bookingId: 'dyn_1',
    duration: 60,
    hostTimezone: 'Asia/Jerusalem',
    date: '2026-11-18',
    day: 'Wednesday',
    groupSize: 1,
    responses: [],
    slots: [
      { date: '2026-11-18', hour: 8, minute: 0 },   // 0: already past
      { date: '2026-11-18', hour: 11, minute: 0 },  // 1
      { date: '2026-11-18', hour: 12, minute: 0 },  // 2
      { date: '2026-11-19', hour: 11, minute: 0 },  // 3
      { date: '2026-11-19', hour: 15, minute: 0 }   // 4
    ],
    ...extra
  };
}

test('normalizeGroupSize clamps to 1..20', () => {
  assert.strictEqual(normalizeGroupSize(undefined), 1);
  assert.strictEqual(normalizeGroupSize('3'), 3);
  assert.strictEqual(normalizeGroupSize(0), 1);
  assert.strictEqual(normalizeGroupSize(2.5), 1);
  assert.strictEqual(normalizeGroupSize(99), 20);
});

test('nowInZone gives the host-zone date and time', () => {
  assert.deepStrictEqual(nowInZone('Asia/Jerusalem', NOW), { date: '2026-11-18', minutes: 9 * 60 });
});

test('past times drop off the link', () => {
  const b = booking();
  assert.strictEqual(slotIsPast(b, b.slots[0], NOW), true);
  assert.strictEqual(slotIsPast(b, b.slots[1], NOW), false);
  assert.deepStrictEqual(openSlots(b, { now: NOW }).map(s => s.index), [1, 2, 3, 4]);
});

test('a time the host filled since sending drops off, and indexes stay put', () => {
  const schedule = {
    Wednesday: [{ title: 'Dentist', startTime: '11:30 AM', endTime: '12:00 PM', targetDate: '2026-11-18' }],
    // A one-time event on another Thursday doesn't block this Thursday.
    Thursday: [{ title: 'Other week', startTime: '11:00', endTime: '12:00', targetDate: '2026-11-26' }]
  };
  const open = openSlots(booking(), { schedule, now: NOW });
  assert.deepStrictEqual(open.map(s => s.index), [2, 3, 4]);
  assert.strictEqual(open[0].hour, 12);
});

test('the link\'s own booked event never blocks it', () => {
  const schedule = { Wednesday: [{ startTime: '11:00', endTime: '12:00', bookingId: 'dyn_1' }] };
  assert.deepStrictEqual(openSlots(booking(), { schedule, now: NOW }).map(s => s.index), [1, 2, 3, 4]);
});

test('group: later friends only see times everyone so far can make', () => {
  const b = booking({
    groupSize: 3,
    responses: [
      { key: 'a', name: 'Yael', slotIndexes: [1, 3, 4] },
      { key: 'b', name: 'Dan', slotIndexes: [3, 4] }
    ]
  });
  assert.deepStrictEqual(openSlots(b, { now: NOW }).map(s => s.index), [3, 4]);
  const st = groupStatus(b, { now: NOW });
  assert.strictEqual(st.complete, false);
  assert.strictEqual(st.responded, 2);
  assert.strictEqual(st.winnerIndex, null);
});

test('group: once everyone answered, the earliest shared time wins', () => {
  const b = booking({
    groupSize: 2,
    responses: [
      { key: 'a', name: 'Yael', slotIndexes: [4, 3, 1] },
      { key: 'b', name: 'Dan', slotIndexes: [4, 3] }
    ]
  });
  const st = groupStatus(b, { now: NOW });
  assert.strictEqual(st.complete, true);
  assert.strictEqual(st.winnerIndex, 3);
});

test('group: no shared time is reported', () => {
  const b = booking({
    groupSize: 2,
    responses: [
      { key: 'a', name: 'Yael', slotIndexes: [1] },
      { key: 'b', name: 'Dan', slotIndexes: [2] }
    ]
  });
  const st = groupStatus(b, { now: NOW });
  assert.strictEqual(st.noCommonTime, true);
  assert.strictEqual(st.winnerIndex, null);
});

test('single links ignore responses', () => {
  const b = booking({ responses: [{ key: 'a', slotIndexes: [1] }] });
  assert.strictEqual(openSlots(b, { now: NOW }).length, 4);
});

test('responderKey matches the same person across answers', () => {
  assert.strictEqual(responderKey({ email: ' Yael@Mail.com ' }), responderKey({ email: 'yael@mail.com' }));
  assert.strictEqual(responderKey({ phone: '050-123 4567' }), 'p:0501234567');
  assert.strictEqual(responderKey({ name: 'Dan' }), 'n:dan');
});
