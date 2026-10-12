import React from 'react';
import { Trash2, ArrowLeft, Mail, Clock, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DeleteAccount() {
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
            <div className="p-2.5 bg-red-50 rounded-xl">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Delete Your CalendAI Account</h1>
              <p className="text-sm text-slate-500">How to request account and data deletion</p>
            </div>
          </div>
          <p className="text-slate-600 leading-relaxed">
            You can request deletion of your <strong>CalendAI</strong> account and all associated
            data at any time. This page explains exactly how.
          </p>
        </div>

        {/* How to request */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-slate-800">How to Request Deletion</h2>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 leading-relaxed pl-2">
            <li>
              Send an email to{' '}
              <a href="mailto:calendai555@gmail.com?subject=Delete%20My%20CalendAI%20Account" className="text-blue-600 hover:underline font-medium">
                calendai555@gmail.com
              </a>{' '}
              from the email address associated with your CalendAI account.
            </li>
            <li>Use the subject line <strong>"Delete My CalendAI Account"</strong>.</li>
            <li>We will verify the request and confirm by email once your account and data have been deleted.</li>
          </ol>
        </div>

        {/* What gets deleted */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-800">What Gets Deleted</h2>
          </div>
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>Once your request is processed, we permanently delete:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>Your account record (email, display name, profile photo)</li>
              <li>Your saved schedule and events created in CalendAI</li>
              <li>Stored Google/Microsoft Calendar connection tokens (access to your calendar is also revoked)</li>
              <li>Your provider/booking profile, if you created one</li>
              <li>Mutual scheduling and booking links you created</li>
            </ul>
            <p className="mt-3">
              <strong>What we may retain:</strong> billing records tied to completed payments
              (e.g. invoices held by our payment processor, Stripe/Lemon Squeezy) may be kept
              for a limited period as required for accounting and legal/tax obligations, even
              after your account is deleted.
            </p>
          </div>
        </div>

        {/* Timeframe */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-bold text-slate-800">Timeframe</h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            We process deletion requests within <strong>30 days</strong> of verifying your
            identity. You will receive an email confirmation once the deletion is complete.
          </p>
        </div>

        {/* Alternative */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Partial Deletion</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            If you only want to clear your schedule data without deleting your account, you can
            use the <strong>"Clear All"</strong> button inside the app. To revoke CalendAI's
            access to your Google account without deleting your CalendAI account, visit your{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Google Account Permissions page
            </a>.
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
