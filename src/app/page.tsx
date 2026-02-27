"use client";
import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Activity, Trophy, BarChart3 } from "lucide-react";
import CategoryFilter from "@/components/CategoryFilter";
import RankingTable from "@/components/RankingTable";

export default function HomePage() {
  const [entities, setEntities] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortField, setSortField] = useState("total_score");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    fetch("/api/seed", { method: "POST" })
      .then(() => setSeeded(true))
      .catch(() => setSeeded(true));
  }, []);

  const fetchData = useCallback(async () => {
    if (!seeded) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.set("category", selectedCategory);
      params.set("sort", sortField);
      params.set("order", sortOrder);
      const res = await fetch(`/api/entities?${params}`);
      const data = await res.json();
      setEntities(data.entities || []);
      setCategories(data.categories || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [seeded, selectedCategory, sortField, sortOrder]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const topGainer = entities.length
    ? entities.reduce((best, e) => (e.momentum_7d > best.momentum_7d ? e : best), entities[0])
    : null;
  const mostVolatile = entities.length
    ? entities.reduce((best, e) => (e.volatility > best.volatility ? e : best), entities[0])
    : null;

  const categoryLeaders: Record<string, any> = {};
  for (const e of entities) {
    if (!categoryLeaders[e.category] || e.total_score > categoryLeaders[e.category].total_score) {
      categoryLeaders[e.category] = e;
    }
  }

  const categoryCounts: Record<string, number> = {};
  for (const e of entities) {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  }

  const CATEGORY_LABELS: Record<string, string> = {
    coding: "Coding", image: "Image Gen", video: "Video Gen", general_llm: "General LLMs",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="text-gray-300 font-medium">{entities.length}</span> entities tracked
        </span>
        <span className="text-[#2a3a52]">|</span>
        <span><span className="text-gray-300 font-medium">{categories.length}</span> categories</span>
        <span className="text-[#2a3a52]">|</span>
        <span>Updated {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>

      <CategoryFilter categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} counts={selectedCategory ? undefined : categoryCounts} />

      {!loading && entities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topGainer && (
            <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-500 uppercase tracking-wider">Top Gainer (7d)</span>
              </div>
              <div className="text-lg font-bold text-white">{topGainer.name}</div>
              <div className="text-xs text-gray-500">{topGainer.company}</div>
              <div className="text-green-400 text-sm font-medium mt-1">+{topGainer.momentum_7d.toFixed(2)} momentum</div>
            </div>
          )}
          {mostVolatile && (
            <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-gray-500 uppercase tracking-wider">Most Volatile</span>
              </div>
              <div className="text-lg font-bold text-white">{mostVolatile.name}</div>
              <div className="text-xs text-gray-500">{mostVolatile.company}</div>
              <div className="text-amber-400 text-sm font-medium mt-1">σ {mostVolatile.volatility.toFixed(2)}</div>
            </div>
          )}
          <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-gray-500 uppercase tracking-wider">Category Leaders</span>
            </div>
            <div className="space-y-1.5">
              {Object.entries(categoryLeaders).map(([cat, leader]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{CATEGORY_LABELS[cat] || cat}</span>
                  <span className="text-gray-200 font-medium">{leader.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          Error: {error}
          <button onClick={fetchData} className="ml-3 underline hover:text-red-300">Retry</button>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-[#111827] animate-pulse" />
          ))}
        </div>
      )}

      {!loading && entities.length > 0 && (
        <RankingTable entities={entities} onSort={handleSort} sortField={sortField} sortOrder={sortOrder} />
      )}

      <div className="text-xs text-gray-600 border-t border-[#1f2b3d] pt-4 mt-8">
        <p className="mb-1">
          <span className="text-gray-500 font-medium">Methodology:</span> Total Score = (0.45 × Usage) + (0.30 × Attention) + (0.15 × Capability) + (0.10 × Expert)
        </p>
        <p>Momentum = 7-day linear regression slope. Volatility = 30-day standard deviation. Scores normalized 0-100. Updated daily.</p>
      </div>
    </div>
  );
}
