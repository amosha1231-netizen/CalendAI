import React from 'react';
import { FileText, ArrowLeft, Shield, AlertCircle, User, Activity, Ban, Gavel, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Terms() {
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
            <div className="p-2.5 bg-blue-50 rounded-xl">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Terms of Service</h1>
              <p className="text-sm text-slate-500">Last updated: July 27, 2026</p>
            </div>
          </div>

          <p className="text-slate-600 leading-relaxed">
            Welcome to <strong>CalendAI</strong> ("the App", "we", "our", or "us"). By accessing or 
            using our service, you agree to be bound by these Terms of Service ("Terms"). 
            If you do not agree to these Terms, please do not use the App.
          </p>
        </div>

        {/* 1. Acceptance of Terms */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-bold text-slate-800">1. Acceptance of Terms</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              By creating an account, signing in, or using any feature of CalendAI, you 
              acknowledge that you have read, understood, and agree to be bound by these Terms. 
              We reserve the right to update these Terms at any time. Continued use of the App 
              after changes constitutes acceptance of the new Terms.
            </p>
          </div>
        </div>

        {/* 2. Description of Service */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-slate-800">2. Description of Service</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              CalendAI is an AI-powered scheduling assistant that helps you manage your weekly 
              schedule. The App allows you to:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>Enter scheduling instructions in natural language.</li>
              <li>Receive AI-generated schedule suggestions.</li>
              <li>Save, edit, and manage events in a weekly calendar view.</li>
              <li>Sync events to your Google Calendar (optional, with your explicit consent).</li>
              <li>Share booking links for meeting coordination.</li>
            </ul>
          </div>
        </div>

        {/* 3. User Accounts */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-slate-800">3. User Accounts</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>When you create an account with CalendAI, you agree to:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>Provide accurate, current, and complete information during the registration process.</li>
              <li>Maintain the security of your login credentials.</li>
              <li>Notify us immediately of any unauthorized use of your account.</li>
              <li>Be responsible for all activities that occur under your account.</li>
            </ul>
            <p className="mt-2">
              You may also use the App as a guest without creating an account, subject to 
              usage limitations.
            </p>
          </div>
        </div>

        {/* 4. Google Calendar Integration */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-800">4. Google Calendar Integration</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              CalendAI offers optional Google Calendar integration. By enabling this feature:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>You explicitly grant permission for the App to read and write events to your Google Calendar.</li>
              <li>We will only access your calendar when you explicitly request an action (e.g., adding an event).</li>
              <li>We never access your calendar data for any purpose other than fulfilling your direct requests.</li>
              <li>You can revoke access at any time via your Google Account settings.</li>
            </ul>
            <p className="mt-2">
              CalendAI's use of information received from Google APIs will adhere to Google's 
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                API Services User Data Policy
              </a>, including the Limited Use requirements.
            </p>
          </div>
        </div>

        {/* 5. Acceptable Use */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-bold text-slate-800">5. Acceptable Use</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>You agree to use CalendAI only for lawful purposes and in accordance with these Terms. You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>Use the App for any illegal or unauthorized purpose.</li>
              <li>Attempt to gain unauthorized access to any part of the App or its systems.</li>
              <li>Interfere with or disrupt the operation of the App or servers.</li>
              <li>Use the App to send spam, harass others, or distribute malicious content.</li>
              <li>Reverse engineer, decompile, or disassemble any part of the App.</li>
              <li>Exceed the permitted usage limits or API rate limits.</li>
            </ul>
          </div>
        </div>

        {/* 6. Intellectual Property */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Gavel className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-bold text-slate-800">6. Intellectual Property</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              The CalendAI name, logo, interface design, and underlying technology are the 
              intellectual property of CalendAI. You may not copy, modify, distribute, sell, 
              or lease any part of the App without our prior written consent.
            </p>
            <p>
              However, you retain all rights to your own schedule data and any content you 
              enter into the App.
            </p>
          </div>
        </div>

        {/* 7. Limitation of Liability */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Ban className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-slate-800">7. Limitation of Liability</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              CalendAI is provided on an "as is" and "as available" basis. We make no 
              warranties, expressed or implied, regarding the reliability, accuracy, or 
              availability of the service. To the fullest extent permitted by law:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2">
              <li>We are not liable for any missed appointments or scheduling conflicts arising from the use of the App.</li>
              <li>We are not responsible for any data loss or service interruptions.</li>
              <li>We are not liable for any indirect, incidental, or consequential damages.</li>
              <li>Our total liability shall not exceed the amount paid by you (if any) in the 12 months preceding the claim.</li>
            </ul>
          </div>
        </div>

        {/* 8. Termination */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Ban className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-bold text-slate-800">8. Termination</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              We reserve the right to suspend or terminate your access to CalendAI at any time, 
              without prior notice, for conduct that we believe violates these Terms or is 
              harmful to the App or other users.
            </p>
            <p>
              You may terminate your account at any time by discontinuing use of the App. 
              Upon termination, your data may be retained for a reasonable period before deletion, 
              unless you request immediate deletion.
            </p>
          </div>
        </div>

        {/* 9. Changes to Terms */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-bold text-slate-800">9. Changes to These Terms</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              We may revise these Terms from time to time. The most current version will 
              always be available at the Terms of Service page. By continuing to use CalendAI 
              after changes become effective, you agree to be bound by the revised Terms.
            </p>
          </div>
        </div>

        {/* 10. Contact */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-slate-800">10. Contact</h2>
          </div>
          
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              If you have any questions about these Terms, please contact us at{' '}
              <a href="mailto:calendai.support@example.com" className="text-blue-600 hover:underline font-medium">
                calendai.support@example.com
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pb-8">
          &copy; {new Date().getFullYear()} CalendAI. All rights reserved.
        </div>
      </div>
    </div>
  );
}