import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Calendar, Clock, Loader2, X, Check, Mail, AlertCircle, Users, Sparkles, Phone, Send, Copy, MessageCircle, ShieldCheck, ArrowRight, UserCheck } from "lucide-react";
import safeStorage from "../utils/safeStorage";
import { detectContact } from "../utils/contactDetect";

const API_BASE = import.meta.env.VITE_API_URL || "";

const DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_HE = {
  Sunday: 'ראשון', Monday: 'שני', Tuesday: 'שלישי',
  Wednesday: 'רביעי', Thursday: 'חמישי', Friday: 'שישי', Saturday: 'שבת'
};
const DAY_SHORT_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const DAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PICK_DAYS = 14;          // how far ahead the host can offer times
const DAY_START_MIN = 8 * 60;  // first start time offered
const DAY_END_MIN = 22 * 60;   // meetings must end by then
const STEP_MIN = 30;
const MAX_SLOTS = 30;          // matches the server's cap

function authHeaders() {
  let token = null;
  try {
    token = safeStorage.getItem('token') || safeStorage.getItem('calendai-jwt');
  } catch {
    token = null;
  }
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// Local calendar date → "YYYY-MM-DD" (numeric parts only; safe on iOS Safari).
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hhmm(totalMin) {
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}

// "10:00 AM" / "10:00" → minutes since midnight, or null.
function toMinutes(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (match[3]) {
    const pm = match[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return h * 60 + m;
}

// The host's own busy windows on a given date, from the app's schedule.
function busyWindowsFor(schedule, date) {
  const dayKey = DAY_KEYS[date.getDay()];
  const iso = isoOf(date);
  const events = (schedule && Array.isArray(schedule[dayKey])) ? schedule[dayKey] : [];
  const windows = [];
  for (const ev of events) {
    if (!ev || ev.isSleep) continue;
    if (ev.targetDate && String(ev.targetDate).slice(0, 10) !== iso) continue;
    const start = toMinutes(ev.startTime);
    const end = toMinutes(ev.endTime);
    if (start === null || end === null || end <= start) continue;
    windows.push([start, end, ev.title || '']);
  }
  return windows;
}

/**
 * "Meet a friend": by default the host picks a few times that suit them
 * (from their own calendar) and sends them — by WhatsApp/SMS when they typed
 * a phone number, by email when they typed an email, or as a plain link.
 * The friend opens the link, picks one, and the meeting lands on the host's
 * calendar (Google Calendar emails the friend an invite when they leave an
 * email) and the host gets a ping.
 *
 * Comparing both calendars is optional and only happens after the friend
 * approves it in their own CalendAI app (inviteeConsent on the session).
 */
export default function MutualScheduler({ lang, t, locationId, schedule, onClose, onMeetingConfirmed }) {
  const isRTL = lang === 'he';
  const L = (he, en) => (lang === 'he' ? he : en);

  // 'start' | 'pick' | 'share' | 'waiting-consent' | 'select-slot' | 'confirm' | 'success'
  const [step, setStep] = useState('start');
  const [contactInput, setContactInput] = useState("");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState(30);
  const contact = useMemo(() => detectContact(contactInput), [contactInput]);

  // ── Pick-your-times flow ──
  const days = useMemo(() => {
    const out = [];
    const base = new Date();
    for (let i = 0; i < PICK_DAYS + 2 && out.length < PICK_DAYS; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      if (d.getDay() === 6) continue; // no meetings on Shabbat
      out.push(d);
    }
    return out;
  }, []);
  const [activeDayIso, setActiveDayIso] = useState(() => isoOf(days[0] || new Date()));
  const [picked, setPicked] = useState([]); // [{ date: 'YYYY-MM-DD', start: minutes }]
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);

  // ── Requests from friends who want to compare calendars with me ──
  const [requests, setRequests] = useState([]);
  const [answering, setAnswering] = useState(null);

  // ── Compare-calendars flow (needs the friend's approval) ──
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [inviteeDisplayName, setInviteeDisplayName] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [consent, setConsent] = useState('pending');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [mutualDays, setMutualDays] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [confirmedSession, setConfirmedSession] = useState(null);
  const [slotTakenNotice, setSlotTakenNotice] = useState("");

  const dayLabel = (dayKey) => (lang === 'he' ? (DAY_NAMES_HE[dayKey] || dayKey) : dayKey);

  const formatPicked = useCallback((p) => {
    const [y, m, d] = p.date.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dayName = lang === 'he' ? `יום ${DAY_NAMES_HE[DAY_KEYS[date.getDay()]]}` : DAY_KEYS[date.getDay()];
    return `${dayName} ${d}.${m} · ${hhmm(p.start)}`;
  }, [lang]);

  const cancelSession = useCallback((sid) => {
    if (!sid) return;
    fetch(`${API_BASE}/api/mutual/sessions/${sid}/cancel`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include"
    }).catch(() => {});
  }, []);

  // Cancel an abandoned compare-calendars session when this screen unmounts.
  const liveRef = useRef({ sessionId: null, step: 'start' });
  useEffect(() => {
    liveRef.current = { sessionId, step };
  }, [sessionId, step]);
  useEffect(() => {
    return () => {
      const { sessionId: sid, step: finalStep } = liveRef.current;
      if (sid && finalStep !== 'success') cancelSession(sid);
    };
  }, [cancelSession]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !confirming && !lookupLoading && !creating) onClose(); };
    try { document.addEventListener('keydown', onKey); } catch (e) {}
    return () => { try { document.removeEventListener('keydown', onKey); } catch (e) {} };
  }, [onClose, confirming, lookupLoading, creating]);

  // Pending "compare calendars" requests addressed to me.
  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/mutual/requests`, { headers: authHeaders(), credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch {
      // not signed in / offline: nothing to show
    }
  }, []);
  useEffect(() => { loadRequests(); }, [loadRequests]);

  const answerRequest = async (sid, approve) => {
    setAnswering(sid);
    try {
      await fetch(`${API_BASE}/api/mutual/sessions/${sid}/consent`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ approve })
      });
    } catch {
      // the list refresh below shows whatever the server kept
    } finally {
      setAnswering(null);
      loadRequests();
    }
  };

  // ===================== Pick-your-times =====================
  const activeDay = days.find(d => isoOf(d) === activeDayIso) || days[0];
  const busy = useMemo(() => (activeDay ? busyWindowsFor(schedule, activeDay) : []), [schedule, activeDay]);
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const isToday = activeDay && isoOf(activeDay) === isoOf(new Date());

  const startTimes = useMemo(() => {
    const out = [];
    for (let s = DAY_START_MIN; s + duration <= DAY_END_MIN; s += STEP_MIN) out.push(s);
    return out;
  }, [duration]);

  const slotState = (start) => {
    if (isToday && start <= nowMin) return { disabled: true, reason: 'past' };
    const end = start + duration;
    const clash = busy.find(([bs, be]) => start < be && end > bs);
    if (clash) return { disabled: true, reason: 'busy', title: clash[2] };
    return { disabled: false };
  };

  const isPicked = (date, start) => picked.some(p => p.date === date && p.start === start);
  const togglePick = (date, start) => {
    setCreateError("");
    setPicked(prev => {
      if (prev.some(p => p.date === date && p.start === start)) return prev.filter(p => !(p.date === date && p.start === start));
      if (prev.length >= MAX_SLOTS) return prev;
      return [...prev, { date, start }].sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1));
    });
  };

  // Changing the duration can make picked times overlap the host's events; drop those.
  useEffect(() => {
    setPicked(prev => prev.filter(p => {
      const [y, m, d] = p.date.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const end = p.start + duration;
      if (end > DAY_END_MIN) return false;
      return !busyWindowsFor(schedule, date).some(([bs, be]) => p.start < be && end > bs);
    }));
  }, [duration, schedule]);

  const meetingTitle = subject.trim() || L('פגישה', 'Meeting');

  const shareMessage = useMemo(() => {
    if (!shareLink) return '';
    const lines = picked.map(p => `• ${formatPicked(p)}`).join('\n');
    return lang === 'he'
      ? `היי! 👋 בחרתי כמה זמנים שנוחים לי ל${meetingTitle} (${duration} דק׳):\n${lines}\n\nבחר/י את מה שמתאים לך כאן, ושנינו נקבל את פרטי הפגישה:\n${shareLink}`
      : `Hi! 👋 Here are a few times that work for me for ${meetingTitle} (${duration} min):\n${lines}\n\nPick the one that suits you here and we'll both get the meeting details:\n${shareLink}`;
  }, [shareLink, picked, formatPicked, lang, meetingTitle, duration]);

  const handleCreateLink = async () => {
    if (!picked.length || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch(`${API_BASE}/api/booking/create-link`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({
          subject: meetingTitle,
          duration,
          slots: picked.map(p => ({ date: p.date, hour: Math.floor(p.start / 60), minute: p.start % 60 })),
          locationId,
          inviteeContact: contact.type ? contactInput.trim() : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || L('לא הצלחנו ליצור קישור.', 'Could not create the link.'));
      setShareLink(data.link);
      setStep('share');
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const openExternal = (url) => {
    try {
      const w = window.open(url, '_blank');
      if (!w) window.location.href = url;
    } catch {
      try { window.location.href = url; } catch (e) {}
    }
  };
  const sendWhatsApp = () => {
    const to = contact.type === 'phone' ? contact.value : '';
    openExternal(`https://wa.me/${to}?text=${encodeURIComponent(shareMessage)}`);
  };
  const sendSms = () => {
    openExternal(`sms:+${contact.value}?&body=${encodeURIComponent(shareMessage)}`);
  };
  const sendEmail = () => {
    const to = contact.type === 'email' ? contact.value : '';
    const subj = L(`תיאום ${meetingTitle}`, `Scheduling: ${meetingTitle}`);
    openExternal(`mailto:${to}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(shareMessage)}`);
  };
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // ===================== Compare calendars (with consent) =====================
  const fetchAvailability = useCallback(async (sid) => {
    setAvailabilityLoading(true);
    setAvailabilityError("");
    setMutualDays([]);
    try {
      const res = await fetch(`${API_BASE}/api/mutual/sessions/${sid}/availability`, {
        headers: authHeaders(),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load mutual availability.");
      setMutualDays(data.days || []);
    } catch (err) {
      setAvailabilityError(err.message);
    } finally {
      setAvailabilityLoading(false);
    }
  }, []);

  const handleAskToCompare = async () => {
    if (contact.type !== 'email') return;
    const email = contact.value;
    cancelSession(sessionId);
    setSessionId(null);
    setLookupLoading(true);
    setLookupError("");
    setNotFound(false);
    setSlotTakenNotice("");
    try {
      const lookupRes = await fetch(`${API_BASE}/api/mutual/lookup?email=${encodeURIComponent(email)}`, {
        headers: authHeaders(),
        credentials: "include"
      });
      const lookupData = await lookupRes.json();
      if (!lookupRes.ok) throw new Error(lookupData.error || "Lookup failed.");
      if (!lookupData.found || !lookupData.hasGoogle) {
        setNotFound(true);
        return;
      }
      setInviteeDisplayName(lookupData.displayName || email);

      const sessionRes = await fetch(`${API_BASE}/api/mutual/sessions`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ inviteeEmail: email, subject: subject || undefined, duration, locationId })
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error || "Could not start a mutual scheduling session.");
      setSessionId(sessionData.sessionId);
      setConsent(sessionData.consent || 'pending');
      setStep('waiting-consent');
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const checkConsent = useCallback(async (sid) => {
    try {
      const res = await fetch(`${API_BASE}/api/mutual/sessions/${sid}`, { headers: authHeaders(), credentials: "include" });
      const data = await res.json();
      if (!res.ok) return;
      setConsent(data.consent);
      if (data.consent === 'granted') {
        setStep('select-slot');
        fetchAvailability(sid);
      }
    } catch {
      // try again on the next tick
    }
  }, [fetchAvailability]);

  // While waiting, check every few seconds (stops once answered or after ~10 minutes).
  useEffect(() => {
    if (step !== 'waiting-consent' || !sessionId || consent !== 'pending') return undefined;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      if (ticks > 120) { clearInterval(id); return; }
      checkConsent(sessionId);
    }, 5000);
    return () => clearInterval(id);
  }, [step, sessionId, consent, checkConsent]);

  const switchToPickTimes = () => {
    cancelSession(sessionId);
    setSessionId(null);
    setNotFound(false);
    setStep('pick');
  };

  const handlePickMutualSlot = (date, day, slot) => {
    setSelectedSlot({ date, day, startTime: slot.startTime, endTime: slot.endTime });
    setConfirmError("");
    setSlotTakenNotice("");
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!selectedSlot || !sessionId) return;
    setConfirming(true);
    setConfirmError("");
    try {
      const res = await fetch(`${API_BASE}/api/mutual/sessions/${sessionId}/confirm`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ date: selectedSlot.date, startTime: selectedSlot.startTime, endTime: selectedSlot.endTime })
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setSlotTakenNotice(data.error || "Failed to confirm the mutual meeting.");
          setStep('select-slot');
          fetchAvailability(sessionId);
        } else {
          setConfirmError(data.error || "Failed to confirm the mutual meeting.");
        }
        return;
      }
      setConfirmedSession(data.session);
      setStep('success');
      if (onMeetingConfirmed) onMeetingConfirmed();
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirming(false);
    }
  };

  // ===================== Render =====================
  const title = t.mutualTitle || L('תיאום פגישה עם חבר', 'Meet a friend');
  const shell = (children, { onBack, icon, heading, sub, backDisabled } = {}) => (
    <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" aria-label={title}>
      <div className="booking-header">
        <button onClick={onBack || onClose} className="booking-close-btn" disabled={backDisabled} aria-label={L('סגור', 'Close')}>
          <X className="w-5 h-5" />
        </button>
        <div className="booking-header-content">
          {icon || <Users className="w-6 h-6 text-blue-600" />}
          <div>
            <h2 className="booking-title">{heading || title}</h2>
            {sub && <p className="booking-subtitle">{sub}</p>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );

  // ── START ──
  if (step === 'start') {
    const hint = contact.type === 'phone'
      ? { icon: <Phone className="w-3.5 h-3.5" />, text: L('זיהינו מספר טלפון: נשלח בוואטסאפ או SMS', 'Phone number: we’ll send it by WhatsApp or SMS') }
      : contact.type === 'email'
        ? { icon: <Mail className="w-3.5 h-3.5" />, text: L('זיהינו מייל: נשלח במייל', 'Email: we’ll send it by email') }
        : contactInput.trim()
          ? { icon: <AlertCircle className="w-3.5 h-3.5" />, text: L('זה לא נראה כמו מייל או מספר טלפון', 'That doesn’t look like an email or phone number'), warn: true }
          : null;

    return shell(
      <>
        {requests.length > 0 && (
          <div className="mx-4 mb-2 space-y-2">
            {requests.map(r => (
              <div key={r.sessionId} className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" />
                  {L(`${r.hostName} רוצה למצוא איתך זמן`, `${r.hostName} wants to find a time with you`)}
                </p>
                <p className="text-xs text-indigo-700 mt-1">
                  {L('לאשר השוואה בין היומנים? רק שעות פנוי/תפוס משותפות, בלי פרטי האירועים.', 'Allow comparing calendars? Only free/busy times are shared, never event details.')}
                </p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => answerRequest(r.sessionId, true)} disabled={answering === r.sessionId}
                    className="flex-1 rounded-lg bg-indigo-600 text-white text-sm font-semibold py-2 disabled:opacity-60">
                    {L('מאשר/ת', 'Allow')}
                  </button>
                  <button onClick={() => answerRequest(r.sessionId, false)} disabled={answering === r.sessionId}
                    className="flex-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-sm font-semibold py-2 disabled:opacity-60">
                    {L('לא עכשיו', 'Not now')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="booking-guest-section">
          <label className="booking-label" htmlFor="mutual-contact">
            {L('למי לשלוח? מייל או טלפון (לא חובה)', 'Send to (optional): email or phone')}
          </label>
          <input
            id="mutual-contact"
            type="text"
            inputMode={contact.type === 'phone' ? 'tel' : 'email'}
            autoComplete="off"
            value={contactInput}
            onChange={e => setContactInput(e.target.value)}
            placeholder={L('050-1234567 או friend@mail.com', 'friend@mail.com or +1 555 0100')}
            className="booking-input"
            dir="ltr"
          />
          {hint && (
            <p className={`mt-1.5 text-xs flex items-center gap-1 ${hint.warn ? 'text-amber-700' : 'text-emerald-700'}`}>
              {hint.icon}<span>{hint.text}</span>
            </p>
          )}
        </div>

        <div className="booking-guest-section">
          <label className="booking-label" htmlFor="mutual-subject">{L('על מה הפגישה?', 'What’s it about?')}</label>
          <input
            id="mutual-subject"
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder={L('קפה, שיחה, אימון…', 'Coffee, a call, a workout…')}
            className="booking-input"
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>

        <div className="booking-duration-section">
          <label className="booking-label">{t.bookingDuration || L('משך', 'Duration')}</label>
          <div className="booking-duration-options">
            {[15, 30, 45, 60, 90].map(m => (
              <button key={m} onClick={() => setDuration(m)} className={`booking-duration-btn ${duration === m ? 'active' : ''}`}>
                {m} {L('דק׳', 'min')}
              </button>
            ))}
          </div>
        </div>

        <div className="booking-footer">
          <button onClick={() => setStep('pick')} className="booking-confirm-btn">
            <Calendar className="w-5 h-5" /> {L('בחר זמנים שנוחים לי', 'Pick times that suit me')}
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            {L('החבר יבחר אחד מהם, ושניכם תקבלו את פרטי הפגישה.', 'Your friend picks one and you both get the meeting details.')}
          </p>
        </div>

        {contact.type === 'email' && (
          <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-slate-500" /> {L('החבר משתמש ב‑CalendAI?', 'Friend uses CalendAI?')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {L('אפשר לבקש ממנו אישור להשוות בין היומנים ולמצוא זמן פנוי לשניכם. לא נבדוק את היומן שלו לפני שיאשר.',
                'You can ask them to allow comparing calendars to find a free time for both. We won’t look at their calendar until they approve.')}
            </p>
            <button onClick={handleAskToCompare} disabled={lookupLoading}
              className="mt-2 w-full rounded-lg border border-blue-200 bg-white text-blue-700 text-sm font-semibold py-2 flex items-center justify-center gap-1.5 disabled:opacity-60">
              {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {L('בקש אישור להשוואת יומנים', 'Ask to compare calendars')}
            </button>
            {notFound && (
              <p className="text-xs text-amber-700 mt-2">
                {L('לא מצאנו משתמש CalendAI עם יומן Google במייל הזה. אפשר פשוט לבחור זמנים ולשלוח לו.', 'No CalendAI user with Google Calendar has that email. Just pick times and send them instead.')}
              </p>
            )}
            {lookupError && <p className="text-xs text-red-600 mt-2">{lookupError}</p>}
          </div>
        )}
      </>,
      { backDisabled: lookupLoading, sub: L('בחר כמה זמנים שנוחים לך ושלח לחבר', 'Pick a few times that suit you and send them') }
    );
  }

  // ── PICK TIMES ──
  if (step === 'pick') {
    const shortNames = lang === 'he' ? DAY_SHORT_HE : DAY_SHORT_EN;
    return shell(
      <>
        <div className="px-4">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" role="tablist">
            {days.map(d => {
              const iso = isoOf(d);
              const count = picked.filter(p => p.date === iso).length;
              const active = iso === activeDayIso;
              return (
                <button key={iso} role="tab" aria-selected={active} onClick={() => setActiveDayIso(iso)}
                  className={`relative shrink-0 w-14 rounded-xl border py-2 text-center transition ${active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
                  <span className="block text-[11px] opacity-80">{shortNames[d.getDay()]}</span>
                  <span className="block text-base font-bold leading-tight">{d.getDate()}</span>
                  {count > 0 && (
                    <span className={`absolute -top-1.5 ${isRTL ? '-left-1.5' : '-right-1.5'} min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center ${active ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-2 mb-3">
            {startTimes.map(s => {
              const iso = activeDayIso;
              const state = slotState(s);
              const on = isPicked(iso, s);
              return (
                <button key={s} disabled={state.disabled && !on} onClick={() => togglePick(iso, s)}
                  title={state.reason === 'busy' ? state.title : undefined}
                  aria-pressed={on}
                  className={`rounded-lg border py-2 text-sm font-medium transition ${on
                    ? 'bg-blue-600 border-blue-600 text-white shadow'
                    : state.disabled
                      ? 'bg-slate-100 border-slate-100 text-slate-300 line-through'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400'}`}>
                  {hhmm(s)}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mb-2">{L('שעות מחוקות תפוסות ביומן שלך.', 'Crossed-out times are busy in your calendar.')}</p>
        </div>

        {picked.length > 0 && (
          <div className="mx-4 mb-2 rounded-xl bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs font-semibold text-blue-800 mb-2">{L(`בחרת ${picked.length} זמנים`, `${picked.length} times picked`)}</p>
            <div className="flex flex-wrap gap-1.5">
              {picked.map(p => (
                <button key={`${p.date}-${p.start}`} onClick={() => togglePick(p.date, p.start)}
                  className="inline-flex items-center gap-1 rounded-full bg-white border border-blue-200 px-2.5 py-1 text-xs text-blue-800">
                  {formatPicked(p)} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        {createError && (
          <div className="booking-slot-error"><AlertCircle className="w-4 h-4" /><span>{createError}</span></div>
        )}

        <div className="booking-footer">
          <button onClick={handleCreateLink} disabled={!picked.length || creating} className="booking-confirm-btn">
            {creating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {L('מכין קישור…', 'Creating link…')}</>
              : <><Send className="w-5 h-5" /> {picked.length ? L(`המשך לשליחה (${picked.length})`, `Continue (${picked.length})`) : L('בחר לפחות זמן אחד', 'Pick at least one time')}</>}
          </button>
        </div>
      </>,
      { onBack: () => setStep('start'), backDisabled: creating, heading: L('מתי נוח לך?', 'When suits you?'), sub: `${meetingTitle} · ${duration} ${L('דק׳', 'min')}`, icon: <Calendar className="w-6 h-6 text-blue-600" /> }
    );
  }

  // ── SHARE ──
  if (step === 'share') {
    const who = contact.type ? contactInput.trim() : '';
    return shell(
      <>
        <div className="mx-4 mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500 mb-1">{L('ההודעה שתישלח', 'Message')}</p>
          <p className="text-sm text-slate-700 whitespace-pre-line break-words">{shareMessage}</p>
        </div>

        <div className="px-4 space-y-2 mb-3">
          {contact.type === 'phone' && (
            <>
              <button onClick={sendWhatsApp} className="booking-share-btn booking-share-whatsapp w-full">
                <MessageCircle className="w-5 h-5" /> {L(`שלח בוואטסאפ ל‑${who}`, `WhatsApp ${who}`)}
              </button>
              <button onClick={sendSms} className="booking-share-btn w-full">
                <Phone className="w-5 h-5" /> {L('שלח ב‑SMS', 'Send by SMS')}
              </button>
            </>
          )}
          {contact.type === 'email' && (
            <button onClick={sendEmail} className="booking-share-btn w-full">
              <Mail className="w-5 h-5" /> {L(`שלח במייל ל‑${who}`, `Email ${who}`)}
            </button>
          )}
          {!contact.type && (
            <>
              <button onClick={sendWhatsApp} className="booking-share-btn booking-share-whatsapp w-full">
                <MessageCircle className="w-5 h-5" /> {L('שלח בוואטסאפ', 'Send on WhatsApp')}
              </button>
              <button onClick={sendEmail} className="booking-share-btn w-full">
                <Mail className="w-5 h-5" /> {L('שלח במייל', 'Send by email')}
              </button>
            </>
          )}
          <button onClick={copyMessage} className="booking-share-btn w-full">
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            {copied ? L('הועתק', 'Copied') : L('העתק הודעה וקישור', 'Copy message and link')}
          </button>
        </div>

        <div className="mx-4 mb-4 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800 flex gap-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{L('כשהחבר יבחר זמן, הפגישה תיכנס ליומן שלך ותקבל התראה. אם השאיר מייל, Google ישלח לו הזמנה ליומן.',
            'When your friend picks a time it goes into your calendar and you get a ping. If they leave an email, Google sends them a calendar invite.')}</span>
        </div>

        <div className="booking-footer">
          <button onClick={onClose} className="booking-success-close-btn">{t.bookingClose || L('סיום', 'Done')}</button>
        </div>
      </>,
      { onBack: () => setStep('pick'), heading: L('שלח לחבר', 'Send to your friend'), icon: <Send className="w-6 h-6 text-blue-600" /> }
    );
  }

  // ── WAITING FOR CONSENT ──
  if (step === 'waiting-consent') {
    return shell(
      <div className="px-4 pb-4">
        {consent === 'declined' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {L(`${inviteeDisplayName} העדיף/ה לא להשוות יומנים. אפשר לשלוח לו/ה כמה זמנים לבחירה.`, `${inviteeDisplayName} preferred not to compare calendars. You can send a few times to choose from instead.`)}
          </div>
        ) : (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 flex gap-3">
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            <span>{L(`שלחנו ל‑${inviteeDisplayName} בקשה לאשר השוואת יומנים. ברגע שיאשר/תאשר באפליקציה, נציג כאן זמנים פנויים לשניכם.`,
              `We asked ${inviteeDisplayName} to allow comparing calendars. As soon as they approve in the app, free times for both of you show up here.`)}</span>
          </div>
        )}
        {consent !== 'declined' && (
          <button onClick={() => checkConsent(sessionId)} className="mt-3 w-full rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold py-2">
            {L('בדוק שוב', 'Check again')}
          </button>
        )}
        <button onClick={switchToPickTimes} className="mt-2 w-full booking-confirm-btn">
          <ArrowRight className="w-4 h-4" /> {L('במקום זה: בחר זמנים ושלח', 'Instead: pick times and send')}
        </button>
      </div>,
      { onBack: () => { cancelSession(sessionId); setSessionId(null); setStep('start'); }, heading: L('ממתין לאישור', 'Waiting for approval'), icon: <ShieldCheck className="w-6 h-6 text-blue-600" /> }
    );
  }

  // ── COMPARE: SELECT SLOT ──
  if (step === 'select-slot') {
    return shell(
      <>
        {slotTakenNotice && (
          <div className="booking-slot-error"><AlertCircle className="w-4 h-4" /><span>{slotTakenNotice}</span></div>
        )}
        {availabilityLoading && (
          <div className="booking-ai-result">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <p className="booking-ai-message">{L('מחפש זמנים פנויים לשניכם…', 'Finding times you’re both free…')}</p>
          </div>
        )}
        {availabilityError && (
          <div className="booking-slot-error"><AlertCircle className="w-4 h-4" /><span>{availabilityError}</span></div>
        )}
        {!availabilityLoading && !availabilityError && mutualDays.length === 0 && (
          <div className="booking-ai-result">
            <p className="booking-ai-message">{L('לא נמצאו זמנים פנויים לשניכם בשבוע הקרוב.', 'No mutual free time found in the coming week.')}</p>
          </div>
        )}
        {mutualDays.map(({ date, day, freeSlots }) => (
          <div key={date} className="booking-ai-slots">
            <p className="booking-ai-slots-title">{dayLabel(day)} · {date}</p>
            {freeSlots.map((slot, i) => (
              <button key={i} onClick={() => handlePickMutualSlot(date, day, slot)} className="booking-ai-slot-btn">
                <Clock className="w-3 h-3" />
                <span>{slot.startTime} - {slot.endTime}</span>
              </button>
            ))}
          </div>
        ))}
      </>,
      {
        onBack: () => { cancelSession(sessionId); setSessionId(null); setStep('start'); },
        icon: <Calendar className="w-6 h-6 text-blue-600" />,
        sub: (t.mutualWithLabel || L('עם {name}', 'With {name}')).replace('{name}', inviteeDisplayName)
      }
    );
  }

  // ── COMPARE: CONFIRM ──
  if (step === 'confirm' && selectedSlot) {
    // Back is disabled mid-request so a second concurrent confirm can't race the first.
    return shell(
      <>
        <div className="booking-details-summary">
          <div className="booking-details-summary-item">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>{dayLabel(selectedSlot.day)} · {selectedSlot.date} — {selectedSlot.startTime}–{selectedSlot.endTime}</span>
          </div>
          <div className="booking-details-summary-item">
            <Users className="w-4 h-4 text-blue-500" />
            <span>{inviteeDisplayName}</span>
          </div>
        </div>
        {confirmError && (
          <div className="booking-slot-error"><AlertCircle className="w-4 h-4" /><span>{confirmError}</span></div>
        )}
        <div className="booking-footer">
          <button onClick={handleConfirm} disabled={confirming} className="booking-confirm-btn">
            {confirming
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {L('מאשר…', 'Confirming…')}</>
              : <><Check className="w-5 h-5" /> {t.mutualLockIn || L('קבע את הפגישה', 'Lock it in')}</>}
          </button>
        </div>
      </>,
      { onBack: () => setStep('select-slot'), backDisabled: confirming, heading: t.bookingConfirm || L('אישור', 'Confirm'), icon: <Calendar className="w-6 h-6 text-blue-600" /> }
    );
  }

  // ── COMPARE: SUCCESS ──
  if (step === 'success') {
    return shell(
      <div className="booking-success-content">
        <div className="booking-success-icon"><Sparkles className="w-12 h-12 text-green-500" /></div>
        <h3 className="booking-success-heading">{L('הפגישה נקבעה ✅', 'Meeting booked ✅')}</h3>
        <p className="booking-success-desc">{L('הפגישה נוספה ליומן Google של שניכם.', 'The meeting was added to both of your Google Calendars.')}</p>
        <div className="booking-success-details">
          <div className="booking-success-detail-item">
            <span className="booking-success-detail-label">{t.wizardSubject || L('נושא', 'Subject')}</span>
            <span className="booking-success-detail-value">{confirmedSession?.subject || meetingTitle}</span>
          </div>
          <div className="booking-success-detail-item">
            <span className="booking-success-detail-label"><Clock className="w-3 h-3 inline" /> {L('מתי', 'When')}</span>
            <span className="booking-success-detail-value">
              {confirmedSession?.lockedSlot
                ? `${confirmedSession.lockedSlot.date} — ${confirmedSession.lockedSlot.startTime}–${confirmedSession.lockedSlot.endTime}`
                : `${selectedSlot?.date} — ${selectedSlot?.startTime}–${selectedSlot?.endTime}`}
            </span>
          </div>
          <div className="booking-success-detail-item">
            <span className="booking-success-detail-label"><Users className="w-3 h-3 inline" /> {L('עם', 'With')}</span>
            <span className="booking-success-detail-value">{inviteeDisplayName}</span>
          </div>
        </div>
        <button onClick={onClose} className="booking-success-close-btn">{t.bookingClose || L('סגור', 'Close')}</button>
      </div>,
      { heading: L('נקבע!', 'Booked!'), icon: <Calendar className="w-6 h-6 text-green-600" /> }
    );
  }

  return null;
}
