import type { WeekDay, ReminderItem } from "@/app/types/calendar";
import type { ReminderPriority } from "@/app/types/calendar";

interface CalendarWidgetProps {
  weekDays: WeekDay[];
  /** Es. "12 ott – 18 ott 2026" */
  weekLabel: string;
  reminders: ReminderItem[];
  priorityColor: Record<ReminderPriority, string>;
}

export default function CalendarWidget({ weekDays, weekLabel, reminders, priorityColor }: CalendarWidgetProps) {
  return (
    <div className="bg-surface rounded-2xl overflow-hidden flex flex-col border border-line">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <div>
          <h2 className="text-sm font-semibold text-ink">Agenda & Poltrone</h2>
          <p className="text-xs text-ink-muted">Settimana {weekLabel}</p>
        </div>
        <button className="text-xs font-semibold text-accent-text hover:text-ink transition-colors">
          Vista completa →
        </button>
      </div>


      {/* Weekly columns */}
      <div className="flex-1 grid grid-cols-5 border-b border-line">
        {weekDays.map(({ day, date, today, events }) => (
          <div
            key={day}
            className="p-2.5 flex flex-col gap-1.5 border-r border-line last:border-r-0"
          >
            <div className="text-center mb-1">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${today ? "text-accent-text" : "text-ink-muted"}`}>
                {day}
              </p>
              <div
                className={`text-sm font-bold mt-0.5 w-7 h-7 rounded-full flex items-center justify-center mx-auto
                  ${today ? "bg-accent text-accent-ink" : "bg-transparent text-ink"}`}
              >
                {date}
              </div>
            </div>

            {events.map((ev, i) => (
              <div
                key={i}
                className="rounded-lg px-1.5 py-1.5 border-l-[2.5px] [background-color:var(--ev-soft-bg)]"
                style={{
                  ["--ev-soft-bg" as string]: `${ev.color}14`,
                  borderColor: ev.color
                }}
              >
                <p className="font-semibold text-[10px]" style={{ color: ev.color }}>{ev.time}</p>
                <p className="text-[10px] leading-tight mt-0.5 text-ink">{ev.title}</p>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Reminders */}
      <div className="px-5 py-3 bg-surface-muted">
        <p className="text-xs font-bold mb-2 text-ink">Promemoria di Oggi</p>
        <div className="space-y-1.5">
          {reminders.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: priorityColor[r.priority as ReminderPriority] || "#6e5446" }}
              />
              <span className="text-xs flex-1 truncate text-ink">{r.text}</span>
              <span className="text-[11px] font-semibold flex-shrink-0 text-ink-muted">{r.time}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
