// Shabbat follows the user's location, not Jerusalem's (no database needed).
const test = require('node:test');
const assert = require('node:assert');
const shabbat = require('../services/shabbatService');
const { buildLocation, getRequestLocation, isValidTimeZone } = require('../services/userLocation');

const jerusalem = buildLocation({ timeZone: 'Asia/Jerusalem' });
const newYork = buildLocation({ timeZone: 'America/New_York' });
const sydney = buildLocation({ timeZone: 'Australia/Sydney' });

test('Saturday afternoon in New York is Shabbat there but over in Jerusalem', () => {
  const when = new Date('2026-10-17T16:30:00Z'); // NY 12:30 Sat, Jerusalem 19:30 Sat
  assert.strictEqual(shabbat.isShabbatTime(when, newYork).isShabbat, true);
  assert.strictEqual(shabbat.isShabbatTime(when, jerusalem).isShabbat, false);
});

test('Friday afternoon in New York is before Shabbat there while Jerusalem already started', () => {
  const when = new Date('2026-10-16T16:00:00Z'); // NY 12:00 Fri, Jerusalem 19:00 Fri
  assert.strictEqual(shabbat.isShabbatTime(when, newYork).isShabbat, false);
  assert.strictEqual(shabbat.isShabbatTime(when, jerusalem).isShabbat, true);
});

test('Sydney starts Shabbat many hours before Israel', () => {
  const when = new Date('2026-10-16T09:00:00Z'); // Sydney 20:00 Fri, Jerusalem 12:00 Fri
  assert.strictEqual(shabbat.isShabbatTime(when, sydney).isShabbat, true);
  assert.strictEqual(shabbat.isShabbatTime(when, jerusalem).isShabbat, false);
});

test('candle lighting is 20 minutes before local sunset, havdalah 42 after', () => {
  const { start, end } = shabbat.getShabbatWindow(new Date('2026-10-14T10:00:00Z'), jerusalem);
  const fmt = d => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  assert.match(fmt(start), /^Fri 17:4\d$/);
  assert.match(fmt(end), /^Sat 18:\d\d$/);
});

test('polar locations fall back to 18:00 instead of failing', () => {
  const tromso = buildLocation({ timeZone: 'Europe/Oslo', lat: 69.65, lng: 18.95 });
  const { start } = shabbat.getShabbatWindow(new Date('2026-06-17T10:00:00Z'), tromso);
  assert.ok(start instanceof Date && !isNaN(start.getTime()));
});

test('requests without location headers keep the Jerusalem default', () => {
  const req = { body: {}, query: {}, get: () => undefined };
  assert.strictEqual(getRequestLocation(req).timeZone, 'Asia/Jerusalem');
});

test('request headers and invalid values are validated', () => {
  const headers = { 'x-calendai-timezone': 'America/New_York', 'x-calendai-lat': '40.7', 'x-calendai-lng': '-74' };
  const req = { body: {}, query: {}, get: name => headers[name.toLowerCase()] };
  assert.deepStrictEqual(getRequestLocation(req), { timeZone: 'America/New_York', lat: 40.7, lng: -74, source: 'gps' });

  const bad = { body: {}, query: {}, get: name => ({ 'x-calendai-timezone': 'Mars/Base', 'x-calendai-lat': '999' })[name.toLowerCase()] };
  assert.strictEqual(getRequestLocation(bad).timeZone, 'Asia/Jerusalem');
  assert.strictEqual(isValidTimeZone('Europe/Paris'), true);
});
