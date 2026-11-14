import React, { useEffect, useState } from 'react';
import { User, Video, Clock, Menu } from 'lucide-react';
import { formatTimeString } from '../utils/timeFormat';

const DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "15:00", "3:00 PM" → minutes since midnight, or -1.
export function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return -1;
  const ampm = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const pm = ampm[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + m;
  }
  const h24 = timeStr.match(/(\d{1,2}):(\d{2})/);
  return h24 ? parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10) : -1;
}

// Re-render once a minute so "in 25 min" stays true.
function useMinuteTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function greetingFor(hour, isHe) {
  if (hour >= 5 && hour < 12) return isHe ? 'בוקר טוב' : 'Good morning';
  if (hour >= 12 && hour < 17) return isHe ? 'צהריים טובים' : 'Good afternoon';
  if (hour >= 17 && hour < 22) return isHe ? 'ערב טוב' : 'Good evening';
  return isHe ? 'לילה טוב' : 'Good night';
}

/** Avatar + "Good morning, Amos" + today's date. The avatar (with its menu badge) is the one way into the drawer. */
export function HomeGreeting({ user, lang, onOpenAccount, showDot }) {
  const now = useMinuteTick();
  const isHe = lang === 'he';
  const first = String(user?.name || user?.displayName || '').trim().split(/\s+/)[0] || '';
  let dateLabel = '';
  try {
    dateLabel = now.toLocaleDateString(isHe ? 'he-IL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch (e) { dateLabel = ''; }
  const initial = first ? first[0].toUpperCase() : '';
  return (
    <div className="flex items-center gap-3 min-w-0">
      <button
        onClick={onOpenAccount}
        aria-label={isHe ? 'תפריט וחשבון' : 'Menu and account'}
        className="relative w-11 h-11 rounded-full shrink-0 bg-gradient-to-br from-[#FFB86B] to-[#FF6FA8] text-white font-bold text-[17px] flex items-center justify-center shadow-[0_6px_14px_-8px_rgba(255,111,168,0.9)]"
      >
        {user?.photo
          ? <img src={user.photo} alt="" className="w-11 h-11 rounded-full object-cover" />
          : (initial || <User className="w-5 h-5" />)}
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-aurora text-white flex items-center justify-center ring-[2.5px] ring-[#F6F5FB]"
        >
          <Menu className="w-3 h-3" strokeWidth={3} />
        </span>
        {showDot && <span className="absolute top-0 end-0 w-3 h-3 rounded-full bg-[#FF6B5B] ring-2 ring-[#F6F5FB]" />}
      </button>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[#6E7189] truncate">{dateLabel}</div>
        <div className="text-[19px] sm:text-[21px] font-extrabold tracking-tight text-[#0E1020] truncate">
          {greetingFor(now.getHours(), isHe)}{first ? `, ${first}` : ''}
        </div>
      </div>
    </div>
  );
}

function linkOf(ev) {
  const candidates = [ev?.meetLink, ev?.hangoutLink, ev?.conferenceLink, ev?.location];
  return candidates.find(v => typeof v === 'string' && /^https?:\/\//i.test(v)) || null;
}

/** Dark "what's next" card: the next (or current) event today. Hidden when nothing is left today. */
export function NextUpCard({ schedule, lang, onOpen }) {
  const now = useMinuteTick();
  const isHe = lang === 'he';
  const todayKey = DAY_KEYS[now.getDay()];
  const seen = new Set();
  const events = [...(schedule?.Today || []), ...(schedule?.[todayKey] || [])].filter(ev => {
    const key = `${ev?.title}|${ev?.startTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !ev?.isSleep && timeToMinutes(ev?.startTime) >= 0;
  });
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const upcoming = events
    .map(ev => {
      const start = timeToMinutes(ev.startTime);
      let end = timeToMinutes(ev.endTime);
      if (end <= start) end = start + 30;
      return { ev, start, end };
    })
    .filter(x => x.end > nowMin)
    .sort((a, b) => a.start - b.start);
  if (upcoming.length === 0) return null;

  const { ev, start } = upcoming[0];
  const mins = start - nowMin;
  let when;
  if (mins <= 0) when = isHe ? 'עכשיו' : 'Now';
  else if (mins < 60) when = isHe ? `הבא בעוד ${mins} דק׳` : `Next in ${mins} min`;
  else when = isHe ? `הבא ב-${formatTimeString(ev.startTime, lang)}` : `Next at ${formatTimeString(ev.startTime, lang)}`;
  const link = linkOf(ev);
  const more = upcoming.length - 1;

  return (
    <div
      className="relative overflow-hidden rounded-[26px] bg-night text-white p-[18px] cursor-pointer"
      onClick={() => onOpen && onOpen(ev)}
      role="button"
      tabIndex={0}
    >
      <div aria-hidden="true" className="aurora-blob w-52 h-52 bg-[#7C5CFF] opacity-80 -top-20 -left-16" style={{ filter: 'blur(40px)' }} />
      <div aria-hidden="true" className="aurora-blob w-40 h-40 bg-[#FF6FA8] opacity-50 -bottom-24 left-24" style={{ filter: 'blur(40px)' }} />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold bg-white/15 px-2.5 py-1 rounded-full">● {when}</span>
          <span className="text-[12.5px] text-white/75" dir="ltr">
            {formatTimeString(ev.startTime, lang)}{ev.endTime ? `–${formatTimeString(ev.endTime, lang)}` : ''}
          </span>
        </div>
        <div className="mt-3 text-[22px] font-extrabold tracking-tight leading-snug line-clamp-2">{ev.title}</div>
        <div className="mt-3.5 flex items-center justify-between gap-2 min-h-[38px]">
          <span className="text-[12.5px] text-white/75 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {more > 0
              ? (isHe ? `ועוד ${more} אירועים היום` : `+${more} more today`)
              : (isHe ? 'האירוע האחרון להיום' : 'Last one today')}
          </span>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1.5 h-[38px] px-3.5 rounded-xl bg-white text-night font-bold text-sm"
            >
              <Video className="w-4 h-4" /> {isHe ? 'הצטרפות' : 'Join'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
