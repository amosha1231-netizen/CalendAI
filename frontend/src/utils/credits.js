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
    return (typeof n === 'number' && !Number.isNaN(n)) ? n : 0;
  }
  return credits;
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