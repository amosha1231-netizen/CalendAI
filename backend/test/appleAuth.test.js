const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyAppleIdentityToken } = require('../services/appleAuth');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
const getKeys = async () => [jwk];
const audiences = ['com.amos.calendai'];

function sign(claims, opts = {}) {
  return jwt.sign(
    { sub: '001234.abcd', email: 'Someone@Example.com', email_verified: 'true', ...claims },
    opts.key || privateKey,
    { algorithm: 'RS256', keyid: opts.kid || 'test-kid', issuer: opts.iss || 'https://appleid.apple.com', audience: opts.aud || 'com.amos.calendai', expiresIn: opts.exp || '10m' }
  );
}

test('accepts a valid Apple token and normalizes claims', async () => {
  const r = await verifyAppleIdentityToken(sign({ is_private_email: true }), { getKeys, audiences });
  assert.deepStrictEqual(r, { sub: '001234.abcd', email: 'someone@example.com', emailVerified: true, isPrivateEmail: true });
});

test('rejects a token for another app', async () => {
  await assert.rejects(verifyAppleIdentityToken(sign({}, { aud: 'com.other.app' }), { getKeys, audiences }));
});

test('rejects a token not issued by Apple', async () => {
  await assert.rejects(verifyAppleIdentityToken(sign({}, { iss: 'https://evil.example' }), { getKeys, audiences }));
});

test('rejects a token signed with a different key', async () => {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(verifyAppleIdentityToken(sign({}, { key: other }), { getKeys, audiences }));
});

test('rejects an expired token', async () => {
  await assert.rejects(verifyAppleIdentityToken(sign({}, { exp: -10 }), { getKeys, audiences }));
});

test('rejects an unknown key id after one refresh', async () => {
  let calls = 0;
  const counting = async () => { calls++; return [jwk]; };
  await assert.rejects(verifyAppleIdentityToken(sign({}, { kid: 'nope' }), { getKeys: counting, audiences }));
  assert.strictEqual(calls, 2);
});

test('rejects garbage input', async () => {
  await assert.rejects(verifyAppleIdentityToken(undefined, { getKeys, audiences }));
  await assert.rejects(verifyAppleIdentityToken('not-a-jwt-but-long-enough', { getKeys, audiences }));
});
