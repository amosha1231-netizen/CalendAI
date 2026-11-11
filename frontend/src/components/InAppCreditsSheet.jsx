import React, { useEffect, useState } from 'react';
import { Zap, Loader2, X } from 'lucide-react';
import { getCreditPacks, buyCreditPack } from '../utils/inAppPurchase';

/**
 * Buy AI credits inside the iOS / Android app (Apple / Google billing).
 * Shown only when isIapAvailable(). Never mentions the website or its prices.
 */
export default function InAppCreditsSheet({ open, onClose, lang, user, outOfCredits, credits, onPurchased }) {
  const he = lang === 'he';
  const [packs, setPacks] = useState(null); // null = loading
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const userId = user?._id || user?.id || null;

  useEffect(() => {
    if (!open || !userId) return undefined;
    let alive = true;
    setPacks(null);
    setError('');
    setDone(false);
    getCreditPacks(userId)
      .then((list) => { if (alive) setPacks(list); })
      .catch((e) => {
        console.warn('[IAP] Could not load products:', e?.message);
        if (alive) {
          setPacks([]);
          setError(he ? 'לא הצלחנו לטעון את החבילות מהחנות. נסו שוב בעוד רגע.' : 'Could not load packs from the store. Please try again shortly.');
        }
      });
    return () => { alive = false; };
  }, [open, userId, he]);

  if (!open) return null;

  const buy = async (pack) => {
    setBusyId(pack.id);
    setError('');
    try {
      const result = await buyCreditPack(userId, pack);
      if (result.ok) {
        setDone(true);
        if (onPurchased) onPurchased();
      }
    } catch (e) {
      console.warn('[IAP] Purchase failed:', e?.message);
      setError(he ? 'הרכישה לא הושלמה. לא חויבתם.' : 'The purchase did not go through. You were not charged.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-[9999]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label={he ? 'סגירה' : 'Close'} className="absolute top-3 end-3 p-2 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Zap className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">
          {outOfCredits ? (he ? 'נגמרו לך הקרדיטים' : 'You are out of credits') : (he ? 'קרדיטים לפעולות AI' : 'AI credits')}
        </h3>
        {typeof credits === 'number' && !outOfCredits && (
          <p className="text-sm text-slate-500 mb-1">{he ? `יתרה: ${credits}` : `Balance: ${credits}`}</p>
        )}
        <p className="text-sm text-slate-500 mb-5">
          {he ? 'קרדיטים משמשים לקביעת אירועים בשפה חופשית, מתמונה ובקול.' : 'Credits are used to schedule from plain text, photos and voice.'}
        </p>

        {done ? (
          <p className="text-sm font-medium text-emerald-600 mb-4">
            {he ? 'תודה! הקרדיטים יתווספו לחשבון בעוד כמה שניות.' : 'Thank you! Your credits will appear in a few seconds.'}
          </p>
        ) : packs === null ? (
          <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-2 mb-3">
            {packs.map((pack) => (
              <button
                key={pack.id}
                onClick={() => buy(pack)}
                disabled={!!busyId}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition shadow disabled:opacity-60"
              >
                <span className="truncate">{pack.title}</span>
                <span className="shrink-0 ms-3">{busyId === pack.id ? <Loader2 className="w-4 h-4 animate-spin" /> : pack.priceString}</span>
              </button>
            ))}
            {packs.length === 0 && !error && (
              <p className="text-sm text-slate-500">{he ? 'אין כרגע חבילות לרכישה.' : 'No packs are available right now.'}</p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button onClick={onClose} className="w-full mt-1 text-sm text-slate-400 hover:text-slate-600 py-2 transition">
          {done ? (he ? 'סגירה' : 'Close') : (he ? 'לא עכשיו' : 'Not now')}
        </button>
      </div>
    </div>
  );
}
