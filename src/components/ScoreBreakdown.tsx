"use client";

interface Props {
  scores: {
    usage_score: number;
    attention_score: number;
    capability_score: number;
    expert_score: number;
    total_score: number;
    confidence_lower?: number | null;
    confidence_upper?: number | null;
  };
}

const SCORE_CONFIG = [
  { key: "usage_score", label: "Usage", weight: 0.45, color: "from-blue-600 to-blue-400" },
  { key: "attention_score", label: "Attention", weight: 0.30, color: "from-purple-600 to-purple-400" },
  { key: "capability_score", label: "Capability", weight: 0.15, color: "from-green-600 to-green-400" },
  { key: "expert_score", label: "Expert", weight: 0.10, color: "from-amber-600 to-amber-400" },
];

export default function ScoreBreakdown({ scores }: Props) {
  return (
    <div className="rounded-xl border border-[#1f2b3d] bg-[#111827] p-5">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Score Breakdown</h3>
      <div className="text-center mb-6">
        <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          {scores.total_score?.toFixed(1)}
        </div>
        <div className="text-xs text-gray-500 mt-1">Composite Score</div>
        {scores.confidence_lower != null && scores.confidence_upper != null && (
          <div className="mt-2">
            <div className="relative h-1.5 w-48 mx-auto bg-[#1a2332] rounded-full overflow-hidden">
              <div
                className="absolute h-full rounded-full bg-gradient-to-r from-blue-500/40 to-purple-500/40"
                style={{
                  left: `${scores.confidence_lower}%`,
                  width: `${scores.confidence_upper - scores.confidence_lower}%`,
                }}
              />
              <div
                className="absolute h-full w-0.5 bg-white/80 rounded-full"
                style={{ left: `${scores.total_score}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-500 mt-1.5">
              Confidence: {scores.confidence_lower.toFixed(1)} – {scores.confidence_upper.toFixed(1)}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {SCORE_CONFIG.map((cfg) => {
          const val = (scores as any)[cfg.key] || 0;
          const weighted = val * cfg.weight;
          return (
            <div key={cfg.key}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm text-gray-300">{cfg.label}</span>
                <div className="text-xs text-gray-500">
                  <span className="text-gray-300 font-medium">{val.toFixed(1)}</span>
                  <span className="mx-1">×</span><span>{cfg.weight}</span>
                  <span className="mx-1">=</span>
                  <span className="text-white font-medium">{weighted.toFixed(1)}</span>
                </div>
              </div>
              <div className="w-full h-2 bg-[#1a2332] rounded-full overflow-hidden">
                <div className={`h-full rounded-full bg-gradient-to-r ${cfg.color} transition-all duration-500`} style={{ width: `${val}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
