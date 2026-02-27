"use client";
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface HistoryPoint {
  date: string; total_score: number; usage_score: number;
  attention_score: number; capability_score: number; expert_score: number;
}

interface Props { history: HistoryPoint[]; title?: string; }

const SUB_SCORES = [
  { key: "usage_score", label: "Usage", color: "#3b82f6" },
  { key: "attention_score", label: "Attention", color: "#a855f7" },
  { key: "capability_score", label: "Capability", color: "#22c55e" },
  { key: "expert_score", label: "Expert", color: "#f59e0b" },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a2332] border border-[#2a3a52] rounded-lg p-3 shadow-xl text-xs">
      <div className="text-gray-400 mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-white font-medium">{p.value?.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendChart({ history, title }: Props) {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const data = history.map((h) => ({ ...h, dateLabel: formatDate(h.date) }));

  return (
    <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{title || "30-Day Trend"}</h3>
        <div className="flex gap-1">
          {SUB_SCORES.map((s) => (
            <button key={s.key} onClick={() => setVisible((v) => ({ ...v, [s.key]: !v[s.key] }))}
              className={`px-2 py-1 text-[10px] rounded font-medium transition-all ${visible[s.key] ? "text-white" : "text-gray-600 hover:text-gray-400"}`}
              style={{ backgroundColor: visible[s.key] ? s.color + "30" : "transparent" }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2b3d" />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#1f2b3d" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} domain={["dataMin - 5", "dataMax + 5"]} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="total_score" name="Total" stroke="#ffffff" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#ffffff" }} />
            {SUB_SCORES.map((s) => visible[s.key] ? (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            ) : null)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
