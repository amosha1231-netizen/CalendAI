import React, { useState } from "react";
import { isAppleSignInAvailable, signInWithApple } from "../utils/appleSignIn";

const LABEL = { he: 'המשך עם Apple', en: 'Continue with Apple' };
const ERRORS = {
  apple_email_in_use: {
    he: 'כתובת המייל של חשבון Apple כבר רשומה אצלנו. התחברו בדרך שבה נרשמתם.',
    en: "That Apple ID's email is already registered. Sign in the way you signed up."
  },
  default: { he: 'ההתחברות עם Apple נכשלה. נסו שוב.', en: 'Sign in with Apple failed. Please try again.' }
};

export function AppleLogo({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.51 1.25-2.58-.03-.01-2.39-.92-2.4-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.76-.96 2.79 1.02.08 2.05-.51 2.68-1.27z" />
    </svg>
  );
}

/**
 * "Continue with Apple" for the iPhone app (App Store guideline 4.8).
 * Renders nothing on the web and on Android.
 */
export default function AppleSignInButton({ lang = 'he', className = "" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!isAppleSignInAvailable()) return null;
  const key = lang === 'he' ? 'he' : 'en';

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithApple();
      if (result && result.error) setError(result.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`w-full h-14 rounded-2xl bg-black text-white text-base font-bold flex items-center justify-center gap-2.5 active:scale-[0.99] transition disabled:opacity-70 ${className}`}
      >
        <AppleLogo />
        {LABEL[key]}
      </button>
      {error && (
        <p role="alert" className="text-sm text-rose-600 text-center">
          {(ERRORS[error] || ERRORS.default)[key]}
        </p>
      )}
    </>
  );
}

export { isAppleSignInAvailable };
