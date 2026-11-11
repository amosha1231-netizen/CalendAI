/**
 * Pro subscription entitlement.
 *
 * Pro can be bought in three places, and all of them end up in the same
 * fields on the User document:
 *   - the website, through Lemon Squeezy (subscription_* webhooks)
 *   - the iOS app, through Apple in-app purchase   } both reported by
 *   - the Android app, through Google Play Billing  } RevenueCat webhooks
 *
 * A user is Pro while `proExpiresAt` is in the future. Each paid period
 * (first payment and every renewal) tops the user's AI credits up to
 * PRO_MONTHLY_CREDITS. The allowance does not stack month over month, and
 * credits a user already has above it are never taken away.
 *
 * The event-mapping functions are pure so they can be tested without a
 * database. `applyEntitlement` does the write.
 */
const mongoose = require('mongoose');

const DAY_MS = 24 * 60 * 60 * 1000;
// Payment providers retry failed renewals for a few days; keep Pro on meanwhile.
const RENEWAL_GRACE_MS = 3 * DAY_MS;
// One-time credit pack (web "buy credits" and store consumables).
const CREDIT_PACK_SIZE = 100;

function proMonthlyCredits() {
  const n = Number(process.env.PRO_MONTHLY_CREDITS);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isProActive(user, now = Date.now()) {
  try {
    const expires = toDate(user?.proExpiresAt);
    return !!expires && expires.getTime() > now;
  } catch (e) {
    return false;
  }
}

// ── Lemon Squeezy ──────────────────────────────

function lemonProVariantId() {
  return process.env.LEMON_SQUEEZY_PRO_VARIANT_ID?.trim() || '';
}

function isLemonProVariant(variantId) {
  const pro = lemonProVariantId();
  return !!pro && variantId !== undefined && variantId !== null && String(variantId) === pro;
}

/**
 * Pro expiry implied by a Lemon Squeezy subscription object's attributes.
 * Every subscription_* event carries the full current subscription, so the
 * latest event always describes the latest state.
 */
function lemonSubscriptionExpiry(attrs, now = Date.now()) {
  const status = String(attrs?.status || '');
  if (['active', 'on_trial', 'past_due'].includes(status)) {
    const renews = toDate(attrs?.renews_at) || toDate(attrs?.trial_ends_at);
    return renews ? new Date(renews.getTime() + RENEWAL_GRACE_MS) : new Date(now + 30 * DAY_MS);
  }
  if (status === 'cancelled') {
    // Cancelled subscriptions stay active until the end of the paid period.
    return toDate(attrs?.ends_at) || new Date(now);
  }
  // expired, unpaid, paused
  return new Date(now);
}

const LEMON_SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused'
]);

/**
 * What a Lemon Squeezy webhook means for the user.
 * @returns {{kind: 'credits'|'subscription'|'renewal'|'ignore', ...}}
 */
function lemonEventEffect(payload, now = Date.now()) {
  const eventName = payload?.meta?.event_name;
  const data = payload?.data || {};
  const attrs = data.attributes || {};
  const id = data.id ? String(data.id) : null;

  if (eventName === 'order_created') {
    if (!id) return { kind: 'ignore', reason: 'missing order id' };
    if (attrs.status && attrs.status !== 'paid') return { kind: 'ignore', reason: `order status ${attrs.status}` };
    // The first payment of a Pro subscription also creates an order; its
    // credits come from subscription_payment_success instead.
    if (isLemonProVariant(attrs.first_order_item?.variant_id)) return { kind: 'ignore', reason: 'subscription order' };
    return { kind: 'credits', eventKey: `order_created:${id}`, orderId: id, credits: CREDIT_PACK_SIZE };
  }

  if (LEMON_SUBSCRIPTION_EVENTS.has(eventName)) {
    if (!id) return { kind: 'ignore', reason: 'missing subscription id' };
    return {
      kind: 'subscription',
      subscriptionId: id,
      expiresAt: lemonSubscriptionExpiry(attrs, now),
      customerPortalUrl: attrs.urls?.customer_portal || null
    };
  }

  if (eventName === 'subscription_payment_success') {
    // data is a subscription invoice; one grant per invoice.
    if (!id) return { kind: 'ignore', reason: 'missing invoice id' };
    return {
      kind: 'renewal',
      eventKey: `ls_invoice:${id}`,
      orderId: id,
      subscriptionId: attrs.subscription_id ? String(attrs.subscription_id) : null,
      credits: proMonthlyCredits()
    };
  }

  return { kind: 'ignore', reason: `unhandled event ${eventName}` };
}

// ── RevenueCat (App Store + Google Play) ────────

/** The CalendAI user id behind a RevenueCat event (we log in with user._id). */
function revenueCatUserId(event) {
  const candidates = [event?.app_user_id, event?.original_app_user_id, ...(Array.isArray(event?.aliases) ? event.aliases : [])];
  return candidates.find((c) => typeof c === 'string' && mongoose.Types.ObjectId.isValid(c) && /^[a-f0-9]{24}$/i.test(c)) || null;
}

function revenueCatSource(store) {
  if (store === 'APP_STORE' || store === 'MAC_APP_STORE') return 'app_store';
  if (store === 'PLAY_STORE') return 'play_store';
  return 'revenuecat';
}

/** Subscription events carry an expiration; consumable credit packs do not. */
function isRevenueCatSubscriptionEvent(event) {
  return event?.expiration_at_ms !== null && event?.expiration_at_ms !== undefined && event?.type !== 'NON_RENEWING_PURCHASE';
}

/**
 * What a RevenueCat subscription event means for the user. Credit packs
 * (NON_RENEWING_PURCHASE and their refunds) are handled in
 * routes/revenuecatRoutes.js.
 * https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 */
function revenueCatEventEffect(event, now = Date.now()) {
  const type = event?.type;
  const id = event?.id ? String(event.id) : null;
  const expires = toDate(event?.expiration_at_ms);
  const source = revenueCatSource(event?.store);
  if (!id) return { kind: 'ignore', reason: 'missing event id' };

  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      if (!expires) return { kind: 'ignore', reason: 'subscription event without expiration' };
      return { kind: 'renewal', eventKey: `rc:${id}`, orderId: id, expiresAt: expires, source, credits: proMonthlyCredits() };
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'CANCELLATION': // auto-renew turned off; still Pro until expiration
      if (event?.cancel_reason === 'CUSTOMER_SUPPORT') {
        // Store refund: Pro ends now.
        return { kind: 'subscription', expiresAt: new Date(now), source };
      }
      if (!expires) return { kind: 'ignore', reason: `${type} without expiration` };
      return { kind: 'subscription', expiresAt: expires, source };
    case 'BILLING_ISSUE':
    case 'SUBSCRIPTION_EXTENDED':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
      if (!expires) return { kind: 'ignore', reason: `${type} without expiration` };
      return { kind: 'subscription', expiresAt: expires, source };
    case 'EXPIRATION':
      return { kind: 'subscription', expiresAt: new Date(now), source };
    default:
      return { kind: 'ignore', reason: `unhandled event ${type}` };
  }
}

// ── Database write ─────────────────────────────

/**
 * Apply an effect to a user. Credit grants are idempotent by eventKey
 * (ProcessedPaymentEvent has a unique index), so webhook retries are safe.
 * @returns {Promise<{duplicate?: boolean}>}
 */
async function applyEntitlement({ User, ProcessedPaymentEvent, user, effect, source, subscriptionId, customerPortalUrl }) {
  const set = {};
  if (effect.expiresAt) {
    set.proExpiresAt = effect.expiresAt;
    set.isPro = effect.expiresAt.getTime() > Date.now();
  }
  if (source || effect.source) set.proSource = effect.source || source;
  if (subscriptionId) set.lemonSubscriptionId = subscriptionId;
  if (customerPortalUrl) set.lemonCustomerPortalUrl = customerPortalUrl;

  if (effect.kind === 'subscription') {
    if (Object.keys(set).length) await User.updateOne({ _id: user._id }, { $set: set });
    return {};
  }

  // 'credits' adds a pack; 'renewal' tops credits up to the monthly allowance.
  const creditUpdate = effect.kind === 'credits'
    ? [{ $set: { ...set, aiCredits: { $add: [{ $ifNull: ['$aiCredits', 0] }, effect.credits] } } }]
    : [{ $set: { ...set, isPro: true, aiCredits: { $max: [{ $ifNull: ['$aiCredits', 0] }, effect.credits] } } }];

  const dbSession = await mongoose.startSession();
  try {
    await ProcessedPaymentEvent.init();
    await dbSession.withTransaction(async () => {
      await ProcessedPaymentEvent.create([{
        eventKey: effect.eventKey,
        orderId: effect.orderId,
        userId: user._id,
        credits: effect.credits
      }], { session: dbSession });
      const updated = await User.findByIdAndUpdate(user._id, creditUpdate, { new: true, session: dbSession });
      if (!updated) throw new Error('Payment user disappeared during crediting.');
    });
  } catch (err) {
    if (err?.code === 11000) return { duplicate: true };
    throw err;
  } finally {
    await dbSession.endSession();
  }
  return {};
}

module.exports = {
  CREDIT_PACK_SIZE,
  RENEWAL_GRACE_MS,
  proMonthlyCredits,
  isProActive,
  isLemonProVariant,
  lemonProVariantId,
  lemonSubscriptionExpiry,
  lemonEventEffect,
  revenueCatUserId,
  isRevenueCatSubscriptionEvent,
  revenueCatEventEffect,
  applyEntitlement
};
