"use client";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface Props {
  history: { date: string; total_score: number }[];
  momentum: number;
  volatility: number;
}

export default function MomentumGraph({ history, momentum, volatility }: Props) {
  const positive = momentum >= 0;
  const data = history.map((h) => ({
    date: new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: h.total_score,
  }));

  return (
    <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-5">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Momentum & Volatility</h3>
      <div className="h-32 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="momentumGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                <stop offset="100%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
            <Tooltip contentStyle={{ backgroundColor: "#1a2332", border: "1px solid #2a3a52", borderRadius: "8px", fontSize: "12px" }} labelStyle={{ color: "#9ca3af" }} itemStyle={{ color: "#fff" }} />
            <Area type="monotone" dataKey="score" stroke={positive ? "#22c55e" : "#ef4444"} strokeWidth={2} fill="url(#momentumGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1a2332] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            {positive ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
            <span className="text-xs text-gray-500">7d Momentum</span>
          </div>
          <div className={`text-lg font-bold ${positive ? "text-green-400" : "text-red-400"}`}>
            {momentum > 0 ? "+" : ""}{momentum.toFixed(2)}
          </div>
        </div>
        <div className="bg-[#1a2332] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-gray-500">Volatility</span>
          </div>
          <div className={`text-lg font-bold ${volatility > 3 ? "text-amber-400" : "text-gray-300"}`}>
            {volatility.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
