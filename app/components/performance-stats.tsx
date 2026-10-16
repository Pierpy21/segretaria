"use client";

import { Zap, Activity, TrendingDown, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, Tooltip,
  LineChart, Line
} from "recharts";

// ─── Mock Data ──────

const responseTimeData = [
  { day: "Lun", sec: 1.1 }, { day: "Mar", sec: 0.8 }, { day: "Mer", sec: 1.2 },
  { day: "Gio", sec: 0.7 }, { day: "Ven", sec: 0.9 }, { day: "Sab", sec: 0.6 }, { day: "Dom", sec: 0.5 },
];

const completionData = [
  { week: "S24", rate: 89 }, { week: "S25", rate: 92 },
  { week: "S26", rate: 91 }, { week: "S27", rate: 96 },
];

const requestTypeData = [
  { name: "Igiene & Prevenzione", count: 42, color: "#4b2d20" },
  { name: "Implantologia & Chirurgia", count: 28, color: "#e04a95" },
  { name: "Ortodonzia Invisibile", count: 21, color: "#8c5a3c" },
  { name: "Endodonzia & Conservativa", count: 16, color: "#f59e0b" },
  { name: "Estetica & Sbiancamento", count: 11, color: "#e04a95" },
];

const totalRequests = requestTypeData.reduce((s, r) => s + r.count, 0);


// ─── Componente Principale

export default function PerformanceStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* Avg Response Time */}
      <div className="bg-surface rounded-2xl p-5 border border-line">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Tempo Risposta Triage AI</h2>
            <p className="text-xs text-ink-muted">Secondi — ultimi 7 giorni</p>
          </div>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-accent/10">
            <Zap size={14} className="text-accent" />
          </div>
        </div>
        <div className="flex items-baseline gap-1 mb-4">
          <p className="text-2xl font-bold text-ink">0.8</p>
          <p className="text-sm text-ink-muted">secondi</p>
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <TrendingDown size={12} /> 22% più rapido
          </span>
        </div>
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={responseTimeData} barCategoryGap="35%" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6e5446" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e6dbc8", boxShadow: "none" }}
              cursor={{ fill: "#f5efe2" }}
              formatter={(v) => [`${v}s`, "Risposta"]}
            />
            <Bar dataKey="sec" fill="#e04a95" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Task Completion Rate */}
      <div className="bg-surface rounded-2xl p-5 border border-line">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Tasso Presenze & Recall</h2>
            <p className="text-xs text-ink-muted">% conferme — ultime 4 settimane</p>
          </div>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-50">
            <Activity size={14} className="text-emerald-600" />
          </div>
        </div>
        <div className="flex items-baseline gap-1 mb-4">
          <p className="text-2xl font-bold text-ink">96</p>
          <p className="text-sm text-ink-muted">%</p>
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <TrendingUp size={12} /> +7% con recall AI
          </span>
        </div>
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={completionData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#6e5446" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e6dbc8", boxShadow: "none" }}
              formatter={(v) => [`${v}%`, "Presenze"]}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ fill: "#10b981", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Most Frequent Requests */}
      <div className="bg-surface rounded-2xl p-5 border border-line">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Prestazioni Più Richieste</h2>
            <p className="text-xs text-ink-muted">Per branca odontoiatrica — mese corrente</p>
          </div>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-surface-muted">
            <Activity size={14} className="text-ink" />
          </div>
        </div>

        <div className="space-y-3 mt-2">
          {requestTypeData.map(r => {
            const pct = Math.round((r.count / totalRequests) * 100);
            return (
              <div key={r.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-ink">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">{r.count}</span>
                    <span className="text-xs font-bold" style={{ color: r.color }}>{pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-surface-muted">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: r.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
