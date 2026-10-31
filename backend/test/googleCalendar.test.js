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
const { formatDateTimeWithTimezone, zonedDateTime, buildGcalEventBody, insertEventWithOptionalMeet } = require('../services/googleCalendar');

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

// ── buildGcalEventBody(): shared event-body builder for mutualRoutes.js
// (dual-insert) and the legacy single-user sync path — untested until now
// even though formatDateTimeWithTimezone/zonedDateTime (what it calls) were. ──
test('buildGcalEventBody: builds start/end with the given timezone and falls back to a default title', () => {
  const eventDate = new Date(2026, 10, 15);
  const body = buildGcalEventBody({
    title: '', eventDate, startHour: 9, startMinute: 0, endHour: 9, endMinute: 30, timeZone: 'Asia/Jerusalem'
  });
  assert.equal(body.summary, 'CalendAI Event');
  assert.deepEqual(body.start, { dateTime: '2026-11-15T09:00:00+02:00', timeZone: 'Asia/Jerusalem' });
  assert.deepEqual(body.end, { dateTime: '2026-11-15T09:30:00+02:00', timeZone: 'Asia/Jerusalem' });
  assert.equal('description' in body, false, 'no description field when none is given');
  assert.equal('recurrence' in body, false, 'no recurrence field when none is given');
  assert.equal('attendees' in body, false, 'no attendees field when none is given');
});

test('buildGcalEventBody: optional fields (description, reminders, recurrence, attendees) are only included when provided', () => {
  const eventDate = new Date(2026, 10, 15);
  const body = buildGcalEventBody({
    title: 'Mutual meeting', description: 'with Jane', eventDate,
    startHour: 14, startMinute: 0, endHour: 14, endMinute: 30, timeZone: 'UTC',
    reminders: { useDefault: false }, recurrenceRule: 'RRULE:FREQ=WEEKLY', attendees: [{ email: 'a@test.com' }]
  });
  assert.equal(body.summary, 'Mutual meeting');
  assert.equal(body.description, 'with Jane');
  assert.deepEqual(body.reminders, { useDefault: false });
  assert.deepEqual(body.recurrence, ['RRULE:FREQ=WEEKLY']);
  assert.deepEqual(body.attendees, [{ email: 'a@test.com' }]);
});

test('buildGcalEventBody: an empty attendees array is omitted, not sent as an empty list', () => {
  const eventDate = new Date(2026, 10, 15);
  const body = buildGcalEventBody({
    title: 'Meeting', eventDate, startHour: 9, startMinute: 0, endHour: 9, endMinute: 30,
    timeZone: 'UTC', attendees: []
  });
  assert.equal('attendees' in body, false);
});

// ── Google Meet links: buildGcalEventBody + insertEventWithOptionalMeet ──
test('buildGcalEventBody: addMeet requests a hangoutsMeet conference', () => {
  const body = buildGcalEventBody({ title: 'Sync', eventDate: new Date(2026, 10, 4), startHour: 13, startMinute: 30, endHour: 14, endMinute: 30, timeZone: 'Asia/Jerusalem', addMeet: true });
  assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.ok(body.conferenceData.createRequest.requestId);
  const plain = buildGcalEventBody({ title: 'Sync', eventDate: new Date(2026, 10, 4), startHour: 13, startMinute: 30, endHour: 14, endMinute: 30, timeZone: 'Asia/Jerusalem' });
  assert.equal(plain.conferenceData, undefined);
});

test('insertEventWithOptionalMeet: sends conferenceDataVersion and returns the Meet link', async () => {
  const calls = [];
  const calendar = { events: { insert: async (params) => { calls.push(params); return { data: { id: 'ev1', hangoutLink: 'https://meet.google.com/abc-defg-hij' } }; } } };
  const requestBody = buildGcalEventBody({ title: 'Sync', eventDate: new Date(2026, 10, 4), startHour: 9, startMinute: 0, endHour: 10, endMinute: 0, timeZone: 'UTC', addMeet: true });
  const { event, meetLink } = await insertEventWithOptionalMeet(calendar, { requestBody, sendUpdates: 'all' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].conferenceDataVersion, 1);
  assert.equal(calls[0].sendUpdates, 'all');
  assert.equal(event.id, 'ev1');
  assert.equal(meetLink, 'https://meet.google.com/abc-defg-hij');
});

test('insertEventWithOptionalMeet: retries without Meet when the conference request is rejected', async () => {
  const calls = [];
  const calendar = { events: { insert: async (params) => {
    calls.push(params);
    if (params.requestBody.conferenceData) throw new Error('Invalid conference type value.');
    return { data: { id: 'ev2' } };
  } } };
  const requestBody = buildGcalEventBody({ title: 'Sync', eventDate: new Date(2026, 10, 4), startHour: 9, startMinute: 0, endHour: 10, endMinute: 0, timeZone: 'UTC', addMeet: true, attendees: [{ email: 'a@b.co' }] });
  const { event, meetLink } = await insertEventWithOptionalMeet(calendar, { requestBody, sendUpdates: 'all' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].conferenceDataVersion, undefined);
  assert.deepEqual(calls[1].requestBody.attendees, [{ email: 'a@b.co' }]);
  assert.equal(calls[1].sendUpdates, 'all');
  assert.equal(event.id, 'ev2');
  assert.equal(meetLink, null);
});
