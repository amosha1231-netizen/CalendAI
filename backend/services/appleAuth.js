/**
 * Sign in with Apple (iOS app only).
 *
 * The iPhone app shows Apple's own sign-in sheet (see
 * frontend/ios/App/App/AppleSignInPlugin.swift). Apple hands the app a signed
 * identity token (a JWT), the app posts it here, and we check it against
 * Apple's public keys before trusting anything inside it.
 *
 * No secret is needed to sign people in. The optional key below
 * (APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY) is only used to revoke
 * the Apple login when someone deletes their account, which Apple asks apps
 * to do. Without it, sign-in still works and deletion still deletes.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_TTL_MS = 6 * 60 * 60 * 1000;

function appleClientIds() {
  const raw = process.env.APPLE_CLIENT_IDS || process.env.APPLE_BUNDLE_ID || 'com.amos.calendai';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

let keyCache = { keys: null, fetchedAt: 0 };

async function fetchAppleKeys(force = false, fetchImpl = fetch) {
  if (!force && keyCache.keys && Date.now() - keyCache.fetchedAt < KEYS_TTL_MS) return keyCache.keys;
  const res = await fetchImpl(APPLE_KEYS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Apple keys fetch failed: ${res.status}`);
  const body = await res.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/** Test hook. */
function _setAppleKeysForTest(keys) {
  keyCache = { keys, fetchedAt: keys ? Date.now() : 0 };
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Verifies an Apple identity token and returns { sub, email, emailVerified, isPrivateEmail }.
 * Throws on anything wrong: bad signature, wrong app, expired, nonce mismatch.
 */
async function verifyAppleIdentityToken(identityToken, { nonce, fetchImpl } = {}) {
  if (typeof identityToken !== 'string' || identityToken.length > 8000) throw new Error('missing_token');
  const decoded = jwt.decode(identityToken, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid || decoded.header.alg !== 'RS256') throw new Error('bad_token_header');

  let keys = await fetchAppleKeys(false, fetchImpl);
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    // Apple rotates keys; refresh once before giving up.
    keys = await fetchAppleKeys(true, fetchImpl);
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error('unknown_key');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const payload = jwt.verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience: appleClientIds()
  });

  if (!payload.sub) throw new Error('missing_sub');
  if (nonce !== undefined && nonce !== null) {
    // The app sends Apple sha256(nonce) and keeps the raw nonce; Apple echoes the hash back.
    if (!payload.nonce || payload.nonce !== sha256Hex(nonce)) throw new Error('nonce_mismatch');
  }

  const asBool = (v) => v === true || v === 'true';
  return {
    sub: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : '',
    emailVerified: asBool(payload.email_verified),
    isPrivateEmail: asBool(payload.is_private_email)
  };
}

// ── Optional: refresh token + revoke on account deletion ──

function appleKeyConfig() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  // Render env vars keep newlines poorly; accept "\n" escapes too.
  const privateKey = process.env.APPLE_PRIVATE_KEY?.trim().replace(/\\n/g, '\n');
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey };
}

function appleClientSecret(clientId, cfg = appleKeyConfig()) {
  if (!cfg) return null;
  return jwt.sign({}, cfg.privateKey, {
    algorithm: 'ES256',
    keyid: cfg.keyId,
    issuer: cfg.teamId,
    audience: APPLE_ISSUER,
    subject: clientId,
    expiresIn: '5m'
  });
}

/** Trades the one-time authorization code for a refresh token. Returns null when not configured or on failure. */
async function exchangeAppleCode(authorizationCode, fetchImpl = fetch) {
  const clientId = appleClientIds()[0];
  const secret = appleClientSecret(clientId);
  if (!secret || typeof authorizationCode !== 'string' || !authorizationCode || authorizationCode.length > 2000) return null;
  try {
    const res = await fetchImpl(`${APPLE_ISSUER}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        code: authorizationCode,
        grant_type: 'authorization_code'
      }).toString(),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      console.warn('Apple code exchange failed:', res.status);
      return null;
    }
    const body = await res.json();
    return typeof body?.refresh_token === 'string' ? body.refresh_token : null;
  } catch (e) {
    console.warn('Apple code exchange failed:', e.message);
    return null;
  }
}

/** Best effort: revoke the Apple login for a deleted account. */
async function revokeAppleToken(refreshToken, fetchImpl = fetch) {
  const clientId = appleClientIds()[0];
  const secret = appleClientSecret(clientId);
  if (!secret || !refreshToken) return false;
  try {
    const res = await fetchImpl(`${APPLE_ISSUER}/auth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        token: refreshToken,
        token_type_hint: 'refresh_token'
      }).toString(),
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch (e) {
    console.warn('Apple token revoke failed (account still deleted):', e.message);
    return false;
  }
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 60) : '';
}

/**
 * Finds or creates the CalendAI user for a verified Apple identity.
 * Returns { user } or { error } where error is a code the landing page knows.
 *
 * Matched by Apple's stable id first. An existing account with the same email
 * is linked only when Apple says the email is verified: Apple checks it, unlike
 * Microsoft, where any tenant admin can set any address.
 */
async function findOrCreateAppleUser(User, identity, { givenName, familyName } = {}) {
  let user = await User.findOne({ appleId: identity.sub });
  if (user) return { user };

  if (!identity.email) return { error: 'apple_no_email' };
  const existing = await User.findOne({ email: identity.email });
  if (existing) {
    if (!identity.emailVerified) return { error: 'apple_email_in_use' };
    if (existing.appleId && existing.appleId !== identity.sub) return { error: 'apple_email_in_use' };
    existing.appleId = identity.sub;
    await existing.save();
    return { user: existing };
  }

  const displayName = [cleanName(givenName), cleanName(familyName)].filter(Boolean).join(' ')
    || identity.email.split('@')[0];
  user = await User.create({ appleId: identity.sub, email: identity.email, displayName, photo: '' });
  return { user };
}

module.exports = {
  verifyAppleIdentityToken,
  findOrCreateAppleUser,
  exchangeAppleCode,
  revokeAppleToken,
  appleClientSecret,
  appleKeyConfig,
  sha256Hex,
  _setAppleKeysForTest
};
