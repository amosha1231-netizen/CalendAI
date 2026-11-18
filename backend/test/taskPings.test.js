const test = require('node:test');
const assert = require('node:assert/strict');
const { isTaskText, applyTaskIntent, taskPingEvents, scheduleHasTask } = require('../services/taskPings');
const { reminderSpecsFromEvents } = require('../services/reminderSchedule');
const { prepareParsedEvent, sanitizeConfirmedEvents } = require('../services/parsedEvents');
const { createDispatcher } = require('../services/reminderDispatcher');

const IL = 'Asia/Jerusalem';

test('task words are recognised in Hebrew and English', () => {
  assert.ok(isTaskText('תעשה לי משימה כל יום ראשון ב-11 שניים מקרא ואחד תרגום'));
  assert.ok(isTaskText('שיהיה לי פינג ואצטרך לסמן בוצע'));
  assert.ok(isTaskText('add a task every Sunday at 11'));
  assert.ok(isTaskText('ping me and I will mark it done'));
  assert.ok(!isTaskText('פגישה עם דני ביום חמישי בחמש'));
  assert.ok(!isTaskText('remind me every day at 8 to take a pill'));
});

test('a request for a task turns a plain event or a bare reminder into a task', () => {
  const event = { summary: 'שניים מקרא ואחד תרגום', day: 'Sunday', startTime: '11:00', endTime: '11:30', recurrence: 'weekly' };
  const [asEvent] = applyTaskIntent([event], 'משימה כל יום ראשון ב-11 שניים מקרא ואחד תרגום');
  assert.equal(asEvent.isTask, true);
  assert.equal(asEvent.isReminder, false);

  const [asReminder] = applyTaskIntent([{ ...event, isReminder: true }], 'תן לי פינג ב-11 ואסמן בוצע');
  assert.equal(asReminder.isTask, true);
  assert.equal(asReminder.isReminder, false);

  // Without task words the AI's answer is kept as it is.
  const [meeting] = applyTaskIntent([event], 'פגישה עם דני');
  assert.equal(meeting.isTask, undefined);
  const [sleep] = applyTaskIntent([{ ...event, isSleep: true }], 'משימה: לישון ב-23');
  assert.equal(sleep.isTask, undefined);
});

test('a weekly task stays in the calendar and gets a weekly ping at its start time', () => {
  const task = { summary: 'שניים מקרא ואחד תרגום', title: 'שניים מקרא ואחד תרגום', day: 'Sunday', startTime: '11:00', endTime: '11:15',
    recurrence: 'weekly', isRecurring: true, isTask: true, isReminder: false, repeat: { frequency: 'weekly', daysOfWeek: ['Sunday'] } };

  // As a calendar event it is not taken as a reminder.
  const { reminders: asReminders, remainingEvents } = reminderSpecsFromEvents([task], { timeZone: IL, todayName: 'Sunday' });
  assert.equal(asReminders.length, 0);
  assert.equal(remainingEvents.length, 1);

  const { reminders: pings } = reminderSpecsFromEvents(taskPingEvents([task]), { timeZone: IL, todayName: 'Sunday' });
  assert.equal(pings.length, 1);
  assert.equal(pings[0].frequency, 'weekly');
  assert.deepEqual(pings[0].daysOfWeek, [0]);
  assert.equal(pings[0].time, '11:00');

  const prepared = prepareParsedEvent({ ...task, isReminder: true }, { todayName: 'Sunday', locationId: 'jerusalem' });
  assert.equal(prepared.isTask, true);
  assert.equal(prepared.isReminder, false);
});

test('the preview confirm keeps the task flag', () => {
  const [ev] = sanitizeConfirmedEvents([{ title: 'שניים מקרא', day: 'Sunday', startTime: '11:00', endTime: '11:15', recurrence: 'weekly', isTask: true, isReminder: true }]);
  assert.equal(ev.isTask, true);
  assert.equal(ev.isReminder, false);
});

test('scheduleHasTask finds the task by title', () => {
  const schedule = { Sunday: [{ title: 'שניים מקרא ואחד תרגום', isTask: true }, { title: 'יעל' }], Monday: [] };
  assert.ok(scheduleHasTask(schedule, 'שניים מקרא ואחד תרגום'));
  assert.ok(!scheduleHasTask(schedule, 'יעל'));
  assert.ok(!scheduleHasTask({}, 'x'));
});

function store(rows) {
  const matches = (row, q) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$lte' in v) return row[k] && row[k] <= v.$lte;
    if (v instanceof Date) return row[k] && row[k].getTime() === v.getTime();
    return String(row[k]) === String(v);
  });
  const chain = list => ({ sort: () => chain(list), limit: () => chain(list), lean: async () => list.map(r => ({ ...r })) });
  return {
    rows,
    find: q => chain(rows.filter(r => matches(r, q))),
    findOneAndUpdate: async (q, u) => { const row = rows.find(r => matches(r, q)); if (!row) return null; Object.assign(row, u.$set); return { ...row }; },
    updateOne: async (q, u) => { const row = rows.find(r => matches(r, q)); if (row) Object.assign(row, u.$set); return {}; },
    deleteOne: async () => ({})
  };
}

test('a task ping opens today, and stops once the task is deleted', async () => {
  const due = new Date('2026-11-15T09:00:00Z'); // Sunday 11:00 in Israel
  const Reminder = store([
    { _id: 't1', userId: 'u1', kind: 'task', title: 'שניים מקרא', time: '11:00', frequency: 'weekly', daysOfWeek: [0], timezone: IL, active: true, nextFireAt: due },
    { _id: 't2', userId: 'u1', kind: 'task', title: 'נמחקה', time: '11:00', frequency: 'weekly', daysOfWeek: [0], timezone: IL, active: true, nextFireAt: due }
  ]);
  const PushSubscription = store([{ _id: 's1', userId: 'u1' }]);
  const sent = [];
  const push = { send: async (sub, payload) => { sent.push(payload); return { ok: true }; } };
  const d = createDispatcher({
    Reminder, PushSubscription, push,
    taskExists: async r => r.title === 'שניים מקרא',
    now: () => new Date('2026-11-15T09:00:10Z'),
    logger: { warn() {}, error() {} }
  });
  const result = await d.tick();
  assert.equal(result.fired, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, '/');
  assert.equal(Reminder.rows.find(r => r._id === 't2').active, false);
});
