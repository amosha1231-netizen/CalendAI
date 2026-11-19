// Tasks: things to do at a set time and then mark done / not done.
//
// A task is a calendar event (so the day view shows its done / postponed /
// not-done circle, see TaskCheckin) that ALSO pings at its start time through
// a Reminder of kind 'task'. Plain events are calendar blocks only, and they are
// the default: an item becomes a task only when the user asks for one.

// "משימה", "מטלה", "task", "to-do", or asking to mark it done.
const TASK_TEXT_RE = /(משימ|מטל[הות]|סמן\s*(?:אם\s*)?(?:בוצע|ביצעתי|עשיתי|וי)|\btasks?\b|\bto-?dos?\b|mark(?:\s+it)?\s+(?:as\s+)?done|check\s+(?:it\s+)?off)/i;

function isTaskText(text) {
  return typeof text === 'string' && TASK_TEXT_RE.test(text);
}

// "תזכיר לי", "תזכורת", "remind me": the user wants a ping, so it is a task too.
const REMIND_TEXT_RE = /(תזכיר|תזכירי|להזכיר|תזכורת|\bremind(?:er)?\b)/i;

/** True when the text asks for a task or a reminder (both become tasks). */
function wantsTask(text) {
  return isTaskText(text) || (typeof text === 'string' && REMIND_TEXT_RE.test(text));
}

// Clause breaks inside one request: commas, full stops, new lines, "ואז", "and then".
const CLAUSE_SPLIT_RE = /[,،;.\n]+|\s+(?:ואז|ואחר כך|אחרי זה|and then|then)\s+/i;

function titleWords(ev) {
  return String(ev.summary || ev.title || '')
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(w => w.length >= 2);
}

/** The part of the request this event came from, or null when it can't be told apart. */
function clauseFor(ev, clauses) {
  const words = titleWords(ev);
  if (!words.length) return null;
  const hits = clauses.filter(c => words.some(w => c.toLowerCase().includes(w)));
  return hits.length === 1 ? hits[0] : null;
}

/** wantsTask, ignoring the items' own titles ("מטלה עם חברים" is a name, not a request). */
function wantsTaskBesidesTitles(text, items) {
  if (typeof text !== 'string') return false;
  let rest = text;
  for (const ev of items) {
    const title = String((ev && (ev.summary || ev.title)) || '').trim();
    if (title) rest = rest.split(title).join(' ');
  }
  return wantsTask(rest);
}

function asTask(ev) {
  return { ...ev, isTask: true, isReminder: false };
}

function asPlainEvent(ev) {
  const out = { ...ev };
  delete out.isTask;
  return out;
}

/**
 * Decide, item by item, what is a task and what is a plain event.
 *
 * A plain calendar event is the default: no done circle and no ping. An item is
 * a task only when the user asked for one: "משימה" / "מטלה" / "task", "תזכיר לי"
 * / "remind me", or asking to mark it done. When one request holds several
 * items ("לימוד ב-12, מטלה עם חברים ב-1, משימה להתקשר לנועה ב-3"), only the item
 * whose own part of the sentence says so becomes a task, not all of them.
 * Sleep events and events with a "N minutes before" alert are never tasks.
 */
function applyTaskIntent(events, text) {
  if (!Array.isArray(events)) return [];
  const real = events.filter(ev => ev && typeof ev === 'object' && ev.isSleep !== true);
  const clauses = typeof text === 'string' ? text.split(CLAUSE_SPLIT_RE).map(c => c.trim()).filter(Boolean) : [];

  return events.map(ev => {
    if (!ev || typeof ev !== 'object' || ev.isSleep === true) return ev;
    if (Number(ev.reminderMinutesBefore) > 0) return ev.isTask ? asPlainEvent(ev) : ev;
    const aiSaysTask = ev.isTask === true || ev.isReminder === true;
    if (!wantsTaskBesidesTitles(text, real)) return ev.isTask ? asPlainEvent(ev) : ev;

    if (real.length <= 1) return asTask(ev);

    // Several items: look at this item's own part of the sentence.
    const clause = clauses.length > 1 ? clauseFor(ev, clauses) : null;
    if (clause) return wantsTaskBesidesTitles(clause, real) ? asTask(ev) : asPlainEvent({ ...ev, isReminder: false });
    return aiSaysTask ? asTask(ev) : asPlainEvent(ev);
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

module.exports = { isTaskText, wantsTask, applyTaskIntent, taskPingEvents, scheduleHasTask };
