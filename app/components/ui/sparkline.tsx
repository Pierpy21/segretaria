'use client';

import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  color: string;
}

export default function Sparkline({ data, color }: SparklineProps) {
  const chartData = data.map((v, i) => ({ i, v }));
  
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <Area 
          type="monotone" 
          dataKey="v" 
          stroke={color} 
          strokeWidth={2} 
          fill={color} 
          fillOpacity={0.12} 
          dot={false} 
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}