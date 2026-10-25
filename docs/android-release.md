# Android app (Google Play)

The Android app is the same Capacitor wrapper as iOS (see `ios-release.md` for
how sign-in, CORS and purchases work in the native app). The Android Studio
project lives in `frontend/android`.

## Build a release bundle

```bash
cd frontend
npm install
npm run cap:build:android   # vite build --mode capacitor + cap sync android
npx cap open android        # opens Android Studio
```

Signing: create `frontend/android/keystore.properties` (git-ignored) next to
your upload keystore:

```properties
storeFile=calendai-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

Then Build → Generate Signed App Bundle, or `./gradlew bundleRelease` in
`frontend/android`. The bundle is `app/build/outputs/bundle/release/app-release.aab`.

Raise `versionCode` (and `versionName`) in `app/build.gradle` for every upload.

## Native details

- Sign-in returns through `com.amos.calendai://auth`, registered as an
  intent filter on `MainActivity`.
- Permissions: internet, coarse location (time zone and Shabbat times),
  microphone (voice input).
- Icons and splash use `android-assets/`.
