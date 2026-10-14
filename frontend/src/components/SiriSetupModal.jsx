import React, { useState, useEffect } from 'react';
import { X, Mic, Copy, Check, Loader2, Trash2 } from 'lucide-react';
import safeStorage from '../utils/safeStorage';

const API_BASE = import.meta.env.VITE_API_URL || "";

// Shared iCloud Shortcut. On import it asks for the user's Siri key
// (Import Question on its "Text" action), so nothing personal is baked in.
const SHORTCUT_ICLOUD_URL = 'https://www.icloud.com/shortcuts/ebd0870422d045a58175ca07c12c3771';

function getToken() {
  try {
    return safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt') || '';
  } catch (e) {
    return '';
  }
}

async function siriKeyRequest(method) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/siri/key`, {
    method,
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/**
 * Copy text that may still be loading. iOS Safari only allows clipboard writes
 * inside the tap itself, so a ClipboardItem with a pending promise is handed over
 * synchronously; other browsers fall back to writeText once the text is ready.
 */
function copyPendingText(textPromise) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      const item = new ClipboardItem({
        'text/plain': textPromise.then(text => new Blob([text], { type: 'text/plain' }))
      });
      return navigator.clipboard.write([item]).then(() => true).catch(() =>
        textPromise.then(text => navigator.clipboard.writeText(text)).then(() => true).catch(() => false)
      );
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      return textPromise.then(text => navigator.clipboard.writeText(text)).then(() => true).catch(() => false);
    }
  } catch (e) {}
  return Promise.resolve(false);
}

function CopyField({ label, value, copied, onCopy }) {
  return (
    <div className="mb-3 text-start">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
        <code className="flex-1 text-xs text-slate-800 break-all" dir="ltr">{value}</code>
        <button
          onClick={onCopy}
          className="shrink-0 w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600"
          aria-label="Copy"
        >
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function SiriSetupModal({ lang, user, onClose }) {
  const he = lang === 'he';
  const [status, setStatus] = useState(null); // { hasKey, endpoint }
  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!user) return;
    siriKeyRequest('GET')
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [user]);

  const handleRevoke = async () => {
    if (!window.confirm(he ? 'לבטל את המפתח? קיצור הדרך יפסיק לעבוד.' : 'Revoke the key? Your Shortcut will stop working.')) return;
    setLoading(true);
    setError('');
    try {
      await siriKeyRequest('DELETE');
      setNewKey('');
      setStatus((s) => ({ ...s, hasKey: false }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // One tap: (create a key if needed) → copy it → open the shared Shortcut.
  // The Shortcut's import question asks for the key, which is already on the clipboard.
  const handleAddToSiri = async () => {
    if (!newKey && status?.hasKey && !window.confirm(he
      ? 'יצירת מפתח חדש תנתק קיצור דרך קיים. להמשיך?'
      : 'Creating a new key disconnects any existing Shortcut. Continue?')) return;
    setLoading(true);
    setError('');
    const keyPromise = newKey
      ? Promise.resolve(newKey)
      : siriKeyRequest('POST').then((data) => {
          setNewKey(data.key);
          setStatus({ hasKey: true, endpoint: data.endpoint });
          return data.key;
        });
    const copiedPromise = copyPendingText(keyPromise);
    try {
      await keyPromise;
      const copiedOk = await copiedPromise;
      setCopied(copiedOk ? 'key' : '');
      if (typeof window !== 'undefined') window.location.href = SHORTCUT_ICLOUD_URL;
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = (id, value) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(id);
          setTimeout(() => setCopied(''), 2000);
        }).catch(() => {});
      }
    } catch (e) {}
  };

  const steps = he
    ? [
        'פתחו את אפליקציית "קיצורי דרך" (Shortcuts) באייפון ולחצו +.',
        'הוסיפו פעולה "הכתבת טקסט" (Dictate Text) ובחרו שפה: עברית.',
        'הוסיפו פעולה "קבלת תוכן של כתובת URL" (Get Contents of URL) והדביקו את כתובת השרת.',
        'בפעולה הזו לחצו "הצג עוד": שיטה POST. תחת כותרות (Headers) הוסיפו X-CalendAI-Key עם המפתח שלכם. תחת גוף הבקשה בחרו JSON, הוסיפו שדה text וערכו "טקסט מוכתב".',
        'הוסיפו פעולה "הקרא טקסט" (Speak Text) עם "תוכן של כתובת URL".',
        'קראו לקיצור הדרך בשם קצר, למשל "קלנדאיי" ושמרו.',
        'עכשיו אמרו: "היי סירי, קלנדאיי", ואז את מה שרוצים לקבוע, למשל "פגישה עם דני מחר בשלוש".'
      ]
    : [
        'Open the Shortcuts app on your iPhone and tap +.',
        'Add a "Dictate Text" action.',
        'Add a "Get Contents of URL" action and paste the server URL.',
        'Tap "Show More": Method POST. Under Headers add X-CalendAI-Key with your key. Under Request Body choose JSON, add a field "text" set to "Dictated Text".',
        'Add a "Speak Text" action with "Contents of URL".',
        'Name the shortcut something short, e.g. "CalendAI", and save.',
        'Now say: "Hey Siri, CalendAI", then what to schedule, e.g. "meeting with Dan tomorrow at 3pm".'
      ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 sm:p-8 relative"
        dir={he ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-500/30">
            <Mic className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            {he ? 'הפעל את CalendAI דרך Siri' : 'Enable CalendAI with Siri'}
          </h3>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">
            {he
              ? 'חברו את CalendAI לסירי בלחיצה אחת, ומעכשיו אפשר לומר לסירי לקבוע פגישות, והן יתווספו ליומן שלכם.'
              : 'Connect CalendAI to Siri in one tap. Then just ask Siri to schedule meetings and they land in your calendar.'}
          </p>
        </div>

        {!user ? (
          <p className="text-sm text-center text-amber-600 bg-amber-50 rounded-xl p-3">
            {he ? 'יש להתחבר לחשבון כדי לחבר את סירי.' : 'Please log in to connect Siri.'}
          </p>
        ) : (
          <>
            <button
              onClick={handleAddToSiri}
              disabled={loading || !status}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 mb-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
              {he ? 'הוסף לסירי' : 'Add to Siri'}
            </button>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4 text-start">
              <ol className="list-decimal ps-5 space-y-1.5 text-xs text-slate-600 leading-relaxed">
                {(he
                  ? [
                      'לחצו "הוסף לסירי". המפתח האישי שלכם יועתק אוטומטית.',
                      'באפליקציית קיצורי הדרך לחצו "הגדר קיצור דרך" (Set Up Shortcut).',
                      'הדביקו את המפתח בשדה, ולחצו "הוסף קיצור דרך".',
                      'אמרו: "היי סירי, CalendAI", ואז מה לקבוע. למשל: "פגישה עם דני מחר בשתיים".'
                    ]
                  : [
                      'Tap "Add to Siri". Your personal key is copied automatically.',
                      'In Shortcuts, tap "Set Up Shortcut".',
                      'Paste the key into the field and tap "Add Shortcut".',
                      'Say: "Hey Siri, CalendAI", then what to schedule, e.g. "meeting with Dan tomorrow at 2pm".'
                    ]
                ).map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>

            {newKey && (
              <>
                <CopyField
                  label={he ? 'המפתח שלכם (אם צריך להדביק שוב)' : 'Your key (if you need to paste it again)'}
                  value={newKey}
                  copied={copied === 'key'}
                  onCopy={() => copy('key', newKey)}
                />
                <p className="text-xs text-amber-600 mb-4">
                  {he
                    ? 'מטעמי אבטחה המפתח לא יוצג שוב אחרי סגירת החלון. אל תשתפו אותו.'
                    : 'For security, the key is not shown again after closing. Do not share it.'}
                </p>
              </>
            )}

            {status?.hasKey && !newKey && (
              <p className="text-xs text-slate-500 mb-4 text-center">
                {he ? 'כבר יש לכם מפתח פעיל. "הוסף לסירי" ייצור מפתח חדש.' : 'You already have an active key. "Add to Siri" creates a new one.'}
              </p>
            )}

            {error && <p className="text-xs text-red-600 mb-4 text-center">{error}</p>}

            <details className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-start">
              <summary className="text-sm font-bold text-slate-700 cursor-pointer">
                {he ? 'הגדרה ידנית (מתקדם)' : 'Manual setup (advanced)'}
              </summary>
              {status?.endpoint && (
                <div className="mt-3">
                  <CopyField
                    label={he ? 'כתובת השרת (URL)' : 'Server URL'}
                    value={status.endpoint}
                    copied={copied === 'url'}
                    onCopy={() => copy('url', status.endpoint)}
                  />
                </div>
              )}
              <ol className="list-decimal ps-5 space-y-2 text-xs text-slate-600 leading-relaxed mt-2">
                {steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </details>

            {status?.hasKey && (
              <button
                onClick={handleRevoke}
                disabled={loading}
                className="w-full mt-4 flex items-center justify-center gap-2 text-xs text-red-500 hover:text-red-700 py-2 transition"
              >
                <Trash2 className="w-4 h-4" />
                {he ? 'בטל את מפתח הסירי' : 'Revoke Siri key'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
