/**
 * Schedule entries mirrored from a MutualBooking (`mutualSessionId`) or a
 * ProviderBooking (`providerBookingId`) are owned by those booking flows, not
 * by the generic schedule-editing routes: the real appointment lives in the
 * booking document and on Google Calendar. A wholesale schedule write (e.g.
 * the frontend's Undo, which PUTs a client-side snapshot back) must therefore
 * neither drop such an entry that exists now nor bring back one that has
 * since been cancelled.
 */

function isLinkedEntry(event) {
  return !!(event && typeof event === 'object' && (event.mutualSessionId || event.providerBookingId));
}

/**
 * Returns a copy of `incoming` whose linked entries are exactly the ones in
 * `current` (same day keys), with every unlinked entry taken from `incoming`.
 * Returns null when `incoming` is not a plain object.
 */
function preserveLinkedEntries(incoming, current) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return null;
  const result = {};
  for (const [day, events] of Object.entries(incoming)) {
    result[day] = Array.isArray(events) ? events.filter(ev => !isLinkedEntry(ev)) : events;
  }
  if (current && typeof current === 'object') {
    for (const [day, events] of Object.entries(current)) {
      if (!Array.isArray(events)) continue;
      const linked = events.filter(isLinkedEntry);
      if (!linked.length) continue;
      result[day] = [...(Array.isArray(result[day]) ? result[day] : []), ...linked];
    }
  }
  return result;
}

module.exports = { isLinkedEntry, preserveLinkedEntries };
