import React from 'react';
import { Shield, ArrowLeft, Calendar, Lock, Eye, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 font-sans">
      <div className="max-w-3xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to CalendAI
        </button>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-indigo-50 rounded-xl">
              <Shield className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
              <p className="text-sm text-slate-500">Last updated: July 27, 2026</p>
            </div>
          </div>

          <p className="text-slate-600 leading-relaxed">
            This Privacy Policy explains how <strong>CalendAI</strong> ("we", "our", or "the app") 
            collects, uses, stores, and protects your personal information when you use our 
            service. We are committed to ensuring your privacy and maintaining your trust.
          </p>
        </div>

        {/* 1. Information We Collect */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-slate-800">1. Information We Collect</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>When you sign in with Google, we collect the following information from your Google profile:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Email address</strong> — used to identify your account and send you 
                notifications if applicable.
              </li>
              <li>
                <strong>Display name</strong> — used to personalize your experience within the app.
              </li>
              <li>
                <strong>Profile photo</strong> — used to display your avatar in the app interface.
              </li>
              <li>
                <strong>Google Calendar events</strong> — only if you explicitly choose to sync 
                events to your Google Calendar. We read and write events solely at your direction.
              </li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> collect any browsing history, location data beyond 
              what you voluntarily provide (location selector), or any other personal data 
              outside of what is described above.
            </p>
          </div>
        </div>

        {/* 2. How We Use Your Data */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-bold text-slate-800">2. How We Use Your Data</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>Your data is used exclusively for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>Creating and managing your personalized schedule within the app.</li>
              <li>Saving and loading your schedule data so you can access it across sessions.</li>
              <li>Adding events to your Google Calendar when you explicitly request it.</li>
              <li>Improving the app's scheduling suggestions via AI (anonymized).</li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> sell, rent, or share your personal data with any 
              third parties for marketing or advertising purposes.
            </p>
          </div>
        </div>

        {/* 3. Data Storage & Security */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-800">3. Data Storage & Security</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>We take data security seriously:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Tokens:</strong> Your Google OAuth access token is stored securely in 
                a server-side session. It is <strong>never exposed to the client</strong> 
                (your browser) and is only used server-side to make authorized Google Calendar API calls.
              </li>
              <li>
                <strong>Session data:</strong> Session information is stored server-side and 
                is encrypted using a secret key configured via the <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">SESSION_SECRET</code> environment variable.
              </li>
              <li>
                <strong>Schedule data:</strong> Your schedule is stored in a local file on 
                the server. We use industry-standard practices to secure this data.
              </li>
              <li>
                <strong>HTTPS:</strong> All data transmitted between your browser and our server 
                is encrypted using HTTPS in production.
              </li>
            </ul>
          </div>
        </div>

        {/* 4. Google API Scopes */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <ExternalLink className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-slate-800">4. Google API Scopes</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>When you sign in with Google, we request the following scopes:</p>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 mt-3">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 shrink-0"></div>
                <div>
                  <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">openid</code>
                  <p className="text-xs text-slate-500 mt-0.5">Used for OpenID Connect authentication to verify your identity.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 shrink-0"></div>
                <div>
                  <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">profile</code>
                  <p className="text-xs text-slate-500 mt-0.5">Provides your display name and profile photo.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 shrink-0"></div>
                <div>
                  <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">email</code>
                  <p className="text-xs text-slate-500 mt-0.5">Provides your primary email address for account identification.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0"></div>
                <div>
                  <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border">https://www.googleapis.com/auth/calendar.events</code>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <strong>Only requested if you choose to sync events.</strong> Allows the app to create, read, update, and delete 
                    events on your Google Calendar <strong>only when you explicitly request it</strong>. 
                    We never access your calendar without your action.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Data Retention & Deletion */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Trash2 className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-slate-800">5. Data Retention & Deletion</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Session data:</strong> Your session is maintained while you are logged in 
                and expires after a period of inactivity.
              </li>
              <li>
                <strong>Schedule data:</strong> Your schedule persists between sessions and can be 
                deleted at any time by using the "Clear All" button in the app.
              </li>
              <li>
                <strong>Account removal:</strong> To fully remove your data, you can log out and 
                contact us to request deletion of your stored schedule. You can also revoke 
                CalendAI's access to your Google account at any time via your 
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  Google Account Permissions page
                </a>.
              </li>
            </ul>
          </div>
        </div>

        {/* 6. Third-Party Services */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <ExternalLink className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-bold text-slate-800">6. Third-Party Services</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>CalendAI relies on the following third-party services:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>
                <strong>Google OAuth 2.0</strong> — for authentication and, with your permission, 
                Google Calendar API access. See 
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  Google's Privacy Policy
                </a>.
              </li>
              <li>
                <strong>Google Gemini API</strong> — for AI-powered schedule parsing and 
                suggestions. Text you enter is sent to Gemini for processing. See 
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                  Google's Privacy Policy
                </a>.
              </li>
            </ul>
            <p className="mt-2">
              We do not control how these third parties handle your data. We encourage you 
              to review their privacy policies.
            </p>
          </div>
        </div>

        {/* 7. Your Rights */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-bold text-slate-800">7. Your Rights</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>Access your data at any time through the app interface.</li>
              <li>Delete your schedule data using the "Clear All" button.</li>
              <li>Revoke CalendAI's access to your Google account via your Google Account settings.</li>
              <li>Request full deletion of your stored data by contacting us.</li>
              <li>Opt out of Google Calendar sync by simply not using the sync feature.</li>
            </ul>
          </div>
        </div>

        {/* 8. Contact */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">8. Contact</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            If you have any questions about this Privacy Policy or how your data is handled, 
            please contact us at{' '}
            <a href="mailto:calendai.support@example.com" className="text-blue-600 hover:underline font-medium">
              calendai.support@example.com
            </a>
          </p>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pb-8">
          &copy; {new Date().getFullYear()} CalendAI. All rights reserved.
        </div>
      </div>
    </div>
  );
}