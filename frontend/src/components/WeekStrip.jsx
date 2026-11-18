import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

/**
 * Weekly view, option B: the seven coming days as one strip (today first and
 * coloured), a dot under a day that has events. Tapping a day shows only that
 * day below. A short line sums up the week.
 *
 * Event rows are drawn by the caller (renderEvent) so they keep every action
 * of the old weekly grid: edit on tap, delete, task / reminder badges.
 */
const LETTERS = {
  he: { Sunday: 'א׳', Monday: 'ב׳', Tuesday: 'ג׳', Wednesday: 'ד׳', Thursday: 'ה׳', Friday: 'ו׳', Saturday: 'ש׳' },
  en: { Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' }
};
const FULL = {
  he: { Sunday: 'יום ראשון', Monday: 'יום שני', Tuesday: 'יום שלישי', Wednesday: 'יום רביעי', Thursday: 'יום חמישי', Friday: 'יום שישי', Saturday: 'שבת' },
  en: { Sunday: 'Sunday', Monday: 'Monday', Tuesday: 'Tuesday', Wednesday: 'Wednesday', Thursday: 'Thursday', Friday: 'Friday', Saturday: 'Saturday' }
};
const STR = {
  he: { today: 'היום', tomorrow: 'מחר', events: n => (n === 1 ? 'אירוע אחד' : `${n} אירועים`), free: 'יום פנוי', add: 'הוספה ליום הזה', week: 'השבוע', busiest: 'הכי עמוס', freeDays: 'פנוי', and: ' ו', none: 'שבוע פנוי לגמרי' },
  en: { today: 'Today', tomorrow: 'Tomorrow', events: n => (n === 1 ? '1 event' : `${n} events`), free: 'Free day', add: 'Add to this day', week: 'This week', busiest: 'busiest', freeDays: 'free', and: ' and ', none: 'A completely free week' }
};

function joinNames(names, s) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')}${s.and}${names[names.length - 1]}`;
}

export default function WeekStrip({ lang = 'he', dayNamesEn, todayName, getDayEvents, getDayReminders, renderEvent, renderReminder, onAddForDay }) {
  const L = LETTERS[lang] || LETTERS.en;
  const F = FULL[lang] || FULL.en;
  const s = STR[lang] || STR.en;

  const days = useMemo(() => {
    const start = dayNamesEn.indexOf(todayName);
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const key = dayNamesEn[(start + i) % 7];
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      return { key, date, offset: i };
    });
  }, [dayNamesEn, todayName]);

  const [selected, setSelected] = useState(0);
  const counts = days.map(d => (getDayEvents(d.key, d.date) || []).length);
  const day = days[Math.min(selected, 6)];
  const events = getDayEvents(day.key, day.date) || [];
  const reminders = getDayReminders ? getDayReminders(day.date) || [] : [];

  // Week summary: total, busiest day, free days (Shabbat is not counted as "free").
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const busiest = max > 0 ? days[counts.indexOf(max)] : null;
  const freeDays = days.filter((d, i) => counts[i] === 0 && d.key !== 'Saturday').map(d => F[d.key].replace(/^יום /, ''));

  const label = day.offset === 0 ? s.today : day.offset === 1 ? s.tomorrow : F[day.key];
  const dateText = `${day.date.getDate()}.${day.date.getMonth() + 1}`;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="tablist">
        {days.map((d, i) => {
          const active = i === selected;
          const shabbat = d.key === 'Saturday';
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${F[d.key]} ${d.date.getDate()}`}
              onClick={() => setSelected(i)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl h-[74px] border transition ${
                active
                  ? 'bg-gradient-to-b from-violet-600 to-pink-500 border-transparent text-white shadow-[0_8px_20px_-8px_rgba(124,58,237,.7)]'
                  : shabbat
                    ? 'bg-slate-50 border-slate-100 text-slate-400'
                    : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              <span className={`text-[11px] font-semibold ${active ? 'text-white/85' : shabbat ? 'text-slate-400' : 'text-slate-500'}`}>{L[d.key]}</span>
              <span className="text-[19px] font-extrabold leading-none">{d.date.getDate()}</span>
              <span className={`mt-1 h-1.5 rounded-full ${counts[i] > 0 ? (active ? 'w-1.5 bg-white' : 'w-1.5 bg-violet-500') : 'w-1.5 bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between mt-4 mb-2.5 px-0.5">
        <h3 className="text-[16px] font-extrabold text-slate-900">
          {label}{day.offset <= 1 ? ` · ${F[day.key]}` : ''} <span dir="ltr">{dateText}</span>
        </h3>
        <span className="text-xs text-slate-400">{events.length ? s.events(events.length) : ''}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {reminders.map(r => renderReminder ? renderReminder(r) : null)}
        {events.map((event, index) => renderEvent(day.key, event, index))}
        {events.length === 0 && reminders.length === 0 && (
          <button
            type="button"
            onClick={() => onAddForDay && onAddForDay(day.key, day.date)}
            className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-6 flex flex-col items-center gap-1 text-slate-400 hover:text-violet-600 hover:border-violet-300 transition"
          >
            <span className="text-sm font-semibold">{s.free}</span>
            <span className="text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{s.add}</span>
          </button>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-violet-50 text-violet-700 text-[13px] px-4 py-3 leading-relaxed">
        {total === 0 ? s.none : (
          <>
            {s.week}: {s.events(total)}
            {busiest && max > 1 ? ` · ${s.busiest}: ${F[busiest.key]}` : ''}
            {freeDays.length ? ` · ${s.freeDays}: ${joinNames(freeDays, s)}` : ''}
          </>
        )}
      </div>
    </div>
  );
}
