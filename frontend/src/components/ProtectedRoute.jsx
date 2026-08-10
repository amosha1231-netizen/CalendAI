import React from 'react';
import LuxuryLoader from './LuxuryLoader';

/**
 * ProtectedRoute – guards content behind authentication.
 *
 * Usage:
 *   <ProtectedRoute loading={authLoading} isAuthenticated={!!user}>
 *     <Dashboard />
 *   </ProtectedRoute>
 *
 * While loading:       shows <LuxuryLoader />
 * If not authenticated: shows a message prompting login (or you can redirect via Navigate if using React Router)
 * If authenticated:     renders children
 */
export default function ProtectedRoute({ loading, isAuthenticated, children }) {
  // ── While auth is still being checked, show a full-screen loader ──
  if (loading) {
    return <LuxuryLoader statusText="AUTHENTICATING..." />;
  }

  // ── Not authenticated → show a prompt to login ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-slate-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-sm text-slate-500 mb-6">Please log in to access this page.</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  // ── Authenticated → render children ──
  return children;
}