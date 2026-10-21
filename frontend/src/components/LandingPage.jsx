import React, { useState, useEffect } from "react";
import { Calendar, LogIn, Mail, ChevronDown, Bot, Link2, Bell, BarChart3, ArrowDown, Check } from "lucide-react";
import { isShabbatNow } from "../utils/shabbatHelper";
import ShabbatBanner from "./ShabbatBanner";

// Feature copy in i18n.js carries a leading emoji (kept for older call sites);
// the dedicated icon chip below renders its own icon, so strip it here to avoid showing it twice.
const stripLeadingEmoji = (str = "") => str.replace(/^[^\p{L}\p{N}]+/u, "").trim();

const FEATURE_ICONS = [Bot, Link2, Bell, BarChart3];

const StampButton = ({ onClick, children, variant = "solid", onDark = false, className = "" }) => {
  const base = "inline-flex items-center gap-3 rounded-xl text-lg font-display font-bold px-8 py-3.5 w-full sm:w-auto justify-center transition-transform duration-75 border-2 hover:translate-x-px hover:translate-y-px active:translate-x-[3px] active:translate-y-[3px] active:shadow-none";
  const palette = onDark
    ? (variant === "solid"
        ? "bg-gold-500 text-ink-900 border-paper-50 shadow-stamp-paper hover:shadow-[2px_2px_0_#EEF0E9]"
        : "bg-transparent text-paper-50 border-line-strong shadow-none hover:bg-ink-700")
    : (variant === "solid"
        ? "bg-gold-500 text-ink-900 border-ink-900 shadow-stamp hover:shadow-stamp-sm"
        : "bg-white text-ink-900 border-ink-900 shadow-stamp hover:shadow-stamp-sm");
  return (
    <button onClick={onClick} className={`${base} ${palette} ${className}`}>
      {children}
    </button>
  );
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

  const scrollToFeatures = () => {
    document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const demoPrompt = isRTL ? '"קבעי לי קפה עם רונית ביום חמישי ב-10:00"' : '"Grab coffee with Dana Thursday at 10am"';
  const demoResultTitle = isRTL ? 'קפה עם רונית' : 'Coffee with Dana';
  const demoResultMeta = isRTL ? 'יום ה׳ · 10:00–10:30' : 'Thu · 10:00–10:30 AM';

  return (
    <div className={`min-h-screen bg-paper-50 text-ink-900 ${isRTL ? 'font-he' : 'font-en'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {authErrorVisible && (
        <div role="alert" className="bg-rose-50 border-b border-rose-200 text-rose-700 text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-start gap-3">
            <p className="flex-1">{authErrorMessage(authError, lang)}</p>
            <button onClick={() => setAuthErrorVisible(false)} aria-label={lang === 'he' ? 'סגירה' : 'Close'} className="text-rose-400 hover:text-rose-600 px-2 -mx-2">✕</button>
          </div>
        </div>
      )}
      {/* ── Navigation Bar ── */}
      <header className="sticky top-0 z-50 bg-paper-50/90 backdrop-blur-md border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-ink-900 rounded-lg grid grid-cols-2 gap-0.5 p-1.5 shrink-0">
              <span className="bg-paper-50 rounded-sm" />
              <span className="bg-paper-50 rounded-sm" />
              <span className="bg-paper-50 rounded-sm" />
              <span className="bg-gold-500 rounded-sm" />
            </div>
            <span className="font-display font-extrabold text-lg tracking-tight">
              Calend<span className="text-gold-600">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLanguage}
              className="font-mono text-xs tracking-wide px-3 py-1.5 rounded-md border border-line-strong text-muted hover:text-ink-900 hover:bg-paper-100 transition"
            >
              {t.languageLabel}
            </button>
            <button
              onClick={onLogin}
              className="text-sm text-muted hover:text-ink-900 px-3 py-1.5 rounded-lg border border-transparent hover:border-line transition font-medium"
            >
              {t.loginShort}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden bg-ledger-grid">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            <div className="flex-1 w-full text-center lg:text-start">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 font-mono text-xs tracking-wide text-gold-600 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-gold-500" />
                {stripLeadingEmoji(t.landingHeroBadge)}
              </div>

              {/* Title */}
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
                {t.landingHeroTitle}
              </h1>

              {/* Subtitle */}
              <p className="text-lg sm:text-xl text-muted leading-relaxed mb-10 max-w-2xl mx-auto lg:mx-0">
                {t.landingHeroSubtitle}
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4">
                <StampButton onClick={onLogin}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {t.landingQuickLogin || 'התחברות מהירה עם Google'}
                </StampButton>
                <StampButton onClick={onMicrosoftLogin} variant="outline">
                  <svg className="w-5 h-5" viewBox="0 0 21 21" aria-hidden="true">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  {t.landingLoginOutlook}
                </StampButton>
                <StampButton onClick={onTryGuest} variant="outline">
                  <Calendar className="w-5 h-5 text-gold-600" />
                  {t.landingTryGuest}
                </StampButton>
              </div>

              {/* Email/password sign-in — alternative to Google/Outlook OAuth */}
              {onEmailLogin && (
                <button
                  onClick={onEmailLogin}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink-900 transition"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {lang === 'he' ? 'או התחבר/הירשם עם אימייל וסיסמה' : 'Or sign in / register with email'}
                </button>
              )}

              {/* Scroll indicator */}
              <button
                onClick={scrollToFeatures}
                className="hidden lg:block mt-16 text-line-strong hover:text-muted transition animate-bounce"
                aria-label="Scroll to features"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
            </div>

            {/* Live demo card — shows the AI parsing a plain-language request */}
            <div className="flex-1 w-full max-w-sm">
              <div className="bg-white border border-line rounded-xl p-4 card-fold shadow-sm">
                <div className="bg-paper-100 border border-line rounded-lg px-3.5 py-2.5 text-sm leading-relaxed mb-3">
                  {demoPrompt}
                </div>
                <div className="flex justify-center text-line-strong mb-3">
                  <ArrowDown className="w-4 h-4" />
                </div>
                <div className="flex items-start gap-2.5 bg-sage-100 border border-sage-500 rounded-lg px-3.5 py-3">
                  <Check className="w-4 h-4 text-sage-500 mt-0.5 shrink-0" />
                  <div>
                    <strong className="block text-sm">{demoResultTitle}</strong>
                    <span className="font-mono text-xs text-muted">{demoResultMeta}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works Section ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-center mb-12 tracking-tight">
            {t.landingHowItWorksTitle}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-xl p-6 sm:p-8 border border-line hover:border-line-strong transition">
                <div className="font-mono text-sm text-gold-600 mb-3">0{n}</div>
                <h3 className="font-display text-lg font-bold mb-2">{t[`landingHowStep${n}`]}</h3>
                <p className="text-sm text-muted leading-relaxed">{t[`landingHowStep${n}Desc`]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features-section" className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-center mb-12 tracking-tight">
            {t.landingFeaturesTitle}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((n) => {
              const Icon = FEATURE_ICONS[n - 1];
              return (
                <div key={n} className="bg-white rounded-xl p-6 sm:p-8 border border-line hover:border-line-strong transition">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 bg-paper-100 border border-line rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-ink-900" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold mb-2">{stripLeadingEmoji(t[`landingFeature${n}Title`])}</h3>
                      <p className="text-sm text-muted leading-relaxed">{t[`landingFeature${n}Desc`]}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-ink-900 rounded-2xl p-8 sm:p-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-paper-50 mb-4 tracking-tight">
              {t.landingCtaTitle}
            </h2>
            <p className="text-line-strong text-lg mb-8">
              {t.landingCtaSubtitle}
            </p>
            <StampButton onClick={onLogin} onDark>
              <LogIn className="w-5 h-5" />
              {t.landingLoginWithGoogle}
            </StampButton>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-line py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-gold-600" />
            <span className="font-display font-bold">CalendAI</span>
          </div>
          <p className="text-sm text-muted">
            {t.landingFooterText}
          </p>
        </div>
      </footer>
    </div>
  );
}
