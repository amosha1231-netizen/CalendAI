import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import safeStorage from '../utils/safeStorage';
import LuxuryLoader from '../components/LuxuryLoader';

export default function AuthSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuth } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function handleAuth() {
      try {
        // ── Step 1: Extract token from URL ──
        const token = searchParams.get('token');

        console.log('=== AuthSuccess loaded ===');
        console.log('Captured Token from URL:', token);

        if (!token) {
          // No token in URL — navigate to home
          console.warn('AuthSuccess: No token found in URL, redirecting to home.');
          navigate('/', { replace: true });
          return;
        }

        // ── Step 2: Save token to all storage locations ──
        try {
          safeStorage.setItem('token', token);
          safeStorage.setItem('calendai-jwt', token);
          safeStorage.setItem('calendai-isLoggedIn', 'true');
          localStorage.setItem('token', token);
          localStorage.setItem('calendai-jwt', token);
          localStorage.setItem('calendai-isLoggedIn', 'true');
        } catch (e) {
          // localStorage may be unavailable (private mode)
        }

        // ── Step 3: Trigger auth check in AuthContext ──
        // This will call /api/auth/me and update the auth state
        if (typeof checkAuth === 'function') {
          await checkAuth();
        }

        if (cancelled) return;

        // ── Step 4: Navigate to home using React Router ──
        // This triggers a proper re-render without full page reload
        navigate('/', { replace: true });
      } catch (err) {
        console.error('AuthSuccess error:', err);
        if (!cancelled) {
          // On error, still navigate to home — the token is saved
          // and AuthContext will pick it up on next mount
          navigate('/', { replace: true });
        }
      }
    }

    handleAuth();
    return () => { cancelled = true; };
  }, [searchParams, navigate, checkAuth]);

  return <LuxuryLoader statusText="מתחבר למערכת..." />;
}