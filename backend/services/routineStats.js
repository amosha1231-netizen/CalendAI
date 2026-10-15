/**
 * Routine Stats — pure helpers for routines, check-ins and streaks.
 *
 * Dates are 'YYYY-MM-DD' strings in the user's own time zone, so "today"
 * means today where the user is. Nothing here touches the database.
 */

const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

/** 'YYYY-MM-DD' of `date` in `timeZone`. */
function dateKeyInZone(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch (e) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
function dayOfWeek(key) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 864e5);
}

function idOf(value) {
  return value == null ? '' : String(value._id || value);
}

/** The participant entry of `userId` in a routine (owner included). */
function participantFor(routine, userId) {
  const uid = idOf(userId);
  return (routine.participants || []).find(p => idOf(p.userId) === uid) || null;
}

/**
 * When and on which weekdays the routine applies to this user:
 * from the day they started (created or joined) to the last day of a challenge.
 */
function scheduleFor(routine, userId) {
  const p = participantFor(routine, userId);
  const startDate = (p && p.startDate) || dateKeyInZone(routine.createdAt ? new Date(routine.createdAt) : new Date());
  const endDate = routine.kind === 'challenge' && routine.challengeDays
    ? addDays(startDate, routine.challengeDays - 1)
    : null;
  const days = Array.isArray(routine.days) ? routine.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  return { startDate, endDate, days };
}

function isScheduledOn(schedule, key) {
  if (key < schedule.startDate) return false;
  if (schedule.endDate && key > schedule.endDate) return false;
  return schedule.days.length === 0 || schedule.days.includes(dayOfWeek(key));
}

function stepIds(routine) {
  return (routine.steps || []).map(s => idOf(s._id));
}

/** Steps of the routine done in a check-in (ignores steps since removed). */
function doneCount(routine, checkin) {
  if (!checkin) return 0;
  const done = new Set((checkin.doneStepIds || []).map(String));
  return stepIds(routine).filter(id => done.has(id)).length;
}

function isComplete(routine, checkin) {
  const total = (routine.steps || []).length;
  return total > 0 && doneCount(routine, checkin) === total;
}

/**
 * Streaks over days ordered oldest → newest, each 'done' | 'missed' | 'off'.
 * 'off' days (nothing scheduled) neither count nor break a streak. An
 * unfinished today does not break the current streak yet.
 */
function computeStreaks(statuses, { todayPending = false } = {}) {
  let best = 0;
  let run = 0;
  for (const s of statuses) {
    if (s === 'done') { run += 1; best = Math.max(best, run); }
    else if (s === 'missed') run = 0;
  }
  let current = 0;
  for (let i = statuses.length - 1; i >= 0; i--) {
    const s = statuses[i];
    if (i === statuses.length - 1 && todayPending && s === 'missed') continue;
    if (s === 'off') continue;
    if (s === 'done') current += 1;
    else break;
  }
  return { current, best };
}

function checkinMap(checkins) {
  const map = new Map();
  for (const c of checkins || []) map.set(`${idOf(c.routineId)}|${c.date}`, c);
  return map;
}

/** Progress of one user on one routine up to `today`. */
function routineProgress(routine, userId, checkins, today, lookback = 120) {
  const schedule = scheduleFor(routine, userId);
  const map = checkinMap(checkins);
  const rid = idOf(routine._id);
  const from = schedule.startDate > addDays(today, -(lookback - 1)) ? schedule.startDate : addDays(today, -(lookback - 1));
  const last = schedule.endDate && schedule.endDate < today ? schedule.endDate : today;

  const statuses = [];
  let scheduledDays = 0;
  let completedDays = 0;
  for (let key = from; key <= last; key = addDays(key, 1)) {
    if (!isScheduledOn(schedule, key)) { statuses.push('off'); continue; }
    scheduledDays += 1;
    const done = isComplete(routine, map.get(`${rid}|${key}`));
    if (done) completedDays += 1;
    statuses.push(done ? 'done' : 'missed');
  }
  const todayPending = last === today && statuses[statuses.length - 1] === 'missed';
  // Today is not over: an unfinished today doesn't count against the rate.
  const countedDays = todayPending ? scheduledDays - 1 : scheduledDays;
  const streaks = computeStreaks(statuses, { todayPending });
  const todayCheckin = map.get(`${rid}|${today}`);

  const result = {
    routineId: rid,
    scheduledToday: isScheduledOn(schedule, today),
    todayDone: doneCount(routine, todayCheckin),
    todayTotal: (routine.steps || []).length,
    scheduledDays: countedDays,
    completedDays,
    rate: countedDays > 0 ? Math.round((Math.min(completedDays, countedDays) / countedDays) * 100) : null,
    currentStreak: streaks.current,
    bestStreak: streaks.best,
    startDate: schedule.startDate,
    endDate: schedule.endDate
  };
  if (routine.kind === 'challenge' && routine.challengeDays) {
    const dayNumber = Math.min(routine.challengeDays, Math.max(0, daysBetween(schedule.startDate, today) + 1));
    result.challenge = {
      day: dayNumber,
      totalDays: routine.challengeDays,
      finished: !!schedule.endDate && today > schedule.endDate
    };
  }
  return result;
}

/**
 * Overall "how am I doing": per-day completion for the last `days` days,
 * overall streak of days on which every scheduled routine was completed,
 * and progress per routine.
 */
function computeStats({ routines, checkins, userId, today, days = 30 }) {
  const map = checkinMap(checkins);
  const schedules = routines.map(r => ({ routine: r, rid: idOf(r._id), schedule: scheduleFor(r, userId) }));
  const lookback = Math.max(days, 120);
  const from = addDays(today, -(lookback - 1));
  const windowStart = addDays(today, -(days - 1));

  const daily = [];
  const statuses = [];
  for (let key = from; key <= today; key = addDays(key, 1)) {
    let stepsTotal = 0;
    let stepsDone = 0;
    let scheduled = 0;
    let completed = 0;
    for (const { routine, rid, schedule } of schedules) {
      if (!isScheduledOn(schedule, key) || !(routine.steps || []).length) continue;
      const checkin = map.get(`${rid}|${key}`);
      scheduled += 1;
      stepsTotal += routine.steps.length;
      stepsDone += doneCount(routine, checkin);
      if (isComplete(routine, checkin)) completed += 1;
    }
    statuses.push(scheduled === 0 ? 'off' : completed === scheduled ? 'done' : 'missed');
    if (key >= windowStart) {
      daily.push({
        date: key,
        scheduled,
        completed,
        stepsTotal,
        stepsDone,
        percent: stepsTotal > 0 ? Math.round((stepsDone / stepsTotal) * 100) : null
      });
    }
  }

  const todayPending = statuses[statuses.length - 1] === 'missed';
  const streaks = computeStreaks(statuses, { todayPending });
  const pastDays = daily.filter(d => d.percent !== null && (d.date !== today || !todayPending));
  const average = pastDays.length
    ? Math.round(pastDays.reduce((sum, d) => sum + d.percent, 0) / pastDays.length)
    : null;
  const todayEntry = daily[daily.length - 1];

  return {
    today,
    days,
    daily,
    averagePercent: average,
    perfectDays: daily.filter(d => d.scheduled > 0 && d.completed === d.scheduled).length,
    todayPercent: todayEntry ? todayEntry.percent : null,
    currentStreak: streaks.current,
    bestStreak: streaks.best,
    routines: routines.map(r => ({
      title: r.title,
      emoji: r.emoji,
      kind: r.kind,
      ...routineProgress(r, userId, checkins, today, lookback)
    }))
  };
}

module.exports = {
  DEFAULT_TIMEZONE,
  dateKeyInZone,
  isDateKey,
  addDays,
  dayOfWeek,
  daysBetween,
  participantFor,
  scheduleFor,
  isScheduledOn,
  doneCount,
  isComplete,
  computeStreaks,
  routineProgress,
  computeStats
};
