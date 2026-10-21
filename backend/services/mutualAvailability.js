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

// Friday Shabbat-start cutoff (minutes since midnight) — the same 16:00
// boundary already enforced elsewhere in this app (eventRoutes.js'
// checkShabbatBlock for Siri-created events, and aiService.js's parsing
// prompt: "Friday ... From 16:00 onward — Shabbat has started. DO NOT
// schedule any events starting at or after this time on Friday"). Saturday
// is already excluded outright everywhere below via shabbatService.isShabbatDay;
// without this, a Friday meeting/booking could still be offered or confirmed
// running straight through candle-lighting and into Shabbat, since nothing
// else in this file treats Friday evening as off-limits.
const FRIDAY_SHABBAT_CUTOFF_MIN = 16 * 60;

function getLocation(locationId) {
  return LOCATIONS.find(l => l.id === locationId) || LOCATIONS.find(l => l.id === DEFAULT_LOCATION_ID) || null;
}

/** Resolve a location's IANA timezone, same lookup convention as providerRoutes.js. */
function getLocationTimeZone(locationId) {
  return getLocation(locationId)?.timezone || 'Asia/Jerusalem';
}

/** Today's date (YYYY-MM-DD) as observed in the given IANA timezone, not server-local/UTC. */
function todayIsoInTimeZone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * Today's weekday name as observed in the given IANA timezone, not
 * server-local/UTC and not the requesting visitor's own timezone. Shared by
 * mutualRoutes.js and providerRoutes.js so that whichever party actually owns
 * the schedule being written (the mutual session's location, or the
 * provider's own locationId) decides what "Today" means for their own
 * mirrored schedule.Today bucket — a provider in one timezone must not have
 * their "Today" list decided by an anonymous guest's browser timezone
 * (server.js's generic getTodayDayName() resolves from the *requesting*
 * user's timezone via its request-scoped AsyncLocalStorage, which is right
 * for that user's own schedule but wrong here).
 */
function getTodayDayNameInTimeZone(timeZone) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date());
  return DAY_NAMES.includes(weekday) ? weekday : DAY_NAMES[new Date().getDay()];
}

/**
 * Strictly validate a 'YYYY-MM-DD' calendar date. A regex + Date.parse check
 * alone isn't enough: `new Date("2026-02-30T00:00:00Z")` doesn't throw or
 * produce NaN, it silently overflows to March 2 — so an invalid date would
 * pass validation and then get booked/confirmed under the wrong day. The
 * round-trip through toISOString() catches that overflow.
 */
function isValidIsoDate(dateStr) {
  return typeof dateStr === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    && !Number.isNaN(Date.parse(`${dateStr}T00:00:00Z`))
    && new Date(`${dateStr}T00:00:00Z`).toISOString().slice(0, 10) === dateStr;
}

/**
 * Slice a list of [start,end) minute ranges into back-to-back duration-sized
 * slots, dropping any remainder shorter than `duration`. Pure function shared
 * by mutual availability (free-time gaps between two calendars) and provider
 * availability (merged weekly-availability rows) so both offer slots on the
 * exact same slicing rule instead of each re-implementing it.
 */
function sliceIntoSlots(ranges, duration) {
  const slots = [];
  for (const { start, end } of ranges) {
    for (let s = start; s + duration <= end; s += duration) {
      slots.push({ start: s, end: s + duration });
    }
  }
  return slots;
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

/**
 * True if [startMin,endMin) strictly overlaps any range in `ranges` (touching
 * at a boundary, e.g. 10:00-10:30 against 10:30-11:00, does not count).
 * Pure function — shared so every overlap check in the codebase (free-slot
 * filtering, the provider double-booking re-check) uses the same rule.
 */
function overlapsAny(startMin, endMin, ranges) {
  return ranges.some(r => startMin < r.end && endMin > r.start);
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
 * Busy intervals (minutes-since-midnight) from a user's own local CalendAI
 * `schedule` for one day — events there never necessarily made it to Google
 * (e.g. /api/schedule/add-to-free-slot doesn't sync, and a provider booking
 * only syncs if the provider has Google connected). The single-user
 * /api/schedule/free-slots route already merges local schedule + Google
 * events for this reason; mutual availability must do the same or it can
 * offer/confirm a slot that's actually already taken locally.
 */
function getLocalScheduleBusy(user, isoDate, dayName) {
  const dayEvents = (user?.schedule?.[dayName] || []).filter(ev => {
    if (ev.targetDate && String(ev.targetDate).slice(0, 10) !== isoDate) return false;
    return true;
  });
  return dayEvents
    .map(ev => ({ start: parseClock12(ev.startTime), end: parseClock12(ev.endTime) }))
    .filter(r => r.start !== null && r.end !== null && r.end > r.start);
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

  // Reject a slot that has already started "today" in the session's own
  // location timezone — the availability list the client saw may be stale
  // (mirrors the same cutoff getMutualFreeSlots applies when listing slots).
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (date === todayIso && startMin < currentMinuteOfDay(timeZone)) {
    return { free: false, timeZone };
  }

  const dayName = DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];

  // HARD SHABBAT GUARD: getMutualFreeSlots() never lists a Shabbat day, but
  // this function is the server-side source of truth the /confirm route
  // relies on to re-verify a client-supplied date — without this check, a
  // direct API call (bypassing the UI) could still lock in a Shabbat meeting
  // as long as neither calendar happened to be busy then.
  if (shabbatService.isShabbatDay(dayName)) {
    return { free: false, timeZone };
  }

  // Same hard guard, extended to Friday evening: Saturday is excluded
  // outright above, but a Friday slot that STARTS before the Shabbat-start
  // cutoff and RUNS PAST it is just as much a Shabbat violation — hence
  // checking endMin, not startMin. See FRIDAY_SHABBAT_CUTOFF_MIN above.
  if (dayName === 'Friday' && endMin > FRIDAY_SHABBAT_CUTOFF_MIN) {
    return { free: false, timeZone };
  }

  const [busyHost, busyInvitee] = await Promise.all([
    getFreeBusyForDay(host, date, dayStartHHMM, dayEndHHMM, timeZone),
    getFreeBusyForDay(invitee, date, dayStartHHMM, dayEndHHMM, timeZone)
  ]);
  const combinedHost = [...busyHost, ...getLocalScheduleBusy(host, date, dayName)];
  const combinedInvitee = [...busyInvitee, ...getLocalScheduleBusy(invitee, date, dayName)];

  const free = intersectFree(combinedHost, combinedInvitee, startMin, endMin, endMin - startMin);
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
    const combinedHost = [...busyHost, ...getLocalScheduleBusy(host, isoDate, dayOfWeek)];
    const combinedInvitee = [...busyInvitee, ...getLocalScheduleBusy(invitee, isoDate, dayOfWeek)];

    const windowStartMin = offset === 0 ? Math.max(dayStartMin, currentMinuteOfDay(timeZone)) : dayStartMin;
    // Never list a Friday slot that would run into Shabbat — see
    // FRIDAY_SHABBAT_CUTOFF_MIN above (isSlotMutuallyFree enforces the same
    // cutoff server-side, but listing one here just to have /confirm reject
    // it is a bad experience and relies on that second check always running).
    const windowEndMin = dayOfWeek === 'Friday' ? Math.min(dayEndMin, FRIDAY_SHABBAT_CUTOFF_MIN) : dayEndMin;
    const free = intersectFree(combinedHost, combinedInvitee, windowStartMin, windowEndMin, duration);

    // Slice each free gap into duration-sized slots (not one giant button per
    // gap) — this is also what confirm's duration-match check now requires.
    const freeSlots = sliceIntoSlots(free, duration).map(s => ({
      startTime: minutesToTime12(s.start),
      endTime: minutesToTime12(s.end),
      durationMinutes: duration
    }));

    if (freeSlots.length) {
      results.push({ date: isoDate, day: dayOfWeek, freeSlots });
    }
  }
  return results;
}

module.exports = {
  intersectFree,
  mergeIntervals,
  sliceIntoSlots,
  overlapsAny,
  getFreeBusyForDay,
  getLocalScheduleBusy,
  getLocationTimeZone,
  todayIsoInTimeZone,
  getTodayDayNameInTimeZone,
  isValidIsoDate,
  getMutualFreeSlots,
  isSlotMutuallyFree,
  minutesToTime12,
  parseClock12,
  currentMinuteOfDay,
  FRIDAY_SHABBAT_CUTOFF_MIN
};
