import React from "react";

export default function LuxuryLoader({ statusText = "OPTIMIZING YOUR SCHEDULE..." }) {
  return (
    <div className="luxury-loader-overlay">
      {/* Radial gradient depth effect */}
      <div className="luxury-loader-bg" />

      {/* Ambient glow core */}
      <div className="luxury-loader-glow" />

      {/* Breathing core */}
      <div className="luxury-loader-core">
        <div className="luxury-loader-orb" />
        <h1 className="luxury-loader-title">CalendAI</h1>
      </div>

      {/* Status text */}
      <div className="luxury-loader-status-wrapper">
        <span className="luxury-loader-status">{statusText}</span>
      </div>
    </div>
  );
}