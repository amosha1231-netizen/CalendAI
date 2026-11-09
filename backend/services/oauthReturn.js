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
const WEB_STATE_PREFIX = 'web:';

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch (e) {
    return null;
  }
}

function createOAuthReturn({ frontendUrl, extraOrigins = [] }) {
  const fallback = String(frontendUrl || '').replace(/\/+$/, '');
  const allowed = new Set(
    [fallback, ...extraOrigins].map(normalizeOrigin).filter(Boolean)
  );

  /** The OAuth `state` to send to the provider for this sign-in request, or undefined. */
  function stateFor(query = {}) {
    if (query.platform === 'native') return NATIVE_OAUTH_STATE;
    const origin = normalizeOrigin(query.return_to);
    if (origin && allowed.has(origin) && origin !== normalizeOrigin(fallback)) {
      return `${WEB_STATE_PREFIX}${origin}`;
    }
    return undefined;
  }

  /** Where the provider's callback should send the user, from the returned `state`. */
  function baseFor(state) {
    if (state === NATIVE_OAUTH_STATE) return NATIVE_APP_AUTH_URL;
    if (typeof state === 'string' && state.startsWith(WEB_STATE_PREFIX)) {
      const origin = normalizeOrigin(state.slice(WEB_STATE_PREFIX.length));
      if (origin && allowed.has(origin)) return origin;
    }
    return fallback;
  }

  return { stateFor, baseFor, allowedOrigins: [...allowed] };
}

module.exports = { createOAuthReturn, NATIVE_OAUTH_STATE, NATIVE_APP_AUTH_URL };
