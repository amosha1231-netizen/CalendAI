/**
 * Reminder Dispatcher — finds reminders that are due and pings their owners.
 *
 * Every tick it loads active reminders whose nextFireAt has passed, claims each
 * one atomically (only the instance whose update matches the old nextFireAt
 * sends, so two server instances never double-ping), moves nextFireAt to the
 * following occurrence, and sends a Web Push to each of the user's browsers.
 *
 * Nothing is sent during Shabbat in the reminder's time zone.
 *
 * A ping that is more than STALE_MS late (the server was asleep, e.g. a Render
 * free instance spinning down) is skipped rather than delivered hours late.
 */
const { computeNextFire } = require('./reminderSchedule');

const STALE_MS = 15 * 60 * 1000;
const BATCH = 200;

function createDispatcher({ Reminder, PushSubscription, push, isShabbatAt, now = () => new Date(), logger = console }) {
  function nextFor(reminder, after) {
    // The app is closed on Shabbat, so no reminder ever pings then
    // (whatever an older reminder's skipShabbat flag says).
    const isBlocked = typeof isShabbatAt === 'function'
      ? instant => isShabbatAt(instant, reminder.timezone)
      : null;
    return computeNextFire(reminder, after, { isBlocked });
  }

  async function deliver(reminder, fireAt) {
    const subs = await PushSubscription.find({ userId: reminder.userId }).lean();
    if (!subs.length) return { sent: 0 };
    const payload = {
      type: 'reminder',
      reminderId: String(reminder._id),
      title: `${reminder.emoji || '🔔'} ${reminder.title}`,
      body: reminder.time,
      fireAt: fireAt.toISOString(),
      tag: `reminder-${reminder._id}-${fireAt.getTime()}`,
      url: '/?reminders=1'
    };
    let sent = 0;
    for (const sub of subs) {
      const result = await push.send(sub, payload);
      if (result.ok) {
        sent++;
        PushSubscription.updateOne({ _id: sub._id }, { $set: { lastSuccessAt: now() } }).catch(() => {});
      } else if (result.gone) {
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
      } else if (result.error !== 'not-configured') {
        logger.warn(`[Reminders] push to ${sub._id} failed: ${result.error}`);
      }
    }
    return { sent };
  }

  async function tick() {
    const current = now();
    const due = await Reminder.find({ active: true, nextFireAt: { $lte: current } })
      .sort({ nextFireAt: 1 }).limit(BATCH).lean();
    let fired = 0;
    let skipped = 0;
    for (const reminder of due) {
      const fireAt = new Date(reminder.nextFireAt);
      const next = nextFor(reminder, current);
      const claimed = await Reminder.findOneAndUpdate(
        { _id: reminder._id, active: true, nextFireAt: reminder.nextFireAt },
        { $set: { nextFireAt: next, lastFiredAt: current, ...(next ? {} : { active: false }) } },
        { new: true }
      );
      if (!claimed) continue; // another instance took it, or the user just edited it
      if (current.getTime() - fireAt.getTime() > STALE_MS) { skipped++; continue; }
      // A ping scheduled before this rule (or before Shabbat times shifted) is not sent on Shabbat.
      if (typeof isShabbatAt === 'function' && isShabbatAt(current, reminder.timezone)) { skipped++; continue; }
      try {
        await deliver(reminder, fireAt);
        fired++;
      } catch (err) {
        logger.error('[Reminders] delivery failed:', err.message);
      }
    }
    return { due: due.length, fired, skipped };
  }

  function start(intervalMs = 30000, isReady = () => true) {
    let running = false;
    const run = async () => {
      if (running || !isReady()) return;
      running = true;
      try { await tick(); } catch (err) { logger.error('[Reminders] tick failed:', err.message); } finally { running = false; }
    };
    const timer = setInterval(run, intervalMs);
    if (timer.unref) timer.unref();
    run();
    return () => clearInterval(timer);
  }

  return { tick, start, nextFor, deliver };
}

module.exports = { createDispatcher, STALE_MS };
