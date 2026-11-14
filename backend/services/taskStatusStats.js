// Pure helpers for task check-ins (done / postponed / not done) and their summary.

const STATUSES = ['done', 'postponed', 'missed'];
const MAX_RANGE_DAYS = 366;

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isStatus(value) {
  return STATUSES.includes(value);
}

function cleanKey(value) {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Validate a ?from=&to= range; returns { from, to } or { error }. */
function parseRange(from, to) {
  if (!isDateKey(from) || !isDateKey(to)) return { error: 'from and to must be YYYY-MM-DD.' };
  const span = daysBetween(from, to);
  if (span < 0) return { error: 'from must not be after to.' };
  if (span > MAX_RANGE_DAYS) return { error: 'Range is too long.' };
  return { from, to };
}

/**
 * Count statuses. `rate` is the share of marked tasks that were done
 * (0-100, rounded), or null when nothing was marked.
 */
function summarize(items) {
  const counts = { done: 0, postponed: 0, missed: 0 };
  for (const item of items || []) {
    if (item && isStatus(item.status)) counts[item.status] += 1;
  }
  const total = counts.done + counts.postponed + counts.missed;
  return { ...counts, total, rate: total ? Math.round((counts.done / total) * 100) : null };
}

module.exports = { STATUSES, isDateKey, isStatus, cleanKey, parseRange, summarize };
