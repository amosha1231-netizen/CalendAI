// Single source of truth for the JWT signing secret.
// Previously each route file redefined its own fallback to a hardcoded
// string ('calendai-jwt-secret-change-in-production', checked into a
// public repo) that was used even in production if JWT_SECRET was ever
// unset. Fails closed in production instead: the process refuses to run.
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const JWT_SECRET = process.env.JWT_SECRET?.trim() || (!isProduction ? 'calendai-jwt-secret-change-in-production' : null);

if (isProduction && !JWT_SECRET) {
  throw new Error('Production requires JWT_SECRET to be set.');
}

module.exports = JWT_SECRET;
