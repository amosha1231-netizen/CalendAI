/**
 * Web Push — sends reminder pings to browsers that subscribed.
 *
 * Needs a VAPID key pair in the environment (generate once with
 * `npx web-push generate-vapid-keys`; keep them stable, or every existing
 * subscription stops working):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: URL)
 * Without them push is off and the app falls back to in-app pings.
 */
const webpush = require('web-push');

let configured = null;

function isConfigured() {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    console.warn('[WebPush] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set: reminder push notifications are off (in-app pings still work).');
    return configured;
  }
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@calendai.app', publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.error('[WebPush] Invalid VAPID configuration:', err.message);
    configured = false;
  }
  return configured;
}

function getPublicKey() {
  return isConfigured() ? process.env.VAPID_PUBLIC_KEY : null;
}

/**
 * Send one payload to one subscription.
 * @returns {Promise<{ ok: boolean, gone?: boolean, error?: string }>} gone = the browser dropped it.
 */
async function send(subscription, payload) {
  if (!isConfigured()) return { ok: false, error: 'not-configured' };
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 30, urgency: 'high' }
    );
    return { ok: true };
  } catch (err) {
    const gone = err && (err.statusCode === 404 || err.statusCode === 410);
    return { ok: false, gone, error: (err && err.message) || 'push failed' };
  }
}

module.exports = { isConfigured, getPublicKey, send };
