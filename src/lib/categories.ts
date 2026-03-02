export const CATEGORIES = [
  'coding',
  'image',
  'video',
  'audio',
  'general_llm',
  'agent_tools',
  'app',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  coding: "Coding",
  image: "Image Gen",
  video: "Video Gen",
  audio: "Audio",
  general_llm: "General LLMs",
  agent_tools: "Agent Tools",
  app: "Apps",
};

export const CATEGORY_SHORT_LABELS: Record<string, string> = {
  coding: "Coding",
  image: "Image",
  video: "Video",
  audio: "Audio",
  general_llm: "LLM",
  agent_tools: "Agent",
  app: "App",
};

export const CATEGORY_COLORS: Record<string, string> = {
  coding: "bg-blue-500/20 text-blue-400",
  image: "bg-purple-500/20 text-purple-400",
  video: "bg-pink-500/20 text-pink-400",
  audio: "bg-orange-500/20 text-orange-400",
  general_llm: "bg-emerald-500/20 text-emerald-400",
  agent_tools: "bg-cyan-500/20 text-cyan-400",
  app: "bg-yellow-500/20 text-yellow-400",
};
