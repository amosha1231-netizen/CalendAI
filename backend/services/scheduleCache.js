// ──────────────────────────────────────────────
// Reload a user's authoritative schedule from MongoDB into the in-memory
// cache before a route reads/mutates it via server.js's getUserSchedule().
//
// getUserSchedule() auto-vivifies an *empty* default schedule on a cache
// miss (e.g. right after a server restart/deploy) — it never falls back to
// Mongo on its own. runQuickAdd (the Siri/quick-add pipeline) already
// guards against this by reloading from Mongo before reading the cache;
// this helper is that same guard, extracted so every other schedule-
// mutating route (the /api/reschedule family) can use it too without
// duplicating the logic inline in server.js.
// ──────────────────────────────────────────────

/**
 * Fetches the user's stored schedule from MongoDB and returns it, or
 * returns null if there is nothing to apply (invalid/anonymous id, no
 * such user, no stored schedule, or a lookup error). Never throws.
 * @param {object} deps
 * @param {import('mongoose')} deps.mongoose
 * @param {import('mongoose').Model} deps.User
 * @param {string} deps.userId
 * @param {string} [deps.source] - log label for the caller (e.g. route name)
 * @returns {Promise<object|null>}
 */
async function fetchStoredSchedule({ mongoose, User, userId, source = 'schedule-cache' }) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;
  try {
    const dbUser = await User.findById(userId).select('schedule').lean();
    if (dbUser && dbUser.schedule) return dbUser.schedule;
    return null;
  } catch (err) {
    console.error(`[${source}] Failed to load schedule from MongoDB:`, err.message);
    return null;
  }
}

/**
 * A schedule is "effectively empty" if every day bucket is a missing/empty
 * array — i.e. it's either the literal getDefaultSchedule() shape or
 * something equally unpopulated. Used to tell a genuinely cold cache entry
 * (nothing real loaded yet) apart from a warm one, without needing the
 * exact default-schedule object reference.
 * @param {object} schedule
 * @returns {boolean}
 */
function isEffectivelyEmpty(schedule) {
  if (!schedule || typeof schedule !== 'object') return true;
  return Object.values(schedule).every((v) => !Array.isArray(v) || v.length === 0);
}

/**
 * Warms the in-memory userSchedules cache for userId from MongoDB, so a
 * route that reads/mutates the cache right after won't silently operate on
 * (and then save) an empty default schedule from a cold cache.
 *
 * No-ops immediately, without touching Mongo, when the cache already holds
 * real (non-empty) data for this user — this is the important case, not
 * just an optimization: unconditionally re-fetching and overwriting on
 * every call (the original shape of this function) opened an async
 * read-then-blind-overwrite window on every one of its callers' requests,
 * not just after a cold start. A concurrent mutual/provider-booking confirm
 * that pushes a new event into this same in-memory schedule object between
 * this function's Mongo read starting and resolving would get silently
 * reverted the moment that stale read landed — see the regression test
 * below ("never overwrites an already-warm cache entry, even with a
 * concurrent write racing the Mongo read"). Skipping the fetch entirely
 * once the cache is warm closes that window for the common case; only a
 * genuinely cold cache (nothing loaded yet, or only the auto-vivified empty
 * default) still pays for — and needs — the Mongo round-trip.
 * @param {object} deps
 * @param {import('mongoose')} deps.mongoose
 * @param {import('mongoose').Model} deps.User
 * @param {Map<string, object>} deps.userSchedules
 * @param {string} deps.userId
 * @param {string} [deps.source]
 */
async function warmScheduleCache({ mongoose, User, userSchedules, userId, source }) {
  const cached = userSchedules.get(userId);
  if (cached && !isEffectivelyEmpty(cached)) return;
  const schedule = await fetchStoredSchedule({ mongoose, User, userId, source });
  if (schedule) userSchedules.set(userId, schedule);
}

module.exports = { fetchStoredSchedule, warmScheduleCache, isEffectivelyEmpty };
