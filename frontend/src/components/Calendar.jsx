import { CalendarDays, Clock } from "lucide-react";

export default function Calendar({ events }) {
  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
        No events yet. Add one above to see it appear here.
      </div>
    );
  }

  const grouped = events.reduce((acc, event) => {
    const day = event.day || "Today";
    if (!acc[day]) acc[day] = [];
    acc[day].push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([day, dayEvents]) => (
        <section key={day} className="overflow-hidden rounded-xl border border-slate-200">
          <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            <CalendarDays className="h-4 w-4 text-blue-500" />
            {day}
          </header>

          <ul className="divide-y divide-slate-100">
            {dayEvents.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-800">{event.title}</p>
                  <p className="text-xs text-slate-500">Parsed into your schedule</p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200">
                  <Clock className="h-3 w-3" />
                  {event.startTime} - {event.endTime}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
