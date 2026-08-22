/**
 * Shabbat Service — Accurate Shabbat time calculation for Israel.
 *
 * Uses SunCalc to compute precise sunset/sunrise times for Jerusalem
 * and determines whether the current time (Asia/Jerusalem) falls
 * within Shabbat.
 *
 * Shabbat start:   Friday, 20 minutes before sunset (candle-lighting)
 * Shabbat end:     Saturday, 42 minutes after sunset (Rabbeinu Tam / standard Israeli havdalah)
 *
 * If SunCalc fails to produce valid times (edge latitudes, API errors),
 * safe fallback defaults are used.
 */

const SunCalc = require('suncalc');

// Jerusalem coordinates
const JERUSALEM_LAT = 31.7683;
const JERUSALEM_LNG = 35.2137;

// Time offsets in minutes
const CANDLE_LIGHTING_OFFSET = -20;   // 20 minutes BEFORE sunset
const HAVDALAH_OFFSET = 42;           // 42 minutes AFTER sunset (Rabbeinu Tam)

// Fallback hardcoded times (used only if SunCalc fails)
const FALLBACK_SUMMER_SUNSET_FRI = 17 * 60 + 20;  // 17:20 summer Friday
const FALLBACK_SUMMER_SUNSET_SAT = 17 * 60 + 15;  // 17:15 summer Saturday
const FALLBACK_WINTER_SUNSET_FRI = 15 * 60 + 45;  // 15:45 winter Friday
const FALLBACK_WINTER_SUNSET_SAT = 15 * 60 + 40;  // 15:40 winter Saturday

/**
 * Get the current date/time in Asia/Jerusalem timezone.
 * @returns {{ date: Date, dayOfWeek: number, hours: number, minutes: number, totalMinutes: number }}
 */
function getJerusalemNow() {
  const now = new Date();

  // Use Intl.DateTimeFormat to get day + time in Israel timezone
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short'
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });

  const dayStr = dayFormatter.format(now);
  const timeStr = timeFormatter.format(now);

  // Map weekday short name to number (0=Sun, 1=Mon, ..., 5=Fri, 6=Sat)
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[dayStr] !== undefined ? dayMap[dayStr] : now.getDay();

  // Parse hours:minutes from the time string
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const totalMinutes = hours * 60 + minutes;

  return { date: now, dayOfWeek, hours, minutes, totalMinutes };
}

/**
 * Get sunset time for a given date in Jerusalem.
 * @param {Date} date
 * @returns {{ sunset: Date | null, sunrise: Date | null }}
 */
function getSunTimes(date) {
  try {
    const times = SunCalc.getTimes(date, JERUSALEM_LAT, JERUSALEM_LNG);
    return {
      sunset: times.sunset || null,
      sunrise: times.sunrise || null
    };
  } catch (err) {
    console.error('[ShabbatService] SunCalc error:', err.message);
    return { sunset: null, sunrise: null };
  }
}

/**
 * Get sunset time in minutes since midnight (Asia/Jerusalem timezone).
 * @param {Date} sunsetDate
 * @returns {number | null} Minutes since midnight
 */
function getSunsetMinutes(sunsetDate) {
  if (!sunsetDate) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const timeStr = formatter.format(sunsetDate);
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } catch {
    return null;
  }
}

/**
 * Determine if summer time (approximately April-September) or winter time.
 * In Israel: summer time is ~March end to October end.
 * This is a rough heuristic used ONLY for SunCalc fallback.
 * @param {number} month - 0-11
 * @returns {boolean}
 */
function isSummer(month) {
  return month >= 3 && month <= 8; // April through September
}

/**
 * Get the Shabbat start time (Friday candle-lighting) in minutes since midnight.
 * @param {Date} now - Current date
 * @returns {number | null} Minutes since midnight
 */
function getShabbatStartMinutes(now) {
  // Find the upcoming/last Friday
  const friday = new Date(now);
  const dayOfWeek = now.getDay();
  // Days until previous Friday (if today is Friday, use today)
  const daysToFriday = dayOfWeek >= 5 ? (dayOfWeek - 5) : (dayOfWeek + 2);
  friday.setDate(now.getDate() - daysToFriday);
  friday.setHours(12, 0, 0, 0); // Midday Friday to get correct sunset

  const { sunset } = getSunTimes(friday);
  if (sunset) {
    const sunsetMin = getSunsetMinutes(sunset);
    if (sunsetMin !== null) {
      return sunsetMin + CANDLE_LIGHTING_OFFSET;
    }
  }

  // Fallback: use hardcoded times
  const month = now.getMonth();
  if (isSummer(month)) {
    return FALLBACK_SUMMER_SUNSET_FRI + CANDLE_LIGHTING_OFFSET;
  }
  return FALLBACK_WINTER_SUNSET_FRI + CANDLE_LIGHTING_OFFSET;
}

/**
 * Get the Shabbat end time (Saturday havdalah) in minutes since midnight.
 * @param {Date} now - Current date
 * @returns {number | null} Minutes since midnight
 */
function getShabbatEndMinutes(now) {
  // Find the upcoming/last Saturday
  const saturday = new Date(now);
  const dayOfWeek = now.getDay();
  // Days until previous Saturday
  const daysToSaturday = dayOfWeek >= 6 ? (dayOfWeek - 6) : (dayOfWeek + 1);
  saturday.setDate(now.getDate() - daysToSaturday);
  saturday.setHours(12, 0, 0, 0); // Midday Saturday to get correct sunset

  const { sunset } = getSunTimes(saturday);
  if (sunset) {
    const sunsetMin = getSunsetMinutes(sunset);
    if (sunsetMin !== null) {
      return sunsetMin + HAVDALAH_OFFSET;
    }
  }

  // Fallback
  const month = now.getMonth();
  if (isSummer(month)) {
    return FALLBACK_SUMMER_SUNSET_SAT + HAVDALAH_OFFSET;
  }
  return FALLBACK_WINTER_SUNSET_SAT + HAVDALAH_OFFSET;
}

/**
 * Check if a given time falls within Shabbat.
 * Uses Asia/Jerusalem timezone for day/week determination.
 * @param {Date} [date] - Date to check. Defaults to now.
 * @returns {{ isShabbat: boolean, details: { shabbatStart: string, shabbatEnd: string, currentTime: string, dayOfWeek: number } }}
 */
function isShabbatTime(date) {
  const jerusalem = getJerusalemNow();
  const { dayOfWeek, totalMinutes, hours, minutes } = jerusalem;

  const shabbatStart = getShabbatStartMinutes(jerusalem.date);
  const shabbatEnd = getShabbatEndMinutes(jerusalem.date);

  const formatTime = (mins) => {
    if (mins === null) return 'N/A';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  let isShabbat = false;

  if (shabbatStart !== null && shabbatEnd !== null) {
    // Friday: from Shabbat start until midnight (24:00)
    if (dayOfWeek === 5 && totalMinutes >= shabbatStart) {
      isShabbat = true;
    }
    // Saturday: from midnight until Shabbat end
    if (dayOfWeek === 6 && totalMinutes < shabbatEnd) {
      isShabbat = true;
    }
  }

  return {
    isShabbat,
    details: {
      shabbatStart: formatTime(shabbatStart),
      shabbatEnd: formatTime(shabbatEnd),
      currentTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      dayOfWeek
    }
  };
}

/**
 * Check if the current time IS Shabbat.
 * @returns {boolean}
 */
function isShabbatNow() {
  return isShabbatTime().isShabbat;
}

/**
 * Check if a given day name / event day is Shabbat/Saturday.
 * @param {string} day - The day name (e.g., "Saturday", "שבת")
 * @returns {boolean}
 */
function isShabbatDay(day) {
  if (!day) return false;
  const d = day.toLowerCase();
  return d.includes('שבת') || d.includes('saturday');
}

/**
 * Get the current Shabbat status for API endpoint.
 * @returns {Object}
 */
function getShabbatStatus() {
  const result = isShabbatTime();
  return {
    isShabbat: result.isShabbat,
    shabbatStart: result.details.shabbatStart,
    shabbatEnd: result.details.shabbatEnd,
    currentTime: result.details.currentTime,
    timezone: 'Asia/Jerusalem',
    shabbatActive: result.isShabbat
  };
}

module.exports = {
  isShabbatTime,
  isShabbatNow,
  isShabbatDay,
  getShabbatStatus,
  getJerusalemNow,
  JERUSALEM_LAT,
  JERUSALEM_LNG
};