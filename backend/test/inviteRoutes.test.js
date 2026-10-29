// ──────────────────────────────────────────────
// Validation for /api/invites (routes/inviteRoutes.js). Pure checks on the
// date/time window — no Google Calendar or Mongo needed.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseWindow, parseClock24 } = require('../routes/inviteRoutes');

const TZ = 'Asia/Jerusalem';
const FAR_FUTURE_WEDNESDAY = '2099-11-04';

test('parseClock24: accepts HH:MM and rejects anything else', () => {
  assert.equal(parseClock24('13:30'), 810);
  assert.equal(parseClock24('9:05'), 545);
  assert.equal(parseClock24('24:00'), null);
  assert.equal(parseClock24('1:30 PM'), null);
  assert.equal(parseClock24(undefined), null);
});

test('parseWindow: returns minutes and the weekday for a valid window', () => {
  const w = parseWindow({ date: FAR_FUTURE_WEDNESDAY, startTime: '13:30', endTime: '14:30' }, TZ);
  assert.deepEqual(w, { date: FAR_FUTURE_WEDNESDAY, startMin: 810, endMin: 870, dayName: 'Wednesday' });
});

test('parseWindow: rejects an end before the start', () => {
  assert.throws(() => parseWindow({ date: FAR_FUTURE_WEDNESDAY, startTime: '14:30', endTime: '13:30' }, TZ), err => err.code === 'end_before_start');
});

test('parseWindow: rejects past dates and malformed dates', () => {
  assert.throws(() => parseWindow({ date: '2020-01-01', startTime: '10:00', endTime: '11:00' }, TZ), err => err.code === 'date_in_past');
  assert.throws(() => parseWindow({ date: '2099-02-30', startTime: '10:00', endTime: '11:00' }, TZ), err => err.code === 'invalid_date');
});

test('parseWindow: blocks Saturday and Friday after the Shabbat cutoff', () => {
  assert.throws(() => parseWindow({ date: '2099-11-07', startTime: '10:00', endTime: '11:00' }, TZ), err => err.code === 'shabbat');
  assert.throws(() => parseWindow({ date: '2099-11-06', startTime: '15:30', endTime: '16:30' }, TZ), err => err.code === 'shabbat');
  assert.equal(parseWindow({ date: '2099-11-06', startTime: '15:00', endTime: '16:00' }, TZ).dayName, 'Friday');
});
