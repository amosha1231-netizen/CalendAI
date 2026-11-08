const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');

const {
  isProActive,
  lemonEventEffect,
  lemonSubscriptionExpiry,
  revenueCatEventEffect,
  revenueCatUserId,
  RENEWAL_GRACE_MS
} = require('../services/subscriptions');

const NOW = Date.parse('2026-11-08T12:00:00Z');
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';

beforeEach(() => {
  process.env.LEMON_SQUEEZY_PRO_VARIANT_ID = '9001';
  process.env.PRO_MONTHLY_CREDITS = '1000';
});

test('isProActive follows proExpiresAt', () => {
  assert.equal(isProActive({ proExpiresAt: new Date(NOW + 1000) }, NOW), true);
  assert.equal(isProActive({ proExpiresAt: new Date(NOW - 1000) }, NOW), false);
  assert.equal(isProActive({ isPro: true }, NOW), false, 'the legacy flag alone does not grant Pro');
  assert.equal(isProActive(null, NOW), false);
});

test('credit-pack order adds credits, Pro subscription order is skipped', () => {
  const pack = lemonEventEffect({ meta: { event_name: 'order_created' }, data: { id: 55, attributes: { status: 'paid', first_order_item: { variant_id: 2035157 } } } });
  assert.deepEqual(pack, { kind: 'credits', eventKey: 'order_created:55', orderId: '55', credits: 100 });

  const sub = lemonEventEffect({ meta: { event_name: 'order_created' }, data: { id: 56, attributes: { status: 'paid', first_order_item: { variant_id: 9001 } } } });
  assert.equal(sub.kind, 'ignore');

  const refunded = lemonEventEffect({ meta: { event_name: 'order_created' }, data: { id: 57, attributes: { status: 'refunded' } } });
  assert.equal(refunded.kind, 'ignore');
});

test('Lemon subscription status maps to an expiry', () => {
  const renews = '2026-12-08T12:00:00Z';
  assert.equal(lemonSubscriptionExpiry({ status: 'active', renews_at: renews }, NOW).getTime(), Date.parse(renews) + RENEWAL_GRACE_MS);
  assert.equal(lemonSubscriptionExpiry({ status: 'cancelled', ends_at: renews }, NOW).getTime(), Date.parse(renews));
  assert.equal(lemonSubscriptionExpiry({ status: 'expired' }, NOW).getTime(), NOW);
  assert.equal(lemonSubscriptionExpiry({ status: 'unpaid', renews_at: renews }, NOW).getTime(), NOW);

  const effect = lemonEventEffect({
    meta: { event_name: 'subscription_created' },
    data: { id: 'sub_1', attributes: { status: 'active', renews_at: renews, urls: { customer_portal: 'https://x/portal' } } }
  }, NOW);
  assert.equal(effect.kind, 'subscription');
  assert.equal(effect.subscriptionId, 'sub_1');
  assert.equal(effect.customerPortalUrl, 'https://x/portal');
});

test('Lemon renewal payment grants the monthly allowance once per invoice', () => {
  const effect = lemonEventEffect({ meta: { event_name: 'subscription_payment_success' }, data: { id: 'inv_9', attributes: { subscription_id: 77 } } });
  assert.deepEqual(effect, { kind: 'renewal', eventKey: 'ls_invoice:inv_9', orderId: 'inv_9', subscriptionId: '77', credits: 1000 });
});

test('RevenueCat purchase and renewal grant credits and set expiry', () => {
  const exp = NOW + 30 * 86400000;
  const effect = revenueCatEventEffect({ id: 'e1', type: 'INITIAL_PURCHASE', store: 'APP_STORE', expiration_at_ms: exp }, NOW);
  assert.equal(effect.kind, 'renewal');
  assert.equal(effect.eventKey, 'rc:e1');
  assert.equal(effect.source, 'app_store');
  assert.equal(effect.credits, 1000);
  assert.equal(effect.expiresAt.getTime(), exp);

  const renewal = revenueCatEventEffect({ id: 'e2', type: 'RENEWAL', store: 'PLAY_STORE', expiration_at_ms: exp }, NOW);
  assert.equal(renewal.source, 'play_store');
});

test('RevenueCat cancellation keeps Pro until expiry, expiration ends it', () => {
  const exp = NOW + 5 * 86400000;
  const cancel = revenueCatEventEffect({ id: 'e3', type: 'CANCELLATION', store: 'APP_STORE', expiration_at_ms: exp }, NOW);
  assert.equal(cancel.kind, 'subscription');
  assert.equal(cancel.expiresAt.getTime(), exp);

  const expired = revenueCatEventEffect({ id: 'e4', type: 'EXPIRATION', store: 'APP_STORE', expiration_at_ms: exp }, NOW);
  assert.equal(expired.expiresAt.getTime(), NOW);

  assert.equal(revenueCatEventEffect({ id: 'e5', type: 'TEST' }, NOW).kind, 'ignore');
  assert.equal(revenueCatEventEffect({ id: 'e6', type: 'NON_RENEWING_PURCHASE', store: 'PLAY_STORE' }, NOW).credits, 100);
});

test('RevenueCat user id comes from app_user_id or an alias', () => {
  assert.equal(revenueCatUserId({ app_user_id: USER_ID }), USER_ID);
  assert.equal(revenueCatUserId({ app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', USER_ID] }), USER_ID);
  assert.equal(revenueCatUserId({ app_user_id: '$RCAnonymousID:abc' }), null);
});
