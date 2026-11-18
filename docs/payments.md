# Payments

CalendAI sells one thing: **Pro**, a monthly subscription that tops the user's
AI credits up to `PRO_MONTHLY_CREDITS` (default 3000) on every paid month.
A one-time credit pack (default 1500) is still sold on the web.

## How AI requests are charged

All prices and allowances live in one file: `backend/config/pricing.js`.

Each AI request costs `real provider cost (USD) × markup (3) × 1000` points.
The real cost is what OpenRouter actually charged for that call (`usage.cost`),
so a price change at the provider is passed on automatically. If OpenRouter
reports no cost, the tokens are priced from OpenRouter's live model price list
(refreshed every 6 hours by `services/modelPricing.js`), and only if that is
unreachable, from the fallback table in `config/pricing.js`.

A typical request costs ~$0.004, so ~12 points. A Pro user who uses all 3,000
points costs at most $1 of AI (~₪3.7) against ~₪21 net from ₪29.

Env overrides (no code change needed): `OPENROUTER_MARKUP_MULTIPLIER`,
`PRO_MONTHLY_CREDITS`, `SIGNUP_CREDITS`, `CREDIT_PACK_CREDITS`.

If a request's price is more than the user's remaining balance, the answer is
still delivered and the balance goes to 0 (never negative); the next request
is refused.

Accounts created before the pricing change got a 100-point gift instead of 300.
`backend/scripts/grantSignupDifference.js` gives them the missing 200 once
(dry run by default; pass `--before=<deploy time> --apply`).

| Where | How | Backend entry point |
|---|---|---|
| Website | Lemon Squeezy checkout (`product: 'pro'` or `'credits'`) | `POST /api/payments/webhook` |
| iOS app | Apple in-app purchase through RevenueCat | `POST /api/payments/revenuecat-webhook` |
| Android app | Google Play Billing through RevenueCat | `POST /api/payments/revenuecat-webhook` |

All three write the same fields on the user: `proExpiresAt` (Pro is on while
it is in the future), `proSource`, and the credits. The logic lives in
`backend/services/subscriptions.js`. Credit grants are idempotent per
webhook event (`ProcessedPaymentEvent`).

Store rules: inside the native apps never show the web price, the web
checkout, or a link to it. A user who paid on the web is simply Pro in the app.

## Lemon Squeezy (website)

1. Create a product with a **monthly subscription** variant (e.g. ₪29).
2. Set `LEMON_SQUEEZY_PRO_VARIANT_ID` on Render to that variant id.
   Until it is set, the "Upgrade to Pro" button keeps selling the credit pack.
3. In Settings → Webhooks, add these events to the existing webhook:
   `order_created`, `subscription_created`, `subscription_updated`,
   `subscription_cancelled`, `subscription_resumed`, `subscription_expired`,
   `subscription_paused`, `subscription_unpaused`, `subscription_payment_success`.

## App Store and Google Play (apps)

**Currently off** (`VITE_IAP_ENABLED=false` in `frontend/.env.capacitor`):
the first store release is web-payment only. Do the steps below when turning
in-app purchase on.

Store setup, RevenueCat project, API keys and the webhook are shared with
the credit packs: follow `docs/in-app-purchases.md` first. For Pro, add:

1. **App Store Connect**: an **auto-renewable subscription** in a
   subscription group, e.g. `calendai_pro_monthly`, monthly.
2. **Play Console**: a **subscription** with a monthly base plan, same id.
3. **RevenueCat**: import the product from both stores, create the
   entitlement **`pro`** and attach it, and add a monthly package to the
   current offering next to the credit packs. The in-app sheet shows the
   subscription with its period, the auto-renew terms and "Restore purchases".
4. **Render**: `REVENUECAT_SECRET_KEY` = RevenueCat secret API key (v1).
   Used by `POST /api/payments/revenuecat-sync` so Pro turns on right after
   a purchase or restore. Optional `REVENUECAT_ENTITLEMENT_ID` if the
   entitlement is not called `pro`.

The same webhook (`backend/routes/revenuecatRoutes.js`) sends subscription
events (they carry `expiration_at_ms`) to `services/subscriptions.js`; credit
packs keep their own path. A store refund of the subscription
(`CANCELLATION` with `cancel_reason: CUSTOMER_SUPPORT`) ends Pro at once.

Test with sandbox testers (Apple) and license testers (Play) before release.
