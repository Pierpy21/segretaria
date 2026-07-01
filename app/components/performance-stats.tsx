"use client";

import { Zap, Activity, TrendingDown, TrendingUp } from "lucide-react";
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, 
  LineChart, Line 
} from "recharts";

// ─── Mock Data ──────

const responseTimeData = [
  { day: "Mon", sec: 1.2 }, { day: "Tue", sec: 0.9 }, { day: "Wed", sec: 1.4 },
  { day: "Thu", sec: 0.8 }, { day: "Fri", sec: 1.1 }, { day: "Sat", sec: 0.7 }, { day: "Sun", sec: 0.6 },
];

const completionData = [
  { week: "W24", rate: 87 }, { week: "W25", rate: 91 },
  { week: "W26", rate: 88 }, { week: "W27", rate: 94 },
];

const requestTypeData = [
  { name: "Plumbing", count: 34, color: "#3b82f6" },
  { name: "Electrical", count: 27, color: "#0d9488" },
  { name: "Carpentry", count: 18, color: "#8b5cf6" },
  { name: "Painting", count: 15, color: "#f59e0b" },
  { name: "Other", count: 9, color: "#94a3b8" },
];

const totalRequests = requestTypeData.reduce((s, r) => s + r.count, 0);

// ─── Componente Principale 

export default function PerformanceStats() {
  return (
    <div className="grid grid-cols-3 gap-4">

      {/* Avg Response Time */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Avg Response Time</h2>
            <p className="text-xs text-slate-500">Seconds — last 7 days</p>
          </div>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-50">
            <Zap size={14} className="text-blue-500" />
          </div>
        </div>
        <div className="flex items-baseline gap-1 mb-4">
          <p className="text-2xl font-bold text-slate-900">0.9</p>
          <p className="text-sm text-slate-500">seconds</p>
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-500">
            <TrendingDown size={12} /> 18% faster
          </span>
        </div>
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={responseTimeData} barCategoryGap="35%" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "none" }}
              cursor={{ fill: "#f8fafc" }}
              formatter={(v: any) => [`${v}s`, "Response"]}
            />
            <Bar dataKey="sec" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Task Completion Rate */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Task Completion Rate</h2>
            <p className="text-xs text-slate-500">% — last 4 weeks</p>
          </div>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-50">
            <Activity size={14} className="text-emerald-500" />
          </div>
        </div>
        <div className="flex items-baseline gap-1 mb-4">
          <p className="text-2xl font-bold text-slate-900">94</p>
          <p className="text-sm text-slate-500">%</p>
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-500">
            <TrendingUp size={12} /> +6% vs W24
          </span>
        </div>
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={completionData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "none" }}
              formatter={(v: any) => [`${v}%`, "Completion"]}
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
      <div className="bg-white rounded-2xl p-5 border border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Most Frequent Requests</h2>
            <p className="text-xs text-slate-500">By service type — this month</p>
          </div>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-purple-50">
            <Activity size={14} className="text-purple-500" />
          </div>
        </div>
        <div className="space-y-3 mt-2">
          {requestTypeData.map(r => {
            const pct = Math.round((r.count / totalRequests) * 100);
            return (
              <div key={r.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{r.count}</span>
                    <span className="text-xs font-bold" style={{ color: r.color }}>{pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
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