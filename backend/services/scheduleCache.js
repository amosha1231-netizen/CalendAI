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

/**
 * After a caller has already persisted a $push of `event` into userId's
 * schedule.<day> (and schedule.Today, when `alsoToday`) in MongoDB — e.g.
 * mutualRoutes.js's POST /sessions/:id/confirm or providerRoutes.js's
 * POST /:id/book, via their own pushToSchedule/$push write — apply the
 * matching update to the in-memory userSchedules cache so other routes
 * that read it don't keep serving a stale schedule.
 *
 * This exists because the original shape of that cache sync — call the
 * auto-vivifying getUserSchedule(userId), then unconditionally push `event`
 * onto whatever it returns — is unsound on a cold cache: getUserSchedule()
 * auto-vivifies an *empty* default schedule on a cache miss (e.g. right
 * after a server restart, with no prior request for this user in this
 * process), and appending just the one new event onto that empty default
 * leaves a cache entry holding ONLY this event, none of the user's other
 * real schedule data (which still only exists in MongoDB at this point).
 * isEffectivelyEmpty() — which every /api/reschedule*-style route's
 * warmScheduleCache() guard uses to decide whether to reload from Mongo —
 * would then wrongly classify that single-event cache entry as "warm" and
 * skip reloading it before its own unconditional wholesale
 * saveScheduleToMongo, permanently erasing the rest of the user's schedule
 * the next time any such route runs for this user. The exact same bug
 * class rounds 35/39 already fixed for those routes' own cold-cache reads,
 * reached here instead through the confirm/book handlers' cache-sync code
 * creating a *false* warm state in the first place. See this file's
 * regression test for the concrete before/after.
 *
 * When the cache is already warm (holds real data for this user, loaded
 * earlier in this process), the cheap incremental push is applied directly
 * with no Mongo round-trip — unchanged from the original behavior. When
 * it's cold/effectively empty, the authoritative copy is re-fetched from
 * Mongo instead: since the caller's own write already landed before this
 * runs, that fresh copy already includes `event`, so no separate push is
 * applied in that branch (avoiding a duplicate).
 *
 * @param {object} deps
 * @param {import('mongoose')} deps.mongoose
 * @param {import('mongoose').Model} deps.User
 * @param {(userId: string) => object} deps.getUserSchedule - server.js' auto-vivifying cache accessor
 * @param {string} deps.userId
 * @param {string} deps.day - the day-of-week bucket `event` was pushed into
 * @param {object} deps.event - the schedule entry already persisted to MongoDB
 * @param {boolean} [deps.alsoToday] - whether `event` was also pushed into the Today bucket
 * @param {string} [deps.source] - log label for fetchStoredSchedule
 */
async function syncPushedEventIntoCache({ mongoose, User, getUserSchedule, userId, day, event, alsoToday, source }) {
  const cached = getUserSchedule(userId);
  if (!cached) return;
  if (isEffectivelyEmpty(cached)) {
    const fresh = await fetchStoredSchedule({ mongoose, User, userId, source });
    if (fresh) Object.assign(cached, fresh);
    return;
  }
  if (!cached[day]) cached[day] = [];
  cached[day].push(event);
  if (alsoToday) {
    if (!cached.Today) cached.Today = [];
    cached.Today.push(event);
  }
}

module.exports = { fetchStoredSchedule, warmScheduleCache, isEffectivelyEmpty, syncPushedEventIntoCache };
