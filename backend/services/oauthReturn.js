/**
 * Where an OAuth sign-in (Google / Microsoft) returns to.
 *
 * The app is reachable on more than one web address (www.calendai.org, the bare
 * calendai.org, and Render's own calendai-q59p.onrender.com). A home-screen icon
 * on iPhone is tied to the address it was added from and keeps its own storage
 * for that address only. If sign-in always came back to www.calendai.org, a
 * person whose icon opens another address got the login token saved somewhere
 * the icon never reads, so the next launch asked them to sign in again.
 *
 * The frontend now sends its own origin (?return_to=...), we carry it through the
 * provider in the OAuth `state`, and send the user back to that same origin, but
 * only if it is one of ours. Anything else falls back to the main site.
 */
const NATIVE_OAUTH_STATE = 'native';
const NATIVE_APP_AUTH_URL = 'com.amos.calendai://auth';
const WEB_STATE_PREFIX = 'w.';

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch (e) {
    return null;
  }
}

const POLL_HASH_RE = /^[a-f0-9]{64}$/;

function encodeWebState(data) {
  return `${WEB_STATE_PREFIX}${Buffer.from(JSON.stringify(data)).toString('base64url')}`;
}

function decodeWebState(state) {
  if (typeof state !== 'string' || !state.startsWith(WEB_STATE_PREFIX)) return null;
  try {
    const data = JSON.parse(Buffer.from(state.slice(WEB_STATE_PREFIX.length), 'base64url').toString('utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

/**
 * Home-screen web apps on iPhone: Google sign-in leaves the app's address, and
 * iOS finishes it in a separate in-app browser whose storage the home-screen app
 * never sees. So the app also sends `pwa_poll` = sha256(secret it keeps), and the
 * callback leaves the login waiting under that hash; the app picks it up with the
 * secret (POST /api/auth/oauth-poll). We only accept it when the sign-in was
 * started from one of our own pages (Referer), so a link someone else crafted
 * and sent to a victim can't plant a hash the sender later claims.
 */
function createOAuthReturn({ frontendUrl, extraOrigins = [] }) {
  const fallback = String(frontendUrl || '').replace(/\/+$/, '');
  const fallbackOrigin = normalizeOrigin(fallback);
  const allowed = new Set(
    [fallback, ...extraOrigins].map(normalizeOrigin).filter(Boolean)
  );

  /** The OAuth `state` to send to the provider for this sign-in request, or undefined. */
  function stateFor(query = {}, referer = '') {
    if (query.platform === 'native') return NATIVE_OAUTH_STATE;
    const data = {};
    const origin = normalizeOrigin(query.return_to);
    if (origin && allowed.has(origin) && origin !== fallbackOrigin) data.o = origin;
    const poll = String(query.pwa_poll || '').toLowerCase();
    const refererOrigin = normalizeOrigin(referer);
    if (POLL_HASH_RE.test(poll) && refererOrigin && allowed.has(refererOrigin)) data.p = poll;
    return Object.keys(data).length ? encodeWebState(data) : undefined;
  }

  /** Where the provider's callback should send the user, from the returned `state`. */
  function baseFor(state) {
    if (state === NATIVE_OAUTH_STATE) return NATIVE_APP_AUTH_URL;
    const origin = normalizeOrigin(decodeWebState(state)?.o);
    if (origin && allowed.has(origin)) return origin;
    return fallback;
  }

  /** The home-screen app's poll hash carried in `state`, or null. */
  function pollHashFor(state) {
    const poll = decodeWebState(state)?.p;
    return typeof poll === 'string' && POLL_HASH_RE.test(poll) ? poll : null;
  }

  return { stateFor, baseFor, pollHashFor, allowedOrigins: [...allowed] };
}

module.exports = { createOAuthReturn, NATIVE_OAUTH_STATE, NATIVE_APP_AUTH_URL };
