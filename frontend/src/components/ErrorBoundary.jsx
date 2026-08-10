import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log the error but never throw
    try {
      // ── Debug: Always print error details to console ──
      console.error('=== ErrorBoundary Caught Error ===');
      console.error('Message:', error?.message || error);
      console.error('Stack:', error?.stack);
      console.error('Component Stack:', errorInfo?.componentStack);
      console.error('URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');
      console.error('UserAgent:', typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A');
      console.error('===================================');
      
      // Store in a global debug variable so we can show on screen
      if (typeof window !== 'undefined') {
        window.__calendaiLastError = {
          message: error?.message || String(error),
          stack: error?.stack,
          componentStack: errorInfo?.componentStack,
          timestamp: new Date().toISOString(),
          url: window.location.href
        };
      }
      
      // Attempt to report to a logging service if available
      if (typeof window !== 'undefined' && window.__errorLog) {
        try {
          window.__errorLog.push({
            error: error?.message || String(error),
            stack: error?.stack,
            componentStack: errorInfo?.componentStack,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent
          });
        } catch (logErr) {
          // Silently fail - logging should never throw
        }
      }
    } catch (e) {
      // Absolute last resort - never throw in error handler
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || this.state.error?.toString() || 'Unknown error';
      const isAuthError = errorMessage.includes('auth') || errorMessage.includes('token') || errorMessage.includes('localStorage');
      const isStorageError = errorMessage.includes('localStorage') || errorMessage.includes('SecurityError') || errorMessage.includes('storage');

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            {/* Icon */}
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>

            <h1 className="text-xl font-bold text-slate-800 mb-2">CalendAI</h1>
            <p className="text-slate-500 mb-6 text-sm">
              {isStorageError
                ? 'הדפדפן שלך מגביל אחסון מקומי. נסה לפתוח ב-Safari רגיל.'
                : 'Something went wrong. Please try again or refresh.'}
            </p>

            {process.env.NODE_ENV === 'development' && (
              <details className="mb-4 text-left">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">Error details</summary>
                <pre className="mt-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg overflow-auto max-h-32 border border-red-100">
                  {errorMessage}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleRetry}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-lg hover:shadow-xl text-sm"
              >
                נסה שוב / Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="w-full px-4 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition text-sm"
              >
                רענן דף / Refresh Page
              </button>
              {isAuthError && (
                <button
                  onClick={() => {
                    // Clear storage and reload
                    try { localStorage.clear(); } catch (e) {}
                    try { sessionStorage.clear(); } catch (e) {}
                    window.location.href = '/';
                  }}
                  className="w-full px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium hover:bg-red-100 transition text-sm"
                >
                  נקה נתונים והתחל מחדש / Clear & Restart
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
