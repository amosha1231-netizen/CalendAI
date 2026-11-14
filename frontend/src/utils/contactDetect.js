// One input, two kinds of contact: tells an email address from a phone
// number. Mirrors backend/services/contactDetect.js — keep the two in step.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Digits only, international form when it can be inferred (Israeli 05x… → 9725x…).
export function normalizePhone(raw) {
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

// { type: 'email' | 'phone' | null, value }
export function detectContact(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { type: null, value: '' };
  if (text.includes('@')) {
    return EMAIL_RE.test(text) ? { type: 'email', value: text.toLowerCase() } : { type: null, value: text };
  }
  const phone = normalizePhone(text);
  return phone ? { type: 'phone', value: phone } : { type: null, value: text };
}
