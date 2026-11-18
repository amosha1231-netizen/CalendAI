import React from 'react';
import { Shield } from 'lucide-react';
import LegalPage from './legal/LegalPage';
import privacyContent from './legal/privacyContent';

export default function PrivacyPolicy({ lang }) {
  return <LegalPage docs={privacyContent} lang={lang} headerIcon={Shield} headerTint="bg-indigo-50" headerColor="text-indigo-600" />;
}
