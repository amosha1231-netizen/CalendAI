import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

// Labels for the bottom bar and its category sheets.
const NAV_LABELS = {
  he: {
    home: 'בית', routines: 'רוטינות', meet: 'תיאום', tools: 'כלים', me: 'אני', add: 'הוספת אירוע', close: 'סגור',
    meetTitle: 'תיאום פגישות', toolsTitle: 'כלים',
    mutual: 'תיאום פגישה הדדי', mutualSub: 'בוחרים זמנים, הצד השני בוחר מה מתאים לו',
    shareLink: 'קישור לתיאום', shareLinkSub: 'שליחת קישור בוואטסאפ או במייל',
    providers: 'מצא נותן שירות', providersSub: 'קביעת תור אצל בעלי מקצוע',
    providerProfile: 'הפרופיל שלי כנותן שירות', providerProfileSub: 'שעות, שירותים ומחירים',
    alarm: 'שעון מעורר חכם', alarmSub: 'מותאם לאירוע הראשון של מחר',
    expenses: 'הוצאות צפויות', expensesSub: 'מה עומד לרדת מהחשבון',
    journal: 'יומן אישי', journalSub: 'כמה מילים על היום',
    challenges: 'אתגרים ומטרות', challengesSub: 'מצטרפים לאתגר עם אחרים',
    history: 'היסטוריית פעולות', historySub: 'מה ה-AI עשה, עם אפשרות לבטל',
    analytics: 'סטטיסטיקה', analyticsSub: 'לאן הולך הזמן שלך',
  },
  en: {
    home: 'Home', routines: 'Routines', meet: 'Meet', tools: 'Tools', me: 'You', add: 'Add event', close: 'Close',
    meetTitle: 'Scheduling', toolsTitle: 'Tools',
    mutual: 'Mutual scheduling', mutualSub: 'Pick times, the other side picks what works',
    shareLink: 'Booking link', shareLinkSub: 'Send a link on WhatsApp or by email',
    providers: 'Find a provider', providersSub: 'Book an appointment with a pro',
    providerProfile: 'My provider profile', providerProfileSub: 'Hours, services and prices',
    alarm: 'Smart alarm', alarmSub: "Set to tomorrow's first event",
    expenses: 'Expected expenses', expensesSub: "What's about to be charged",
    journal: 'Daily journal', journalSub: 'A few words about your day',
    challenges: 'Goals & challenges', challengesSub: 'Join a challenge with others',
    history: 'Action history', historySub: 'What the AI did, with undo',
    analytics: 'Analytics', analyticsSub: 'Where your time goes',
  },
  fr: {
    home: 'Accueil', routines: 'Routines', meet: 'RDV', tools: 'Outils', me: 'Moi', add: 'Ajouter', close: 'Fermer',
    meetTitle: 'Rendez-vous', toolsTitle: 'Outils',
    mutual: 'Planification mutuelle', mutualSub: "Proposez des créneaux, l'autre choisit",
    shareLink: 'Lien de réservation', shareLinkSub: 'Envoyer par WhatsApp ou e-mail',
    providers: 'Trouver un prestataire', providersSub: 'Prendre rendez-vous avec un pro',
    providerProfile: 'Mon profil prestataire', providerProfileSub: 'Horaires, services et prix',
    alarm: 'Réveil intelligent', alarmSub: 'Réglé sur le premier événement de demain',
    expenses: 'Dépenses prévues', expensesSub: 'Ce qui va être débité',
    journal: 'Journal', journalSub: 'Quelques mots sur votre journée',
    challenges: 'Objectifs et défis', challengesSub: "Rejoindre un défi avec d'autres",
    history: 'Historique', historySub: "Ce que l'IA a fait, avec annulation",
    analytics: 'Statistiques', analyticsSub: 'Où va votre temps',
  },
  es: {
    home: 'Inicio', routines: 'Rutinas', meet: 'Citas', tools: 'Herramientas', me: 'Tú', add: 'Añadir', close: 'Cerrar',
    meetTitle: 'Citas', toolsTitle: 'Herramientas',
    mutual: 'Programación mutua', mutualSub: 'Elige horarios, el otro elige el que le sirve',
    shareLink: 'Enlace de reserva', shareLinkSub: 'Enviar por WhatsApp o correo',
    providers: 'Buscar un proveedor', providersSub: 'Reservar con un profesional',
    providerProfile: 'Mi perfil de proveedor', providerProfileSub: 'Horario, servicios y precios',
    alarm: 'Alarma inteligente', alarmSub: 'Según el primer evento de mañana',
    expenses: 'Gastos previstos', expensesSub: 'Lo que se va a cobrar',
    journal: 'Diario', journalSub: 'Unas palabras sobre tu día',
    challenges: 'Metas y retos', challengesSub: 'Únete a un reto con otros',
    history: 'Historial', historySub: 'Lo que hizo la IA, con deshacer',
    analytics: 'Estadísticas', analyticsSub: 'En qué se va tu tiempo',
  },
};

export function getNavLabels(lang) {
  return NAV_LABELS[lang] || NAV_LABELS.en;
}

function Badge({ value, dot }) {
  if (dot) {
    return <span className="absolute -top-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />;
  }
  if (!value) return null;
  return (
    <span className="absolute -top-1.5 -end-3 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold leading-5 text-center ring-2 ring-white">
      {value > 99 ? '99+' : value}
    </span>
  );
}

/**
 * Floating, rounded bottom bar in the style of WhatsApp's tab bar.
 * A finger can slide along it: the highlight follows, and lifting it opens that tab.
 * tabs: [{ id, label, icon, badge?, dot?, photo? }]
 */
export default function BottomNav({ tabs, activeId, onSelect, isRTL, screenOpen = false }) {
  const barRef = useRef(null);
  const tabRefs = useRef({});
  const drag = useRef(null); // { startX, moved, pointerId }
  const suppressClick = useRef(false);
  const [dragId, setDragId] = useState(null);
  const [pill, setPill] = useState(null); // { left, width }
  const highlightId = dragId || activeId;

  // While the bar is on screen, full-screen layers stop above it (see index.css).
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.add('has-bottom-nav');
    return () => document.body.classList.remove('has-bottom-nav');
  }, []);

  // Slide the highlight pill to the highlighted tab.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[highlightId];
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [highlightId, tabs.length]);

  const tabAt = (clientX) => {
    for (const tab of tabs) {
      const el = tabRefs.current[tab.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return tab.id;
    }
    return null;
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { startX: e.clientX, moved: false, pointerId: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < 8) return;
    if (!d.moved) {
      d.moved = true;
      try { barRef.current?.setPointerCapture(e.pointerId); } catch (err) {}
    }
    const id = tabAt(e.clientX);
    if (id) setDragId(id);
  };
  const endDrag = (e, commit) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    // Swallow the click the browser may fire after a drag, but only that one.
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const id = commit ? (tabAt(e.clientX) || dragId) : null;
    setDragId(null);
    if (id) onSelect(id);
  };

  return (
    <>
    {/* When a screen is open above the bar, fill the strip under it so the page behind doesn't peek through */}
    {screenOpen && (
      <div aria-hidden="true" className="fixed inset-x-0 bottom-0 z-[9985] bg-slate-50 border-t border-slate-200/60" style={{ height: 'var(--bottom-nav-space)' }} />
    )}
    <nav
      className="bottom-nav fixed z-[9990] inset-x-3 mx-auto max-w-md"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => endDrag(e, true)}
        onPointerCancel={e => endDrag(e, false)}
        className="relative flex items-stretch justify-between gap-1 p-1.5 rounded-[2rem] bg-white/90 backdrop-blur-xl border border-slate-200/70 shadow-[0_8px_30px_rgba(15,23,42,0.12)] select-none"
        style={{ touchAction: 'pan-y' }}
      >
        {pill && (
          <span
            aria-hidden="true"
            className={`absolute top-1.5 bottom-1.5 rounded-[1.6rem] transition-all duration-300 ease-out ${dragId ? 'bg-slate-200/80 scale-105' : 'bg-slate-100'}`}
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = tab.id === highlightId;
          return (
            <button
              key={tab.id}
              ref={el => { tabRefs.current[tab.id] = el; }}
              onClick={() => {
                if (suppressClick.current) { suppressClick.current = false; return; }
                onSelect(tab.id);
              }}
              aria-current={tab.id === activeId ? 'page' : undefined}
              className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] rounded-[1.6rem] transition-colors ${
                active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="relative">
                {tab.photo ? (
                  <img src={tab.photo} alt="" draggable="false" className={`w-6 h-6 rounded-full object-cover ${active ? 'ring-2 ring-slate-900' : ''}`} />
                ) : (
                  <Icon className="w-6 h-6" strokeWidth={active ? 2.3 : 1.8} />
                )}
                <Badge value={tab.badge} dot={tab.dot} />
              </span>
              <span className={`text-[11px] leading-none truncate max-w-full px-1 ${active ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
}

/**
 * Bottom sheet listing the actions of one category (e.g. "Meet" or "Tools").
 * items: [{ id, label, sub, icon, tone, onClick }]
 */
export function NavSheet({ title, items, onClose, isRTL, closeLabel }) {
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px] animate-fade-scale-in" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto overscroll-contain animate-slide-up"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        dir={isRTL ? 'rtl' : 'ltr'}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex justify-center pt-2.5 sm:hidden"><span className="w-10 h-1.5 rounded-full bg-slate-200" /></div>
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label={closeLabel} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="px-3 pb-2">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={item.onClick}
                  className="w-full flex items-center gap-3 px-2 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition text-start"
                >
                  <span className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${item.tone}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-slate-800 truncate">{item.label}</span>
                    {item.sub && <span className="block text-xs text-slate-500 truncate">{item.sub}</span>}
                  </span>
                  <Chevron className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
