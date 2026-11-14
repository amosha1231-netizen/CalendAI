import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lock, Loader2, RefreshCw } from 'lucide-react';
import safeStorage from '../utils/safeStorage';

// Owner-only page (/admin/costs): the owner's own AI requests and what each one cost.
// Not linked from the app. The server answers only for OWNER_EMAILS accounts and
// returns only the signed-in owner's own requests; everyone else gets "not available".

const USD_TO_ILS = 3.7; // rough rate, only for an at-a-glance shekel figure

const ACTION_LABELS = {
  'parse-schedule': 'בקשה לעוזר',
  'quick-add': 'הוספה מהירה',
  'parse-image': 'תמונה',
  'reschedule': 'סידור מחדש',
  'siri': 'Siri'
};

function money(usd) {
  const v = Number(usd) || 0;
  return `$${v < 0.01 ? v.toFixed(5) : v.toFixed(4)}`;
}
function shekels(usd) {
  const v = (Number(usd) || 0) * USD_TO_ILS;
  return `≈ ₪${v < 0.1 ? v.toFixed(4) : v.toFixed(2)}`;
}
function when(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

export default function AdminCosts() {
  const [state, setState] = useState({ status: 'loading', data: null });

  const load = async () => {
    setState(s => ({ ...s, status: 'loading' }));
    let token = null;
    try { token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt'); } catch (e) {}
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/my-ai-costs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
        cache: 'no-store'
      });
      if (res.status === 404 || res.status === 401 || res.status === 403) {
        setState({ status: 'denied', data: null });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setState({ status: 'ok', data: await res.json() });
    } catch (e) {
      setState({ status: 'error', data: null });
    }
  };

  useEffect(() => { load(); }, []);

  const goHome = () => { try { window.location.href = '/'; } catch (e) {} };
  const { status, data } = state;
  const totals = data?.totals;
  const requests = data?.requests || [];
  const avg = totals && totals.count ? totals.realCostUSD / totals.count : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 font-sans" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <button onClick={goHome} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4 rotate-180" /> חזרה ל-CalendAI
        </button>

        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 rounded-xl"><Lock className="w-5 h-5 text-indigo-600" /></div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">העלות של הבקשות שלי</h1>
                <p className="text-xs text-slate-500">גלוי רק לך כמנהל. מוצגות רק הבקשות שלך, לא של משתמשים אחרים.</p>
              </div>
            </div>
            {status !== 'loading' && status !== 'denied' && (
              <button onClick={load} className="p-2 rounded-full hover:bg-slate-100" aria-label="רענון">
                <RefreshCw className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>
        </div>

        {status === 'loading' && (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        )}

        {status === 'denied' && (
          <div className="bg-white rounded-2xl border p-6 text-center text-slate-600">הדף הזה לא זמין.</div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-2xl border p-6 text-center text-red-600">לא הצלחנו לטעון כרגע. נסה שוב בעוד רגע.</div>
        )}

        {status === 'ok' && totals && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-2xl border p-4">
                <div className="text-xs text-slate-500">בקשות</div>
                <div className="text-2xl font-bold text-slate-900">{totals.count}</div>
              </div>
              <div className="bg-white rounded-2xl border p-4">
                <div className="text-xs text-slate-500">כמה ה-AI עלה לך</div>
                <div className="text-2xl font-bold text-slate-900" dir="ltr">{money(totals.realCostUSD)}</div>
                <div className="text-xs text-slate-500" dir="ltr">{shekels(totals.realCostUSD)}</div>
              </div>
              <div className="bg-white rounded-2xl border p-4 col-span-2 sm:col-span-1">
                <div className="text-xs text-slate-500">ממוצע לבקשה</div>
                <div className="text-2xl font-bold text-slate-900" dir="ltr">{money(avg)}</div>
                <div className="text-xs text-slate-500" dir="ltr">{shekels(avg)}</div>
              </div>
            </div>

            {requests.length === 0 ? (
              <div className="bg-white rounded-2xl border p-6 text-center text-slate-500">עוד אין בקשות. שלח בקשה לעוזר וחזור לכאן.</div>
            ) : (
              <ul className="space-y-2">
                {requests.map((r, i) => (
                  <li key={`${r.timestamp}-${i}`} className="bg-white rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-slate-400 mb-1">
                          {when(r.timestamp)} · {ACTION_LABELS[r.action] || r.action}
                        </div>
                        <div className="text-sm text-slate-800 break-words">
                          {r.requestText || <span className="text-slate-400">(בקשה ישנה, הטקסט לא נשמר)</span>}
                        </div>
                      </div>
                      <div className="text-left shrink-0" dir="ltr">
                        <div className="text-sm font-bold text-slate-900">{money(r.realCostUSD)}</div>
                        <div className="text-[11px] text-slate-500">{shekels(r.realCostUSD)}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400 flex flex-wrap gap-x-3">
                      <span>{Number(r.totalTokens || 0).toLocaleString()} טוקנים</span>
                      <span>{r.credits} קרדיטים</span>
                      <span>{r.realCostIsExact ? 'עלות מדויקת מ-OpenRouter' : 'עלות משוערת'}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
