"use client";
import Link from "next/link";

interface Competitor { id: string; name: string; company: string; total_score: number; category_rank: number; }

interface Props {
  competitors: Competitor[];
  currentId: string;
  currentScore: number;
  currentName: string;
}

export default function ComparisonToggle({ competitors, currentId, currentScore, currentName }: Props) {
  const all = [
    { id: currentId, name: currentName, total_score: currentScore, isCurrent: true, company: "", category_rank: 0 },
    ...competitors.map(c => ({ ...c, isCurrent: false })),
  ].sort((a, b) => b.total_score - a.total_score);
  const maxScore = Math.max(...all.map(a => a.total_score));

  return (
    <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-5">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Category Competitors</h3>
      <div className="space-y-2">
        {all.map((item) => (
          <div key={item.id}>
            {item.isCurrent ? (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex-1 min-w-0"><div className="text-sm font-medium text-blue-400 truncate">{item.name}</div></div>
                <span className="text-sm font-bold text-white tabular-nums">{item.total_score.toFixed(1)}</span>
                <div className="w-20 h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${(item.total_score / maxScore) * 100}%` }} />
                </div>
              </div>
            ) : (
              <Link href={`/entity/${item.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a2332] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-300 truncate">{item.name}</div>
                  <div className="text-xs text-gray-600">{item.company}</div>
                </div>
                <span className="text-sm font-medium text-gray-400 tabular-nums">{item.total_score.toFixed(1)}</span>
                <div className="w-20 h-1.5 bg-[#1a2332] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gray-600" style={{ width: `${(item.total_score / maxScore) * 100}%` }} />
                </div>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
