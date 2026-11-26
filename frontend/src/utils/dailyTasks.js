/**
 * Daily tasks: the circles on the home screen.
 *
 * Three sources, one list:
 *  - calendar tasks for today (events with isTask, made by "משימה ..." in the AI box),
 *  - the user's own daily tasks ("לשתות 3 ליטר מים", "לא לכעוס היום"),
 *  - challenges the user joined (search / the challenges list), which sync here.
 *
 * Signed-in users keep their own tasks and challenges on the server
 * (/api/goals/tasks); guests keep their own tasks on this device, so nothing is
 * lost behind a login. Each item's mark for the day uses the task-status store
 * (utils/taskStatus.js), so done / not done / postponed shows everywhere.
 */
import api from '../api/axios';
import safeStorage from './safeStorage';
import { taskKey, toDateKey, fetchTaskStatuses, saveTaskStatus } from './taskStatus';
import { parseTimeString } from './timeFormat';

const LOCAL_KEY = 'calendai-daily-tasks';
export const TASKS_CHANGED_EVENT = 'calendai:tasks-changed';

/** `background: true` marks a quiet refresh (live sync), not a change made here. */
export function notifyTasksChanged({ background = false } = {}) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT, { detail: { background } }));
    }
  } catch (e) {}
}

function readLocal() {
  try {
    const raw = safeStorage.getItem(LOCAL_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(t => t && t.id && t.title) : [];
  } catch (e) {
    return [];
  }
}

function writeLocal(list) {
  try { safeStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 30))); } catch (e) {}
}

/** The user's own daily tasks + joined challenges. */
export async function loadDailyTasks(user, { strict = false } = {}) {
  if (!user) return readLocal().map(t => ({ ...t, key: `local:${t.id}`, kind: t.kind || 'task' }));
  try {
    const res = await api.get('/api/goals/tasks');
    return Array.isArray(res.data?.tasks) ? res.data.tasks : [];
  } catch (e) {
    if (strict) throw e;
    return [];
  }
}

export async function addDailyTask(user, { title, emoji = '', titleEn = '', challengeId = null }) {
  const clean = String(title || '').trim().slice(0, 80);
  if (!clean) return null;
  if (!user) {
    const list = readLocal();
    const item = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: clean, titleEn, emoji, kind: challengeId ? 'challenge' : 'task' };
    writeLocal([...list, item]);
    notifyTasksChanged();
    return item;
  }
  const res = challengeId
    ? await api.post(`/api/goals/${challengeId}/join`).catch(err => {
        if (err?.response?.status === 409) return { data: {} }; // already joined
        throw err;
      })
    : await api.post('/api/goals/tasks', { title: clean, emoji });
  notifyTasksChanged();
  return res.data?.task || null;
}

export async function removeDailyTask(user, task) {
  if (!task) return;
  if (!user || String(task.key || '').startsWith('local:')) {
    writeLocal(readLocal().filter(t => t.id !== task.id));
  } else {
    await api.post(`/api/goals/${task.id}/leave`);
  }
  notifyTasksChanged();
}

function minutesOf(time) {
  const t = parseTimeString(time);
  return t ? t.hour * 60 + t.minute : 24 * 60;
}

/**
 * Today's items in display order: calendar tasks by time, then daily tasks.
 * Each: { key, title, emoji, time, source: 'calendar' | 'task' | 'challenge', task?, event? }
 */
export function buildTodayItems({ todayEvents = [], dailyTasks = [], lang = 'he' }) {
  const seen = new Set();
  const calendar = (todayEvents || [])
    .filter(e => e && e.isTask)
    .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime))
    .map(e => ({ key: taskKey(e), title: e.title, emoji: '⏰', time: e.startTime, source: 'calendar', event: e }))
    .filter(i => (seen.has(i.key) ? false : seen.add(i.key)));
  const daily = (dailyTasks || []).map(t => ({
    key: t.key,
    title: lang !== 'he' && t.titleEn ? t.titleEn : t.title,
    emoji: t.emoji || (t.kind === 'challenge' ? '🏆' : '✨'),
    time: '',
    source: t.kind === 'challenge' ? 'challenge' : 'task',
    task: t
  }));
  return [...calendar, ...daily];
}

export async function loadTodayStatuses(user, { strict = false } = {}) {
  const today = toDateKey(new Date());
  const items = await fetchTaskStatuses(user, today, today, { strict });
  const map = {};
  for (const i of items) if (i.date === today) map[i.key] = i.status;
  return map;
}

/** Mark one item for today. A done challenge also counts toward its streak. */
export async function markTodayItem(user, item, status) {
  const date = toDateKey(new Date());
  await saveTaskStatus(user, { date, key: item.key, title: item.title, startTime: item.time || '', status });
  if (user && status === 'done' && item.source === 'challenge' && item.task?.id) {
    api.post(`/api/goals/${item.task.id}/checkin`).catch(() => {});
  }
}

export const EXAMPLES = {
  he: [
    { emoji: '💧', title: 'לשתות 3 ליטר מים' },
    { emoji: '🕊️', title: 'לא לכעוס היום' },
    { emoji: '📖', title: '20 דקות קריאה' },
    { emoji: '📞', title: 'להתקשר לאמא' },
    { emoji: '🚶', title: 'הליכה של חצי שעה' },
    { emoji: '🍭', title: 'בלי סוכר היום' }
  ],
  en: [
    { emoji: '💧', title: 'Drink 3 liters of water' },
    { emoji: '🕊️', title: 'No anger today' },
    { emoji: '📖', title: 'Read for 20 minutes' },
    { emoji: '📞', title: 'Call mom' },
    { emoji: '🚶', title: 'A 30 minute walk' },
    { emoji: '🍭', title: 'No sugar today' }
  ]
};
