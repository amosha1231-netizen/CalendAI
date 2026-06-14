import React from 'react';
import { CalendarDays } from 'lucide-react';

export default function MonthlyCalendar({ schedule }) {
  // חישוב חודש נוכחי
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  // מציאת היום הראשון בחודש
  const firstDay = new Date(year, month, 1).getDay();
  // כמות ימים בחודש הנוכחי
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
    "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
  ];
  
  // שמות הימים בראש הלוח
  const dayNames = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
  
  // תרגום פנימי לחיפוש אירועים
  const enDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // מערך לייצוג כל התאים בלוח החודשי (כולל ריקים בתחילת החודש)
  const calendarCells = [];
  for (let i = 0; i < firstDay; i++) {
    calendarCells.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarCells.push(i);
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border mt-6">
      <div className="flex items-center gap-3 mb-6 border-b pb-4">
        <CalendarDays className="w-6 h-6 text-indigo-600" />
        <h2 className="text-xl font-bold text-slate-800">
          פריסה חודשית מלאה - {monthNames[month]} {year}
        </h2>
      </div>

      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {/* כותרות ימים */}
        {dayNames.map(name => (
          <div key={name} className="text-center font-bold text-slate-500 py-2 bg-slate-100 rounded-t-lg">
            {name}
          </div>
        ))}

        {/* תאי ימים */}
        {calendarCells.map((dayNum, idx) => {
          if (!dayNum) {
            return <div key={`empty-${idx}`} className="bg-slate-50 border border-slate-100 rounded-lg min-h-[100px] opacity-50"></div>;
          }

          // מציאת היום בשבוע עבור התא הנוכחי (0 עד 6)
          const currentDayOfWeek = new Date(year, month, dayNum).getDay();
          const dayString = enDays[currentDayOfWeek];
          
          // משיכת אירועים שמתאימים ליום הזה
          const dayEvents = schedule[dayString] || [];
          
          // בדיקה האם זה היום הנוכחי (היום האמיתי)
          const isToday = dayNum === today.getDate();

          return (
            <div 
              key={`day-${dayNum}`} 
              className={`border rounded-lg p-2 min-h-[120px] transition-colors ${
                isToday ? 'border-indigo-500 bg-indigo-50/30 ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'
              }`}
            >
              <div className={`font-bold text-sm inline-flex items-center justify-center w-7 h-7 rounded-full mb-2 ${
                isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'
              }`}>
                {dayNum}
              </div>
              
              <div className="flex flex-col gap-1.5">
                {dayEvents.map((ev, i) => (
                  <div key={i} className="bg-indigo-100 text-indigo-900 text-xs p-1.5 rounded font-medium shadow-sm border border-indigo-200" title={ev.title}>
                    <div className="truncate">{ev.title}</div>
                    {ev.startTime && <div className="text-[10px] text-indigo-700 mt-0.5" dir="ltr">{ev.startTime}</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
