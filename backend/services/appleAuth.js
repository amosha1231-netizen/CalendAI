/**
 * Sign in with Apple: verifies the identity token the iOS app gets from
 * ASAuthorizationAppleIDProvider.
 *
 * The token is a JWT signed by Apple. We check its signature against Apple's
 * published keys, that Apple issued it, that it was issued for our app
 * (audience = bundle id, or a web Services ID if one is configured) and that
 * it has not expired. Only then do we trust `sub` (Apple's stable user id)
 * and `email`.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_TTL_MS = 60 * 60 * 1000;

let cachedKeys = null;
let cachedAt = 0;

async function fetchAppleKeys({ force = false } = {}) {
  if (!force && cachedKeys && Date.now() - cachedAt < KEYS_TTL_MS) return cachedKeys;
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error(`Apple keys request failed: ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.keys)) throw new Error('Apple keys response has no keys');
  cachedKeys = body.keys;
  cachedAt = Date.now();
  return cachedKeys;
}

function appleAudiences() {
  const ids = [process.env.APPLE_BUNDLE_ID || 'com.amos.calendai'];
  if (process.env.APPLE_SERVICE_ID) ids.push(process.env.APPLE_SERVICE_ID.trim());
  return ids.filter(Boolean);
}

/**
 * @param {string} identityToken
 * @param {object} [opts]
 * @param {string[]} [opts.audiences]
 * @param {(o:{force:boolean})=>Promise<object[]>} [opts.getKeys] injectable for tests
 * @returns {Promise<{ sub: string, email: string, emailVerified: boolean, isPrivateEmail: boolean }>}
 */
async function verifyAppleIdentityToken(identityToken, opts = {}) {
  if (typeof identityToken !== 'string' || identityToken.length < 20 || identityToken.length > 8192) {
    throw new Error('Missing or malformed identity token');
  }
  const decoded = jwt.decode(identityToken, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid || decoded.header.alg !== 'RS256') throw new Error('Unexpected token header');

  const getKeys = opts.getKeys || fetchAppleKeys;
  let jwk = (await getKeys({ force: false })).find((k) => k.kid === kid);
  // Apple rotates keys; refresh once if we do not know this kid yet.
  if (!jwk) jwk = (await getKeys({ force: true })).find((k) => k.kid === kid);
  if (!jwk) throw new Error('Unknown Apple signing key');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const claims = jwt.verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience: opts.audiences || appleAudiences(),
  });

  if (!claims.sub || typeof claims.sub !== 'string') throw new Error('Token has no subject');
  const truthy = (v) => v === true || v === 'true';
  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
    emailVerified: truthy(claims.email_verified),
    isPrivateEmail: truthy(claims.is_private_email),
  };
}

module.exports = { verifyAppleIdentityToken, appleAudiences };
