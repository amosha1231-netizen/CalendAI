const assert = require('node:assert/strict');
const { test } = require('node:test');
const stats = require('../services/routineStats');

const USER = 'u1';
const steps = [{ _id: 's1', title: 'Brush teeth' }, { _id: 's2', title: 'Workout' }];

function routine(extra = {}) {
  return {
    _id: 'r1', title: 'Morning', steps, days: [], kind: 'routine',
    participants: [{ userId: USER, startDate: '2026-10-01' }], ...extra
  };
}
const full = date => ({ routineId: 'r1', date, doneStepIds: ['s1', 's2'] });

test('dateKeyInZone uses the user zone, not the server zone', () => {
  const instant = new Date('2026-10-14T23:30:00Z');
  assert.equal(stats.dateKeyInZone(instant, 'Asia/Jerusalem'), '2026-10-15');
  assert.equal(stats.dateKeyInZone(instant, 'America/New_York'), '2026-10-14');
});

test('a step removed from the routine no longer counts toward completion', () => {
  const r = routine();
  assert.equal(stats.isComplete(r, { doneStepIds: ['s1', 's2', 'old'] }), true);
  assert.equal(stats.isComplete(r, { doneStepIds: ['s1', 'old'] }), false);
  assert.equal(stats.doneCount(r, { doneStepIds: ['s1', 'old'] }), 1);
});

test('streaks: off days do not break, an unfinished today does not break', () => {
  assert.deepEqual(stats.computeStreaks(['done', 'missed', 'done', 'off', 'done']), { current: 2, best: 2 });
  assert.deepEqual(stats.computeStreaks(['done', 'done', 'missed'], { todayPending: true }), { current: 2, best: 2 });
  assert.deepEqual(stats.computeStreaks(['done', 'done', 'missed']), { current: 0, best: 2 });
});

test('routine progress counts only scheduled weekdays since the user started', () => {
  // 2026-10-01 is a Thursday. Schedule Sun–Thu (no Fri/Sat).
  const r = routine({ days: [0, 1, 2, 3, 4] });
  const checkins = ['2026-10-01', '2026-10-04', '2026-10-05'].map(full);
  const p = stats.routineProgress(r, USER, checkins, '2026-10-06');
  // Scheduled: 10-01 (Thu), 10-04 (Sun), 10-05 (Mon), 10-06 today (Tue, pending)
  assert.equal(p.scheduledDays, 3);
  assert.equal(p.completedDays, 3);
  assert.equal(p.rate, 100);
  assert.equal(p.currentStreak, 3);
  assert.equal(p.todayDone, 0);
  assert.equal(p.scheduledToday, true);
});

test('a challenge ends after its number of days and reports the day number', () => {
  const r = routine({ kind: 'challenge', challengeDays: 3 });
  const p = stats.routineProgress(r, USER, [full('2026-10-01'), full('2026-10-02')], '2026-10-02');
  assert.deepEqual(p.challenge, { day: 2, totalDays: 3, finished: false });
  const later = stats.routineProgress(r, USER, [full('2026-10-01'), full('2026-10-02')], '2026-10-10');
  assert.equal(later.endDate, '2026-10-03');
  assert.equal(later.scheduledDays, 3);
  assert.equal(later.completedDays, 2);
  assert.equal(later.challenge.finished, true);
  assert.equal(later.scheduledToday, false);
});

test('each participant counts from the day they joined', () => {
  const r = routine({ participants: [{ userId: USER, startDate: '2026-10-01' }, { userId: 'u2', startDate: '2026-10-05' }] });
  const p = stats.routineProgress(r, 'u2', [full('2026-10-05')], '2026-10-06');
  assert.equal(p.startDate, '2026-10-05');
  assert.equal(p.scheduledDays, 1); // today still pending
  assert.equal(p.completedDays, 1);
});

test('overall stats: daily percent, average and perfect-day streak', () => {
  const r = routine();
  const checkins = [full('2026-10-04'), full('2026-10-05'), { routineId: 'r1', date: '2026-10-06', doneStepIds: ['s1'] }];
  const s = stats.computeStats({ routines: [r], checkins, userId: USER, today: '2026-10-06', days: 7 });
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily[6].date, '2026-10-06');
  assert.equal(s.todayPercent, 50);
  assert.equal(s.currentStreak, 2);
  assert.equal(s.perfectDays, 2);
  // 7-day window: 09-30 (off, before start), 10-01..10-03 0%, 10-04 & 10-05 100%; today excluded while pending.
  assert.equal(s.averagePercent, 40);
  assert.equal(s.daily[0].percent, null);
});
