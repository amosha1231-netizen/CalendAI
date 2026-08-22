/**
 * Shabbat Helper — checks if the current time according to Israel timezone
 * falls within Shabbat.
 *
 * Uses accurate Asia/Jerusalem timezone detection and rough sunset estimates
 * by season (summer/winter). For the most precise times, the frontend should
 * call GET /api/shabbat/status from the backend (which uses SunCalc).
 *
 * Shabbat start (Friday): 20 minutes before sunset
 *   - Summer (April-Sep): ~16:30 → 16:10
 *   - Winter (Oct-March): ~15:15 → 14:55
 *
 * Shabbat end (Saturday): 42 minutes after sunset (Rabbeinu Tam / Havdalah)
 *   - Summer (April-Sep): ~17:25 → 18:07
 *   - Winter (Oct-March): ~15:10 → 15:52
 */

/**
 * Check if the current time in Asia/Jerusalem is within Shabbat.
 * @returns {boolean} True if currently Shabbat.
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

  // Determine if summer (April-September) or winter
  const month = now.getMonth(); // 0=Jan, 11=Dec
  const isSummer = month >= 3 && month <= 8; // April through September

  // Friday starting times (candle lighting, 20 min before sunset)
  const fridayStart = isSummer ? 16.1 : 14.9; // ~16:10 summer, ~14:55 winter

  // Saturday ending times (havdalah, 42 min after sunset)
  const saturdayEnd = isSummer ? 18.1 : 15.9; // ~18:07 summer, ~15:52 winter

  // Friday: from candle-lighting onward → Shabbat
  if (weekday === 'Fri' && timeDecimal >= fridayStart) {
    return true;
  }

  // Saturday: until havdalah → Shabbat
  if (weekday === 'Sat' && timeDecimal <= saturdayEnd) {
    return true;
  }

  return false;
}

/**
 * Get the current Shabbat status with detailed times.
 * Uses approximate seasonal times for client-side check.
 * @returns {{ isShabbat: boolean, shabbatStart: string, shabbatEnd: string, currentTime: string }}
 */
export function getShabbatStatus() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric'
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

  const month = now.getMonth();
  const isSummer = month >= 3 && month <= 8;

  const fridayStart = isSummer ? 16.1 : 14.9;
  const saturdayEnd = isSummer ? 18.1 : 15.9;

  const fridayStartH = Math.floor(fridayStart);
  const fridayStartM = Math.round((fridayStart - fridayStartH) * 60);
  const saturdayEndH = Math.floor(saturdayEnd);
  const saturdayEndM = Math.round((saturdayEnd - saturdayEndH) * 60);

  let isShabbat = false;
  if (weekday === 'Fri') {
    isShabbat = (hour + minute / 60) >= fridayStart;
  } else if (weekday === 'Sat') {
    isShabbat = (hour + minute / 60) <= saturdayEnd;
  }

  return {
    isShabbat,
    shabbatStart: `${String(fridayStartH).padStart(2, '0')}:${String(fridayStartM).padStart(2, '0')}`,
    shabbatEnd: `${String(saturdayEndH).padStart(2, '0')}:${String(saturdayEndM).padStart(2, '0')}`,
    currentTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    timezone: 'Asia/Jerusalem'
  };
}