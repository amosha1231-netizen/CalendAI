const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const appleAuth = require('../services/appleAuth');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
appleAuth._setAppleKeysForTest([jwk]);
const noFetch = async () => { throw new Error('should not fetch'); };

function token(overrides = {}, opts = {}) {
  const nonce = overrides.rawNonce || 'n'.repeat(32);
  const payload = {
    sub: '001234.abcd',
    email: 'Person@privaterelay.appleid.com',
    email_verified: 'true',
    is_private_email: 'true',
    nonce: appleAuth.sha256Hex(nonce),
    ...overrides
  };
  delete payload.rawNonce;
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: 'test-kid',
    issuer: opts.issuer || 'https://appleid.apple.com',
    audience: opts.audience || 'com.amos.calendai',
    expiresIn: opts.expiresIn || '5m'
  });
}

test('accepts a valid Apple token and checks the nonce', async () => {
  const id = await appleAuth.verifyAppleIdentityToken(token(), { nonce: 'n'.repeat(32), fetchImpl: noFetch });
  assert.deepStrictEqual(id, { sub: '001234.abcd', email: 'person@privaterelay.appleid.com', emailVerified: true, isPrivateEmail: true });
});

test('rejects a wrong nonce, audience, issuer, or expired token', async () => {
  const opts = { nonce: 'n'.repeat(32), fetchImpl: noFetch };
  await assert.rejects(appleAuth.verifyAppleIdentityToken(token(), { ...opts, nonce: 'x'.repeat(32) }), /nonce_mismatch/);
  await assert.rejects(appleAuth.verifyAppleIdentityToken(token({}, { audience: 'com.other.app' }), opts));
  await assert.rejects(appleAuth.verifyAppleIdentityToken(token({}, { issuer: 'https://evil.example' }), opts));
  await assert.rejects(appleAuth.verifyAppleIdentityToken(token({}, { expiresIn: -10 }), opts));
});

test('rejects a token signed by another key', async () => {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const forged = jwt.sign({ sub: 'x', nonce: appleAuth.sha256Hex('n'.repeat(32)) }, other, {
    algorithm: 'RS256', keyid: 'test-kid', issuer: 'https://appleid.apple.com', audience: 'com.amos.calendai'
  });
  await assert.rejects(appleAuth.verifyAppleIdentityToken(forged, { nonce: 'n'.repeat(32), fetchImpl: noFetch }));
});

function fakeUserModel(existing = []) {
  const rows = existing.map((r) => ({ ...r, save: async function () {} }));
  return {
    rows,
    findOne: async (q) => rows.find((r) => Object.entries(q).every(([k, v]) => r[k] === v)) || null,
    create: async (doc) => { const r = { ...doc, save: async () => {} }; rows.push(r); return r; }
  };
}

test('creates a new account, then finds it again by Apple id', async () => {
  const User = fakeUserModel();
  const identity = { sub: 's1', email: 'a@b.com', emailVerified: true };
  const first = await appleAuth.findOrCreateAppleUser(User, identity, { givenName: 'Dana', familyName: 'Levi' });
  assert.strictEqual(first.user.displayName, 'Dana Levi');
  const again = await appleAuth.findOrCreateAppleUser(User, { ...identity, email: '' });
  assert.strictEqual(again.user, first.user);
  assert.strictEqual(User.rows.length, 1);
});

test('links an existing email only when Apple verified it', async () => {
  const User = fakeUserModel([{ email: 'a@b.com', googleId: 'g' }]);
  const refused = await appleAuth.findOrCreateAppleUser(User, { sub: 's1', email: 'a@b.com', emailVerified: false });
  assert.strictEqual(refused.error, 'apple_email_in_use');
  const linked = await appleAuth.findOrCreateAppleUser(User, { sub: 's1', email: 'a@b.com', emailVerified: true });
  assert.strictEqual(linked.user.appleId, 's1');
});

test('revoke and code exchange are no-ops without the Apple key', async () => {
  assert.strictEqual(await appleAuth.revokeAppleToken('rt', noFetch), false);
  assert.strictEqual(await appleAuth.exchangeAppleCode('code', noFetch), null);
});

test('client secret is an ES256 JWT for the bundle id when the key is set', () => {
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = ec.privateKey.export({ format: 'pem', type: 'pkcs8' });
  const secret = appleAuth.appleClientSecret('com.amos.calendai', { teamId: 'TEAM', keyId: 'KEY', privateKey: pem });
  const decoded = jwt.verify(secret, ec.publicKey, { algorithms: ['ES256'] });
  assert.strictEqual(decoded.iss, 'TEAM');
  assert.strictEqual(decoded.sub, 'com.amos.calendai');
  assert.strictEqual(decoded.aud, 'https://appleid.apple.com');
});
