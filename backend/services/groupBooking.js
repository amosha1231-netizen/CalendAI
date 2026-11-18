'use strict';

/**
 * Pure helpers for personal booking links ("meet a friend"):
 *  - which offered times are still open (not past, not clashing with
 *    something the host added since, and, for group links, still chosen by
 *    everyone who already answered), so the link updates itself;
 *  - group answers: each friend marks every time that works for them, and
 *    once the whole group answered, the earliest time that suits everyone wins.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_GROUP_SIZE = 20;

// "10:00 AM" / "14:30" → minutes since midnight, or null.
function toMinutes(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (match[3]) {
    const pm = match[3].toUpperCase() === 'PM';
    if (h < 1 || h > 12) return null;
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function normalizeGroupSize(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_GROUP_SIZE);
}

// The calendar date ("YYYY-MM-DD") and minutes since midnight right now in a zone.
function nowInZone(timeZone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const get = type => (parts.find(p => p.type === type) || {}).value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  } catch {
    const iso = now.toISOString();
    return { date: iso.slice(0, 10), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }
}

function slotDate(booking, slot) {
  return (slot && slot.date) || booking.date || null;
}

function slotDayName(booking, slot) {
  const date = slotDate(booking, slot);
  return date ? DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()] : booking.day;
}

// Does the host's schedule have something overlapping this slot? Mirrors the
// confirm route: dated (one-time) events only count on their own date.
function slotClashesSchedule(booking, slot, schedule) {
  if (!schedule || typeof schedule !== 'object') return false;
  const dayName = slotDayName(booking, slot);
  const date = slotDate(booking, slot);
  const start = slot.hour * 60 + slot.minute;
  const end = start + Number(booking.duration || 0);
  const events = Array.isArray(schedule[dayName]) ? schedule[dayName] : [];
  return events.some(ev => {
    if (!ev || ev.isSleep) return false;
    if (ev.bookingId && ev.bookingId === booking.bookingId) return false;
    if (date && ev.targetDate && String(ev.targetDate).slice(0, 10) !== date) return false;
    const s = toMinutes(ev.startTime);
    const e = toMinutes(ev.endTime);
    return s !== null && e !== null && e > s && start < e && end > s;
  });
}

function slotIsPast(booking, slot, now = new Date()) {
  const date = slotDate(booking, slot);
  if (!date) return false;
  const zoneNow = nowInZone(booking.hostTimezone || 'Asia/Jerusalem', now);
  if (date < zoneNow.date) return true;
  return date === zoneNow.date && slot.hour * 60 + slot.minute <= zoneNow.minutes;
}

// Slot indexes every group member who already answered can make.
function agreedIndexes(booking) {
  const responses = Array.isArray(booking.responses) ? booking.responses : [];
  let open = null;
  for (const r of responses) {
    const mine = new Set((r.slotIndexes || []).map(Number));
    open = open === null ? mine : new Set([...open].filter(i => mine.has(i)));
  }
  return open; // null = nobody answered yet
}

/**
 * The offered times still open on this link, each with its index into
 * booking.slots (so clients never rely on array position).
 */
function openSlots(booking, { schedule = null, now = new Date() } = {}) {
  const slots = Array.isArray(booking.slots) ? booking.slots : [];
  const agreed = normalizeGroupSize(booking.groupSize) > 1 ? agreedIndexes(booking) : null;
  const out = [];
  slots.forEach((slot, index) => {
    if (!slot || slot.booked) return;
    if (agreed && !agreed.has(index)) return;
    if (slotIsPast(booking, slot, now)) return;
    if (slotClashesSchedule(booking, slot, schedule)) return;
    out.push({ ...slot, index });
  });
  return out;
}

// One key per person, so answering twice replaces the first answer.
function responderKey({ email, phone, name }) {
  if (email) return `e:${String(email).trim().toLowerCase()}`;
  if (phone) return `p:${String(phone).replace(/\D/g, '')}`;
  return `n:${String(name || '').trim().toLowerCase()}`;
}

/**
 * Where a group link stands: how many answered, and, once everyone did,
 * the earliest open time that suits all of them (or null when none does).
 */
function groupStatus(booking, opts = {}) {
  const groupSize = normalizeGroupSize(booking.groupSize);
  const responses = Array.isArray(booking.responses) ? booking.responses : [];
  const open = openSlots(booking, opts);
  const complete = responses.length >= groupSize;
  const winner = complete && open.length
    ? [...open].sort((a, b) => {
        const da = slotDate(booking, a) || '';
        const db = slotDate(booking, b) || '';
        if (da !== db) return da < db ? -1 : 1;
        return (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute);
      })[0]
    : null;
  return {
    groupSize,
    responded: responses.length,
    complete,
    openCount: open.length,
    winnerIndex: winner ? winner.index : null,
    noCommonTime: responses.length > 0 && open.length === 0
  };
}

module.exports = {
  MAX_GROUP_SIZE,
  normalizeGroupSize,
  nowInZone,
  slotClashesSchedule,
  slotIsPast,
  agreedIndexes,
  openSlots,
  responderKey,
  groupStatus
};
