/**
 * Sign in with Apple: verify the identity token the iOS app gets from Apple.
 *
 * The token is a JWT signed by Apple (RS256). We check the signature against
 * Apple's published keys, the issuer, the audience (our bundle ID) and the
 * expiry. No Apple private key is needed for this.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_TTL_MS = 6 * 60 * 60 * 1000;

let keyCache = { keys: null, fetchedAt: 0 };

function appleAudiences() {
  const raw = (process.env.APPLE_BUNDLE_IDS || 'com.amos.calendai').trim();
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function fetchAppleKeys(force = false, fetchImpl = globalThis.fetch) {
  if (!force && keyCache.keys && Date.now() - keyCache.fetchedAt < KEYS_TTL_MS) {
    return keyCache.keys;
  }
  const res = await fetchImpl(APPLE_KEYS_URL);
  if (!res.ok) throw new Error(`Apple keys request failed (${res.status})`);
  const body = await res.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * Returns the verified token payload ({ sub, email, email_verified, ... }).
 * Throws when the token is missing, malformed, expired or not from Apple.
 */
async function verifyAppleIdentityToken(idToken, { fetchImpl, audiences } = {}) {
  if (!idToken || typeof idToken !== 'string') throw new Error('Missing identity token');
  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) throw new Error('Malformed identity token');

  let keys = await fetchAppleKeys(false, fetchImpl);
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    // Apple rotates keys; refresh once before giving up.
    keys = await fetchAppleKeys(true, fetchImpl);
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error('Unknown Apple signing key');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience: audiences || appleAudiences()
  });
  if (!payload?.sub) throw new Error('Identity token has no subject');
  return payload;
}

function isAppleEmailVerified(payload) {
  return payload?.email_verified === true || payload?.email_verified === 'true';
}

function resetAppleKeyCache() {
  keyCache = { keys: null, fetchedAt: 0 };
}

module.exports = { verifyAppleIdentityToken, isAppleEmailVerified, resetAppleKeyCache, APPLE_ISSUER };
