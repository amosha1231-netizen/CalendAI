/**
 * Time display helpers. Times are stored as "hh:mm AM/PM" strings; Hebrew,
 * French and Spanish users read them on a 24-hour clock, English users on 12.
 */

export function uses12HourClock(lang) {
  return lang === 'en';
}

export function formatClock(hour, minute, lang) {
  const mm = String(minute).padStart(2, '0');
  if (!uses12HourClock(lang)) return `${String(hour).padStart(2, '0')}:${mm}`;
  return `${String(hour % 12 || 12).padStart(2, '0')}:${mm} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** "07:00 PM" or "19:00" → { hour, minute }, or null. */
export function parseTimeString(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (match[3]) {
    const pm = match[3].toUpperCase() === 'PM';
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  return hour > 23 || minute > 59 ? null : { hour, minute };
}

/** A stored time string shown in the user's clock format. */
export function formatTimeString(value, lang) {
  const parsed = parseTimeString(value);
  return parsed ? formatClock(parsed.hour, parsed.minute, lang) : (value || '');
}
