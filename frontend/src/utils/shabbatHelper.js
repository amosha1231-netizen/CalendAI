/**
 * Shabbat Helper — checks if the current time according to Israel timezone
 * falls within Shabbat (Friday 16:30 to Saturday 21:15).
 */
export function isShabbatNow() {
  const now = new Date();

  // Format parts according to Asia/Jerusalem timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric'
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value; // Fri, Sat, Sun...
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const timeDecimal = hour + minute / 60;

  // Friday starting 16:30 (approx candle-lighting)
  if (weekday === 'Fri' && timeDecimal >= 16.5) {
    return true;
  }

  // Saturday until 21:15 (approx havdalah)
  if (weekday === 'Sat' && timeDecimal <= 21.25) {
    return true;
  }

  return false;
}