# In-app purchases (AI credits in the iOS / Android apps)

The store apps sell AI credit packs through Apple / Google billing, using
RevenueCat (free up to $2,500 monthly revenue). The website keeps selling
through Lemon Squeezy. Both add credits to the same signed-in account.

How it works:
1. The app configures RevenueCat with the signed-in user's id
   (`frontend/src/utils/inAppPurchase.js`), shows the packs with the store's
   own prices (`frontend/src/components/InAppCreditsSheet.jsx`), and opens
   Apple's / Google's payment sheet.
2. RevenueCat validates the receipt and calls
   `POST /api/payments/revenuecat-webhook` (`backend/routes/revenuecatRoutes.js`).
3. The server adds the credits once per transaction (same
   `ProcessedPaymentEvent` idempotency as Lemon Squeezy). A store refund
   (`CANCELLATION`) takes them back, never below 0.
4. The app refreshes credits at 0, 3 and 8 seconds.

The purchase button only appears in the apps once a RevenueCat key is set.

## One-time setup

### 1. Stores (account owner)
- **Apple**: App Store Connect → Business → sign the **Paid Apps** agreement,
  add bank and tax info. Apply to the **App Store Small Business Program**
  (15% instead of 30%).
- **Google**: Play Console → set up a **payments profile** (merchant account).
  Google charges 15% on the first $1M per year; enrol the developer account
  in the 15% service-fee tier if Play Console asks.

### 2. Products (one per store, type **Consumable** / **In-app product**)
Use the same id in both stores, with the number of credits in it, e.g.
`calendai_credits_100` (100 credits). Price it in the store's price tiers.
Apple also needs a review screenshot of the purchase sheet.

In Xcode: App target → Signing & Capabilities → **+ In-App Purchase**.

### 3. RevenueCat
1. Create a project, add the iOS app (bundle `com.amos.calendai`, App Store
   Connect in-app purchase key) and the Android app (package
   `com.amos.calendai`, Play service account JSON).
2. Products → import `calendai_credits_100` from both stores.
3. Offerings → the **current** offering gets one package per credit pack.
4. Project → API keys → copy the public **Apple** key (`appl_…`) and
   **Google** key (`goog_…`) into `frontend/.env.capacitor`:
   `VITE_REVENUECAT_IOS_KEY`, `VITE_REVENUECAT_ANDROID_KEY`. Rebuild the apps.
5. Integrations → **Webhooks** → URL
   `https://calendai-backend-dfmi.onrender.com/api/payments/revenuecat-webhook`,
   Authorization header value = a long random string.

### 4. Render (backend env)
- `REVENUECAT_WEBHOOK_AUTH` = the same Authorization value as in RevenueCat.
- Optional `IAP_PRODUCT_CREDITS` = `productId=credits,…` if a product id does
  not contain its credit count.
- Optional `REVENUECAT_SANDBOX_CREDITS=0` to stop crediting sandbox /
  TestFlight purchases. Leave it on until the app passes review: App Review
  buys in sandbox and must see the credits arrive.

## Test
TestFlight (iOS) or an internal-testing track (Android) with a sandbox /
license-tester account: buy a pack, the sheet says "Thank you", the credits
badge goes up within seconds. Render logs show
`✅ RevenueCat (...): +100 credits for user …`.

## Rules for the apps
- Never mention the website's price, that the website is cheaper, or that
  you can pay elsewhere. Never link to the web checkout.
- Note: the server is closed on Shabbat and Yom Tov, so a webhook sent then
  gets 503. RevenueCat retries for a few hours only; if a purchase is missing
  after Shabbat, resend the event from RevenueCat → Customer → event history.
