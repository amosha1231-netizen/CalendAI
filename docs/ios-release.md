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
- **Sign in with Apple** (guideline 4.8): on iOS only, an Apple button sits
  above Google on every sign-in screen. `App/SignInWithApplePlugin.swift` (a
  local plugin registered in `App/MainViewController.swift`) shows the native
  sheet and returns Apple's identity token; the app posts it to
  `POST /api/auth/apple`, which verifies it against Apple's keys
  (`backend/services/appleAuth.js`, audience `com.amos.calendai`) and returns
  the usual JWT. `App/App.entitlements` enables the capability; with automatic
  signing Xcode adds it to the App ID the first time you sign with the team.
  No backend env vars are needed. Accounts are matched by Apple's `sub`; an
  existing account is linked by email only when Apple marks it verified, using
  the same rules as Google login.
- **CORS**: the backend always allows `capacitor://localhost` (iOS) and
  `https://localhost` (Android).
- **Purchases**: App Store guideline 3.1.1 requires Apple in-app purchase for
  digital goods, so the native app hides the Pro / credits checkout and the
  "install to home screen" tab.
- **Permissions** (Info.plist): location (time zone and Shabbat times),
  microphone and speech recognition (voice input). iPhone only, portrait.
- `App/PrivacyInfo.xcprivacy` declares the data the app collects (name, email,
  user content, coarse location; no tracking).
