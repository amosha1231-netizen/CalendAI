import React from "react";
import { Calendar, Sparkles, LogIn, ChevronDown } from "lucide-react";

export default function LandingPage({ t, lang, onLogin, onTryGuest, toggleLanguage }) {
  const isRTL = lang === 'he';

  const scrollToFeatures = () => {
    document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50/30 to-white" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ── Navigation Bar ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">CalendAI</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLanguage}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              {t.languageLabel}
            </button>
            <button
              onClick={onLogin}
              className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-transparent hover:border-slate-200 hover:bg-white transition font-medium"
            >
              {lang === 'he' ? 'כניסה' : (t.loginShort || 'Login')}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100/40 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100/40 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6 shadow-sm">
              <Sparkles className="w-4 h-4" />
              {t.landingHeroBadge}
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight mb-6">
              {t.landingHeroTitle}
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-600 leading-relaxed mb-10 max-w-2xl mx-auto">
              {t.landingHeroSubtitle}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onLogin}
                className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-xl text-lg font-medium transition shadow-lg shadow-blue-200/50 w-full sm:w-auto justify-center"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {t.landingQuickLogin || 'התחברות מהירה עם Google'}
              </button>
              <button
                onClick={onTryGuest}
                className="flex items-center gap-2 bg-white border-2 border-slate-200 hover:border-blue-300 text-slate-700 px-8 py-3.5 rounded-xl text-lg font-medium transition w-full sm:w-auto justify-center"
              >
                <Calendar className="w-5 h-5 text-blue-500" />
                {t.landingTryGuest}
              </button>
            </div>

            {/* Scroll indicator */}
            <button
              onClick={scrollToFeatures}
              className="mt-16 text-slate-400 hover:text-slate-600 transition animate-bounce"
              aria-label="Scroll to features"
            >
              <ChevronDown className="w-6 h-6 mx-auto" />
            </button>
          </div>
        </div>
      </section>

      {/* ── How It Works Section ── */}
      <section className="py-16 sm:py-20 bg-white/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-slate-900 mb-12">
            {t.landingHowItWorksTitle}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 transition text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{t.landingHowStep1}</h3>
              <p className="text-sm text-slate-500">{t.landingHowStep1Desc}</p>
            </div>

            {/* Step 2 */}
            <div className="relative bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-200 transition text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{t.landingHowStep2}</h3>
              <p className="text-sm text-slate-500">{t.landingHowStep2Desc}</p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 hover:shadow-md hover:border-emerald-200 transition text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{t.landingHowStep3}</h3>
              <p className="text-sm text-slate-500">{t.landingHowStep3Desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features-section" className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-slate-900 mb-12">
            {t.landingFeaturesTitle}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Feature 1 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 hover:shadow-md transition">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-2xl">🤖</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{t.landingFeature1Title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{t.landingFeature1Desc}</p>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 hover:shadow-md transition">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-2xl">📅</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{t.landingFeature2Title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{t.landingFeature2Desc}</p>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 hover:shadow-md transition">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-2xl">🔔</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{t.landingFeature3Title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{t.landingFeature3Desc}</p>
                </div>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 hover:shadow-md transition">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-2xl">📊</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{t.landingFeature4Title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{t.landingFeature4Desc}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 sm:p-12 shadow-xl">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              {t.landingCtaTitle}
            </h2>
            <p className="text-blue-100 text-lg mb-8">
              {t.landingCtaSubtitle}
            </p>
            <button
              onClick={onLogin}
              className="inline-flex items-center gap-3 bg-white hover:bg-blue-50 text-blue-700 px-8 py-3.5 rounded-xl text-lg font-medium transition shadow-lg"
            >
              <LogIn className="w-5 h-5" />
              {t.landingLoginWithGoogle}
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <span className="font-bold text-slate-800">CalendAI</span>
          </div>
          <p className="text-sm text-slate-400">
            {t.landingFooterText}
          </p>
        </div>
      </footer>
    </div>
  );
}