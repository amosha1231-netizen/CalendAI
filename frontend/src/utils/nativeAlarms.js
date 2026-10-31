/**
 * Background alarms for the native app (Capacitor iOS/Android).
 *
 * The web alarm can only ring while CalendAI is open. In the native app every
 * ring (the alarm, each extra ring of the wake-up bundle, a snooze) is also
 * handed to the OS as a local notification with our own ringtone, so it rings
 * with the app closed or the phone locked. Tapping it opens the app straight
 * into the math challenge; solving it cancels the rest of the bundle.
 *
 * OS limits: a notification sound plays once and iOS caps it at 30 seconds
 * (ours is 28s), so "keeps ringing" is done with the bundle's repeat rings.
 * iOS can't ring through silent mode / Focus without Apple's Critical Alerts
 * entitlement.
 *
 * Everything is lazy and wrapped in try/catch; on the web every function is a
 * no-op, so the web alarm behaves exactly as before.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildNativeAlarmSchedule } from './alarmEngine';
import { isShabbatAt } from './shabbatHelper';

// Our notification ids live in this range so we never touch anyone else's.
const ID_BASE = 710000;
const ID_RANGE = 1000;
const CHANNEL_ID = 'calendai-alarm';
const SOUND_FILE = 'calendai_alarm.wav';

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

const isOurs = (id) => id >= ID_BASE && id < ID_BASE + ID_RANGE;

let channelReady = null;
function ensureChannel() {
  if (platform() !== 'android') return Promise.resolve();
  if (!channelReady) {
    channelReady = LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Alarm',
      description: 'CalendAI wake-up alarm',
      importance: 5,
      visibility: 1,
      sound: SOUND_FILE,
      vibration: true,
      lights: true
    }).catch((e) => {
      channelReady = null;
      console.warn('[Alarm] Could not create channel:', e);
    });
  }
  return channelReady;
}

/** Ask for notification permission (call when the user arms the alarm). */
export async function requestAlarmPermission() {
  if (!isNative()) return 'granted';
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return 'granted';
    const result = await LocalNotifications.requestPermissions();
    return result.display;
  } catch (e) {
    console.warn('[Alarm] Permission request failed:', e);
    return 'denied';
  }
}

/** Android 12+: can we ring at the exact minute? ('granted' elsewhere) */
export async function checkExactAlarms() {
  if (platform() !== 'android') return 'granted';
  try {
    const { exact_alarm: state } = await LocalNotifications.checkExactNotificationSetting();
    return state || 'granted';
  } catch (e) {
    return 'granted';
  }
}

/** Android: open the "Alarms & reminders" setting. */
export async function openExactAlarmSettings() {
  if (platform() !== 'android') return;
  try { await LocalNotifications.changeExactNotificationSetting(); } catch (e) {}
}

async function cancelOurs({ alsoDelivered = false } = {}) {
  try {
    const { notifications = [] } = await LocalNotifications.getPending();
    const ours = notifications.filter(n => isOurs(n.id)).map(n => ({ id: n.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours });
  } catch (e) {
    console.warn('[Alarm] Could not cancel pending alarms:', e);
  }
  if (!alsoDelivered) return;
  try {
    const { notifications = [] } = await LocalNotifications.getDeliveredNotifications();
    const ours = notifications.filter(n => isOurs(n.id));
    if (ours.length) await LocalNotifications.removeDeliveredNotifications({ notifications: ours });
  } catch (e) {}
}

// Serialize syncs: settings can change quickly and each sync cancels first.
let queue = Promise.resolve();

/**
 * Make the OS schedule match the alarm. `text` = { title, body } (localized).
 * `clearDelivered` also removes alarm notifications left in the tray (after
 * the user solved the challenge).
 */
export function syncNativeAlarms(alarm, ringing, text = {}, { clearDelivered = false } = {}) {
  if (!isNative()) return Promise.resolve();
  queue = queue.then(async () => {
    try {
      await cancelOurs({ alsoDelivered: clearDelivered });
      const schedule = buildNativeAlarmSchedule(alarm, ringing, {
        isShabbat: (date) => isShabbatAt(date)
      });
      if (!schedule.length) return;
      await ensureChannel();
      const android = platform() === 'android';
      const notifications = schedule.map((item, i) => ({
        id: ID_BASE + i,
        title: text.title || '⏰ CalendAI',
        body: text.body || '',
        schedule: { at: new Date(item.at), allowWhileIdle: true },
        sound: SOUND_FILE,
        channelId: android ? CHANNEL_ID : undefined,
        // iOS: no banner while the app is open (the in-app alarm rings then).
        foreground: android,
        interruptionLevel: 'timeSensitive',
        smallIcon: 'ic_stat_alarm',
        autoCancel: true,
        extra: { calendaiAlarm: true, occurrence: item.occurrence, at: item.at }
      }));
      const result = await LocalNotifications.schedule({ notifications });
      if (result && result.warning) console.warn('[Alarm]', result.warning.message);
    } catch (e) {
      console.warn('[Alarm] Could not schedule background alarm:', e);
    }
  });
  return queue;
}

/**
 * Call `onAlarm({ occurrence, at })` when an alarm notification is tapped or
 * fires while the app is open. Returns a cleanup function.
 */
export function listenForNativeAlarms(onAlarm) {
  if (!isNative()) return () => {};
  const handles = [];
  let removed = false;
  const keep = (h) => { if (removed) { try { h.remove(); } catch (e) {} } else handles.push(h); };
  const handle = (notification) => {
    try {
      const extra = notification && notification.extra;
      if (extra && extra.calendaiAlarm) onAlarm({ occurrence: extra.occurrence, at: extra.at });
    } catch (e) {}
  };
  try {
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => handle(action && action.notification))
      .then(keep).catch(() => {});
    LocalNotifications.addListener('localNotificationReceived', handle)
      .then(keep).catch(() => {});
  } catch (e) {}
  return () => {
    removed = true;
    handles.forEach(h => { try { h.remove(); } catch (e) {} });
  };
}

export function isNativeAlarmPlatform() {
  return isNative();
}
