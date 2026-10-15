// ──────────────────────────────────────────────
// Characterization tests for googleCalendar.js's formatDateTimeWithTimezone()
// and zonedDateTime() — the shared helpers mutualRoutes.js, providerRoutes.js
// (via syncEventToGoogleCalendar) and the legacy single-user sync path all
// use to build Google Calendar event bodies. Pure functions, no I/O — unlike
// mutualBooking.test.js/criticalPaths.test.js this needs no MongoMemoryReplSet.
//
// Run with: npm test  (from backend/)
// ──────────────────────────────────────────────
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { formatDateTimeWithTimezone, zonedDateTime } = require('../services/googleCalendar');

// ── formatDateTimeWithTimezone(): must keep the caller's calendar day ──
// Every caller builds `date` from literal Y/M/D components (new Date(y, m-1, d),
// optionally with .setHours()) in the server process's own local zone — it's
// meant as "this calendar day", not a specific UTC instant. Re-deriving the
// day via Intl.DateTimeFormat(timeZone) used to roll it backward whenever
// `timeZone` was far enough behind the server's zone (e.g. a UTC server +
// an America/* location) that local midnight fell on the previous UTC day,
// silently booking the Google Calendar event one day earlier than the date
// the user actually picked and confirmed.
test('formatDateTimeWithTimezone: keeps the intended calendar day for a timezone behind UTC', () => {
  const eventDate = new Date(2026, 10, 15); // "2026-11-15", local server midnight
  assert.equal(formatDateTimeWithTimezone(eventDate, 9, 0, 'America/Los_Angeles'), '2026-11-15T09:00:00-08:00');
  assert.equal(formatDateTimeWithTimezone(eventDate, 9, 0, 'America/New_York'), '2026-11-15T09:00:00-05:00');
});

test('formatDateTimeWithTimezone: unaffected timezones (UTC or ahead) still resolve correctly', () => {
  const eventDate = new Date(2026, 10, 15);
  assert.equal(formatDateTimeWithTimezone(eventDate, 9, 0, 'Asia/Jerusalem'), '2026-11-15T09:00:00+02:00');
  assert.equal(formatDateTimeWithTimezone(eventDate, 9, 0, 'UTC'), '2026-11-15T09:00:00+00:00');
});

// ── Zero UTC offset renders as the bare string "GMT" (no "+00:00" suffix) in
// Intl's longOffset format — a regex expecting "GMT+HH:MM" doesn't match it,
// which used to fall through to a hardcoded '+03:00' default and silently
// shift every London-winter event 3 hours from the time the user picked. ──
test('formatDateTimeWithTimezone: a zero-offset timezone resolves to +00:00, not a Jerusalem-shaped fallback', () => {
  const winterDate = new Date(2026, 10, 15); // London is on GMT (UTC+0) in November
  assert.equal(formatDateTimeWithTimezone(winterDate, 9, 0, 'Europe/London'), '2026-11-15T09:00:00+00:00');
});

test('formatDateTimeWithTimezone: daylight-saving offset still resolves correctly', () => {
  const summerDate = new Date(2026, 6, 15); // London is on BST (UTC+1) in July
  assert.equal(formatDateTimeWithTimezone(summerDate, 9, 0, 'Europe/London'), '2026-07-15T09:00:00+01:00');
});

// ── zonedDateTime(): resolves a wall-clock "isoDate + HH:MM in timeZone" into
// the correct absolute UTC instant — used to window the freebusy.query calls
// mutual/provider availability depend on. ──
test('zonedDateTime: resolves a timezone behind UTC to the correct absolute instant', () => {
  assert.equal(zonedDateTime('2026-11-15', '06:00', 'America/Los_Angeles').toISOString(), '2026-11-15T14:00:00.000Z');
});

test('zonedDateTime: resolves a timezone ahead of UTC to the correct absolute instant', () => {
  assert.equal(zonedDateTime('2026-11-15', '06:00', 'Asia/Jerusalem').toISOString(), '2026-11-15T04:00:00.000Z');
});

test('zonedDateTime: accounts for daylight saving (BST) rather than using the standard-time offset', () => {
  assert.equal(zonedDateTime('2026-07-15', '06:00', 'Europe/London').toISOString(), '2026-07-15T05:00:00.000Z');
});
