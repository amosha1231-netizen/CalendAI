import React from "react";

// Light "aurora" loader. Markup and styles mirror the boot splash in index.html
// (styles live there so the splash is styled on first paint), so React's
// loaders continue the splash without a visible jump.
export default function LuxuryLoader({ statusText = "" }) {
  return (
    <div className="luxury-loader-overlay" role="status" aria-live="polite">
      <div className="luxury-loader-blob b1" />
      <div className="luxury-loader-blob b2" />
      <div className="luxury-loader-core">
        <div className="luxury-loader-mark">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <rect x="18" y="24" width="64" height="56" rx="10" fill="#fff" />
            <rect x="29" y="14" width="6" height="16" rx="3" fill="#fff" />
            <rect x="65" y="14" width="6" height="16" rx="3" fill="#fff" />
            <rect x="18" y="24" width="64" height="16" rx="8" fill="#E2DCFF" />
            <rect x="30" y="50" width="12" height="11" rx="3" fill="#5B4BFF" />
            <rect x="50" y="50" width="12" height="11" rx="3" fill="#C9C2FF" />
            <rect x="30" y="66" width="12" height="8" rx="3" fill="#C9C2FF" />
            <rect x="50" y="66" width="12" height="8" rx="3" fill="#FF6FA8" />
          </svg>
        </div>
        <div className="luxury-loader-title">CalendAI</div>
        <div className="luxury-loader-track"><div className="luxury-loader-bar" /></div>
        <div className="luxury-loader-status">{statusText}</div>
      </div>
    </div>
  );
}
