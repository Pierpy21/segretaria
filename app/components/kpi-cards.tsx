"use client";

import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import Sparkline from "./ui/sparkline";

interface KpiItem {
  label: string;
  value: string;
  sub: string;
  up: boolean;
  icon: LucideIcon;
  accent: string; 
  spark: number[];
}

interface KpiCardsProps {
  data: KpiItem[];
}

export default function KpiCards({ data }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {data.map(({ label, value, sub, up, icon: Icon, accent, spark }) => (
        <div
          key={label}
          className="bg-white rounded-2xl p-5 flex flex-col border border-slate-200"
        >
          {/* Top Row: Icon & Trend */}
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center [background-color:var(--kpi-accent-soft)]"
              style={{ 
                ["--kpi-accent-soft" as any]: `${accent}18`
              }}
            >
              <Icon size={17} style={{ color: accent }} />
            </div>
            
            {/* Trend Indicator (Green if Up, Red if Down) */}
            <div
              className={`flex items-center gap-1 text-[11px] font-semibold
                ${up ? "text-emerald-500" : "text-rose-500"}`}
            >
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {sub}
            </div>
          </div>

          {/* Value & Label */}
          <p className="text-3xl font-bold leading-none mb-1 text-slate-900">
            {value}
          </p>
          <p className="text-xs mb-3 text-slate-500">
            {label}
          </p>

          {/* Micro Chart Component */}
          <div className="w-full mt-auto">
            <Sparkline data={spark} color={accent} />
          </div>
        </div>
      ))}
    </div>
  );
}