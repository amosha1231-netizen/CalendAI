const test = require('node:test');
const assert = require('node:assert/strict');
const shabbatService = require('../services/shabbatService');
const { placeUntimedEvents } = require('../services/autoPlace');

const JERUSALEM = { timeZone: 'Asia/Jerusalem' };

test('motzashStartMinutes: havdalah in Jerusalem, rounded up to 5 minutes', () => {
  const winter = shabbatService.motzashStartMinutes('2026-11-28', JERUSALEM);
  const summer = shabbatService.motzashStartMinutes('2026-06-27', JERUSALEM);
  assert.ok(winter >= 17 * 60 && winter <= 17 * 60 + 40, `winter motzash ${winter}`);
  assert.ok(summer >= 20 * 60 + 15 && summer <= 20 * 60 + 45, `summer motzash ${summer}`);
  assert.equal(winter % 5, 0);
  assert.match(shabbatService.motzashStartClock('2026-11-28', JERUSALEM), /^\d{2}:\d{2}$/);
});

test('isShabbatSlot: Saturday is closed until motzei Shabbat and open after it', () => {
  const motzash = shabbatService.motzashStartMinutes('2026-11-28', JERUSALEM);
  assert.equal(shabbatService.isShabbatSlot({ date: '2026-11-28', startMin: 10 * 60, location: JERUSALEM }), true);
  assert.equal(shabbatService.isShabbatSlot({ date: '2026-11-28', startMin: motzash - 5, location: JERUSALEM }), true);
  assert.equal(shabbatService.isShabbatSlot({ date: '2026-11-28', startMin: motzash, location: JERUSALEM }), false);
  assert.equal(shabbatService.isShabbatSlot({ date: '2026-11-28', startMin: 21 * 60, location: JERUSALEM }), false);
  // No time at all on Saturday stays blocked.
  assert.equal(shabbatService.isShabbatSlot({ dayName: 'Saturday', location: JERUSALEM }), true);
  // Friday: blocked only when running past 16:00.
  assert.equal(shabbatService.isShabbatSlot({ date: '2026-11-27', startMin: 14 * 60, endMin: 15 * 60 }), false);
  assert.equal(shabbatService.isShabbatSlot({ date: '2026-11-27', startMin: 15 * 60 + 30, endMin: 16 * 60 + 30 }), true);
  // Weekdays are never Shabbat.
  assert.equal(shabbatService.isShabbatSlot({ date: '2026-11-29', startMin: 10 * 60 }), false);
});

test('placeUntimedEvents: an untimed Saturday event lands on motzei Shabbat', () => {
  const motzash = shabbatService.motzashStartMinutes('2026-11-28', JERUSALEM);
  const [placed] = placeUntimedEvents(
    [{ title: 'סרט', day: 'Saturday', targetDate: '2026-11-28', startTime: '09:00', endTime: '10:00', timeSource: 'none' }],
    {},
    { todayName: 'Thursday', todayIso: '2026-11-26', nowMinutes: 12 * 60, location: JERUSALEM }
  );
  const [h, m] = placed.startTime.split(':').map(Number);
  assert.ok(h * 60 + m >= motzash, `placed at ${placed.startTime}, motzash ${motzash}`);
});
