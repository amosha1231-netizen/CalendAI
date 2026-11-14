import React, { useState, useEffect } from "react";
import { LogIn, Mail, Bot, Link2, Bell, BarChart3, Check, Mic, Sparkles, ShieldCheck } from "lucide-react";
import { isShabbatNow } from "../utils/shabbatHelper";
import ShabbatBanner from "./ShabbatBanner";

// Feature copy in i18n.js carries a leading emoji (kept for older call sites);
// the dedicated icon chip below renders its own icon, so strip it here to avoid showing it twice.
const stripLeadingEmoji = (str = "") => str.replace(/^[^\p{L}\p{N}]+/u, "").trim();

const FEATURE_ICONS = [Bot, Link2, Bell, BarChart3];
const FEATURE_TONES = ['bg-brand-soft text-brand', 'bg-[#E3F8EF] text-[#10B981]', 'bg-[#FFF4DC] text-[#F59E0B]', 'bg-[#E4F2FF] text-[#2D9CFF]'];

const AuthButton = ({ onClick, children, className = "" }) => (
  <button
    onClick={onClick}
    className={`w-full h-14 rounded-2xl bg-white border border-[#ECEAF3] text-[#0E1020] text-base font-bold flex items-center justify-center gap-2.5 shadow-[0_6px_18px_-10px_rgba(14,16,32,0.3)] hover:bg-slate-50 active:scale-[0.99] transition ${className}`}
  >
    {children}
  </button>
);

// Landing-only copy that isn't in i18n.js yet (Hebrew + English).
const COPY = {
  he: {
    badge: 'עוזר לו״ז מבוסס AI',
    title1: 'היומן שלך,',
    title2: 'חושב איתך.',
    subtitle: 'אמרו או כתבו מה צריך, ו-CalendAI ימצא זמן, יתאם פגישות ויעיר אתכם בדיוק בזמן.',
    google: 'המשך עם Google',
    outlook: 'המשך עם Outlook',
    guest: 'או נסו בלי הרשמה',
    email: 'כניסה או הרשמה עם אימייל',
    demoPrompt: '״קבע לי זמן להירגע ביום שלישי אחר הצהריים״',
    demoDone: 'מצאתי חלון פנוי ושמרתי ביומן',
    demoTitle: 'זמן להירגע 🧘',
    demoMeta: 'שלישי · 16:30–17:30',
    demoChip: 'אחרי הפגישה האחרונה',
    privacyTitle: 'הפרטיות שלכם קודם.',
    privacyBody: 'אנחנו לא מוכרים מידע, החיבור מוצפן, ואפשר למחוק הכול בלחיצה אחת.',
    privacyLink: 'מדיניות הפרטיות',
  },
  en: {
    badge: 'AI scheduling assistant',
    title1: 'Your calendar,',
    title2: 'thinking with you.',
    subtitle: 'Say or type what you need. CalendAI finds the time, schedules meetings and wakes you up right on time.',
    google: 'Continue with Google',
    outlook: 'Continue with Outlook',
    guest: 'Or try it without signing up',
    email: 'Sign in or register with email',
    demoPrompt: '"Find me time to unwind Tuesday afternoon"',
    demoDone: 'Found a free slot and saved it',
    demoTitle: 'Time to unwind 🧘',
    demoMeta: 'Tue · 4:30–5:30 PM',
    demoChip: 'After your last meeting',
    privacyTitle: 'Your privacy comes first.',
    privacyBody: "We don't sell data, connections are encrypted, and you can delete everything in one tap.",
    privacyLink: 'Privacy policy',
  },
};

const AUTH_ERROR_MESSAGES = {
  microsoft_email_in_use: {
    he: 'כתובת המייל של חשבון Microsoft כבר רשומה אצלנו. התחברו בדרך שבה נרשמתם (Google או מייל וסיסמה).',
    en: 'That Microsoft account\'s email is already registered. Sign in the way you signed up (Google or email and password).'
  },
  default: {
    he: 'ההתחברות נכשלה. נסו שוב.',
    en: 'Sign-in failed. Please try again.'
  }
};

function authErrorMessage(code, lang) {
  const entry = AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_MESSAGES.default;
  return lang === 'he' ? entry.he : entry.en;
}


export default function LandingPage({ t, lang, onLogin, onMicrosoftLogin, onTryGuest, onEmailLogin, toggleLanguage }) {
  // ── Shabbat Guard ──
  const [shabbatActive, setShabbatActive] = useState(() => isShabbatNow());

  useEffect(() => {
    const interval = setInterval(() => {
      setShabbatActive(isShabbatNow());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Sign-in error from an OAuth redirect (?error=...) ──
  const [authError] = useState(() => {
    try {
      if (typeof window === 'undefined') return null;
      return new URLSearchParams(window.location.search).get('error');
    } catch (e) { return null; }
  });
  const [authErrorVisible, setAuthErrorVisible] = useState(!!authError);
  useEffect(() => {
    if (!authError) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (e) {}
  }, [authError]);

  if (shabbatActive) {
    return <ShabbatBanner t={t} lang={lang} />;
  }
  const isRTL = lang === 'he';

  const c = COPY[lang] || COPY.en;
  const switchTo = (code) => { if (code !== lang && toggleLanguage) toggleLanguage(); };

  return (
    <div className="min-h-screen bg-[#FBFAFF] text-[#0E1020] font-sans overflow-x-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      {authErrorVisible && (
        <div role="alert" className="relative z-20 bg-rose-50 border-b border-rose-200 text-rose-700 text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-start gap-3">
            <p className="flex-1">{authErrorMessage(authError, lang)}</p>
            <button onClick={() => setAuthErrorVisible(false)} aria-label={lang === 'he' ? 'סגירה' : 'Close'} className="text-rose-400 hover:text-rose-600 px-2 -mx-2">✕</button>
          </div>
        </div>
      )}

      <section className="relative">
        {/* Aurora glow */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[560px] overflow-hidden">
          <div className="aurora-blob w-80 h-80 bg-[#9B5CFF] opacity-35 -top-28 -left-24" />
          <div className="aurora-blob w-64 h-64 bg-[#FF6FA8] opacity-25 top-32 -right-32" />
          <div className="aurora-blob w-60 h-60 bg-[#5B4BFF] opacity-20 top-4 right-8" />
        </div>

        {/* ── Top bar ── */}
        <header className="relative z-10 max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-[13px] bg-aurora text-white flex items-center justify-center shadow-glow">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-xl tracking-tight" dir="ltr">
              Calend<span className="text-aurora">AI</span>
            </span>
          </div>
          <div className="flex p-[3px] gap-[3px] rounded-xl bg-[#ECEAF4]/80" role="radiogroup" aria-label={lang === 'he' ? 'שפה' : 'Language'}>
            {[['he', 'עב'], ['en', 'EN']].map(([code, label]) => (
              <button
                key={code}
                role="radio"
                aria-checked={lang === code}
                onClick={() => switchTo(code)}
                className={`w-12 h-8 rounded-[9px] text-[13px] font-semibold transition ${lang === code ? 'bg-white text-[#0E1020] shadow-sm' : 'text-[#6E7189]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {/* ── Hero ── */}
        <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-6 pt-8 pb-12 sm:pt-16 lg:flex lg:items-center lg:gap-16">
          <div className="lg:flex-1 text-center lg:text-start">
            <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-white/75 border border-[#E3DEFF] text-brand text-[13px] font-semibold">
              <Sparkles className="w-4 h-4" /> {c.badge}
            </span>
            <h1 className="mt-5 text-[40px] sm:text-6xl font-black leading-[1.08] tracking-tight">
              {c.title1}<br /><span className="text-aurora">{c.title2}</span>
            </h1>
            <p className="mt-4 text-[16.5px] sm:text-lg text-[#6E7189] leading-relaxed max-w-xl mx-auto lg:mx-0">{c.subtitle}</p>

            {/* Sign-in */}
            <div className="mt-7 flex flex-col gap-2.5 max-w-md mx-auto lg:mx-0">
              <AuthButton onClick={onLogin}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {c.google}
              </AuthButton>
              <AuthButton onClick={onMicrosoftLogin}>
                <svg className="w-[18px] h-[18px]" viewBox="0 0 21 21" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                {c.outlook}
              </AuthButton>
              <button onClick={onTryGuest} className="mt-1 h-10 text-[15px] font-semibold text-brand hover:text-brand-600 transition">
                {c.guest} {isRTL ? '←' : '→'}
              </button>
              {onEmailLogin && (
                <button onClick={onEmailLogin} className="inline-flex items-center justify-center gap-1.5 text-sm text-[#6E7189] hover:text-[#0E1020] transition">
                  <Mail className="w-3.5 h-3.5" /> {c.email}
                </button>
              )}
            </div>

            {/* Privacy, before anyone signs in */}
            <div className="mt-6 max-w-md mx-auto lg:mx-0 flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#E3F8EF]/80 text-start">
              <ShieldCheck className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
              <p className="text-[13px] leading-relaxed text-[#1E5C47]">
                <b>{c.privacyTitle}</b> {c.privacyBody}{' '}
                <a href="/privacy" className="underline underline-offset-2 font-medium">{c.privacyLink}</a>
              </p>
            </div>
          </div>

          {/* Live demo: a spoken request turned into an event */}
          <div className="mt-10 lg:mt-0 lg:flex-1 max-w-sm mx-auto w-full">
            <div className="relative">
              <div className="bg-white rounded-[20px] rounded-ee-md p-3.5 flex items-center gap-2.5 shadow-soft ms-10">
                <span className="w-9 h-9 rounded-full bg-aurora text-white flex items-center justify-center shrink-0"><Mic className="w-[18px] h-[18px]" /></span>
                <span className="text-[14.5px] font-medium">{c.demoPrompt}</span>
              </div>
              <div className="bg-white rounded-[20px] p-4 shadow-soft mt-3 me-8">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#10B981]"><Check className="w-4 h-4" /> {c.demoDone}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold">{c.demoTitle}</div>
                    <div className="text-[13px] text-[#6E7189]">{c.demoMeta}</div>
                  </div>
                  <span className="text-xs font-semibold text-brand bg-brand-soft rounded-full px-2.5 py-1 shrink-0">{c.demoChip}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-center mb-10 tracking-tight">{t.landingHowItWorksTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-3xl p-6 shadow-soft">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand font-extrabold flex items-center justify-center mb-3">{n}</div>
                <h3 className="text-lg font-bold mb-1.5">{t[`landingHowStep${n}`]}</h3>
                <p className="text-sm text-[#6E7189] leading-relaxed">{t[`landingHowStep${n}Desc`]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features-section" className="pb-14 sm:pb-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-center mb-10 tracking-tight">{t.landingFeaturesTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((n) => {
              const Icon = FEATURE_ICONS[n - 1];
              const tone = FEATURE_TONES[n - 1];
              return (
                <div key={n} className="bg-white rounded-3xl p-6 shadow-soft flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1.5">{stripLeadingEmoji(t[`landingFeature${n}Title`])}</h3>
                    <p className="text-sm text-[#6E7189] leading-relaxed">{t[`landingFeature${n}Desc`]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="pb-14 sm:pb-20">
        <div className="max-w-2xl mx-auto px-5 sm:px-6">
          <div className="relative overflow-hidden rounded-[28px] bg-night p-8 sm:p-12 text-center text-white">
            <div aria-hidden="true" className="aurora-blob w-56 h-56 bg-[#7C5CFF] opacity-80 -top-20 -left-16" />
            <div aria-hidden="true" className="aurora-blob w-44 h-44 bg-[#FF6FA8] opacity-50 -bottom-24 left-24" />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-3 tracking-tight">{t.landingCtaTitle}</h2>
              <p className="text-white/70 text-lg mb-7">{t.landingCtaSubtitle}</p>
              <button onClick={onLogin} className="inline-flex items-center justify-center gap-2 h-14 px-8 rounded-2xl bg-white text-night font-bold text-base hover:bg-slate-50 transition">
                <LogIn className="w-5 h-5" /> {t.landingLoginWithGoogle}
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#ECEAF3] py-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2" dir="ltr">
            <span className="w-6 h-6 rounded-lg bg-aurora text-white flex items-center justify-center"><Sparkles className="w-3.5 h-3.5" /></span>
            <span className="font-bold">CalendAI</span>
          </div>
          <p className="text-sm text-[#6E7189]">{t.landingFooterText}</p>
          <div className="mt-2 flex items-center justify-center gap-3 text-xs text-[#A3A6BB]">
            <a href="/privacy" className="hover:text-[#6E7189]">{lang === 'he' ? 'פרטיות' : 'Privacy'}</a>
            <span>·</span>
            <a href="/terms" className="hover:text-[#6E7189]">{lang === 'he' ? 'תנאי שימוש' : 'Terms'}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
