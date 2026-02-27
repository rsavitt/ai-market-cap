"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Globe, Star } from "lucide-react";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import TrendChart from "@/components/TrendChart";
import MomentumGraph from "@/components/MomentumGraph";
import ComparisonToggle from "@/components/ComparisonToggle";

const CATEGORY_LABELS: Record<string, string> = {
  coding: "Coding", image: "Image Gen", video: "Video Gen", general_llm: "General LLMs",
};
const CATEGORY_COLORS: Record<string, string> = {
  coding: "bg-blue-500/20 text-blue-400",
  image: "bg-purple-500/20 text-purple-400",
  video: "bg-pink-500/20 text-pink-400",
  general_llm: "bg-emerald-500/20 text-emerald-400",
};

function RankDisplay({ rank, label }: { rank: number; label: string }) {
  const styles: Record<number, string> = {
    1: "from-yellow-400 to-yellow-600",
    2: "from-gray-300 to-gray-500",
    3: "from-amber-500 to-amber-700",
  };
  const gradient = styles[rank] || "from-gray-600 to-gray-700";
  return (
    <div className="text-center">
      <div className={`w-12 h-12 mx-auto rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-xl font-bold text-white mb-1`}>
        {rank}
      </div>
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
    </div>
  );
}

export default function EntityPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/entities/${id}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setError(null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-24 bg-[#111827] rounded animate-pulse" />
        <div className="h-32 bg-[#111827] rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-[#111827] rounded-xl animate-pulse" />
          <div className="h-64 bg-[#111827] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">Error: {error || "Entity not found"}</p>
        <Link href="/" className="text-blue-400 hover:underline">← Back to rankings</Link>
      </div>
    );
  }

  const { entity, history, competitors } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to rankings
      </Link>

      <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{entity.name}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${CATEGORY_COLORS[entity.category] || ""}`}>
                {CATEGORY_LABELS[entity.category] || entity.category}
              </span>
              {entity.open_source === 1 && (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">Open Source</span>
              )}
            </div>
            <div className="text-sm text-gray-500 mb-2">{entity.company}</div>
            <p className="text-sm text-gray-400 max-w-xl">{entity.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {entity.pricing_tier && (
                <span className="text-[10px] px-2 py-1 rounded bg-[#1a2332] text-gray-400 border border-[#2a3a52]">{entity.pricing_tier}</span>
              )}
              {entity.availability?.split(",").map((a: string) => (
                <span key={a} className="text-[10px] px-2 py-1 rounded bg-[#1a2332] text-gray-400 border border-[#2a3a52] flex items-center gap-1">
                  <Globe className="w-2.5 h-2.5" />{a.trim()}
                </span>
              ))}
              {entity.release_date && (
                <span className="text-[10px] px-2 py-1 rounded bg-[#1a2332] text-gray-400 border border-[#2a3a52]">Released {entity.release_date}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                {entity.total_score?.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Composite Score</div>
              <div className={`text-sm font-medium mt-1 flex items-center justify-center gap-1 ${entity.momentum_7d >= 0 ? "text-green-400" : "text-red-400"}`}>
                {entity.momentum_7d >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {entity.momentum_7d > 0 ? "+" : ""}{entity.momentum_7d?.toFixed(2)}
              </div>
            </div>
            <div className="flex gap-4">
              <RankDisplay rank={entity.overall_rank} label="Overall" />
              <RankDisplay rank={entity.category_rank} label="Category" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ScoreBreakdown scores={{ usage_score: entity.usage_score, attention_score: entity.attention_score, capability_score: entity.capability_score, expert_score: entity.expert_score, total_score: entity.total_score }} />
          {history?.length > 0 && <TrendChart history={history} />}
        </div>
        <div className="space-y-6">
          {history?.length > 0 && <MomentumGraph history={history} momentum={entity.momentum_7d || 0} volatility={entity.volatility || 0} />}
          <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-5">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Quick Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Overall Rank", value: `#${entity.overall_rank}`, icon: Star },
                { label: "Category Rank", value: `#${entity.category_rank}`, icon: Star },
                { label: "7d Momentum", value: `${entity.momentum_7d > 0 ? "+" : ""}${entity.momentum_7d?.toFixed(2)}`, icon: TrendingUp },
                { label: "Volatility", value: entity.volatility?.toFixed(2), icon: Activity },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#1a2332] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <stat.icon className="w-3 h-3 text-gray-600" />
                    <span className="text-[10px] text-gray-500 uppercase">{stat.label}</span>
                  </div>
                  <div className="text-sm font-bold text-white">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
          {competitors?.length > 0 && (
            <ComparisonToggle competitors={competitors} currentId={entity.id} currentScore={entity.total_score} currentName={entity.name} />
          )}
        </div>
      </div>
    </div>
  );
}
