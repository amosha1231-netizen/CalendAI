/**
 * Normalize a credit value that may arrive as either a plain number
 * or as the object shape `{ remainingCredits, costInfo }` (the raw return
 * of the backend's `deductAICredit()`).
 *
 * Returns a numeric value (or the original null/undefined as-is).
 */
export function normalizeCredits(credits) {
  if (credits === null || credits === undefined) return credits;
  if (typeof credits === 'object') {
    const n = credits?.remainingCredits;
    return (typeof n === 'number' && !Number.isNaN(n)) ? roundCredits(n) : 0;
  }
  return typeof credits === 'number' ? roundCredits(credits) : credits;
}

/**
 * Credits are charged in fractions (e.g. 1.37), so repeated deductions leave
 * floating-point noise such as 14.999999999999998. Round to 2 decimals.
 */
export function roundCredits(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}

/**
 * Display string for a credit balance, always with 2 decimals
 * (15 → "15.00", 14.5 → "14.50", 14.999999 → "15.00").
 */
export function formatCredits(credits) {
  const n = normalizeCredits(credits);
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return roundCredits(n).toFixed(2);
}

/**
 * Deep-copy a user object and normalize its `aiCredits` field so it is
 * ALWAYS a plain number before being stored in state or localStorage.
 */
export function normalizeUserCredits(user) {
  if (!user || typeof user !== 'object') return user;
  const normalized = { ...user };
  if (normalized.aiCredits !== undefined) {
    normalized.aiCredits = normalizeCredits(normalized.aiCredits);
  }
  return normalized;
}

export default normalizeCredits;