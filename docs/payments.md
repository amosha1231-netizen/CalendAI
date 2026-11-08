# Payments

CalendAI sells one thing: **Pro**, a monthly subscription that tops the user's
AI credits up to `PRO_MONTHLY_CREDITS` (default 1000) on every paid month.
A one-time 100-credit pack is still sold on the web.

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

1. **App Store Connect**: sign the Paid Applications agreement, add bank and
   tax details, enroll in the App Store Small Business Program (15%).
   Create an auto-renewable subscription, e.g. `calendai_pro_monthly`.
2. **Play Console**: set up a payments profile, create a subscription with a
   monthly base plan, e.g. `calendai_pro_monthly`. Google charges 15% on
   subscriptions.
3. **RevenueCat** (free up to $2.5k/month revenue):
   - Add both apps (bundle id / package `com.amos.calendai`), connect the
     App Store Connect API key and the Play service account.
   - Create entitlement `pro` and attach both products.
   - Create an offering `default` with a monthly package containing them.
   - Integrations → Webhooks: URL
     `https://calendai-backend-dfmi.onrender.com/api/payments/revenuecat-webhook`,
     Authorization header = a long random string. Put the same string in
     `REVENUECAT_WEBHOOK_AUTH` on Render.
   - API keys: put the secret (v1) key in `REVENUECAT_SECRET_KEY` on Render,
     and the public iOS / Android SDK keys in `frontend/.env.capacitor`
     (`VITE_REVENUECAT_IOS_KEY`, `VITE_REVENUECAT_ANDROID_KEY`).
4. Rebuild the apps (`npm run cap:build:ios` / `cap:build:android`).
   Without a key, that platform's app hides the purchase UI as before.

Test with sandbox testers (Apple) and license testers (Play) before release.
