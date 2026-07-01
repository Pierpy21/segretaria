import type { CalendarEvent, WeekDay, ReminderItem } from "@/app/types/calendar";
import type { ReminderPriority } from "@/app/types/calendar";

interface CalendarWidgetProps {
  weekDays: WeekDay[];
  reminders: ReminderItem[];
  priorityColor: Record<ReminderPriority, string>;
}

export default function CalendarWidget({ weekDays, reminders, priorityColor }: CalendarWidgetProps) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Calendar & Agenda</h2>
          <p className="text-xs text-slate-500">Week of Jun 29 – Jul 3, 2026</p>
        </div>
        <button className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors">
          Full view →
        </button>
      </div>

      {/* Weekly columns */}
      <div className="flex-1 grid grid-cols-5 border-b border-slate-100">
        {weekDays.map(({ day, date, today, events }) => (
          <div
            key={day}
            className="p-2.5 flex flex-col gap-1.5 border-r border-slate-100 last:border-r-0"
          >
            <div className="text-center mb-1">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${today ? "text-blue-600" : "text-slate-400"}`}>
                {day}
              </p>
              <div
                className={`text-sm font-bold mt-0.5 w-7 h-7 rounded-full flex items-center justify-center mx-auto
                  ${today ? "bg-blue-600 text-white" : "bg-transparent text-slate-700"}`}
              >
                {date}
              </div>
            </div>
            
            {events.map((ev, i) => (
              <div
                key={i}
                className="rounded-lg px-1.5 py-1.5 border-l-[2.5px] [background-color:var(--ev-soft-bg)]"
                style={{ 
                  ["--ev-soft-bg" as any]: `${ev.color}14`,
                  borderColor: ev.color 
                }}
              >
                <p className="font-semibold text-[10px]" style={{ color: ev.color }}>{ev.time}</p>
                <p className="text-[10px] leading-tight mt-0.5 text-slate-700">{ev.title}</p>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Reminders */}
      <div className="px-5 py-3 bg-slate-50">
        <p className="text-xs font-bold mb-2 text-slate-700">Today's Reminders</p>
        <div className="space-y-1.5">
          {reminders.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: priorityColor[r.priority] }}
              />
              <span className="text-xs flex-1 truncate text-slate-700">{r.text}</span>
              <span className="text-[11px] font-semibold flex-shrink-0 text-slate-400">{r.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}