import React, { useState, useEffect } from "react";
import { isShabbatNow } from "../utils/shabbatHelper";
import ShabbatBanner from "./ShabbatBanner";

/**
 * Shows the Shabbat banner instead of its children while it is Shabbat at the
 * viewer's own location, and re-checks every minute in both directions.
 * Keeping the check in its own component lets the wrapped screen call its
 * hooks unconditionally.
 */
export default function ShabbatGate({ t, lang, children }) {
  const [shabbatActive, setShabbatActive] = useState(() => isShabbatNow());

  useEffect(() => {
    const interval = setInterval(() => setShabbatActive(isShabbatNow()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (shabbatActive) return <ShabbatBanner t={t} lang={lang} />;
  return children;
}
