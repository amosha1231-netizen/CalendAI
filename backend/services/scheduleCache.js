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
 * Warms the in-memory userSchedules cache for userId from MongoDB, so a
 * route that reads/mutates the cache right after won't silently operate on
 * (and then save) an empty default schedule from a cold cache. No-op if
 * there's nothing in Mongo to load.
 * @param {object} deps
 * @param {import('mongoose')} deps.mongoose
 * @param {import('mongoose').Model} deps.User
 * @param {Map<string, object>} deps.userSchedules
 * @param {string} deps.userId
 * @param {string} [deps.source]
 */
async function warmScheduleCache({ mongoose, User, userSchedules, userId, source }) {
  const schedule = await fetchStoredSchedule({ mongoose, User, userId, source });
  if (schedule) userSchedules.set(userId, schedule);
}

module.exports = { fetchStoredSchedule, warmScheduleCache };
