import React, { useState, useCallback } from "react";
import { Calendar, Clock, Loader2, X, Check, Mail, AlertCircle, Users, ArrowRight, Sparkles } from "lucide-react";
import safeStorage from "../utils/safeStorage";

const API_BASE = import.meta.env.VITE_API_URL || "";

const DAY_NAMES_HE = {
  Sunday: 'ראשון', Monday: 'שני', Tuesday: 'שלישי',
  Wednesday: 'רביעי', Thursday: 'חמישי', Friday: 'שישי', Saturday: 'שבת'
};

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

/**
 * Peer-to-peer mutual scheduling: two CalendAI users, both with Google
 * Calendar connected, see their combined free time and lock a slot onto
 * both calendars at once. If the invitee isn't a connected CalendAI user,
 * `onFallbackToShareLink` hands off to the existing guest-link flow.
 */
export default function MutualScheduler({ lang, t, onClose, onFallbackToShareLink }) {
  const isRTL = lang === 'he';

  const [step, setStep] = useState('invitee-email'); // 'invitee-email' | 'select-slot' | 'confirm' | 'success'
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState(30);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [inviteeDisplayName, setInviteeDisplayName] = useState("");

  const [sessionId, setSessionId] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [days, setDays] = useState([]);

  const [selectedSlot, setSelectedSlot] = useState(null); // { date, day, startTime, endTime }
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [confirmedSession, setConfirmedSession] = useState(null);

  const dayLabel = (dayKey) => (lang === 'he' ? (DAY_NAMES_HE[dayKey] || dayKey) : dayKey);

  const fetchAvailability = useCallback(async (sid) => {
    setAvailabilityLoading(true);
    setAvailabilityError("");
    try {
      const res = await fetch(`${API_BASE}/api/mutual/sessions/${sid}/availability`, {
        headers: authHeaders(),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load mutual availability.");
      setDays(data.days || []);
    } catch (err) {
      setAvailabilityError(err.message);
    } finally {
      setAvailabilityLoading(false);
    }
  }, []);

  const handleFindMutualTime = async () => {
    const email = inviteeEmail.trim().toLowerCase();
    if (!email) return;
    setLookupLoading(true);
    setLookupError("");
    setNotFound(false);
    try {
      const lookupRes = await fetch(`${API_BASE}/api/mutual/lookup?email=${encodeURIComponent(email)}`, {
        headers: authHeaders(),
        credentials: "include"
      });
      const lookupData = await lookupRes.json();
      if (!lookupRes.ok) throw new Error(lookupData.error || "Lookup failed.");

      if (!lookupData.found || !lookupData.hasGoogle) {
        setNotFound(true);
        setLookupLoading(false);
        return;
      }
      setInviteeDisplayName(lookupData.displayName || email);

      const sessionRes = await fetch(`${API_BASE}/api/mutual/sessions`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ inviteeEmail: email, subject: subject || undefined, duration })
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error || "Could not start a mutual scheduling session.");

      setSessionId(sessionData.sessionId);
      setStep('select-slot');
      fetchAvailability(sessionData.sessionId);
    } catch (err) {
      setLookupError(err.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const handlePickSlot = (date, day, slot) => {
    setSelectedSlot({ date, day, startTime: slot.startTime, endTime: slot.endTime });
    setConfirmError("");
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
        body: JSON.stringify({
          date: selectedSlot.date,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime
        })
      });
      const data = await res.json();
      if (!res.ok) {
        // The slot may have just been taken on either calendar — refresh and go back.
        setConfirmError(data.error || "Failed to confirm the mutual meeting.");
        if (res.status === 409) {
          setStep('select-slot');
          fetchAvailability(sessionId);
        }
        return;
      }
      setConfirmedSession(data.session);
      setStep('success');
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirming(false);
    }
  };

  // ===================== INVITEE EMAIL STEP =====================
  if (step === 'invitee-email') {
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="booking-header">
          <button onClick={onClose} className="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="booking-header-content">
            <Users className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="booking-title">{t.mutualTitle || (lang === 'he' ? 'תיאום פגישה הדדי' : 'Mutual Scheduling')}</h2>
              <p className="booking-subtitle">
                {t.mutualSubtitle || (lang === 'he'
                  ? 'הזן את האימייל של המשתמש השני ונמצא זמנים פנויים לשניכם'
                  : "Enter the other person's email and we'll find times that work for both calendars")}
              </p>
            </div>
          </div>
        </div>

        <div className="booking-guest-section">
          <label className="booking-label">
            <Mail className="w-3.5 h-3.5 inline mr-1" />
            {t.mutualInviteeEmail || (lang === 'he' ? 'אימייל המשתמש השני' : "Other person's CalendAI email")}
          </label>
          <input
            type="email"
            value={inviteeEmail}
            onChange={e => setInviteeEmail(e.target.value)}
            placeholder={t.mutualInviteeEmailPlaceholder || 'friend@example.com'}
            className="booking-input"
            dir="ltr"
          />
        </div>

        <div className="booking-guest-section">
          <label className="booking-label">{t.wizardSubject || (lang === 'he' ? 'נושא' : 'Subject')}</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder={t.bookingTitle || (lang === 'he' ? 'פגישה' : 'Meeting')}
            className="booking-input"
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>

        <div className="booking-duration-section">
          <label className="booking-label">{t.bookingDuration || (lang === 'he' ? 'משך הפגישה' : 'Duration')}</label>
          <div className="booking-duration-options">
            {[15, 30, 45, 60, 90].map(m => (
              <button
                key={m}
                onClick={() => setDuration(m)}
                className={`booking-duration-btn ${duration === m ? 'active' : ''}`}
              >
                {m} {t.bookingMinutes || 'min'}
              </button>
            ))}
          </div>
        </div>

        {notFound && (
          <div className="booking-ai-result">
            <p className="booking-ai-message">
              {t.mutualNotFound || (lang === 'he'
                ? 'לא נמצא משתמש CalendAI מחובר ל-Google Calendar עם האימייל הזה.'
                : "We couldn't find a CalendAI user connected to Google Calendar with that email.")}
            </p>
            {onFallbackToShareLink && (
              <button onClick={onFallbackToShareLink} className="booking-ai-slot-btn">
                <ArrowRight className="w-3.5 h-3.5" />
                <span>{t.mutualSendLinkInstead || (lang === 'he' ? 'שלח קישור לתיאום פגישה במקום' : 'Send a booking link instead')}</span>
              </button>
            )}
          </div>
        )}

        {lookupError && (
          <div className="booking-slot-error">
            <AlertCircle className="w-4 h-4" />
            <span>{lookupError}</span>
          </div>
        )}

        <div className="booking-footer">
          <button
            onClick={handleFindMutualTime}
            disabled={!inviteeEmail.trim() || lookupLoading}
            className="booking-confirm-btn"
          >
            {lookupLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t.bookingAiFinderLoading || (lang === 'he' ? 'מחפש...' : 'Searching...')}</>
            ) : (
              <><Sparkles className="w-5 h-5" /> {t.mutualFindTime || (lang === 'he' ? 'מצא זמן הדדי' : 'Find mutual time')}</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ===================== SELECT SLOT STEP =====================
  if (step === 'select-slot') {
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="booking-header">
          <button onClick={() => setStep('invitee-email')} className="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="booking-header-content">
            <Calendar className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="booking-title">{t.mutualTitle || (lang === 'he' ? 'תיאום פגישה הדדי' : 'Mutual Scheduling')}</h2>
              <p className="booking-subtitle">
                {(t.mutualWithLabel || (lang === 'he' ? 'עם {name}' : 'With {name}')).replace('{name}', inviteeDisplayName)}
              </p>
            </div>
          </div>
        </div>

        {availabilityLoading && (
          <div className="booking-ai-result">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <p className="booking-ai-message">
              {t.mutualComputing || (lang === 'he' ? 'משווה בין שני היומנים...' : 'Comparing both calendars...')}
            </p>
          </div>
        )}

        {availabilityError && (
          <div className="booking-slot-error">
            <AlertCircle className="w-4 h-4" />
            <span>{availabilityError}</span>
          </div>
        )}

        {!availabilityLoading && !availabilityError && days.length === 0 && (
          <div className="booking-ai-result">
            <p className="booking-ai-message">
              {t.mutualNoSlots || (lang === 'he'
                ? 'לא נמצאו זמנים פנויים לשניכם בשבוע הקרוב.'
                : 'No mutual free time found in the coming week.')}
            </p>
          </div>
        )}

        {days.map(({ date, day, freeSlots }) => (
          <div key={date} className="booking-ai-slots">
            <p className="booking-ai-slots-title">{dayLabel(day)} · {date}</p>
            {freeSlots.map((slot, i) => (
              <button
                key={i}
                onClick={() => handlePickSlot(date, day, slot)}
                className="booking-ai-slot-btn"
              >
                <Clock className="w-3 h-3" />
                <span>{slot.startTime} - {slot.endTime}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ===================== CONFIRM STEP =====================
  if (step === 'confirm' && selectedSlot) {
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="booking-header">
          <button onClick={() => setStep('select-slot')} className="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="booking-header-content">
            <Calendar className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="booking-title">{t.bookingConfirm || (lang === 'he' ? 'אשר תיאום' : 'Confirm')}</h2>
            </div>
          </div>
        </div>

        <div className="booking-details-summary">
          <div className="booking-details-summary-item">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>
              {dayLabel(selectedSlot.day)} · {selectedSlot.date} — {selectedSlot.startTime}–{selectedSlot.endTime}
            </span>
          </div>
          <div className="booking-details-summary-item">
            <Users className="w-4 h-4 text-blue-500" />
            <span>{inviteeDisplayName}</span>
          </div>
        </div>

        {confirmError && (
          <div className="booking-slot-error">
            <AlertCircle className="w-4 h-4" />
            <span>{confirmError}</span>
          </div>
        )}

        <div className="booking-footer">
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="booking-confirm-btn"
          >
            {confirming ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t.bookingAiFinderLoading || (lang === 'he' ? 'מאשר...' : 'Confirming...')}</>
            ) : (
              <><Check className="w-5 h-5" /> {t.mutualLockIn || (lang === 'he' ? 'נעל את הפגישה' : 'Lock it in')}</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ===================== SUCCESS STEP =====================
  if (step === 'success') {
    return (
      <div className="booking-container" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="booking-header">
          <button onClick={onClose} className="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
          <div className="booking-header-content">
            <Calendar className="w-6 h-6 text-green-600" />
            <div>
              <h2 className="booking-title">{t.bookingSuccessTitle || 'Booking Confirmed! ✅'}</h2>
            </div>
          </div>
        </div>

        <div className="booking-success-content">
          <div className="booking-success-icon">
            <Sparkles className="w-12 h-12 text-green-500" />
          </div>
          <h3 className="booking-success-heading">{t.bookingSuccessTitle || 'Booking Confirmed! ✅'}</h3>
          <p className="booking-success-desc">
            {t.mutualSuccessDesc || (lang === 'he'
              ? 'הפגישה ננעלה ונוספה ליומן Google של שניכם.'
              : "The meeting is locked in and was added to both of your Google Calendars.")}
          </p>

          <div className="booking-success-details">
            <div className="booking-success-detail-item">
              <span className="booking-success-detail-label">{t.wizardSubject || 'Subject'}</span>
              <span className="booking-success-detail-value">{confirmedSession?.subject || subject}</span>
            </div>
            <div className="booking-success-detail-item">
              <span className="booking-success-detail-label"><Clock className="w-3 h-3 inline" /> {t.bookingDayPicker || 'Day'}</span>
              <span className="booking-success-detail-value">
                {confirmedSession?.lockedSlot
                  ? `${confirmedSession.lockedSlot.date} — ${confirmedSession.lockedSlot.startTime}–${confirmedSession.lockedSlot.endTime}`
                  : `${selectedSlot?.date} — ${selectedSlot?.startTime}–${selectedSlot?.endTime}`}
              </span>
            </div>
            <div className="booking-success-detail-item">
              <span className="booking-success-detail-label"><Users className="w-3 h-3 inline" /> {t.mutualWithLabelShort || (lang === 'he' ? 'עם' : 'With')}</span>
              <span className="booking-success-detail-value">{inviteeDisplayName}</span>
            </div>
          </div>

          <button onClick={onClose} className="booking-success-close-btn">
            {t.bookingClose || 'Close'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
