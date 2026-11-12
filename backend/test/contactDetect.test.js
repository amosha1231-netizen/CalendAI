const assert = require('node:assert/strict');
const { test } = require('node:test');
const { detectContact, normalizePhone } = require('../services/contactDetect');

test('detectContact: emails are recognised and lower-cased', () => {
  assert.deepEqual(detectContact('  Dana@Example.com '), { type: 'email', value: 'dana@example.com' });
});

test('detectContact: an @ without a valid address is not a phone or email', () => {
  assert.equal(detectContact('dana@').type, null);
});

test('detectContact: Israeli mobile numbers get the 972 prefix', () => {
  assert.deepEqual(detectContact('054-123 4567'), { type: 'phone', value: '972541234567' });
  assert.deepEqual(detectContact('+972 54 123 4567'), { type: 'phone', value: '972541234567' });
  assert.deepEqual(detectContact('00972541234567'), { type: 'phone', value: '972541234567' });
});

test('detectContact: foreign numbers with + keep their country code', () => {
  assert.deepEqual(detectContact('+1 (415) 555-0100'), { type: 'phone', value: '14155550100' });
});

test('detectContact: empty and junk input', () => {
  assert.deepEqual(detectContact(''), { type: null, value: '' });
  assert.equal(detectContact('hello').type, null);
  assert.equal(detectContact('123').type, null);
  assert.equal(normalizePhone(null), null);
});
