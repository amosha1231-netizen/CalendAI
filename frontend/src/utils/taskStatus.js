/**
 * Task status: how a calendar task went on a given day (done / postponed / not done).
 *
 * Calendar events repeat by weekday, so a status belongs to (task, date).
 * Signed-in users save to the server (/api/task-status); guests keep the marks
 * on this device, so nothing they mark is lost or blocked behind a login.
 */
import api from '../api/axios';
import safeStorage from './safeStorage';
import { parseTimeString } from './timeFormat';

export const TASK_STATUSES = ['done', 'postponed', 'missed'];
const LOCAL_KEY = 'calendai-task-status';
const LOCAL_KEEP_DAYS = 120;

/** 'YYYY-MM-DD' in the device's local zone. */
export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n));
}

/** Stable id of a task inside one day: its start time (24h) and title. */
export function taskKey(event) {
  if (!event) return '';
  const t = parseTimeString(event.startTime);
  const time = t ? `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` : '';
  return `${time}|${String(event.title || '').trim()}`.slice(0, 200);
}

function readLocal() {
  try {
    const raw = safeStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeLocal(data) {
  try {
    const cutoff = addDaysKey(toDateKey(new Date()), -LOCAL_KEEP_DAYS);
    for (const date of Object.keys(data)) {
      if (date < cutoff || !data[date] || Object.keys(data[date]).length === 0) delete data[date];
    }
    safeStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (e) {}
}

function localRange(from, to) {
  const data = readLocal();
  const items = [];
  for (const date of Object.keys(data)) {
    if (date < from || date > to) continue;
    for (const key of Object.keys(data[date] || {})) {
      const v = data[date][key];
      if (v && TASK_STATUSES.includes(v.status)) items.push({ date, key, ...v });
    }
  }
  return items;
}

/** Load marks for [from, to] (inclusive date keys). */
export async function fetchTaskStatuses(user, from, to) {
  if (!user) return localRange(from, to);
  try {
    const res = await api.get('/api/task-status', { params: { from, to } });
    return Array.isArray(res.data?.items) ? res.data.items : [];
  } catch (e) {
    return localRange(from, to);
  }
}

/** Save (or clear, with status null) one task's mark for one day. */
export async function saveTaskStatus(user, { date, key, title, startTime, status }) {
  if (!user) {
    const data = readLocal();
    if (!data[date]) data[date] = {};
    if (status) data[date][key] = { status, title: title || '', startTime: startTime || '' };
    else delete data[date][key];
    writeLocal(data);
    return true;
  }
  await api.put('/api/task-status', { date, key, title, startTime, status: status || null });
  return true;
}

/** Counts and done-rate (0-100, null when nothing was marked). */
export function summarizeStatuses(items) {
  const counts = { done: 0, postponed: 0, missed: 0 };
  for (const item of items || []) {
    if (item && TASK_STATUSES.includes(item.status)) counts[item.status] += 1;
  }
  const total = counts.done + counts.postponed + counts.missed;
  return { ...counts, total, rate: total ? Math.round((counts.done / total) * 100) : null };
}
