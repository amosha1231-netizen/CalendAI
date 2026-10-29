import React, { useEffect, useState } from "react";
import { X, Send, Loader2, CheckCircle, AlertCircle, AlertTriangle, Video, Users, Copy, Check, ExternalLink, CalendarPlus } from "lucide-react";
import api from "../api/axios";

// Google Calendar does the heavy lifting: the event is created on the host's
// calendar with the guests as attendees, and Google emails each of them a
// regular invitation (Yes / No / Maybe, .ics, Meet link).

const LABELS = {
  he: {
    title: 'שליחת הזמנה ליומן',
    subtitle: 'כל משתתף יקבל הזמנה של Google עם כן / לא / אולי',
    meetingTitle: 'נושא הפגישה', meetingTitlePlaceholder: 'למשל: פגישת פרויקט גמר',
    date: 'תאריך', start: 'התחלה', end: 'סיום',
    guests: 'משתתפים', guestsPlaceholder: 'כתובת מייל, ואז Enter', add: 'הוסף',
    meet: 'הוספת קישור Google Meet',
    note: 'הערה למשתתפים (לא חובה)',
    checking: 'בודק את היומן שלך...',
    noConflicts: 'אין לך אירועים אחרים בזמן הזה',
    conflicts: (n) => n === 1 ? 'מתנגש עם אירוע אחד ביומן שלך:' : `מתנגש עם ${n} אירועים ביומן שלך:`,
    send: 'שלח הזמנה', sending: 'שולח...',
    sentTitle: 'ההזמנה נשלחה!',
    sentTo: (n) => n === 1 ? 'Google שלח הזמנה למשתתף אחד.' : `Google שלח הזמנה ל־${n} משתתפים.`,
    meetLink: 'קישור לפגישה', copy: 'העתק', copied: 'הועתק',
    openCalendar: 'פתיחה ביומן של Google', done: 'סגור', another: 'הזמנה נוספת',
    untitled: 'ללא כותרת',
    signIn: 'צריך להתחבר עם Google כדי לשלוח הזמנות.',
    errors: {
      invalid_email: 'אחת מכתובות המייל לא תקינה.',
      no_attendees: 'צריך להוסיף לפחות משתתף אחד.',
      too_many_attendees: 'אפשר עד 50 משתתפים בהזמנה.',
      end_before_start: 'שעת הסיום צריכה להיות אחרי שעת ההתחלה.',
      date_in_past: 'התאריך כבר עבר.',
      shabbat: 'שבת שלום 🕯️ אי אפשר לקבוע פגישה בשבת.',
      google_not_connected: 'צריך לחבר את Google Calendar כדי לשלוח הזמנות.',
      google_auth_expired: 'החיבור ל־Google פג. התחבר מחדש ונסה שוב.',
      auth_required: 'צריך להתחבר כדי לשלוח הזמנות.',
      rate_limited: 'יותר מדי ניסיונות. נסה שוב בעוד דקה.',
      generic: 'שליחת ההזמנה נכשלה. נסה שוב.',
    },
  },
  en: {
    title: 'Send a calendar invite',
    subtitle: 'Every guest gets a Google invite with Yes / No / Maybe',
    meetingTitle: 'Meeting title', meetingTitlePlaceholder: 'e.g. Final project meeting',
    date: 'Date', start: 'Start', end: 'End',
    guests: 'Guests', guestsPlaceholder: 'Email address, then Enter', add: 'Add',
    meet: 'Add a Google Meet link',
    note: 'Note for guests (optional)',
    checking: 'Checking your calendar...',
    noConflicts: 'No other events at this time',
    conflicts: (n) => n === 1 ? 'Conflicts with 1 event on your calendar:' : `Conflicts with ${n} events on your calendar:`,
    send: 'Send invite', sending: 'Sending...',
    sentTitle: 'Invite sent!',
    sentTo: (n) => n === 1 ? 'Google emailed the invite to 1 guest.' : `Google emailed the invite to ${n} guests.`,
    meetLink: 'Meeting link', copy: 'Copy', copied: 'Copied',
    openCalendar: 'Open in Google Calendar', done: 'Close', another: 'Send another',
    untitled: 'Untitled',
    signIn: 'Sign in with Google to send invites.',
    errors: {
      invalid_email: 'One of the email addresses is not valid.',
      no_attendees: 'Add at least one guest.',
      too_many_attendees: 'Up to 50 guests per invite.',
      end_before_start: 'The end time must be after the start time.',
      date_in_past: 'That date has already passed.',
      shabbat: 'Shabbat Shalom 🕯️ Meetings cannot be scheduled on Shabbat.',
      google_not_connected: 'Connect Google Calendar to send invites.',
      google_auth_expired: 'Your Google sign-in expired. Sign in again and retry.',
      auth_required: 'Sign in to send invites.',
      rate_limited: 'Too many attempts. Try again in a minute.',
      generic: 'Could not send the invite. Please try again.',
    },
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function localIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultTimes() {
  const now = new Date();
  const startHour = Math.min(now.getHours() + 1, 22);
  return {
    start: `${String(startHour).padStart(2, '0')}:00`,
    end: `${String(startHour + 1).padStart(2, '0')}:00`,
  };
}

/** Add one hour to "HH:MM", capped at 23:59. */
function plusOneHour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function SendInvite({ lang, user, onClose, onSent }) {
  const L = LABELS[lang] || LABELS.en;
  const isRTL = lang === 'he';
  const [meetingTitle, setMeetingTitle] = useState('');
  const [date, setDate] = useState(() => localIsoDate(new Date()));
  const [startTime, setStartTime] = useState(() => defaultTimes().start);
  const [endTime, setEndTime] = useState(() => defaultTimes().end);
  const [guests, setGuests] = useState([]);
  const [guestDraft, setGuestDraft] = useState('');
  const [addMeet, setAddMeet] = useState(true);
  const [note, setNote] = useState('');
  const [conflicts, setConflicts] = useState(null); // null = unknown, [] = none
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const errorText = (err) => {
    const code = err?.response?.data?.code;
    return L.errors[code] || err?.response?.data?.error || L.errors.generic;
  };

  // Check the host's calendar for overlaps whenever the time changes.
  useEffect(() => {
    if (!user || !date || !startTime || !endTime || endTime <= startTime) {
      setConflicts(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const { data } = await api.post('/api/invites/conflicts', { date, startTime, endTime });
        if (!cancelled) setConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
      } catch (err) {
        // A failed check shouldn't block sending; just hide the hint.
        if (!cancelled) setConflicts(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user, date, startTime, endTime]);

  const addGuests = (raw) => {
    const parts = String(raw).split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return true;
    const bad = parts.find(p => !EMAIL_RE.test(p));
    if (bad) {
      setError(`${L.errors.invalid_email} (${bad})`);
      return false;
    }
    setError('');
    setGuests(prev => [...new Set([...prev, ...parts])]);
    setGuestDraft('');
    return true;
  };

  const onGuestKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addGuests(guestDraft);
    } else if (e.key === 'Backspace' && !guestDraft && guests.length) {
      setGuests(prev => prev.slice(0, -1));
    }
  };

  const handleSend = async () => {
    // Pick up an address that was typed but not yet turned into a chip.
    let allGuests = guests;
    if (guestDraft.trim()) {
      if (!addGuests(guestDraft)) return;
      const typed = guestDraft.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      allGuests = [...new Set([...guests, ...typed])];
    }
    if (!allGuests.length) {
      setError(L.errors.no_attendees);
      return;
    }
    setSending(true);
    setError('');
    try {
      const { data } = await api.post('/api/invites', {
        title: meetingTitle.trim() || L.untitled,
        description: note.trim() || undefined,
        date, startTime, endTime,
        attendees: allGuests,
        addMeet,
      });
      setResult(data);
      if (onSent) onSent(data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const copyMeetLink = async () => {
    if (!result?.meetLink) return;
    try {
      await navigator.clipboard.writeText(result.meetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Clipboard can be blocked (iOS in-app browsers); the link is visible to copy by hand.
    }
  };

  const resetForAnother = () => {
    setResult(null);
    setGuests([]);
    setGuestDraft('');
    setMeetingTitle('');
    setNote('');
  };

  const inputClass = "w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5 gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-blue-600" />
              {L.title}
            </h3>
            {!result && <p className="text-xs text-slate-500 mt-1">{L.subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 transition" aria-label={L.done}>
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
              <div>
                <p className="font-bold text-green-800">{L.sentTitle}</p>
                <p className="text-sm text-green-700">{L.sentTo(result.attendees?.length || 0)}</p>
              </div>
            </div>
            {result.meetLink && (
              <div className="border rounded-xl p-3">
                <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><Video className="w-3.5 h-3.5" /> {L.meetLink}</p>
                <div className="flex items-center gap-2">
                  <a href={result.meetLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 truncate flex-1" dir="ltr">{result.meetLink.replace(/^https:\/\//, '')}</a>
                  <button onClick={copyMeetLink} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? L.copied : L.copy}
                  </button>
                </div>
              </div>
            )}
            {result.htmlLink && (
              <a href={result.htmlLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-sm text-slate-700 border rounded-lg py-2 hover:bg-slate-50">
                <ExternalLink className="w-4 h-4" /> {L.openCalendar}
              </a>
            )}
            <div className="flex items-center justify-end gap-3">
              <button onClick={resetForAnother} className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50 transition">{L.another}</button>
              <button onClick={onClose} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">{L.done}</button>
            </div>
          </div>
        ) : (
          <>
            {!user && (
              <div className="flex items-center gap-2 text-amber-800 text-sm mb-4 bg-amber-50 p-3 rounded-lg border border-amber-200">
                <AlertCircle className="w-4 h-4 shrink-0" /> <span>{L.signIn}</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{L.meetingTitle}</label>
                <input type="text" value={meetingTitle} maxLength={200} onChange={e => setMeetingTitle(e.target.value)} placeholder={L.meetingTitlePlaceholder} className={inputClass} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{L.date}</label>
                <input type="date" value={date} min={localIsoDate(new Date())} onChange={e => setDate(e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{L.start}</label>
                  <input type="time" value={startTime} onChange={e => { const v = e.target.value; setStartTime(v); if (v && v >= endTime) setEndTime(plusOneHour(v)); }} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{L.end}</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} />
                </div>
              </div>

              {checking ? (
                <p className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {L.checking}</p>
              ) : conflicts && conflicts.length > 0 ? (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  <p className="font-medium flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> {L.conflicts(conflicts.length)}</p>
                  <ul className="space-y-0.5 ps-5 list-disc">
                    {conflicts.slice(0, 5).map((c, i) => (
                      <li key={i}><span dir="ltr">{c.startTime}–{c.endTime}</span> {c.title || L.untitled}</li>
                    ))}
                  </ul>
                </div>
              ) : conflicts ? (
                <p className="text-xs text-green-700 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> {L.noConflicts}</p>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-400" /> {L.guests}</label>
                <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
                  {guests.map(g => (
                    <span key={g} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs rounded-full ps-2.5 pe-1 py-1" dir="ltr">
                      {g}
                      <button onClick={() => setGuests(prev => prev.filter(x => x !== g))} className="p-0.5 rounded-full hover:bg-blue-100" aria-label="remove">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    value={guestDraft}
                    onChange={e => setGuestDraft(e.target.value)}
                    onKeyDown={onGuestKeyDown}
                    onBlur={() => { if (guestDraft.trim()) addGuests(guestDraft); }}
                    placeholder={guests.length ? '' : L.guestsPlaceholder}
                    className="flex-1 min-w-[10rem] text-sm text-slate-800 outline-none bg-transparent px-1"
                    dir="ltr"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={addMeet} onChange={e => setAddMeet(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                <Video className="w-4 h-4 text-slate-500" /> {L.meet}
              </label>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{L.note}</label>
                <textarea value={note} maxLength={2000} rows={2} onChange={e => setNote(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={onClose} className="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50 transition">{L.done}</button>
              <button
                onClick={handleSend}
                disabled={sending || !user || (!guests.length && !guestDraft.trim())}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-300 transition"
              >
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> {L.sending}</> : <><Send className="w-4 h-4" /> {L.send}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
