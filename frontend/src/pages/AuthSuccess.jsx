import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import safeStorage from '../utils/safeStorage';
import LuxuryLoader from '../components/LuxuryLoader';
import api from '../api/axios';

export default function AuthSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { checkAuth } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function handleAuth() {
      try {
        const code = searchParams.get('oauth_code');
        if (!code) {
          navigate('/', { replace: true });
          return;
        }
        window.history.replaceState({}, document.title, window.location.pathname);

        const exchange = await api.post('/api/auth/oauth-exchange', { code });
        const token = exchange.data?.token;
        if (!token) throw new Error('OAuth code exchange failed.');
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
