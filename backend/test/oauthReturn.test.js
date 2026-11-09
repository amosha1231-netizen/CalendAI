const test = require('node:test');
const assert = require('node:assert');
const { createOAuthReturn } = require('../services/oauthReturn');

const r = createOAuthReturn({
  frontendUrl: 'https://www.calendai.org',
  extraOrigins: ['https://www.calendai.org', 'https://calendai.org', 'https://calendai-q59p.onrender.com']
});

test('native sign-in returns to the app scheme', () => {
  assert.strictEqual(r.stateFor({ platform: 'native', return_to: 'https://calendai.org' }), 'native');
  assert.strictEqual(r.baseFor('native'), 'com.amos.calendai://auth');
});

test('sign-in from another of our addresses returns there', () => {
  const state = r.stateFor({ return_to: 'https://calendai-q59p.onrender.com' });
  assert.strictEqual(state, 'web:https://calendai-q59p.onrender.com');
  assert.strictEqual(r.baseFor(state), 'https://calendai-q59p.onrender.com');
  assert.strictEqual(r.baseFor(r.stateFor({ return_to: 'https://calendai.org/' })), 'https://calendai.org');
});

test('main site needs no state', () => {
  assert.strictEqual(r.stateFor({ return_to: 'https://www.calendai.org' }), undefined);
  assert.strictEqual(r.baseFor(undefined), 'https://www.calendai.org');
});

test('unknown or malformed origins fall back to the main site', () => {
  assert.strictEqual(r.stateFor({ return_to: 'https://evil.example' }), undefined);
  assert.strictEqual(r.stateFor({ return_to: 'javascript:alert(1)' }), undefined);
  assert.strictEqual(r.baseFor('web:https://evil.example'), 'https://www.calendai.org');
  assert.strictEqual(r.baseFor('web:not a url'), 'https://www.calendai.org');
  assert.strictEqual(r.baseFor('something-else'), 'https://www.calendai.org');
});
