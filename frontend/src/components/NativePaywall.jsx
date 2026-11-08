import React, { useEffect, useState } from 'react';
import { X, Zap, Loader2, RotateCcw } from 'lucide-react';
import { getStorePackages, buyStorePackage, restoreStorePurchases, nativePlatform, LEGAL_LINKS } from '../utils/nativePurchases';
import { notifyCreditsPurchased } from '../utils/lemonCheckout';

// App.jsx refreshes the user a few times on this event, which picks up the
// credits once the store webhook lands.
const refreshCreditsSoon = notifyCreditsPurchased;

function periodLabel(period, he) {
  if (!period) return he ? 'רכישה חד-פעמית' : 'One-time purchase';
  if (period === 'P1M') return he ? 'לחודש, מתחדש אוטומטית' : 'per month, renews automatically';
  if (period === 'P1Y') return he ? 'לשנה, מתחדש אוטומטית' : 'per year, renews automatically';
  if (period === 'P1W') return he ? 'לשבוע, מתחדש אוטומטית' : 'per week, renews automatically';
  return he ? 'מתחדש אוטומטית' : 'renews automatically';
}

/**
 * Pro / credits purchase sheet for the iOS and Android apps.
 * Prices come from the store (RevenueCat offering), never hard-coded.
 */
export default function NativePaywall({ lang, user, onClose, onPurchased }) {
  const he = lang === 'he';
  const userId = user?._id || user?.id;
  const [packages, setPackages] = useState(null);
  const [busy, setBusy] = useState(null); // package id | 'restore'
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    getStorePackages(userId)
      .then((pkgs) => { if (alive) setPackages(pkgs); })
      .catch((e) => {
        console.warn('[IAP] offerings failed:', e);
        if (alive) {
          setPackages([]);
          setError(he ? 'לא הצלחנו לטעון את המחירים מהחנות. נסה שוב בעוד רגע.' : 'Could not load prices from the store. Try again shortly.');
        }
      });
    return () => { alive = false; };
  }, [userId, he]);

  const buy = async (pkg) => {
    setBusy(pkg.id);
    setError('');
    try {
      const { cancelled } = await buyStorePackage(userId, pkg);
      if (cancelled) return;
      refreshCreditsSoon();
      if (onPurchased) onPurchased();
      setMessage(he ? 'תודה! הרכישה הושלמה ✨' : 'Thank you! Purchase complete ✨');
    } catch (e) {
      console.warn('[IAP] purchase failed:', e);
      setError(he ? 'הרכישה לא הושלמה. לא חויבת. נסה שוב.' : 'The purchase did not go through. You were not charged. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy('restore');
    setError('');
    try {
      const result = await restoreStorePurchases(userId);
      refreshCreditsSoon();
      if (result?.isPro && onPurchased) onPurchased();
      setMessage(result?.isPro
        ? (he ? 'המנוי שוחזר ✨' : 'Subscription restored ✨')
        : (he ? 'לא נמצאו רכישות קודמות בחשבון החנות הזה.' : 'No previous purchases found for this store account.'));
    } catch (e) {
      console.warn('[IAP] restore failed:', e);
      setError(he ? 'השחזור נכשל. נסה שוב.' : 'Restore failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const isIos = nativePlatform() === 'ios';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-[10000]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center relative" dir={he ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 end-3 p-2 text-slate-400 hover:text-slate-600" aria-label={he ? 'סגור' : 'Close'}>
          <X className="w-5 h-5" />
        </button>
        <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
          <Zap className="w-7 h-7 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">{he ? 'CalendAI Pro' : 'CalendAI Pro'}</h3>
        <p className="text-sm text-slate-500 mb-5">
          {he ? 'מכסה חודשית של קרדיטים לעוזר ה-AI, שמתמלאת מחדש בכל חידוש.' : 'A monthly allowance of AI assistant credits, refilled on every renewal.'}
        </p>

        {packages === null && (
          <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        )}

        <div className="space-y-2">
          {(packages || []).map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => buy(pkg)}
              disabled={!!busy}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl font-bold text-sm transition disabled:opacity-60 ${
                pkg.isSubscription ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg' : 'bg-slate-100 text-slate-800'
              }`}
            >
              <span className="text-start">
                <span className="block">{pkg.title}</span>
                <span className="block text-xs font-normal opacity-90">{periodLabel(pkg.period, he)}</span>
              </span>
              <span className="shrink-0">{busy === pkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : pkg.price}</span>
            </button>
          ))}
        </div>

        {message && <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">{message}</div>}
        {error && <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

        <button onClick={restore} disabled={!!busy} className="mt-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-60">
          {busy === 'restore' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {he ? 'שחזור רכישות' : 'Restore purchases'}
        </button>

        <p className="mt-4 text-[11px] leading-snug text-slate-400">
          {isIos
            ? (he ? 'המנוי מתחדש אוטומטית ומחויב בחשבון ה-Apple ID שלך, אלא אם בוטל לפחות 24 שעות לפני סוף התקופה. אפשר לנהל ולבטל בהגדרות החשבון ב-App Store.'
                  : 'Subscription renews automatically and is charged to your Apple ID unless cancelled at least 24 hours before the period ends. Manage or cancel in your App Store account settings.')
            : (he ? 'המנוי מתחדש אוטומטית ומחויב בחשבון Google Play שלך. אפשר לבטל בכל עת ב-Google Play.'
                  : 'Subscription renews automatically and is charged to your Google Play account. Cancel anytime in Google Play.')}
        </p>
        <div className="mt-2 flex justify-center gap-3 text-[11px] text-slate-500 underline">
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noreferrer">{he ? 'תנאי שימוש' : 'Terms'}</a>
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noreferrer">{he ? 'פרטיות' : 'Privacy'}</a>
          {isIos && <a href={LEGAL_LINKS.appleEula} target="_blank" rel="noreferrer">EULA</a>}
        </div>
      </div>
    </div>
  );
}
