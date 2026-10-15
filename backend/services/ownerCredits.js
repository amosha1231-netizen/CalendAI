// ──────────────────────────────────────────────
// Owner accounts: AI credits that refill for free
// ──────────────────────────────────────────────
// Accounts listed in the OWNER_EMAILS env var (comma-separated) never run out
// of AI credits: whenever their balance drops below OWNER_CREDIT_FLOOR it is
// topped back up. Usage is still deducted and logged to the ledger as usual.
//
// The match is on the email stored on the user's DB record, and only for
// accounts linked to Google (googleId set), since Google verifies the email.
// Nothing the client sends is consulted, so the list cannot be spoofed by a
// request body or header.
// ──────────────────────────────────────────────

const OWNER_CREDIT_FLOOR = 100;

function getOwnerEmails() {
  return String(process.env.OWNER_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

function isOwnerAccount(user) {
  if (!user || !user.googleId || typeof user.email !== 'string') return false;
  return getOwnerEmails().includes(user.email.trim().toLowerCase());
}

/**
 * Top an owner account back up to OWNER_CREDIT_FLOOR. No-op for anyone else.
 * @returns {Promise<number|undefined>} the balance after any top-up.
 */
async function refillOwnerCredits(User, user) {
  if (!isOwnerAccount(user)) return user?.aiCredits;
  const current = Number(user.aiCredits);
  if (Number.isFinite(current) && current >= OWNER_CREDIT_FLOOR) return current;
  // Conditional so a concurrent deduction landing between read and write is not lost.
  await User.updateOne(
    { _id: user._id, $or: [{ aiCredits: { $lt: OWNER_CREDIT_FLOOR } }, { aiCredits: null }] },
    { $set: { aiCredits: OWNER_CREDIT_FLOOR } }
  );
  console.log(`[PAYG] Owner account ${user._id} refilled to ${OWNER_CREDIT_FLOOR} credits`);
  return OWNER_CREDIT_FLOOR;
}

module.exports = { isOwnerAccount, refillOwnerCredits, getOwnerEmails, OWNER_CREDIT_FLOOR };
