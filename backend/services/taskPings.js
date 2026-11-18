// Tasks: things to do at a set time and then mark done / not done.
//
// A task is a calendar event (so the day view shows its done / postponed /
// not-done circle, see TaskCheckin) that ALSO pings at its start time through
// a Reminder of kind 'task'. Plain reminders are pings only; plain events are
// calendar blocks only.

// "משימה", "מטלה", "task", "to-do", or asking to mark it done.
const TASK_TEXT_RE = /(משימ|מטל[הות]|סמן\s*(?:אם\s*)?(?:בוצע|ביצעתי|עשיתי|וי)|\btasks?\b|\bto-?dos?\b|mark(?:\s+it)?\s+(?:as\s+)?done|check\s+(?:it\s+)?off)/i;

function isTaskText(text) {
  return typeof text === 'string' && TASK_TEXT_RE.test(text);
}

/**
 * Make sure a request that asked for a task comes back as one. The AI is told
 * to set isTask itself; this catches the times it answers with a plain event
 * or a bare reminder instead. Sleep events are never tasks.
 */
function applyTaskIntent(events, text) {
  if (!Array.isArray(events)) return [];
  const textSaysTask = isTaskText(text);
  return events.map(ev => {
    if (!ev || typeof ev !== 'object' || ev.isSleep === true) return ev;
    if (ev.isTask === true || textSaysTask) return { ...ev, isTask: true, isReminder: false };
    return ev;
  });
}

/** The ping copies of the task events, in the shape reminderSpecsFromEvents takes. */
function taskPingEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter(ev => ev && ev.isTask === true)
    .map(ev => ({ ...ev, isReminder: true }));
}

/** True while the user's schedule still holds a task with this title. */
function scheduleHasTask(schedule, title) {
  if (!schedule || typeof schedule !== 'object') return false;
  const wanted = String(title || '').trim().toLowerCase();
  return Object.values(schedule).some(dayEvents => Array.isArray(dayEvents) && dayEvents.some(ev =>
    ev && ev.isTask === true && String(ev.title || ev.summary || '').trim().toLowerCase() === wanted));
}

module.exports = { isTaskText, applyTaskIntent, taskPingEvents, scheduleHasTask };
