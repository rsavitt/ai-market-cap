"use client";

const LABELS: Record<string, string> = {
  coding: "Coding",
  image: "Image Gen",
  video: "Video Gen",
  audio: "Audio",
  general_llm: "General LLMs",
};

interface Props {
  categories: string[];
  selected: string | null;
  onSelect: (cat: string | null) => void;
  counts?: Record<string, number>;
}

export default function CategoryFilter({ categories, selected, onSelect, counts }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          selected === null
            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
            : "bg-[#1a2332] text-gray-400 hover:bg-[#1f2b3d] hover:text-white"
        }`}
      >
        All{counts ? ` (${Object.values(counts).reduce((a, b) => a + b, 0)})` : ""}
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            selected === cat
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
              : "bg-[#1a2332] text-gray-400 hover:bg-[#1f2b3d] hover:text-white"
          }`}
        >
          {LABELS[cat] || cat}
          {counts && counts[cat] ? ` (${counts[cat]})` : ""}
        </button>
      ))}
    </div>
  );
}
