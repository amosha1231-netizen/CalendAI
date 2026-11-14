const test = require('node:test');
const assert = require('node:assert');
const { createOAuthReturn } = require('../services/oauthReturn');

const r = createOAuthReturn({
  frontendUrl: 'https://www.calendai.org',
  extraOrigins: ['https://www.calendai.org', 'https://calendai.org', 'https://calendai-q59p.onrender.com']
});
const HASH = 'a'.repeat(64);

test('native sign-in returns to the app scheme', () => {
  assert.strictEqual(r.stateFor({ platform: 'native', return_to: 'https://calendai.org' }), 'native');
  assert.strictEqual(r.baseFor('native'), 'com.amos.calendai://auth');
  assert.strictEqual(r.pollHashFor('native'), null);
});

test('sign-in from another of our addresses returns there', () => {
  const state = r.stateFor({ return_to: 'https://calendai-q59p.onrender.com' });
  assert.strictEqual(r.baseFor(state), 'https://calendai-q59p.onrender.com');
  assert.strictEqual(r.baseFor(r.stateFor({ return_to: 'https://calendai.org/' })), 'https://calendai.org');
});

test('main site with no home-screen poll needs no state', () => {
  assert.strictEqual(r.stateFor({ return_to: 'https://www.calendai.org' }), undefined);
  assert.strictEqual(r.baseFor(undefined), 'https://www.calendai.org');
});

test('home-screen poll hash is carried when started from our page', () => {
  const state = r.stateFor({ return_to: 'https://www.calendai.org', pwa_poll: HASH }, 'https://www.calendai.org/');
  assert.strictEqual(r.pollHashFor(state), HASH);
  assert.strictEqual(r.baseFor(state), 'https://www.calendai.org');
});

test('home-screen poll hash is dropped for links from elsewhere or malformed', () => {
  assert.strictEqual(r.stateFor({ pwa_poll: HASH }, ''), undefined);
  assert.strictEqual(r.stateFor({ pwa_poll: HASH }, 'https://evil.example/page'), undefined);
  assert.strictEqual(r.stateFor({ pwa_poll: 'xyz' }, 'https://www.calendai.org/'), undefined);
});

test('unknown or malformed origins fall back to the main site', () => {
  assert.strictEqual(r.stateFor({ return_to: 'https://evil.example' }), undefined);
  assert.strictEqual(r.stateFor({ return_to: 'javascript:alert(1)' }), undefined);
  const forged = 'w.' + Buffer.from(JSON.stringify({ o: 'https://evil.example' })).toString('base64url');
  assert.strictEqual(r.baseFor(forged), 'https://www.calendai.org');
  assert.strictEqual(r.baseFor('w.%%%'), 'https://www.calendai.org');
  assert.strictEqual(r.baseFor('something-else'), 'https://www.calendai.org');
  assert.strictEqual(r.pollHashFor('w.%%%'), null);
});
