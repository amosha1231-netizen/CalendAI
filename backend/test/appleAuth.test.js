const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyAppleIdentityToken, isAppleEmailVerified, resetAppleKeyCache } = require('../services/appleAuth');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };

function fakeFetch(keys) {
  let calls = 0;
  const fn = async () => { calls += 1; return { ok: true, json: async () => ({ keys }) }; };
  fn.calls = () => calls;
  return fn;
}

function sign(payload, opts = {}) {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: 'test-kid',
    issuer: 'https://appleid.apple.com',
    audience: 'com.amos.calendai',
    expiresIn: '10m',
    ...opts
  });
}

test('accepts a valid Apple identity token', async () => {
  resetAppleKeyCache();
  const token = sign({ sub: 'apple-user-1', email: 'a@privaterelay.appleid.com', email_verified: 'true' });
  const payload = await verifyAppleIdentityToken(token, { fetchImpl: fakeFetch([jwk]), audiences: ['com.amos.calendai'] });
  assert.strictEqual(payload.sub, 'apple-user-1');
  assert.strictEqual(isAppleEmailVerified(payload), true);
});

test('rejects a token for another app', async () => {
  resetAppleKeyCache();
  const token = sign({ sub: 'x' }, { audience: 'com.other.app' });
  await assert.rejects(verifyAppleIdentityToken(token, { fetchImpl: fakeFetch([jwk]), audiences: ['com.amos.calendai'] }));
});

test('rejects a token from another issuer', async () => {
  resetAppleKeyCache();
  const token = sign({ sub: 'x' }, { issuer: 'https://evil.example' });
  await assert.rejects(verifyAppleIdentityToken(token, { fetchImpl: fakeFetch([jwk]), audiences: ['com.amos.calendai'] }));
});

test('rejects an expired token', async () => {
  resetAppleKeyCache();
  const token = sign({ sub: 'x' }, { expiresIn: -60 });
  await assert.rejects(verifyAppleIdentityToken(token, { fetchImpl: fakeFetch([jwk]), audiences: ['com.amos.calendai'] }));
});

test('rejects a token signed with a different key', async () => {
  resetAppleKeyCache();
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const token = jwt.sign({ sub: 'x' }, other, { algorithm: 'RS256', keyid: 'test-kid', issuer: 'https://appleid.apple.com', audience: 'com.amos.calendai', expiresIn: '10m' });
  await assert.rejects(verifyAppleIdentityToken(token, { fetchImpl: fakeFetch([jwk]), audiences: ['com.amos.calendai'] }));
});

test('refetches keys once when the kid is unknown', async () => {
  resetAppleKeyCache();
  const token = sign({ sub: 'x' });
  const fetchImpl = fakeFetch([{ ...jwk, kid: 'old' }]);
  await assert.rejects(verifyAppleIdentityToken(token, { fetchImpl, audiences: ['com.amos.calendai'] }));
  assert.strictEqual(fetchImpl.calls(), 2);
});

test('email_verified false is not verified', () => {
  assert.strictEqual(isAppleEmailVerified({ email_verified: 'false' }), false);
  assert.strictEqual(isAppleEmailVerified({}), false);
});
