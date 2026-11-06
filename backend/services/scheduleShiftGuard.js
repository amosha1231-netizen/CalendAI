'use strict';

// Shared guard for the "quick action" schedule helpers in server.js
// (shiftScheduleForward / mergeGaps): a confirmed mutual meeting or provider
// booking (marked by mutualSessionId/providerBookingId) is frozen — its real
// time lives on Google Calendar and in the MutualBooking/ProviderBooking doc,
// so these local-only helpers already skip moving it. But a flat shift
// applied to every *other* event in the run can still push one of them into
// the frozen event's now-unchanged slot, creating a brand-new overlap that
// didn't exist before. These two functions apply the same flat shift while
// clamping it per-event so it can never cross into a frozen neighbor's
// actual boundary — degrading to a smaller (or zero) shift for that one
// event instead of overlapping it.
//
// Both operate on plain { startMinutes, endMinutes, mutualSessionId?,
// providerBookingId? } objects, already sorted in ascending time order, and
// return a same-length array of { startMinutes, endMinutes }. No HH:MM
// parsing/formatting or Mongo/Express coupling, so they're unit-testable on
// their own.

function isLinkedEvent(event) {
  return Boolean(event && (event.mutualSessionId || event.providerBookingId));
}

// Shifts every unlinked event later by delayMinutes, processing back-to-front
// so each event's cap already reflects the final (possibly-clamped) position
// of everything after it. A linked event never moves; an unlinked event right
// before one is capped so its new end never passes the linked event's actual
// start, falling all the way back to "no shift" if there's no room at all.
function applyForwardShiftWithLinkedGuard(events, delayMinutes) {
  const result = events.map((e) => ({ startMinutes: e.startMinutes, endMinutes: e.endMinutes }));
  let maxAllowedEnd = Infinity;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (isLinkedEvent(event)) {
      maxAllowedEnd = event.startMinutes;
      continue;
    }
    const duration = event.endMinutes - event.startMinutes;
    const desiredEnd = event.endMinutes + delayMinutes;
    let newEnd = Math.min(desiredEnd, maxAllowedEnd);
    let newStart = newEnd - duration;
    if (newStart < event.startMinutes) {
      // No room to shift this one at all without overlapping what follows —
      // leave it exactly where it was rather than overlap.
      newStart = event.startMinutes;
      newEnd = event.endMinutes;
    }
    result[i] = { startMinutes: newStart, endMinutes: newEnd };
    maxAllowedEnd = newStart;
  }
  return result;
}

// Shifts every unlinked event from startIndex onward earlier by
// shiftMinutes, processing front-to-back so each event's cap already
// reflects the final (possibly-clamped) position of everything before it.
// A linked event never moves; an unlinked event right after one is capped so
// its new start never crosses before the linked event's actual end, falling
// all the way back to "no shift" if there's no room at all.
function applyBackwardShiftWithLinkedGuard(events, shiftMinutes, startIndex = 0) {
  const result = events.map((e) => ({ startMinutes: e.startMinutes, endMinutes: e.endMinutes }));
  let minAllowedStart = startIndex > 0 ? events[startIndex - 1].endMinutes : -Infinity;
  for (let i = startIndex; i < events.length; i++) {
    const event = events[i];
    if (isLinkedEvent(event)) {
      minAllowedStart = event.endMinutes;
      continue;
    }
    const duration = event.endMinutes - event.startMinutes;
    const desiredStart = event.startMinutes - shiftMinutes;
    let newStart = Math.max(desiredStart, minAllowedStart);
    let newEnd = newStart + duration;
    if (newStart > event.startMinutes) {
      // No room to pull this one back at all without overlapping what
      // precedes it — leave it exactly where it was rather than overlap.
      newStart = event.startMinutes;
      newEnd = event.endMinutes;
    }
    result[i] = { startMinutes: newStart, endMinutes: newEnd };
    minAllowedStart = newEnd;
  }
  return result;
}

// Walks events left-to-right, pushing any unlinked event whose start is
// less than minGapMinutes after the (possibly already-shifted) previous
// event's end just far enough forward to restore that minimum gap. A linked
// event never moves AND resets the running shift to zero: any amount
// carried from before it (including whatever gap violation it itself would
// have needed, had it been movable) is discarded there, since nothing after
// it should inherit a shift tied to an event that never actually moved —
// everything after it is measured fresh against its own true, unmoved end
// (`result[i - 1].endMinutes`, which always reflects the real current
// boundary, frozen or shifted). Without this reset, a flat carried-forward
// shift computed for/around one frozen event could still land an unlinked
// event already past it squarely inside a *second*, later frozen event —
// see the regression test below.
function applyMinGapForwardWithLinkedGuard(events, minGapMinutes) {
  const result = events.map((e) => ({ startMinutes: e.startMinutes, endMinutes: e.endMinutes }));
  let shift = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (isLinkedEvent(event)) {
      shift = 0;
      continue;
    }
    if (i > 0) {
      const prevEnd = result[i - 1].endMinutes;
      const gap = event.startMinutes - prevEnd;
      if (gap < minGapMinutes) shift += (minGapMinutes - gap);
    }
    if (shift > 0) {
      result[i] = { startMinutes: event.startMinutes + shift, endMinutes: event.endMinutes + shift };
    }
  }
  return result;
}

module.exports = {
  isLinkedEvent,
  applyForwardShiftWithLinkedGuard,
  applyBackwardShiftWithLinkedGuard,
  applyMinGapForwardWithLinkedGuard,
};
