// ──────────────────────────────────────────────
// Best-effort push ping to every browser/device a user subscribed from.
// Used for one-off notices (a friend picked a meeting time, a friend asks
// to compare calendars). Never throws: a failed ping must not fail the
// request that triggered it.
// ──────────────────────────────────────────────
const PushSubscription = require('../models/PushSubscription');
const push = require('./webPush');

async function notifyUser(userId, { title, body, url = '/', tag }) {
  try {
    if (!userId || !push.isConfigured()) return { sent: 0 };
    const subs = await PushSubscription.find({ userId }).lean();
    let sent = 0;
    for (const sub of subs) {
      const result = await push.send(sub, { type: 'notice', title, body, url, tag: tag || `notice-${Date.now()}` });
      if (result.ok) sent++;
      else if (result.gone) await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
    }
    return { sent };
  } catch (err) {
    console.warn('[notifyUser] push failed:', err.message);
    return { sent: 0 };
  }
}

module.exports = { notifyUser };
