/**
 * Evening digest — one push the evening before, listing tomorrow's schedule.
 *
 * Settings live on the user (user.eveningDigest: enabled, time "HH:mm",
 * timezone, lang, nextFireAt). Every tick the dispatcher loads users whose
 * nextFireAt has passed, claims each one atomically (same pattern as the
 * reminder dispatcher, so two server instances never double-send), moves
 * nextFireAt to the next evening, and pushes a summary of the following day:
 * the local CalendAI schedule plus Google Calendar events when connected.
 *
 * Never sent on Shabbat; a digest that is more than STALE_MS late (server
 * asleep) is skipped instead of arriving in the middle of the night.
 */
const { computeNextFire } = require('./reminderSchedule');
const { getScheduleEventsForDate } = require('./scheduleOccurrence');

const STALE_MS = 30 * 60 * 1000;
const BATCH = 200;
const MAX_LISTED = 5;
const DEFAULT_TIME = '21:00';

const DAY_NAMES = {
  he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};

/** YYYY-MM-DD of `instant` in `timeZone`. */
function isoDayInZone(instant, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekdayOf(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The digest's own schedule, shaped like a daily reminder for computeNextFire. */
function asDailyReminder(digest) {
  return { frequency: 'daily', time: (digest && digest.time) || DEFAULT_TIME, timezone: digest && digest.timezone };
}

function nextDigestFire(digest, after, isShabbatAt) {
  const isBlocked = typeof isShabbatAt === 'function'
    ? instant => isShabbatAt(instant, digest && digest.timezone)
    : null;
  return computeNextFire(asDailyReminder(digest), after, { isBlocked });
}

/** Sort, drop duplicates (an event synced to Google shows up twice) and keep timed ones first. */
function mergeEvents(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const e of list || []) {
      if (!e || !e.title) continue;
      const key = `${e.allDay ? 'all' : (e.startTime || '')}|${String(e.title).trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out.sort((a, b) => {
    if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });
}

/** Push title + body for tomorrow's events. Pure, so it's easy to test. */
function buildDigestMessage(events, { lang = 'he', isoDate } = {}) {
  const he = lang === 'he';
  const dayName = (he ? DAY_NAMES.he : DAY_NAMES.en)[weekdayOf(isoDate)];
  const title = he ? `🌙 הלו״ז שלך למחר (יום ${dayName})` : `🌙 Your schedule for tomorrow (${dayName})`;
  if (!events.length) {
    return { title, body: he ? 'מחר אין אירועים ביומן. יום פנוי ✨' : 'Nothing on the calendar tomorrow. A free day ✨' };
  }
  const line = e => (e.allDay ? `${he ? 'כל היום' : 'All day'} · ${e.title}` : `${e.startTime} ${e.title}`);
  const listed = events.slice(0, MAX_LISTED).map(line);
  const extra = events.length - listed.length;
  if (extra > 0) listed.push(he ? `ועוד ${extra}…` : `and ${extra} more…`);
  const count = he
    ? (events.length === 1 ? 'אירוע אחד' : `${events.length} אירועים`)
    : (events.length === 1 ? '1 event' : `${events.length} events`);
  const first = events.find(e => !e.allDay);
  const head = first ? (he ? `${count}, הראשון ב-${first.startTime}` : `${count}, first at ${first.startTime}`) : count;
  return { title, body: `${head}\n${listed.join('\n')}` };
}

function localEventsFor(user, isoDate, todayIso) {
  return getScheduleEventsForDate(user.schedule || {}, isoDate, todayIso)
    .map(e => ({ title: e.title, startTime: e.startTime || '', allDay: !e.startTime }));
}

function createDigestDispatcher({
  User, PushSubscription, push, isShabbatAt, fetchGoogleEvents,
  now = () => new Date(), logger = console
}) {
  async function eventsForTomorrow(user, fireAt) {
    const tz = user.eveningDigest.timezone || 'Asia/Jerusalem';
    const todayIso = isoDayInZone(fireAt, tz);
    const isoDate = addDays(todayIso, 1);
    const lists = [localEventsFor(user, isoDate, todayIso)];
    if (typeof fetchGoogleEvents === 'function' && user.googleAccessToken) {
      try {
        lists.push(await fetchGoogleEvents(user, isoDate, tz));
      } catch (err) {
        logger.warn(`[Digest] Google Calendar read failed for ${user._id}: ${err.message}`);
      }
    }
    return { isoDate, events: mergeEvents(lists) };
  }

  async function deliver(user, fireAt) {
    const subs = await PushSubscription.find({ userId: user._id }).lean();
    if (!subs.length) return { sent: 0 };
    const { isoDate, events } = await eventsForTomorrow(user, fireAt);
    const { title, body } = buildDigestMessage(events, { lang: user.eveningDigest.lang, isoDate });
    const payload = { type: 'digest', title, body, tag: `digest-${isoDate}`, url: '/' };
    let sent = 0;
    for (const sub of subs) {
      const result = await push.send(sub, payload);
      if (result.ok) sent++;
      else if (result.gone) await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
      else if (result.error !== 'not-configured') logger.warn(`[Digest] push to ${sub._id} failed: ${result.error}`);
    }
    return { sent };
  }

  async function tick() {
    const current = now();
    const due = await User.find(
      { 'eveningDigest.enabled': true, 'eveningDigest.nextFireAt': { $lte: current } },
      { eveningDigest: 1, schedule: 1, googleAccessToken: 1, googleRefreshToken: 1 }
    ).sort({ 'eveningDigest.nextFireAt': 1 }).limit(BATCH).lean();
    let fired = 0;
    let skipped = 0;
    for (const user of due) {
      const fireAt = new Date(user.eveningDigest.nextFireAt);
      const next = nextDigestFire(user.eveningDigest, current, isShabbatAt);
      const claimed = await User.findOneAndUpdate(
        { _id: user._id, 'eveningDigest.enabled': true, 'eveningDigest.nextFireAt': user.eveningDigest.nextFireAt },
        { $set: { 'eveningDigest.nextFireAt': next, 'eveningDigest.lastSentAt': current } },
        { new: true, projection: { _id: 1 } }
      );
      if (!claimed) continue;
      if (current.getTime() - fireAt.getTime() > STALE_MS) { skipped++; continue; }
      if (typeof isShabbatAt === 'function' && isShabbatAt(current, user.eveningDigest.timezone)) { skipped++; continue; }
      try {
        await deliver(user, fireAt);
        fired++;
      } catch (err) {
        logger.error('[Digest] delivery failed:', err.message);
      }
    }
    return { due: due.length, fired, skipped };
  }

  function start(intervalMs = 60000, isReady = () => true) {
    let running = false;
    const run = async () => {
      if (running || !isReady()) return;
      running = true;
      try { await tick(); } catch (err) { logger.error('[Digest] tick failed:', err.message); } finally { running = false; }
    };
    const timer = setInterval(run, intervalMs);
    if (timer.unref) timer.unref();
    run();
    return () => clearInterval(timer);
  }

  return { tick, start, deliver, eventsForTomorrow };
}

module.exports = {
  createDigestDispatcher, buildDigestMessage, mergeEvents, nextDigestFire, isoDayInZone, addDays,
  DEFAULT_TIME, STALE_MS
};
