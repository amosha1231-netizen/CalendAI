// Lays out one day's events in hour rows for the day timeline (DayView).
//
// Each event is drawn once, in the row of the hour it starts in. An event of
// two hours or more is "long": while it is folded, the hour rows it covers
// after its first one are hidden, and anything that starts inside those hours
// is shown nested inside the long event's card. Unfolded, those hours come
// back as normal rows.

export const LONG_EVENT_MINUTES = 120;
const DAY_MINUTES = 24 * 60;

// { start, end, duration } in minutes from midnight, or null without a start.
// An event that ends at or before its start runs past midnight: on this day it
// ends at 24:00, but its duration is the real one.
export function eventSpan(event, timeToMinutes) {
  const start = timeToMinutes(event.startTime);
  if (start < 0) return null;
  let end = timeToMinutes(event.endTime);
  if (end < 0) return { start, end: start, duration: 0 };
  let duration = end - start;
  if (end <= start) {
    duration = end + DAY_MINUTES - start;
    end = DAY_MINUTES;
  }
  return { start, end, duration };
}

export function layoutDay({ events, reminders = [], hours, timeToMinutes, reminderHour, keyOf, expandedKeys = new Set(), longMinutes = LONG_EVENT_MINUTES }) {
  const items = [];
  for (const event of events) {
    const span = eventSpan(event, timeToMinutes);
    if (span) items.push({ event, span, hour: Math.floor(span.start / 60) });
  }
  items.sort((a, b) => a.span.start - b.span.start);

  // hour -> the folded long event that hides it
  const hiddenBy = new Map();
  for (const item of items) {
    if (item.span.duration < longMinutes) continue;
    item.isLong = true;
    item.expanded = expandedKeys.has(keyOf(item.event));
    item.children = [];
    item.childReminders = [];
    // A long event that starts inside another folded one is nested there, so
    // it does not hide hours of its own.
    if (item.expanded || hiddenBy.has(item.hour)) continue;
    const lastHour = Math.ceil(item.span.end / 60) - 1;
    for (let h = item.hour + 1; h <= lastHour; h++) {
      if (!hiddenBy.has(h)) hiddenBy.set(h, item);
    }
  }

  const rows = hours.filter(h => !hiddenBy.has(h)).map(hour => ({ hour, items: [], reminders: [] }));
  const rowOf = new Map(rows.map(r => [r.hour, r]));

  for (const item of items) {
    const owner = hiddenBy.get(item.hour);
    if (owner) owner.children.push(item);
    else rowOf.get(item.hour)?.items.push(item);
  }
  for (const reminder of reminders) {
    const hour = reminderHour(reminder);
    const owner = hiddenBy.get(hour);
    if (owner) owner.childReminders.push(reminder);
    else rowOf.get(hour)?.reminders.push(reminder);
  }
  return rows;
}

// "7 שעות", "1.5 שעות", "7h"
export function formatDuration(minutes, lang) {
  const hours = Math.round((minutes / 60) * 2) / 2;
  if (lang === 'he') return hours === 1 ? 'שעה' : `${hours} שעות`;
  return `${hours}h`;
}
