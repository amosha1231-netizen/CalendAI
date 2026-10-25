// Shapes AI-parsed events for the schedule, and validates the events a client
// confirms from the chatbot's preview card (see /api/parse-schedule/confirm).

const PARSE_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PARSE_RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'yearly', 'forever'];
const MAX_CONFIRMED_EVENTS = 20;

/**
 * Turn one AI-parsed event into the shape stored in the schedule: resolves
 * "Today", the recurrence default, event type, duration and endTime.
 */
function prepareParsedEvent(event, { todayName, recurrence, locationId, eventType, duration }) {
  let day = event.day || todayName;
  if (day === 'Today') {
    day = todayName;
  }

  // No recurrence from the AI or the client means a one-off event, unless
  // the AI flagged it as recurring.
  let eventRecurrence = event.recurrence || recurrence || (event.isRecurring ? 'weekly' : 'once');
  if (event.isSleep) {
    eventRecurrence = 'daily';
  }

  // Auto-set createdMonth for yearly events so they only repeat in the correct month
  const createdMonth = new Date().getMonth();

  // If eventType was specified from the frontend, override duration accordingly
  const effectiveEventType = eventType || event.eventType || 'activity';
  const effectiveDuration = effectiveEventType === 'notification' ? 0 : (duration || event.duration || 60);

  const eventWithRecurrence = {
    ...event,
    day: day,
    recurrence: eventRecurrence,
    location: locationId,
    eventType: effectiveEventType,
    duration: effectiveDuration,
    ...(eventRecurrence === 'yearly' && { createdMonth })
  };

  // For notification type: override endTime to be 0 duration (same as startTime)
  if (effectiveEventType === 'notification') {
    eventWithRecurrence.endTime = eventWithRecurrence.startTime;
    eventWithRecurrence.isReminder = true;
  // For activity type: if a duration was specified from frontend, recalculate endTime
  } else if (duration && duration > 0 && eventWithRecurrence.startTime) {
    const startMatch = eventWithRecurrence.startTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (startMatch) {
      let sh = parseInt(startMatch[1], 10);
      const sm = parseInt(startMatch[2], 10);
      if (startMatch[3].toUpperCase() === 'PM' && sh !== 12) sh += 12;
      if (startMatch[3].toUpperCase() === 'AM' && sh === 12) sh = 0;
      const totalStartMinutes = sh * 60 + sm;
      const totalEndMinutes = totalStartMinutes + duration;
      const eh = Math.floor((totalEndMinutes % 1440) / 60);
      const em = totalEndMinutes % 60;
      const eAmpm = eh >= 12 ? 'PM' : 'AM';
      const eDisplayH = eh > 12 ? eh - 12 : (eh === 0 ? 12 : eh);
      eventWithRecurrence.endTime = `${String(eDisplayH).padStart(2, '0')}:${String(em).padStart(2, '0')} ${eAmpm}`;
    }
  }

  return eventWithRecurrence;
}

const CONFIRM_TIME_RE = /^\d{1,2}:\d{2}(\s*[AP]M)?$/i;

/**
 * Validate the events a client sends back from the preview card. Only the
 * fields the parser produces are kept; returns null when the list is invalid.
 */
function sanitizeConfirmedEvents(events) {
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_CONFIRMED_EVENTS) return null;
  const clean = [];
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') return null;
    const title = typeof ev.title === 'string' ? ev.title.trim().slice(0, 200) : '';
    if (!title) return null;
    if (!PARSE_DAY_NAMES.includes(ev.day) && ev.day !== 'Today') return null;
    if (typeof ev.startTime !== 'string' || !CONFIRM_TIME_RE.test(ev.startTime.trim())) return null;
    if (ev.endTime != null && (typeof ev.endTime !== 'string' || !CONFIRM_TIME_RE.test(ev.endTime.trim()))) return null;
    const recurrenceValue = PARSE_RECURRENCES.includes(ev.recurrence) ? ev.recurrence : 'once';

    const out = {
      title,
      summary: title,
      day: ev.day,
      startTime: ev.startTime.trim(),
      endTime: (ev.endTime || ev.startTime).trim(),
      recurrence: recurrenceValue,
      isRecurring: recurrenceValue !== 'once',
      isReminder: ev.isReminder === true,
      isSleep: ev.isSleep === true
    };
    if (typeof ev.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ev.targetDate)) out.targetDate = ev.targetDate.slice(0, 10);
    if (typeof ev.emoji === 'string') out.emoji = ev.emoji.slice(0, 8);
    if (typeof ev.description === 'string') out.description = ev.description.slice(0, 1000);
    if (ev.hasAdvice === true && typeof ev.aiAdvice === 'string') {
      out.hasAdvice = true;
      out.aiAdvice = ev.aiAdvice.slice(0, 1000);
    }
    if (ev.repeat && typeof ev.repeat === 'object') {
      const repeat = {};
      if (PARSE_RECURRENCES.includes(ev.repeat.frequency)) repeat.frequency = ev.repeat.frequency;
      if (Array.isArray(ev.repeat.daysOfWeek)) {
        repeat.daysOfWeek = ev.repeat.daysOfWeek
          .filter(d => PARSE_DAY_NAMES.includes(d) || (Number.isInteger(d) && d >= 0 && d <= 6))
          .slice(0, 7);
      }
      if (Number.isInteger(ev.repeat.dayOfMonth) && ev.repeat.dayOfMonth >= 1 && ev.repeat.dayOfMonth <= 31) repeat.dayOfMonth = ev.repeat.dayOfMonth;
      if (Object.keys(repeat).length) out.repeat = repeat;
    }
    clean.push(out);
  }
  return clean;
}

module.exports = { prepareParsedEvent, sanitizeConfirmedEvents, MAX_CONFIRMED_EVENTS };
