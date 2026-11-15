import React from 'react';
import { FileText } from 'lucide-react';
import LegalPage from './legal/LegalPage';
import termsContent from './legal/termsContent';

export default function Terms({ lang }) {
  return <LegalPage docs={termsContent} lang={lang} headerIcon={FileText} headerTint="bg-blue-50" headerColor="text-blue-600" />;
}
