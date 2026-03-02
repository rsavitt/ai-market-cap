"use client";
import { useRouter } from "next/navigation";
import { TrendingUp, TrendingDown, ChevronUp, ChevronDown } from "lucide-react";

import { CATEGORY_SHORT_LABELS as CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/categories";

interface Props {
  entities: any[];
  onSort: (field: string) => void;
  sortField: string;
  sortOrder: string;
}

function SortIcon({ field, sortField, sortOrder }: { field: string; sortField: string; sortOrder: string }) {
  if (field !== sortField) return null;
  return sortOrder === "desc"
    ? <ChevronDown className="w-3 h-3 text-blue-400" />
    : <ChevronUp className="w-3 h-3 text-blue-400" />;
}

function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, string> = {
    1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    2: "bg-gray-400/20 text-gray-300 border-gray-400/30",
    3: "bg-amber-700/20 text-amber-500 border-amber-700/30",
  };
  const style = styles[rank] || "bg-[#1a2332] text-gray-500 border-[#2a3a52]";
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border ${style}`}>
      {rank}
    </span>
  );
}

const columns = [
  { key: "overall_rank", label: "#", className: "w-12" },
  { key: "name", label: "Name", className: "text-left" },
  { key: "category", label: "Category", className: "hidden md:table-cell" },
  { key: "total_score", label: "Score", className: "" },
  { key: "usage_score", label: "Usage", className: "hidden lg:table-cell" },
  { key: "attention_score", label: "Attention", className: "hidden lg:table-cell" },
  { key: "capability_score", label: "Capability", className: "hidden xl:table-cell" },
  { key: "expert_score", label: "Expert", className: "hidden xl:table-cell" },
  { key: "momentum_7d", label: "7d", className: "" },
  { key: "volatility", label: "Vol", className: "hidden md:table-cell" },
];

export default function RankingTable({ entities, onSort, sortField, sortOrder }: Props) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-xl border border-[#1f2b3d] bg-[#111827]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1f2b3d]">
            {columns.map((col) => (
              <th key={col.key} onClick={() => onSort(col.key)}
                className={`group px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 transition-colors ${col.className}`}>
                <div className="flex items-center gap-1 justify-center">
                  {col.label}
                  <SortIcon field={col.key} sortField={sortField} sortOrder={sortOrder} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity: any) => (
            <tr key={entity.id} onClick={() => router.push(`/entity/${entity.id}`)}
              className="border-b border-[#1f2b3d]/50 hover:bg-[#1a2332] transition-colors cursor-pointer">
              <td className="px-3 py-3 text-center"><RankBadge rank={entity.overall_rank} /></td>
              <td className="px-3 py-3 text-left">
                <div>
                  <span className="font-semibold text-white">{entity.name}</span>
                  {entity.open_source === 1 && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">OSS</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{entity.company}</div>
              </td>
              <td className="px-3 py-3 text-center hidden md:table-cell">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${CATEGORY_COLORS[entity.category] || ""}`}>
                  {CATEGORY_LABELS[entity.category] || entity.category}
                </span>
              </td>
              <td className="px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div>
                    <span className="font-bold text-white tabular-nums">{entity.total_score?.toFixed(1)}</span>
                    {entity.confidence_lower != null && entity.confidence_upper != null && (
                      <div className="text-[9px] text-gray-600 tabular-nums leading-tight">
                        {entity.confidence_lower.toFixed(1)}–{entity.confidence_upper.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div className="w-16 h-1.5 bg-[#1a2332] rounded-full overflow-hidden hidden sm:block relative">
                    {entity.confidence_lower != null && entity.confidence_upper != null && (
                      <div
                        className="absolute h-full rounded-full bg-blue-500/20"
                        style={{ left: `${entity.confidence_lower}%`, width: `${entity.confidence_upper - entity.confidence_lower}%` }}
                      />
                    )}
                    <div className="absolute h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${entity.total_score}%` }} />
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-center hidden lg:table-cell"><span className="tabular-nums text-gray-300">{entity.usage_score?.toFixed(1)}</span></td>
              <td className="px-3 py-3 text-center hidden lg:table-cell"><span className="tabular-nums text-gray-300">{entity.attention_score?.toFixed(1)}</span></td>
              <td className="px-3 py-3 text-center hidden xl:table-cell"><span className="tabular-nums text-gray-300">{entity.capability_score?.toFixed(1)}</span></td>
              <td className="px-3 py-3 text-center hidden xl:table-cell"><span className="tabular-nums text-gray-300">{entity.expert_score?.toFixed(1)}</span></td>
              <td className="px-3 py-3 text-center">
                <div className={`flex items-center justify-center gap-1 text-xs font-medium ${
                  entity.momentum_7d > 0 ? "text-green-400" : entity.momentum_7d < 0 ? "text-red-400" : "text-gray-500"
                }`}>
                  {entity.momentum_7d > 0 ? <TrendingUp className="w-3 h-3" /> : entity.momentum_7d < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                  <span className="tabular-nums">{entity.momentum_7d > 0 ? "+" : ""}{entity.momentum_7d?.toFixed(2)}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-center hidden md:table-cell">
                <span className={`text-xs tabular-nums ${entity.volatility > 3 ? "text-amber-400" : "text-gray-500"}`}>
                  {entity.volatility?.toFixed(2)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
