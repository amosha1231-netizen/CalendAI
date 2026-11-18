import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Languages } from 'lucide-react';

// Shared layout for the legal pages (Terms, Privacy). Each page passes the
// same document in Hebrew and English so both languages stay in sync.
//
// Document shape:
//   { title, updated, intro: [para], sections: [{ id, icon, color, title, blocks }] }
//   block: { p: 'text' } | { ul: ['text', ...] }
// Inline markup inside text: **bold** and [label](https://url or mailto:).

function pickInitialLang(langProp) {
  try {
    if (typeof window !== 'undefined') {
      const fromUrl = new URLSearchParams(window.location.search).get('lang');
      if (fromUrl === 'he' || fromUrl === 'en') return fromUrl;
    }
  } catch { /* ignore */ }
  return langProp === 'he' ? 'he' : 'en';
}

const INLINE_RE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text) {
  const parts = String(text).split(INLINE_RE);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-slate-800">{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const external = /^https?:/.test(link[2]);
      return (
        <a
          key={i}
          href={link[2]}
          className="text-blue-600 hover:underline font-medium"
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {link[1]}
        </a>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default function LegalPage({ docs, lang: langProp, headerIcon: HeaderIcon, headerTint = 'bg-blue-50', headerColor = 'text-blue-600' }) {
  const [lang, setLang] = useState(() => pickInitialLang(langProp));
  const doc = docs[lang] || docs.en;
  const isRTL = lang === 'he';
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const goHome = () => {
    try { window.location.href = '/'; } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 font-sans" dir={isRTL ? 'rtl' : 'ltr'} lang={lang}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={goHome}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <BackIcon className="w-4 h-4" />
            {doc.back}
          </button>
          <button
            onClick={() => setLang(isRTL ? 'en' : 'he')}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border rounded-full px-3 py-1 bg-white transition"
          >
            <Languages className="w-4 h-4" />
            {isRTL ? 'English' : 'עברית'}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2.5 rounded-xl ${headerTint}`}>
              {HeaderIcon && <HeaderIcon className={`w-6 h-6 ${headerColor}`} />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{doc.title}</h1>
              <p className="text-sm text-slate-500">{doc.updated}</p>
            </div>
          </div>
          <div className="space-y-3 text-slate-600 leading-relaxed">
            {doc.intro.map((para, i) => <p key={i}>{renderInline(para)}</p>)}
          </div>
        </div>

        {doc.sections.map((section, idx) => {
          const Icon = section.icon;
          return (
            <div key={section.id} id={section.id} className="bg-white rounded-2xl shadow-sm border p-6 sm:p-8 mb-6">
              <div className="flex items-center gap-2 mb-4">
                {Icon && <Icon className={`w-5 h-5 ${section.color || 'text-slate-500'}`} />}
                <h2 className="text-lg font-bold text-slate-800">{idx + 1}. {section.title}</h2>
              </div>
              <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
                {section.blocks.map((block, i) => (
                  block.ul ? (
                    <ul key={i} className={`list-disc space-y-2 ${isRTL ? 'pr-5' : 'pl-5'}`}>
                      {block.ul.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
                    </ul>
                  ) : (
                    <p key={i}>{renderInline(block.p)}</p>
                  )
                ))}
              </div>
            </div>
          );
        })}

        <div className="text-center text-xs text-slate-400 pb-8">
          &copy; {new Date().getFullYear()} CalendAI. {doc.rights}
        </div>
      </div>
    </div>
  );
}
