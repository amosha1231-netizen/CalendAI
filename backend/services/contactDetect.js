// ──────────────────────────────────────────────
// One input, two kinds of contact: tells an email address from a phone
// number so the "meet a friend" flow can ask for either in a single field.
// Mirrored on the client in frontend/src/utils/contactDetect.js — keep the
// two in step.
// ──────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize a phone number to digits only, in international form when it
 * can be inferred. Israeli local numbers (05x…, 0x…) get the 972 prefix so
 * WhatsApp's wa.me links work; anything already starting with + or 00 keeps
 * its country code.
 * @returns {string|null} digits, no "+", or null when it isn't a phone number
 */
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = `972${digits.slice(1)}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * @returns {{ type: 'email'|'phone'|null, value: string }}
 *   value is the lower-cased email, or the normalized phone digits.
 */
function detectContact(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { type: null, value: '' };
  if (text.includes('@')) {
    return EMAIL_RE.test(text) ? { type: 'email', value: text.toLowerCase() } : { type: null, value: text };
  }
  const phone = normalizePhone(text);
  return phone ? { type: 'phone', value: phone } : { type: null, value: text };
}

module.exports = { detectContact, normalizePhone, EMAIL_RE };
