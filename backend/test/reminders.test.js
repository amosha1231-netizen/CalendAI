const assert = require('node:assert/strict');
const { test } = require('node:test');
const s = require('../services/reminderSchedule');
const { createDispatcher, STALE_MS } = require('../services/reminderDispatcher');
const shabbatService = require('../services/shabbatService');
const { buildLocation } = require('../services/userLocation');

const IL = 'Asia/Jerusalem';
const NY = 'America/New_York';

test('normalizeTime accepts 24h and AM/PM, rejects bare numbers', () => {
  assert.equal(s.normalizeTime('8:00'), '08:00');
  assert.equal(s.normalizeTime('08:00 AM'), '08:00');
  assert.equal(s.normalizeTime('12:15 AM'), '00:15');
  assert.equal(s.normalizeTime('8pm'), '20:00');
  assert.equal(s.normalizeTime('20:30'), '20:30');
  assert.equal(s.normalizeTime('8'), null);
  assert.equal(s.normalizeTime('25:00'), null);
  assert.equal(s.normalizeTime('13:00 PM'), null);
});

test('daily reminder fires at 08:00 in the user zone, today if still ahead', () => {
  const r = { frequency: 'daily', time: '08:00', timezone: IL };
  // 2026-10-14 04:00Z = 07:00 in Israel (UTC+3) → today 08:00 = 05:00Z
  assert.equal(s.computeNextFire(r, new Date('2026-10-14T04:00:00Z')).toISOString(), '2026-10-14T05:00:00.000Z');
  // already past 08:00 → tomorrow
  assert.equal(s.computeNextFire(r, new Date('2026-10-14T05:00:00Z')).toISOString(), '2026-10-15T05:00:00.000Z');
});

test('daily reminder keeps its wall-clock time across a DST change', () => {
  const r = { frequency: 'daily', time: '08:00', timezone: IL };
  // Israel leaves DST on 2026-10-25: 08:00 is 05:00Z before and 06:00Z after.
  assert.equal(s.computeNextFire(r, new Date('2026-10-24T06:00:00Z')).toISOString(), '2026-10-25T06:00:00.000Z');
});

test('the same reminder resolves per zone', () => {
  const r = { frequency: 'daily', time: '08:00', timezone: NY };
  assert.equal(s.computeNextFire(r, new Date('2026-10-14T05:00:00Z')).toISOString(), '2026-10-14T12:00:00.000Z');
});

test('weekly reminder picks the next listed weekday', () => {
  // 2026-10-14 is a Wednesday
  const r = { frequency: 'weekly', time: '18:00', timezone: IL, daysOfWeek: [1, 4] };
  assert.equal(s.computeNextFire(r, new Date('2026-10-14T10:00:00Z')).toISOString(), '2026-10-15T15:00:00.000Z');
});

test('monthly reminder clamps to the last day of short months', () => {
  const r = { frequency: 'monthly', time: '09:00', timezone: IL, dayOfMonth: 31 };
  // after Oct 31 → Nov 30
  assert.equal(s.computeNextFire(r, new Date('2026-11-01T00:00:00Z')).toISOString(), '2026-11-30T07:00:00.000Z');
});

test('one-off reminder fires once, then never', () => {
  const r = { frequency: 'once', time: '09:00', timezone: IL, date: '2026-10-15' };
  assert.equal(s.computeNextFire(r, new Date('2026-10-14T00:00:00Z')).toISOString(), '2026-10-15T06:00:00.000Z');
  assert.equal(s.computeNextFire(r, new Date('2026-10-15T06:00:00Z')), null);
});

test('isBlocked skips Shabbat occurrences of a daily reminder', () => {
  const r = { frequency: 'daily', time: '08:00', timezone: IL };
  const isBlocked = instant => shabbatService.isShabbatTime(instant, buildLocation({ timeZone: IL })).isShabbat;
  // Friday 2026-10-16 after 08:00 → Saturday 08:00 is Shabbat → Sunday 08:00
  const next = s.computeNextFire(r, new Date('2026-10-16T06:00:00Z'), { isBlocked });
  assert.equal(next.toISOString(), '2026-10-18T05:00:00.000Z');
});

test('toRRule describes the schedule', () => {
  assert.equal(s.toRRule({ frequency: 'daily', time: '08:00' }), 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0');
  assert.equal(s.toRRule({ frequency: 'weekly', time: '18:30', daysOfWeek: [4, 1] }), 'FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=18;BYMINUTE=30');
  assert.equal(s.toRRule({ frequency: 'monthly', time: '09:00', dayOfMonth: 1 }), 'FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0');
});

test('sanitizeReminderInput validates and normalises', () => {
  assert.equal(s.sanitizeReminderInput({ title: '', time: '08:00', frequency: 'daily' }).error, 'title');
  assert.equal(s.sanitizeReminderInput({ title: 'x', time: 'soon', frequency: 'daily' }).error, 'time');
  assert.equal(s.sanitizeReminderInput({ title: 'x', time: '08:00', frequency: 'weekly', daysOfWeek: [] }).error, 'daysOfWeek');
  const all = s.sanitizeReminderInput({ title: 'x', time: '8:00', frequency: 'weekly', daysOfWeek: [0, 1, 2, 3, 4, 5, 6, 6] }, { timeZone: IL });
  assert.equal(all.value.frequency, 'daily');
  assert.equal(all.value.time, '08:00');
  assert.equal(all.value.skipShabbat, true);
  assert.equal(s.sanitizeReminderInput({ title: 'x', time: '08:00', frequency: 'daily' }, { timeZone: 'Not/AZone' }).value.timezone, IL);
});

test('AI "every day" reminder becomes one daily reminder; other events stay', () => {
  const events = [
    { summary: 'לקחת כדור', day: 'Today', startTime: '08:00', endTime: '08:05', recurrence: 'daily', isReminder: true, repeat: { frequency: 'daily' } },
    { summary: 'פגישה', day: 'Thursday', startTime: '10:00', endTime: '11:00', recurrence: 'once' }
  ];
  const { reminders, remainingEvents } = s.reminderSpecsFromEvents(events, { timeZone: IL, todayName: 'Wednesday' });
  assert.deepEqual(reminders, [{ title: 'לקחת כדור', time: '08:00', emoji: undefined, frequency: 'daily' }]);
  assert.equal(remainingEvents.length, 1);
  assert.equal(remainingEvents[0].summary, 'פגישה');
});

test('seven per-day reminder events from the AI collapse into one daily reminder', () => {
  const events = s.DAY_NAMES.map(day => ({ summary: 'Take pill', day, startTime: '08:00', recurrence: 'weekly', isReminder: true }));
  const { reminders } = s.reminderSpecsFromEvents(events, { timeZone: IL });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].frequency, 'daily');
});

test('weekly reminder days are unioned across events', () => {
  const events = [
    { summary: 'Water plants', day: 'Monday', startTime: '18:00', recurrence: 'weekly', isReminder: true },
    { summary: 'Water plants', day: 'Thursday', startTime: '18:00', recurrence: 'weekly', isReminder: true }
  ];
  const { reminders } = s.reminderSpecsFromEvents(events, { timeZone: IL });
  assert.deepEqual(reminders[0].daysOfWeek, [1, 4]);
});

test('one-off reminder gets the next date for its weekday; yearly stays a calendar event', () => {
  const now = new Date('2026-10-14T10:00:00Z'); // Wednesday 13:00 in Israel
  const { reminders, remainingEvents } = s.reminderSpecsFromEvents([
    { summary: 'Buy milk', day: 'Thursday', startTime: '09:00', recurrence: 'once', isReminder: true },
    { summary: 'Birthday', day: 'Thursday', startTime: '09:00', recurrence: 'yearly', isReminder: true }
  ], { timeZone: IL, now });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].frequency, 'once');
  assert.equal(reminders[0].date, '2026-10-15');
  assert.equal(remainingEvents.length, 1);
});

test('"בעוד 355 ימים" pins the reminder to the date 355 days out, not next week', () => {
  const now = new Date('2026-10-21T16:00:00Z'); // Wednesday 19:00 in Israel
  const text = 'תוכל לשים לי תזכורת לעוד 355 ימים לחדש מנוי לדומיין';
  // What the AI sent back: only a weekday name, which used to resolve to next Wednesday.
  const { reminders } = s.reminderSpecsFromEvents([
    { summary: 'לחדש מנוי לדומיין', day: 'Wednesday', startTime: '09:00', recurrence: 'once', isReminder: true }
  ], { timeZone: IL, now, text });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].date, '2027-10-11');
});

test('relative day, week, month and year offsets resolve to calendar dates', () => {
  const now = new Date('2026-10-21T16:00:00Z');
  const rel = t => s.relativeDateFromText(t, IL, now);
  assert.equal(rel('בעוד 355 ימים'), '2027-10-11');
  assert.equal(rel('תזכיר לי בעוד 3 שבועות'), '2026-11-11');
  assert.equal(rel('בעוד שבועיים'), '2026-11-04');
  assert.equal(rel('בעוד חודש'), '2026-11-21');
  assert.equal(rel('בעוד שנה לחדש דומיין'), '2027-10-21');
  assert.equal(rel('remind me in 355 days'), '2027-10-11');
  assert.equal(rel('in a year'), '2027-10-21');
  assert.equal(rel('10 days from now'), '2026-10-31');
  // Month ends clamp, and minutes/hours are not day offsets.
  assert.equal(s.relativeDateFromText('בעוד חודש', IL, new Date('2027-01-31T10:00:00Z')), '2027-02-28');
  assert.equal(rel('בעוד 10 דקות'), null);
  assert.equal(rel('בעוד שעה'), null);
  assert.equal(rel('עוד יום עבודה'), null);
  assert.equal(rel('בעוד 3 ימים ובעוד שבוע'), null);
});

test('a future targetDate from the AI is used for a one-off reminder', () => {
  const now = new Date('2026-10-21T16:00:00Z');
  const { reminders } = s.reminderSpecsFromEvents([
    { summary: 'Renew domain', day: 'Monday', targetDate: '2027-10-11', startTime: '09:00', recurrence: 'once', isReminder: true }
  ], { timeZone: IL, now });
  assert.equal(reminders[0].date, '2027-10-11');
});

// ── Dispatcher with in-memory fakes ──
function fakeStore(docs) {
  const rows = docs.map(d => ({ ...d }));
  const matches = (row, q) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$lte' in v) return row[k] && row[k] <= v.$lte;
    if (v instanceof Date) return row[k] && row[k].getTime() === v.getTime();
    return String(row[k]) === String(v);
  });
  const chain = list => ({ sort: () => chain(list), limit: () => chain(list), lean: async () => list.map(r => ({ ...r })) });
  return {
    rows,
    find: q => chain(rows.filter(r => matches(r, q))),
    findOneAndUpdate: async (q, u) => {
      const row = rows.find(r => matches(r, q));
      if (!row) return null;
      Object.assign(row, u.$set);
      return { ...row };
    },
    updateOne: async () => ({}),
    deleteOne: async q => { const i = rows.findIndex(r => matches(r, q)); if (i >= 0) rows.splice(i, 1); return {}; }
  };
}

test('dispatcher pings once, advances to the next occurrence, and drops gone subscriptions', async () => {
  const due = new Date('2026-10-14T05:00:00Z');
  const Reminder = fakeStore([{ _id: 'r1', userId: 'u1', title: 'Take pill', emoji: '💊', time: '08:00', frequency: 'daily', timezone: IL, active: true, skipShabbat: false, nextFireAt: due }]);
  const PushSubscription = fakeStore([
    { _id: 's1', userId: 'u1', endpoint: 'https://push/1', keys: { p256dh: 'a', auth: 'b' } },
    { _id: 's2', userId: 'u1', endpoint: 'https://push/2', keys: { p256dh: 'a', auth: 'b' } }
  ]);
  const sent = [];
  const push = { send: async (sub, payload) => { sent.push([sub._id, payload]); return sub._id === 's2' ? { ok: false, gone: true } : { ok: true }; } };
  const d = createDispatcher({ Reminder, PushSubscription, push, now: () => new Date('2026-10-14T05:00:20Z'), logger: { warn() {}, error() {} } });

  const result = await d.tick();
  assert.equal(result.fired, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[0][1].title, '💊 Take pill');
  assert.equal(Reminder.rows[0].nextFireAt.toISOString(), '2026-10-15T05:00:00.000Z');
  assert.deepEqual(PushSubscription.rows.map(r => r._id), ['s1']);

  // Second tick: nothing due, nothing sent.
  assert.equal((await d.tick()).fired, 0);
  assert.equal(sent.length, 2);
});

test('dispatcher skips pings that are long overdue and deactivates finished one-offs', async () => {
  const Reminder = fakeStore([
    { _id: 'late', userId: 'u1', title: 'Late', time: '08:00', frequency: 'daily', timezone: IL, active: true, nextFireAt: new Date('2026-10-14T05:00:00Z') },
    { _id: 'once', userId: 'u1', title: 'Once', time: '08:10', frequency: 'once', date: '2026-10-14', timezone: IL, active: true, nextFireAt: new Date('2026-10-14T05:10:00Z') }
  ]);
  const PushSubscription = fakeStore([{ _id: 's1', userId: 'u1', endpoint: 'https://push/1', keys: { p256dh: 'a', auth: 'b' } }]);
  const sent = [];
  const push = { send: async (sub, p) => { sent.push(p.reminderId); return { ok: true }; } };
  const now = new Date(new Date('2026-10-14T05:00:00Z').getTime() + STALE_MS + 60000);
  const d = createDispatcher({ Reminder, PushSubscription, push, now: () => now, logger: { warn() {}, error() {} } });
  const result = await d.tick();
  assert.equal(result.skipped, 1);
  assert.deepEqual(sent, ['once']);
  const once = Reminder.rows.find(r => r._id === 'once');
  assert.equal(once.active, false);
  assert.equal(once.nextFireAt, null);
});

test('dispatcher never pings on Shabbat, even for reminders saved with skipShabbat off', async () => {
  const due = new Date('2026-10-17T05:00:00Z'); // Saturday 08:00 in Israel
  const Reminder = fakeStore([{ _id: 'r1', userId: 'u1', title: 'Pill', time: '08:00', frequency: 'daily', timezone: IL, active: true, skipShabbat: false, nextFireAt: due }]);
  const PushSubscription = fakeStore([{ _id: 's1', userId: 'u1', endpoint: 'https://push/1', keys: { p256dh: 'a', auth: 'b' } }]);
  const sent = [];
  const push = { send: async (sub, payload) => { sent.push(payload); return { ok: true }; } };
  const isShabbatAt = (instant, timeZone) => shabbatService.isShabbatTime(instant, buildLocation({ timeZone })).isShabbat;
  const d = createDispatcher({ Reminder, PushSubscription, push, isShabbatAt, now: () => new Date('2026-10-17T05:00:20Z'), logger: { warn() {}, error() {} } });

  const result = await d.tick();
  assert.equal(result.fired, 0);
  assert.equal(sent.length, 0);
  assert.equal(Reminder.rows[0].nextFireAt.toISOString(), '2026-10-18T05:00:00.000Z');
});
