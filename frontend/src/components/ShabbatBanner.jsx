import React from "react";

/**
 * ShabbatBanner — a beautiful overlay/banner shown during Shabbat
 * that blocks scheduling and displays a respectful message.
 */
export default function ShabbatBanner({ t, lang }) {
  const isRTL = lang === 'he';

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="max-w-md w-full text-center">
        {/* Candle Icons */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <span className="text-6xl animate-pulse" role="img" aria-label="candle">🕯️</span>
          <span className="text-6xl animate-pulse" role="img" aria-label="candle">🕯️</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-white mb-4">
          שבת שלום! 🕯️🕯️
        </h1>

        {/* Message */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/20">
          <p className="text-lg text-purple-100 leading-relaxed">
            {t.shabbatBannerMessage || 'המערכת אינה פעילה במהלך השבת. נשמח לחזור לפעילות מלאה ולתיאום פגישות במוצאי השבת.'}
          </p>
        </div>

        {/* Decorative divider */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-12 h-0.5 bg-purple-400/50 rounded" />
          <span className="text-purple-300/60 text-sm">✡️</span>
          <div className="w-12 h-0.5 bg-purple-400/50 rounded" />
        </div>

        {/* Sub-message */}
        <p className="text-purple-200/70 text-sm">
          {t.shabbatBannerFooter || 'שבת היא מלכה — זמן למנוחה, משפחה ונחת.'}
        </p>

        {/* Contact button */}
        <a
          href="mailto:support@calendai.onrender.com"
          className="inline-block mt-6 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-purple-100 rounded-xl text-sm font-medium transition border border-white/20"
        >
          {t.shabbatContactButton || 'יצירת קשר 📧'}
        </a>
      </div>
    </div>
  );
}