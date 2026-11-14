# iOS app (App Store)

The iOS app is a Capacitor wrapper around the same React frontend. The Xcode
project lives in `frontend/ios` (Swift Package Manager, no CocoaPods).

## Build on a Mac

```bash
cd frontend
npm install
npm run cap:build:ios   # vite build --mode capacitor + cap sync ios
npx cap open ios        # opens Xcode
```

`--mode capacitor` reads `frontend/.env.capacitor`, which points API calls at
the production backend (the app itself runs from `capacitor://localhost`).

In Xcode: select the **App** target → Signing & Capabilities → choose your
team. Bump **Version** / **Build** for every upload, then Product → Archive →
Distribute App → App Store Connect.

## How it differs from the web app

- **Sign-in**: Google refuses OAuth inside a web view, so Google and Microsoft
  sign-in open in the system browser sheet with `?platform=native`. The backend
  carries that in the OAuth `state` and redirects back to
  `com.amos.calendai://auth/?oauth_code=...`, which `src/utils/nativeApp.js`
  turns into the usual `/?oauth_code=...` exchange. No new Google client is
  needed: the redirect URI is still the backend's `/api/auth/google/callback`.
- **CORS**: the backend always allows `capacitor://localhost` (iOS) and
  `https://localhost` (Android).
- **Purchases**: App Store guideline 3.1.1 requires Apple in-app purchase for
  digital goods. The app sells Pro through Apple IAP via RevenueCat and never
  shows or links to the web checkout. Setup: `docs/payments.md`.
- **Permissions** (Info.plist): location (time zone and Shabbat times),
  microphone and speech recognition (voice input). iPhone only, portrait.
- `App/PrivacyInfo.xcprivacy` declares the data the app collects (name, email,
  user content, coarse location; no tracking).

## Store review checklist (App Store + Google Play)

Two ways to buy AI credits, both landing on the signed-in account:
- **Website**: Lemon Squeezy (`/api/payments/webhook`).
- **iOS / Android apps**: Apple / Google in-app purchase through RevenueCat
  (`/api/payments/revenuecat-webhook`). Setup: `docs/in-app-purchases.md`.

The apps never open the web checkout, never link to it, and never say the
website is cheaper or that you can pay elsewhere (App Store 3.1.1 / 3.1.3).

- Any new web price, purchase or upgrade UI must be wrapped in `!isNativeApp()`;
  in the apps, buying goes only through `InAppCreditsSheet` (store prices).
- Error text that the server sends to every client (e.g. the 402 "out of
  credits" message) must stay neutral. The website adds its own "buy more"
  wording in `showOutOfCredits()` in `App.jsx`.
- Account deletion is in the app: account drawer → "Delete account"
  (`DELETE /api/account`, `backend/routes/accountRoutes.js`). Apple 5.1.1(v)
  and Google Play both require it. The public `/delete-account` page is the
  URL to give Google Play's Data safety form.
- Sign in with Apple (guideline 4.8): the iOS app offers Google and Microsoft
  sign-in, so Apple may ask for Sign in with Apple as well. Not built yet.
- Review notes: give the reviewer a demo email + password account with
  credits, and mention that the service closes on Shabbat (submit Sunday to
  Wednesday so review does not land on a closed app).
