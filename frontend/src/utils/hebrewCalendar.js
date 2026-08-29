/**
 * Hebrew Calendar Utility
 * Provides Hebrew date formatting and holiday detection using @hebcal/core
 */

let HDate, HebrewCalendar, flags;

async function initHebcal() {
  if (HDate) return true;
  try {
    const hebcal = await import('@hebcal/core');
    HDate = hebcal.HDate;
    HebrewCalendar = hebcal.Calendar;
    flags = hebcal.FLAGS;
    return true;
  } catch (e) {
    console.warn('hebcal not available:', e.message);
    return false;
  }
}

/**
 * Get Hebrew date string for a given Date
 * @param {Date} date
 * @returns {Promise<string>} e.g., "כ"ט אב התשפ"ו"
 */
export async function getHebrewDateString(date) {
  try {
    await initHebcal();
    if (HDate) {
      const hd = new HDate(date);
      return hd.render('he');
    }
  } catch (e) {
    // fallback
  }
  // Basic fallback using Intl
  try {
    return date.toLocaleDateString('he-u-ca-hebrew', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });
  } catch (e) {
    return '';
  }
}

/**
 * Get holidays for a given date
 * @param {Date} date
 * @returns {Promise<Array<{name: string, isMajor: boolean}>>}
 */
export async function getHolidays(date) {
  try {
    const ready = await initHebcal();
    if (ready && HebrewCalendar) {
      const holidays = HebrewCalendar.getHolidaysForDate(date, {
        isHebrewYearFuture: false,
        il: true,
      });
      return holidays.map(h => ({
        name: h.render('he'),
        isMajor: h.getFlags ? (h.getFlags() & flags.CHAG) !== 0 : false,
      }));
    }
  } catch (e) {
    // fallback
  }
  return [];
}

/**
 * Check if a date is a holiday and return first holiday name
 * @param {Date} date  
 * @returns {Promise<string|null>}
 */
export async function getHolidayName(date) {
  const holidays = await getHolidays(date);
  return holidays.length > 0 ? holidays[0].name : null;
}

/**
 * Get today's Hebrew info
 * @returns {Promise<{ hebDate: string, holidays: Array, holidayName: string|null }>}
 */
export async function getTodayHebrewInfo() {
  const now = new Date();
  const [hebDate, holidays] = await Promise.all([
    getHebrewDateString(now),
    getHolidays(now)
  ]);
  return {
    hebDate,
    holidays,
    holidayName: holidays.length > 0 ? holidays[0].name : null,
  };
}