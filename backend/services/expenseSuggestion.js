// ──────────────────────────────────────────────
// Expense Suggestion Detector
// Keyword-based scan of a scheduled event's title to spot life events
// that usually come with a cost (wedding, trip, bar mitzvah, ...),
// so the app can suggest tracking an "expected expense" for it.
// Mirrors the simple keyword-category approach already used in
// frontend/src/components/SidebarDrawer.jsx (CATEGORY_KEYWORDS).
// ──────────────────────────────────────────────

const EXPENSE_CATEGORY_KEYWORDS = {
  wedding: ['חתונה', 'כלולות', 'wedding'],
  bar_mitzvah: ['בר מצווה', 'בת מצווה', 'בר-מצווה', 'בת-מצווה', 'bar mitzvah', 'bat mitzvah'],
  trip: ['טיול', 'נסיעה', 'חופשה', 'חו"ל', 'trip', 'vacation', 'flight', 'טיסה'],
  birthday: ['יום הולדת', 'birthday'],
  gift: ['מתנה', 'gift'],
  holiday: ['חג', 'פסח', 'סוכות', 'ראש השנה', 'holiday']
};

/**
 * Scan an event title for a cost-bearing life event.
 * Returns { category, matchedKeyword } or null if nothing matched.
 */
function detectExpenseSuggestion(title) {
  const lower = (title || '').toLowerCase();
  if (!lower.trim()) return null;

  for (const [category, keywords] of Object.entries(EXPENSE_CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { category, matchedKeyword: kw };
      }
    }
  }
  return null;
}

module.exports = { detectExpenseSuggestion, EXPENSE_CATEGORY_KEYWORDS };
