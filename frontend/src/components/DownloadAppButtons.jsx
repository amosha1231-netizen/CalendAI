import React from 'react';
import AppleLogo from './AppleLogo';
import { IOS_APP_STORE_LIVE, ANDROID_PLAY_URL, iosDownloadUrl } from '../utils/appLinks';

const COPY = {
  he: {
    iosTop: IOS_APP_STORE_LIVE ? 'הורידו מה-' : 'גרסת בטא ל-iPhone',
    iosMain: IOS_APP_STORE_LIVE ? 'App Store' : 'TestFlight',
    playTop: ANDROID_PLAY_URL ? 'הורידו מ-' : 'בקרוב ב-',
    playMain: 'Google Play',
    testflightNote: 'ב-iPhone ההתקנה עוברת דרך אפליקציית TestFlight החינמית של Apple.',
  },
  en: {
    iosTop: IOS_APP_STORE_LIVE ? 'Download on the' : 'iPhone beta on',
    iosMain: IOS_APP_STORE_LIVE ? 'App Store' : 'TestFlight',
    playTop: ANDROID_PLAY_URL ? 'Get it on' : 'Coming soon to',
    playMain: 'Google Play',
    testflightNote: "On iPhone, installing goes through Apple's free TestFlight app.",
  },
};

const PlayLogo = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#34A853" d="M3.6 1.8 13.8 12 3.6 22.2c-.4-.2-.6-.7-.6-1.2V3c0-.5.2-1 .6-1.2z" />
    <path fill="#FBBC04" d="M17.2 8.6 13.8 12l3.4 3.4 3.9-2.2c.9-.5.9-1.9 0-2.4l-3.9-2.2z" />
    <path fill="#4285F4" d="M3.6 22.2 13.8 12l3.4 3.4L5 22.3c-.5.3-1 .2-1.4-.1z" />
    <path fill="#EA4335" d="M3.6 1.8c.4-.3.9-.4 1.4-.1l12.2 6.9-3.4 3.4L3.6 1.8z" />
  </svg>
);

const Badge = ({ href, icon, top, main, disabled, dark }) => {
  const base = `inline-flex items-center gap-2.5 h-[52px] px-4 rounded-2xl min-w-[170px] transition ${
    dark ? 'bg-white text-[#0E1020]' : 'bg-black text-white'
  }`;
  const body = (
    <>
      {icon}
      <span className="flex flex-col items-start leading-tight text-start" dir="auto">
        <span className="text-[11px] opacity-75">{top}</span>
        <span className="text-[17px] font-bold" dir="ltr">{main}</span>
      </span>
    </>
  );
  if (disabled || !href) {
    return <span className={`${base} opacity-45 cursor-default select-none`} aria-disabled="true">{body}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} hover:opacity-90 active:scale-[0.99]`}>
      {body}
    </a>
  );
};

/** App Store / TestFlight + Google Play download buttons. `dark` = for a dark background. */
export default function DownloadAppButtons({ lang = 'he', dark = false, showNote = true, className = '' }) {
  const c = COPY[lang] || COPY.en;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Badge href={iosDownloadUrl()} icon={<AppleLogo className="w-6 h-6" />} top={c.iosTop} main={c.iosMain} dark={dark} />
        <Badge href={ANDROID_PLAY_URL} icon={<PlayLogo className="w-6 h-6" />} top={c.playTop} main={c.playMain} disabled={!ANDROID_PLAY_URL} dark={dark} />
      </div>
      {showNote && !IOS_APP_STORE_LIVE && (
        <p className={`mt-3 text-xs text-center ${dark ? 'text-white/60' : 'text-[#6E7189]'}`}>{c.testflightNote}</p>
      )}
    </div>
  );
}
