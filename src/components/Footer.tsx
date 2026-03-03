import { SIGNAL_META, type Dimension } from '@/lib/signal-meta';

const DIMENSION_LABELS: Record<Dimension, string> = {
  usage: 'Usage',
  attention: 'Attention',
  capability: 'Capability',
  expert: 'Expert',
};

function getSourcesByDimension() {
  const seen = new Map<string, { label: string; url: string; dimension: Dimension }>();

  for (const signal of Object.values(SIGNAL_META)) {
    if (!seen.has(signal.source_url)) {
      seen.set(signal.source_url, {
        label: signal.label
          .replace(/^AA /, 'Artificial Analysis ')
          .replace(/^HF /, 'HuggingFace '),
        url: signal.source_url,
        dimension: signal.dimension,
      });
    }
  }

  const grouped: Record<Dimension, { label: string; url: string }[]> = {
    usage: [],
    attention: [],
    capability: [],
    expert: [],
  };

  for (const [, source] of Array.from(seen.entries())) {
    grouped[source.dimension].push({ label: source.label, url: source.url });
  }

  return grouped;
}

export default function Footer() {
  const sources = getSourcesByDimension();

  return (
    <footer className="border-t border-[#1f2b3d] bg-[#0a0f1a] mt-12">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <p className="text-xs text-gray-400 font-medium mb-4">
          Data Sources
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((dim) => (
            <div key={dim}>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                {DIMENSION_LABELS[dim]}
              </h3>
              <ul className="space-y-1">
                {sources[dim].map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-2xs text-gray-600 mt-6">
          Rankings are computed from multiple independent signals. No single source determines placement.
        </p>
      </div>
    </footer>
  );
}
