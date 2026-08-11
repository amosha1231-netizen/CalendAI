import React, { useEffect } from "react";
import api from "../api/axios";
import safeStorage from "../utils/safeStorage";
import LuxuryLoader from "../components/LuxuryLoader";

export default function AuthSuccess() {
  useEffect(() => {
    let cancelled = false;

    async function handleAuth() {
      try {
        // ── Step 1: Extract token from URL ──
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        console.log("=== AuthSuccess loaded ===");
        console.log("Captured Token from URL:", token);

        if (!token) {
          // No token in URL — redirect to home
          console.warn("AuthSuccess: No token found in URL, redirecting to home.");
          window.location.href = "/";
          return;
        }

        // ── Step 2: Save token to all storage locations ──
        try {
          safeStorage.setItem("token", token);
          safeStorage.setItem("calendai-jwt", token);
          safeStorage.setItem("calendai-isLoggedIn", "true");
          localStorage.setItem("token", token);
          localStorage.setItem("calendai-jwt", token);
          localStorage.setItem("calendai-isLoggedIn", "true");
        } catch (e) {
          // localStorage may be unavailable (private mode)
        }

        // ── Step 3: Clean the URL (remove token param) ──
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        window.history.replaceState({}, document.title, url.pathname + url.search);

        // ── Step 4: Fetch user data from /api/auth/me ──
        const res = await api.get(`/api/auth/me?t=${Date.now()}`, {
          cache: "no-store",
          validateStatus: false,
        });

        if (cancelled) return;

        if (res.status === 401) {
          // Token invalid — clear and redirect
          try {
            safeStorage.removeItem("token");
            safeStorage.removeItem("calendai-jwt");
            safeStorage.removeItem("calendai-isLoggedIn");
            localStorage.removeItem("token");
            localStorage.removeItem("calendai-jwt");
            localStorage.removeItem("calendai-isLoggedIn");
          } catch (e) {}
          window.location.href = "/?error=auth_failed";
          return;
        }

        if (res.data?.user) {
          // Save user data to safeStorage for App.jsx to pick up
          try {
            safeStorage.setItem("calendai-user", JSON.stringify(res.data.user));
          } catch (e) {}
        }

        // ── Step 5: Navigate to dashboard ──
        // Use window.location for a full page navigation to ensure
        // App.jsx re-initializes with the authenticated state.
        window.location.href = "/";
      } catch (err) {
        console.error("AuthSuccess error:", err);
        if (!cancelled) {
          // On network error, still navigate to home — the token is saved
          // and App.jsx's auth check will pick it up.
          window.location.href = "/";
        }
      }
    }

    handleAuth();
    return () => { cancelled = true; };
  }, []);

  return <LuxuryLoader statusText="מתחבר למערכת..." />;
}