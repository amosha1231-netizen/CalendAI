import React, { useEffect, useState } from 'react';
import { X, Zap, Package, Check, Loader2, Sparkles } from 'lucide-react';
import api from '../api/axios';
import { toBody } from './TasksToday';

/**
 * "Packages" screen (website only; the store apps never show prices).
 * Each option says what it costs and what it gives. Prices come from
 * /api/payments/plans, which reads them from Lemon Squeezy itself, so this
 * screen always shows the same price as the payment page.
 */
const STR = {
  he: {
    title: 'חבילות',
    sub: 'כל פעולת AI (הוספה בשפה חופשית, סידור יום, הקלטה) משתמשת בכמה נקודות.',
    balance: 'יש לך {n} נקודות',
    pro: 'מנוי Pro',
    proTag: 'משתלם',
    perMonth: 'לחודש',
    pack: 'חבילת נקודות',
    once: 'תשלום חד־פעמי',
    points: '{n} נקודות',
    actions: 'כ-{n} פעולות AI',
    proGive: ['{points} נקודות מתחדשות כל חודש', 'כ-{actions} פעולות AI בחודש', 'ביטול בכל רגע'],
    packGive: ['{points} נקודות, לא פגות', 'כ-{actions} פעולות AI', 'בלי מנוי'],
    buyPro: 'להצטרף ל-Pro',
    buyPack: 'לקנות חבילה',
    priceAtCheckout: 'המחיר מוצג בדף התשלום',
    proSoon: 'המנוי ייפתח בקרוב',
    free: 'בהרשמה מקבלים {n} נקודות מתנה.',
    loading: 'טוען חבילות...',
    close: 'סגור',
    loginFirst: 'צריך להתחבר כדי לקנות.'
  },
  en: {
    title: 'Packages',
    sub: 'Each AI action (adding in plain words, arranging a day, voice) uses a few points.',
    balance: 'You have {n} points',
    pro: 'Pro subscription',
    proTag: 'Best value',
    perMonth: 'per month',
    pack: 'Points pack',
    once: 'One-time payment',
    points: '{n} points',
    actions: 'about {n} AI actions',
    proGive: ['{points} points renewed every month', 'about {actions} AI actions a month', 'Cancel anytime'],
    packGive: ['{points} points that never expire', 'about {actions} AI actions', 'No subscription'],
    buyPro: 'Go Pro',
    buyPack: 'Buy pack',
    priceAtCheckout: 'Price shown at checkout',
    proSoon: 'Subscription opens soon',
    free: 'New accounts get {n} free points.',
    loading: 'Loading packages...',
    close: 'Close',
    loginFirst: 'Sign in to buy.'
  }
};

function formatPrice(amount, currency, lang) {
  if (amount === null || amount === undefined) return null;
  try {
    return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', {
      style: 'currency', currency, minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2
    }).format(amount);
  } catch (e) {
    return `${amount} ${currency}`;
  }
}

const fill = (s, vars) => Object.keys(vars).reduce((acc, k) => acc.split(`{${k}}`).join(String(vars[k])), s);

export default function PlansSheet({ lang = 'he', user, credits, onClose, onBuy, busy }) {
  const s = STR[lang] || STR.en;
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/api/payments/plans')
      .then(res => { if (alive) setData(res.data); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const plans = data?.plans || (failed ? [
    { id: 'pro', available: true, points: 3000, actions: 250, price: null },
    { id: 'credits', available: true, points: 1500, actions: 125, price: null }
  ] : null);
  const currency = data?.currency || 'ILS';

  return toBody(
    <div style={{ zIndex: 10040 }} className="fixed inset-0 flex items-end sm:items-center justify-center" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-[#F6F5FB] rounded-t-[28px] sm:rounded-[28px] shadow-2xl max-h-[calc(100%-16px)] overflow-y-auto">
        <div className="sticky top-0 bg-[#F6F5FB] px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-[#0E1020]">{s.title}</h2>
            <p className="text-sm text-slate-500 mt-1">{s.sub}</p>
          </div>
          <button onClick={onClose} aria-label={s.close} className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-slate-600 shadow-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 space-y-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
          {typeof credits === 'number' && (
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
              <Zap className="w-4 h-4" /> {fill(s.balance, { n: Math.floor(credits) })}
            </div>
          )}

          {!plans && (
            <div className="py-10 text-center text-slate-400 text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />{s.loading}</div>
          )}

          {plans && plans.map(plan => {
            const isPro = plan.id === 'pro';
            const price = formatPrice(plan.price, currency, lang);
            const gives = (isPro ? s.proGive : s.packGive).map(line => fill(line, { points: plan.points.toLocaleString(), actions: plan.actions.toLocaleString() }));
            const disabled = !plan.available || busy;
            return (
              <div key={plan.id} className={`rounded-3xl p-4 bg-white ${isPro ? 'border-2 border-violet-400 shadow-[0_8px_30px_-12px_rgba(124,58,237,.45)]' : 'border border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isPro ? 'bg-gradient-to-br from-violet-500 to-pink-500 text-white' : 'bg-amber-100 text-amber-600'}`}>
                      {isPro ? <Sparkles className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                    </span>
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        {isPro ? s.pro : s.pack}
                        {isPro && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 rounded-full px-2 py-0.5">{s.proTag}</span>}
                      </div>
                      <div className="text-xs text-slate-500">{fill(s.points, { n: plan.points.toLocaleString() })}</div>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    {price ? (
                      <>
                        <div className="text-xl font-extrabold text-slate-900" dir="ltr">{price}</div>
                        <div className="text-[11px] text-slate-500">{isPro ? s.perMonth : s.once}</div>
                      </>
                    ) : (
                      <div className="text-[11px] text-slate-400 max-w-[96px] leading-tight">{s.priceAtCheckout}</div>
                    )}
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {gives.map(line => (
                    <li key={line} className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className={`w-4 h-4 shrink-0 ${isPro ? 'text-violet-600' : 'text-amber-600'}`} strokeWidth={3} />{line}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onBuy && onBuy(plan.id)}
                  className={`mt-4 w-full h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 ${isPro ? 'bg-gradient-to-l from-violet-600 to-pink-500 text-white shadow-lg' : 'bg-slate-900 text-white'}`}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {!plan.available ? s.proSoon : isPro ? s.buyPro : s.buyPack}
                </button>
              </div>
            );
          })}

          {data && <p className="text-xs text-slate-400 text-center pt-1">{fill(s.free, { n: data.signupPoints })}{!user ? ` ${s.loginFirst}` : ''}</p>}
        </div>
      </div>
    </div>
  );
}
