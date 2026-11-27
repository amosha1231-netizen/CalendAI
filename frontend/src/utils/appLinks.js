/**
 * Where people download the CalendAI apps.
 *
 * iOS: until Apple approves the App Store release (and it is released), the
 * public TestFlight link is what works. Flip IOS_APP_STORE_LIVE to true once
 * the app is live on the App Store.
 * Android: the Play listing is a closed test, so there is no public link yet.
 * Set ANDROID_PLAY_URL when the app reaches production.
 */
export const IOS_APP_STORE_LIVE = false;
export const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id6838830605';
export const IOS_TESTFLIGHT_URL = 'https://testflight.apple.com/join/BbcMQn7V';
export const ANDROID_PLAY_URL = null; // e.g. 'https://play.google.com/store/apps/details?id=com.amos.calendai'

export const iosDownloadUrl = () => (IOS_APP_STORE_LIVE ? IOS_APP_STORE_URL : IOS_TESTFLIGHT_URL);
