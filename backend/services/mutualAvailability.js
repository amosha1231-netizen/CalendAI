// ──────────────────────────────────────────────
// Mutual (peer-to-peer) availability — intersects two CalendAI users'
// Google Calendar busy times via freebusy.query (busy/free only, no event
// titles) and returns the overlapping free windows.
// ──────────────────────────────────────────────
const { google } = require('googleapis');
const { createOAuth2ClientWithRefresh, zonedDateTime } = require('./googleCalendar');
const shabbatService = require('./shabbatService');

let LOCATIONS = [];
try {
  LOCATIONS = require('../data/locations.json').locations || [];
} catch (err) {
  console.error('[mutualAvailability] Failed to load locations.json:', err.message);
}
const DEFAULT_LOCATION_ID = 'jerusalem';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getLocation(locationId) {
  return LOCATIONS.find(l => l.id === locationId) || LOCATIONS.find(l => l.id === DEFAULT_LOCATION_ID) || null;
}

function minutesSinceMidnight(hhmm) {
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime12(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function parseClock12(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function currentMinuteOfDay(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
}

/** Merge overlapping/adjacent [start,end) intervals (minutes). Pure function. */
function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }
  return merged;
}

/**
 * Subtract the union of two busy-interval lists from [windowStartMin, windowEndMin),
 * keeping only free gaps of at least minGapMinutes. Pure function — no I/O —
 * so it can be unit-tested directly against fixture intervals.
 */
function intersectFree(busyA, busyB, windowStartMin, windowEndMin, minGapMinutes) {
  const clipped = [...busyA, ...busyB]
    .map(i => ({ start: Math.max(i.start, windowStartMin), end: Math.min(i.end, windowEndMin) }))
    .filter(i => i.end > i.start);
  const busy = mergeIntervals(clipped);

  const free = [];
  let cursor = windowStartMin;
  for (const b of busy) {
    if (cursor < b.start) {
      const gap = b.start - cursor;
      if (gap >= minGapMinutes) free.push({ start: cursor, end: b.start });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < windowEndMin) {
    const gap = windowEndMin - cursor;
    if (gap >= minGapMinutes) free.push({ start: cursor, end: windowEndMin });
  }
  return free;
}

/**
 * Fetch one user's busy intervals (minutes-since-midnight, in `timeZone`) for a
 * single day window via Google's freebusy.query — busy/free only, no event
 * titles pulled into our backend.
 */
async function getFreeBusyForDay(user, isoDate, dayStartHHMM, dayEndHHMM, timeZone) {
  const oauth2Client = await createOAuth2ClientWithRefresh(user);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const windowStart = zonedDateTime(isoDate, dayStartHHMM, timeZone);
  const windowEnd = zonedDateTime(isoDate, dayEndHHMM, timeZone);

  const result = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      timeZone,
      items: [{ id: 'primary' }]
    }
  });

  const busy = result.data?.calendars?.primary?.busy || [];
  const toClockMinutes = (ms) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
    return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
  };

  return busy
    .map(b => {
      // Clip to the query window before converting to minutes-of-day, same as
      // the existing single-user /api/schedule/free-slots clipping logic.
      const clippedStartMs = Math.max(new Date(b.start).getTime(), windowStart.getTime());
      const clippedEndMs = Math.min(new Date(b.end).getTime(), windowEnd.getTime());
      if (clippedEndMs <= clippedStartMs) return null;
      let start = toClockMinutes(clippedStartMs);
      let end = toClockMinutes(clippedEndMs);
      if (end <= start) end += 1440; // midnight-edge guard
      return { start, end };
    })
    .filter(Boolean);
}

/**
 * Check whether a specific [startTime,endTime) window on `date` is free for
 * BOTH users — used as the server-side race guard right before confirming a
 * mutual booking (the availability list the client saw may be stale).
 */
async function isSlotMutuallyFree(host, invitee, { locationId, date, startTime, endTime }) {
  const locData = getLocation(locationId);
  const timeZone = locData?.timezone || 'Asia/Jerusalem';
  const dayStartHHMM = locData?.defaultDayStart || '06:00';
  const dayEndHHMM = locData?.defaultDayEnd || '23:00';

  const startMin = parseClock12(startTime);
  const endMin = parseClock12(endTime);
  if (startMin === null || endMin === null || endMin <= startMin) {
    return { free: false, timeZone };
  }

  const [busyHost, busyInvitee] = await Promise.all([
    getFreeBusyForDay(host, date, dayStartHHMM, dayEndHHMM, timeZone),
    getFreeBusyForDay(invitee, date, dayStartHHMM, dayEndHHMM, timeZone)
  ]);

  const free = intersectFree(busyHost, busyInvitee, startMin, endMin, endMin - startMin);
  const ok = free.some(f => f.start <= startMin && f.end >= endMin);
  return { free: ok, timeZone };
}

/**
 * Compute mutual free slots for the next `rangeDays` days (skipping Shabbat),
 * long enough to fit `duration` minutes, for both host and invitee.
 */
async function getMutualFreeSlots(host, invitee, { locationId, duration, rangeDays = 7 } = {}) {
  const locData = getLocation(locationId);
  const timeZone = locData?.timezone || 'Asia/Jerusalem';
  const dayStartHHMM = locData?.defaultDayStart || '06:00';
  const dayEndHHMM = locData?.defaultDayEnd || '23:00';
  const dayStartMin = minutesSinceMidnight(dayStartHHMM);
  const dayEndMin = minutesSinceMidnight(dayEndHHMM);

  const nowParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const [ty, tm, td] = [
    Number(nowParts.find(p => p.type === 'year').value),
    Number(nowParts.find(p => p.type === 'month').value),
    Number(nowParts.find(p => p.type === 'day').value)
  ];

  const results = [];
  for (let offset = 0; offset < rangeDays; offset++) {
    const d = new Date(Date.UTC(ty, tm - 1, td + offset));
    const isoDate = d.toISOString().slice(0, 10);
    const dayOfWeek = DAY_NAMES[d.getUTCDay()];

    if (shabbatService.isShabbatDay(dayOfWeek)) continue;

    const [busyHost, busyInvitee] = await Promise.all([
      getFreeBusyForDay(host, isoDate, dayStartHHMM, dayEndHHMM, timeZone),
      getFreeBusyForDay(invitee, isoDate, dayStartHHMM, dayEndHHMM, timeZone)
    ]);

    const windowStartMin = offset === 0 ? Math.max(dayStartMin, currentMinuteOfDay(timeZone)) : dayStartMin;
    const free = intersectFree(busyHost, busyInvitee, windowStartMin, dayEndMin, duration);

    // Slice each free gap into duration-sized slots (not one giant button per
    // gap) — this is also what confirm's duration-match check now requires.
    const freeSlots = [];
    for (const gap of free) {
      for (let s = gap.start; s + duration <= gap.end; s += duration) {
        freeSlots.push({
          startTime: minutesToTime12(s),
          endTime: minutesToTime12(s + duration),
          durationMinutes: duration
        });
      }
    }

    if (freeSlots.length) {
      results.push({ date: isoDate, day: dayOfWeek, freeSlots });
    }
  }
  return results;
}

module.exports = {
  intersectFree,
  mergeIntervals,
  getFreeBusyForDay,
  getMutualFreeSlots,
  isSlotMutuallyFree
};
