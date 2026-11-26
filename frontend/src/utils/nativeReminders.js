/**
 * Reminder and task pings for the native app (Capacitor iOS/Android).
 *
 * The native app has no Web Push, so before this a reminder only pinged while
 * CalendAI was open. Now the server sends each active reminder's next fire
 * times (GET /api/reminders → `upcoming`) and we hand them to the phone as
 * local notifications with our own short ping sound, so they ping with the
 * app closed or the phone locked. Every load of the reminders list re-syncs
 * the whole set, so edits, pauses and deleted tasks are picked up.
 *
 * iOS keeps at most 64 pending notifications per app (the alarm uses some),
 * so only the soonest MAX_PENDING pings are scheduled; the list is topped up
 * each time the app opens.
 *
 * Everything is lazy and wrapped in try/catch; on the web every function is a
 * no-op.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Our own id range (the alarm uses 710000–710999).
const ID_BASE = 720000;
const ID_RANGE = 1000;
const MAX_PENDING = 40;
const CHANNEL_ID = 'calendai-reminders';
const SOUND_FILE = 'calendai_ping.wav';

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

function platform() {
  try {
    return Capacitor.getPlatform();
  } catch (e) {
    return 'web';
  }
}

export function isNativeReminderPlatform() {
  return isNative();
}

const isOurs = (id) => id >= ID_BASE && id < ID_BASE + ID_RANGE;

let channelReady = null;
function ensureChannel(name) {
  if (platform() !== 'android') return Promise.resolve();
  if (!channelReady) {
    channelReady = LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: name || 'Reminders',
      description: 'CalendAI reminders and tasks',
      importance: 5,
      visibility: 1,
      sound: SOUND_FILE,
      vibration: true,
      lights: true
    }).catch((e) => {
      channelReady = null;
      console.warn('[Reminders] Could not create channel:', e);
    });
  }
  return channelReady;
}

/** 'granted' | 'denied' | 'prompt' | 'unsupported' */
export async function getNativeReminderPermission() {
  if (!isNative()) return 'unsupported';
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  } catch (e) {
    return 'unsupported';
  }
}

/** Ask the phone for notification permission. Returns the new state. */
export async function requestNativeReminderPermission() {
  if (!isNative()) return 'unsupported';
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return 'granted';
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted' ? 'granted' : 'denied';
  } catch (e) {
    console.warn('[Reminders] Permission request failed:', e);
    return 'denied';
  }
}

async function cancelOurs() {
  try {
    const { notifications = [] } = await LocalNotifications.getPending();
    const ours = notifications.filter(n => isOurs(n.id)).map(n => ({ id: n.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });
  } catch (e) {
    console.warn('[Reminders] Could not cancel pending pings:', e);
  }
}

/** The soonest pings of all active reminders, as { reminder, at }. */
export function buildReminderPings(reminders, now = Date.now(), max = MAX_PENDING) {
  const pings = [];
  for (const r of reminders || []) {
    if (!r || !r.active || !Array.isArray(r.upcoming)) continue;
    for (const iso of r.upcoming) {
      const at = new Date(iso).getTime();
      if (Number.isFinite(at) && at > now + 1000) pings.push({ reminder: r, at });
    }
  }
  pings.sort((a, b) => a.at - b.at);
  return pings.slice(0, max);
}

// Serialize syncs: the list can reload quickly and each sync cancels first.
let queue = Promise.resolve();

/**
 * Make the phone's pending pings match the reminders list.
 * `text` = { channelName } (localized). Asks for permission the first time
 * there is something to ping.
 */
export function syncNativeReminders(reminders, text = {}) {
  if (!isNative()) return Promise.resolve();
  queue = queue.then(async () => {
    try {
      const pings = buildReminderPings(reminders);
      let permission = await getNativeReminderPermission();
      if (permission === 'prompt' && pings.length) permission = await requestNativeReminderPermission();
      await cancelOurs();
      if (permission !== 'granted' || !pings.length) return;
      await ensureChannel(text.channelName);
      const android = platform() === 'android';
      const notifications = pings.map(({ reminder: r, at }, i) => ({
        id: ID_BASE + i,
        title: `${r.emoji || '🔔'} ${r.title}`,
        body: r.time || '',
        schedule: { at: new Date(at), allowWhileIdle: true },
        sound: SOUND_FILE,
        channelId: android ? CHANNEL_ID : undefined,
        // Show the banner and play the ping even while the app is open.
        foreground: true,
        interruptionLevel: 'timeSensitive',
        smallIcon: 'ic_stat_alarm',
        autoCancel: true,
        extra: { calendaiReminder: true, reminderId: r.id, kind: r.kind || 'reminder', at }
      }));
      const result = await LocalNotifications.schedule({ notifications });
      if (result && result.warning) console.warn('[Reminders]', result.warning.message);
    } catch (e) {
      console.warn('[Reminders] Could not schedule pings:', e);
    }
  });
  return queue;
}

/** A test ping a few seconds from now, so the user hears how it sounds. */
export async function sendNativeTestPing(text = {}) {
  if (!isNative()) return false;
  try {
    if (await requestNativeReminderPermission() !== 'granted') return false;
    await ensureChannel(text.channelName);
    await LocalNotifications.schedule({
      notifications: [{
        id: ID_BASE + ID_RANGE - 1,
        title: text.title || '🔔 CalendAI',
        body: text.body || '',
        schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
        sound: SOUND_FILE,
        channelId: platform() === 'android' ? CHANNEL_ID : undefined,
        foreground: true,
        smallIcon: 'ic_stat_alarm',
        autoCancel: true,
        extra: { calendaiReminder: true, test: true }
      }]
    });
    return true;
  } catch (e) {
    console.warn('[Reminders] Test ping failed:', e);
    return false;
  }
}

/**
 * Call `onTap({ reminderId, kind })` when a reminder ping is tapped.
 * Returns a cleanup function.
 */
export function listenForReminderTaps(onTap) {
  if (!isNative()) return () => {};
  const handles = [];
  let removed = false;
  try {
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      try {
        const extra = action && action.notification && action.notification.extra;
        if (extra && extra.calendaiReminder && !extra.test) onTap({ reminderId: extra.reminderId, kind: extra.kind });
      } catch (e) {}
    }).then(h => { if (removed) { try { h.remove(); } catch (e) {} } else handles.push(h); }).catch(() => {});
  } catch (e) {}
  return () => {
    removed = true;
    handles.forEach(h => { try { h.remove(); } catch (e) {} });
  };
}
