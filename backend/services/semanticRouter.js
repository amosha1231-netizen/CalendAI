/**
 * Semantic Router for CalendAI
 * 
 * Classifies user requests into two tracks:
 * 
 * 1. **Fast Track (route: 'fast')** – When the request contains a specific time/date.
 *    The system does NOT need to fetch existing events. Just parse and schedule.
 * 
 * 2. **Smart Track (route: 'smart')** – When the request is vague/general (e.g., "תמצא לי זמן",
 *    "תקבע לי אימון מחר"). The system MUST fetch existing events, inject them into the AI
 *    prompt, and instruct the AI to find a completely free slot with a 15-minute buffer.
 */

// ── Patterns that indicate a SPECIFIC TIME was mentioned (Fast Track) ──
const SPECIFIC_TIME_PATTERNS = [
  // Hebrew: explicit "ב-" prefix with time (ב-14:00, ב-9:30)
  /\bב-?\d{1,2}:\d{2}\b/,

  // Hebrew: "בשעה X" / "שעה X"
  /\b(בשעה|שעה)\s+\d{1,2}\b/,

  // Hebrew: number + time-of-day (ב-9 בערב, ב-10 בבוקר, 5 בערב)
  /\b(ב-?\d{1,2})\s+(לפנה"צ|לאחה"צ|בבוקר|בערב|בלילה|אחה"צ|בצהריים)\b/,

  // Hebrew: spelled-out hours + time-of-day
  /\b(אחת|שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת\s?עשרה|שתים\s?עשרה)\s*(בבוקר|בערב|בלילה|בצהריים|אחה"צ)\b/,

  // Hebrew: quarter/half patterns (רבע ל-, ורבע, וחצי)
  /\b(רבע\s+ל|רבע\s+ל|ורבע|וחצי)\s*\S+/,

  // English: "at HH:MM AM/PM"
  /\bat\s+\d{1,2}(:\d{2})?\s*(AM|PM|am|pm)\b/,

  // English: "HH:MM AM/PM" standalone
  /\b\d{1,2}:\d{2}\s*(AM|PM|am|pm)\b/,

  // English: quarter past/to, half past
  /\b(quarter\s+(past|to)|half\s+past)\s+\d{1,2}\b/i,

  // Hebrew: "מחר/היום/השבוע" + specific time
  /\b(מחר|היום|השבוע|החודש)\s+(ב-?\d{1,2}(\s*:\s*\d{2})?|\d{1,2}\s*(AM|PM|am|pm))\b/,

  // Hebrew: day + time (ביום שני ב-10, יום שלישי בערב)
  /\b(ביום\s+)?(שני|שלישי|רביעי|חמישי|שישי|ראשון|שבת)\s+(ב-?\d{1,2}|\S*בבוקר|\S*בערב|\S*בלילה|\S*בצהריים)\b/,

  // English: day + time (Monday at 10, Tuesday 5pm)
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(at\s+)?\d{1,2}/i,

  // Digital time format (HH:MM)
  /\b\d{1,2}:\d{2}\b/,

  // Hebrew: explicit time with "ב" prefix (ב-5, ב-7, etc.)
  /\bב-(\d{1,2})\b/,
];

// ── Patterns that indicate a GENERAL "find me time" request (Smart Track) ──
const GENERAL_REQUEST_PATTERNS = [
  // Hebrew: "תמצא/תפנה/תארגן/תזמן לי זמן"
  /\b(תמצא|תפנה|תארגן|תזמן|תמציא)\s+לי\s+זמן\b/,
  /\b(תמצא|תפנה|תארגן|תזמן|תמציא)\s+לי\b/,

  // Hebrew: "אין לי זמן" / "צריך זמן" / "אני צריך זמן"
  /\b(אין\s+לי|צריך|אני\s+צריך|אני\s+רוצה)\s+זמן\b/,

  // Hebrew: "מתי/איזה שעה אפשר/כדאי/ניתן"
  /\b(מתי|איזה\s+שעה|באיזה\s+שעה)\s+(אפשר|כדאי|ניתן)\b/,

  // Hebrew: "תן לי/תציע/תציע לי זמן"
  /\b(תן\s+לי|תציע|תציע\s+לי)\s+זמן\b/,

  // Hebrew: "אפשר/כדאי לקבוע"
  /\b(אפשר|כדאי)\s+לקבוע\b/,

  // Hebrew: "זמן פנוי/חופשי"
  /\b(זמן\s+)?(פנוי|חופשי)\b/,

  // Hebrew: "תמצא/תפנה" + duration (תמצא לי שעה פנויה)
  /\b(תמצא|תפנה)\s+לי\s+(\S+\s+)?(שעה|שעתיים|חצי\s+שעה|דקות)\b/,

  // English: "find/schedule/arrange/make time"
  /\b(find|schedule|arrange|make)\s+(me\s+)?(a\s+)?time\b/i,

  // English: "when can/should I"
  /\b(when\s+(can|should|do))\s+i\b/i,

  // English: "what time can/should"
  /\b(what\s+time)\s+(can|should)\b/i,

  // English: "any free/available time/slot"
  /\b(any\s+)?(free|available)\s+(time|slot)\b/i,

  // English: "open/free time/slot"
  /\b(open|free)\s+(time|slot)\b/i,

  // English: "suggest/recommend/propose a time/slot"
  /\b(suggest|recommend|propose)\s+(a\s+)?(time|slot)\b/i,

  // English: "need/want/would like a time/slot"
  /\b(need|want|would\s+like)\s+(a\s+)?(time|slot)\b/i,
];

/**
 * Classify a user's scheduling request into Fast Track or Smart Track.
 * 
 * @param {string} text - The user's natural language request.
 * @returns {{ route: 'fast'|'smart', reason: string }}
 *   - 'fast':  Request contains a specific time/date → skip busy slot lookup.
 *   - 'smart': Request is vague/general → must fetch busy slots and inject context.
 */
function classifyRequest(text) {
  if (!text || typeof text !== 'string') {
    return {
      route: 'smart',
      reason: 'No text provided, defaulting to smart track for safety.'
    };
  }

  const trimmed = text.trim();

  // ── Step 1: Check for general "find me time" patterns FIRST ──
  // These explicitly ask the system to find a free slot, so they MUST be smart track.
  for (const pattern of GENERAL_REQUEST_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        route: 'smart',
        reason: `General "find me time" pattern matched: ${pattern.source.slice(0, 60)}`
      };
    }
  }

  // ── Step 2: Check for specific time patterns ──
  // If a specific time is mentioned, this is a fast track request.
  for (const pattern of SPECIFIC_TIME_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        route: 'fast',
        reason: `Specific time pattern matched: ${pattern.source.slice(0, 60)}`
      };
    }
  }

  // ── Step 3: Check for "today" / "tomorrow" / "מחר" / "היום" ──
  // If the user only says "today" or "tomorrow" without a specific time,
  // it's still a general request (smart track). For example:
  //   "תקבע לי אימון מחר" → no specific time, need smart track
  //   "תקבע לי אימון מחר ב-10" → specific time, fast track
  // These are already handled above by the general patterns.

  // ── Step 4: Default to smart track if no specific time detected ──
  // This is the safe default — if we can't determine that the request has
  // a specific time, we assume it needs conflict-aware scheduling.
  return {
    route: 'smart',
    reason: 'No specific time or general request pattern detected. Defaulting to smart track.'
  };
}

module.exports = { classifyRequest };