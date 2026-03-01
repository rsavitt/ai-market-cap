import { ensureDb } from './db';

interface EntitySeed {
  id: string; name: string; category: string; company: string;
  release_date: string; pricing_tier: string; availability: string;
  open_source: number; description: string;
  base_usage: number; base_attention: number; base_capability: number; base_expert: number;
  trend: number; noise: number;
}

function mulberry32(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
function gaussRand(): number {
  const u1 = rand(); const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const entities: EntitySeed[] = [
  // CODING
  { id:"github-copilot", name:"GitHub Copilot", category:"coding", company:"Microsoft", release_date:"2023-03-22", pricing_tier:"paid", availability:"API,Web,IDE", open_source:0, description:"AI pair programmer integrated into major IDEs", base_usage:94, base_attention:68, base_capability:86, base_expert:84, trend:-0.1, noise:1.5 },
  { id:"cursor", name:"Cursor", category:"coding", company:"Anysphere", release_date:"2024-03-15", pricing_tier:"freemium", availability:"Web,IDE", open_source:0, description:"AI-first code editor with deep codebase understanding", base_usage:78, base_attention:91, base_capability:90, base_expert:89, trend:0.5, noise:2.0 },
  { id:"claude-code", name:"Claude Code", category:"coding", company:"Anthropic", release_date:"2025-02-24", pricing_tier:"paid", availability:"API,CLI", open_source:0, description:"Agentic CLI coding tool by Anthropic", base_usage:62, base_attention:88, base_capability:92, base_expert:90, trend:0.8, noise:2.5 },
  { id:"deepseek-coder-v3", name:"DeepSeek Coder V3", category:"coding", company:"DeepSeek", release_date:"2025-01-20", pricing_tier:"freemium", availability:"API,Web", open_source:1, description:"Open-source code LLM with MoE architecture", base_usage:58, base_attention:82, base_capability:89, base_expert:84, trend:0.4, noise:2.8 },
  { id:"codex-cli", name:"Codex CLI", category:"coding", company:"OpenAI", release_date:"2025-04-16", pricing_tier:"freemium", availability:"CLI", open_source:1, description:"Open-source CLI agent for coding tasks", base_usage:42, base_attention:84, base_capability:82, base_expert:78, trend:0.6, noise:3.0 },
  { id:"gemini-code-assist", name:"Gemini Code Assist", category:"coding", company:"Google", release_date:"2024-12-11", pricing_tier:"freemium", availability:"API,Web,IDE", open_source:0, description:"Google AI coding assistant powered by Gemini", base_usage:52, base_attention:58, base_capability:80, base_expert:72, trend:0.1, noise:1.8 },
  { id:"windsurf", name:"Windsurf", category:"coding", company:"Codeium", release_date:"2024-11-13", pricing_tier:"freemium", availability:"IDE", open_source:0, description:"Agentic IDE with Cascade flow system", base_usage:48, base_attention:55, base_capability:76, base_expert:68, trend:0.2, noise:2.0 },
  { id:"amazon-q-developer", name:"Amazon Q Developer", category:"coding", company:"Amazon", release_date:"2024-04-30", pricing_tier:"freemium", availability:"API,IDE", open_source:0, description:"AWS-integrated AI coding assistant", base_usage:40, base_attention:42, base_capability:72, base_expert:65, trend:0.05, noise:1.5 },
  { id:"tabnine", name:"Tabnine", category:"coding", company:"Tabnine", release_date:"2023-08-01", pricing_tier:"freemium", availability:"IDE", open_source:0, description:"Privacy-focused AI code completion", base_usage:34, base_attention:28, base_capability:64, base_expert:55, trend:-0.3, noise:1.0 },
  // IMAGE
  { id:"midjourney-v6", name:"Midjourney v6.1", category:"image", company:"Midjourney", release_date:"2024-07-30", pricing_tier:"paid", availability:"Web", open_source:0, description:"Leading AI image generation via Discord and web", base_usage:90, base_attention:74, base_capability:93, base_expert:91, trend:0.0, noise:1.5 },
  { id:"dall-e-3", name:"DALL-E 3", category:"image", company:"OpenAI", release_date:"2023-10-03", pricing_tier:"freemium", availability:"API,Web", open_source:0, description:"Text-to-image model integrated with ChatGPT", base_usage:84, base_attention:62, base_capability:84, base_expert:78, trend:-0.2, noise:1.2 },
  { id:"flux-pro", name:"Flux 1.1 Pro", category:"image", company:"Black Forest Labs", release_date:"2024-10-01", pricing_tier:"freemium", availability:"API,Web", open_source:1, description:"State-of-the-art open image model", base_usage:55, base_attention:80, base_capability:91, base_expert:88, trend:0.4, noise:2.5 },
  { id:"stable-diffusion-35", name:"Stable Diffusion 3.5", category:"image", company:"Stability AI", release_date:"2024-10-22", pricing_tier:"free", availability:"API,Web", open_source:1, description:"Open-weight diffusion model with MMDiT architecture", base_usage:68, base_attention:58, base_capability:82, base_expert:76, trend:-0.1, noise:1.8 },
  { id:"ideogram-2", name:"Ideogram 2.0", category:"image", company:"Ideogram", release_date:"2024-08-19", pricing_tier:"freemium", availability:"Web,API", open_source:0, description:"Best-in-class text rendering in AI images", base_usage:44, base_attention:68, base_capability:88, base_expert:82, trend:0.3, noise:2.0 },
  { id:"imagen-3", name:"Google Imagen 3", category:"image", company:"Google", release_date:"2024-08-01", pricing_tier:"freemium", availability:"API,Web", open_source:0, description:"Google highest quality image generation model", base_usage:58, base_attention:54, base_capability:86, base_expert:76, trend:0.1, noise:1.5 },
  { id:"adobe-firefly-3", name:"Adobe Firefly 3", category:"image", company:"Adobe", release_date:"2024-04-23", pricing_tier:"paid", availability:"Web,API", open_source:0, description:"Commercially safe AI image generation", base_usage:64, base_attention:48, base_capability:78, base_expert:70, trend:0.0, noise:1.0 },
  { id:"leonardo-ai", name:"Leonardo AI", category:"image", company:"Leonardo AI", release_date:"2024-03-01", pricing_tier:"freemium", availability:"Web,API", open_source:0, description:"Production-quality image generation platform", base_usage:38, base_attention:42, base_capability:72, base_expert:64, trend:-0.1, noise:1.5 },
  { id:"recraft-v3", name:"Recraft V3", category:"image", company:"Recraft", release_date:"2024-10-29", pricing_tier:"freemium", availability:"Web,API", open_source:0, description:"Professional design-focused image generation", base_usage:30, base_attention:60, base_capability:88, base_expert:80, trend:0.35, noise:2.5 },
  { id:"playground-v3", name:"Playground v3", category:"image", company:"Playground AI", release_date:"2024-11-05", pricing_tier:"freemium", availability:"Web", open_source:0, description:"Consumer-friendly AI image generation", base_usage:32, base_attention:38, base_capability:68, base_expert:58, trend:-0.15, noise:1.5 },
  // VIDEO
  { id:"sora", name:"Sora", category:"video", company:"OpenAI", release_date:"2025-02-10", pricing_tier:"paid", availability:"Web,API", open_source:0, description:"Text-to-video model with world simulation", base_usage:48, base_attention:95, base_capability:88, base_expert:86, trend:0.3, noise:3.0 },
  { id:"runway-gen3", name:"Runway Gen-3 Alpha", category:"video", company:"Runway", release_date:"2024-06-17", pricing_tier:"paid", availability:"Web,API", open_source:0, description:"Professional AI video generation and editing", base_usage:64, base_attention:68, base_capability:85, base_expert:82, trend:0.0, noise:1.5 },
  { id:"kling-1-6", name:"Kling 1.6", category:"video", company:"Kuaishou", release_date:"2024-12-10", pricing_tier:"freemium", availability:"Web,API", open_source:0, description:"High-quality video generation from China", base_usage:52, base_attention:74, base_capability:84, base_expert:78, trend:0.2, noise:2.0 },
  { id:"pika-2", name:"Pika 2.0", category:"video", company:"Pika Labs", release_date:"2024-11-27", pricing_tier:"freemium", availability:"Web", open_source:0, description:"Consumer video generation with scene effects", base_usage:40, base_attention:58, base_capability:75, base_expert:70, trend:0.1, noise:2.0 },
  { id:"veo-2", name:"Veo 2", category:"video", company:"Google", release_date:"2024-12-16", pricing_tier:"freemium", availability:"Web", open_source:0, description:"Google latest video generation model", base_usage:34, base_attention:80, base_capability:90, base_expert:86, trend:0.6, noise:3.0 },
  { id:"minimax-video", name:"Minimax Video-01", category:"video", company:"MiniMax", release_date:"2024-12-05", pricing_tier:"freemium", availability:"Web,API", open_source:0, description:"Long-form video generation with HaiLuo", base_usage:28, base_attention:55, base_capability:78, base_expert:72, trend:0.15, noise:2.5 },
  { id:"luma-dream-machine", name:"Luma Dream Machine", category:"video", company:"Luma AI", release_date:"2024-06-12", pricing_tier:"freemium", availability:"Web,API", open_source:0, description:"Fast high-quality video generation", base_usage:35, base_attention:48, base_capability:72, base_expert:68, trend:-0.1, noise:1.5 },
  { id:"hailuo-ai", name:"HaiLuo AI", category:"video", company:"MiniMax", release_date:"2024-09-22", pricing_tier:"free", availability:"Web", open_source:0, description:"Free video generation with long clip support", base_usage:25, base_attention:44, base_capability:70, base_expert:65, trend:0.0, noise:2.0 },
  { id:"synthesia", name:"Synthesia", category:"video", company:"Synthesia", release_date:"2024-06-01", pricing_tier:"paid", availability:"Web,API", open_source:0, description:"AI avatar video platform for enterprise", base_usage:55, base_attention:35, base_capability:68, base_expert:62, trend:0.0, noise:1.0 },
  { id:"invideo-ai", name:"Invideo AI", category:"video", company:"Invideo", release_date:"2024-05-15", pricing_tier:"freemium", availability:"Web", open_source:0, description:"AI-powered video creation from text prompts", base_usage:42, base_attention:40, base_capability:65, base_expert:58, trend:-0.05, noise:1.5 },
  // AGENT TOOLS
  { id:"openclaw", name:"OpenClaw", category:"agent_tools", company:"OpenClaw", release_date:"2025-11-15", pricing_tier:"free", availability:"CLI,Web", open_source:1, description:"Open-source autonomous AI agent for messaging platforms", base_usage:72, base_attention:95, base_capability:82, base_expert:78, trend:0.9, noise:3.5 },
  { id:"hermes-agent", name:"Hermes Agent", category:"agent_tools", company:"Nous Research", release_date:"2026-02-26", pricing_tier:"free", availability:"CLI", open_source:1, description:"Fully open-source AI agent with persistent memory and multi-platform messaging", base_usage:45, base_attention:62, base_capability:78, base_expert:74, trend:0.4, noise:2.5 },
  { id:"autogpt", name:"AutoGPT", category:"agent_tools", company:"Significant Gravitas", release_date:"2023-03-30", pricing_tier:"free", availability:"CLI,Web", open_source:1, description:"Autonomous AI agent framework for task completion", base_usage:52, base_attention:48, base_capability:68, base_expert:62, trend:-0.2, noise:2.0 },
  { id:"crewai", name:"CrewAI", category:"agent_tools", company:"CrewAI", release_date:"2023-11-14", pricing_tier:"freemium", availability:"API,CLI", open_source:1, description:"Framework for orchestrating multi-agent AI systems", base_usage:58, base_attention:65, base_capability:75, base_expert:72, trend:0.3, noise:2.0 },
  { id:"langchain-agents", name:"LangChain Agents", category:"agent_tools", company:"LangChain", release_date:"2022-10-01", pricing_tier:"free", availability:"API", open_source:1, description:"Agent framework within the LangChain ecosystem", base_usage:68, base_attention:55, base_capability:74, base_expert:76, trend:0.1, noise:1.5 },
  { id:"autogen", name:"AutoGen", category:"agent_tools", company:"Microsoft", release_date:"2023-09-25", pricing_tier:"free", availability:"API", open_source:1, description:"Multi-agent conversation framework by Microsoft Research", base_usage:48, base_attention:52, base_capability:76, base_expert:78, trend:0.15, noise:1.8 },
  { id:"openai-agents-sdk", name:"OpenAI Agents SDK", category:"agent_tools", company:"OpenAI", release_date:"2025-03-11", pricing_tier:"freemium", availability:"API", open_source:1, description:"Official OpenAI SDK for building multi-agent workflows", base_usage:55, base_attention:72, base_capability:80, base_expert:76, trend:0.5, noise:2.5 },
  { id:"browseruse", name:"Browser Use", category:"agent_tools", company:"Browser Use", release_date:"2024-11-06", pricing_tier:"free", availability:"API,CLI", open_source:1, description:"AI agent framework for autonomous web browser interaction", base_usage:40, base_attention:70, base_capability:72, base_expert:65, trend:0.6, noise:3.0 },
  { id:"manus", name:"Manus", category:"agent_tools", company:"Manus AI", release_date:"2025-03-06", pricing_tier:"freemium", availability:"Web", open_source:0, description:"General-purpose AI agent that bridges minds and actions", base_usage:35, base_attention:88, base_capability:78, base_expert:70, trend:0.7, noise:3.5 },
  { id:"devin", name:"Devin", category:"agent_tools", company:"Cognition", release_date:"2024-12-10", pricing_tier:"paid", availability:"Web", open_source:0, description:"Autonomous AI software engineering agent", base_usage:38, base_attention:82, base_capability:80, base_expert:74, trend:0.3, noise:2.8 },
  // GENERAL LLMS
  { id:"gpt-4o", name:"GPT-4o", category:"general_llm", company:"OpenAI", release_date:"2024-05-13", pricing_tier:"freemium", availability:"API,Web,Mobile", open_source:0, description:"OpenAI flagship multimodal model", base_usage:95, base_attention:78, base_capability:90, base_expert:88, trend:-0.1, noise:1.0 },
  { id:"claude-35-sonnet", name:"Claude 3.5 Sonnet", category:"general_llm", company:"Anthropic", release_date:"2024-10-22", pricing_tier:"freemium", availability:"API,Web,Mobile", open_source:0, description:"Anthropic most capable and balanced model", base_usage:80, base_attention:84, base_capability:93, base_expert:92, trend:0.2, noise:1.5 },
  { id:"gemini-2-flash", name:"Gemini 2.0 Flash", category:"general_llm", company:"Google", release_date:"2025-02-05", pricing_tier:"freemium", availability:"API,Web,Mobile", open_source:0, description:"Fast efficient multimodal model from Google", base_usage:68, base_attention:74, base_capability:88, base_expert:82, trend:0.3, noise:2.0 },
  { id:"deepseek-v3", name:"DeepSeek V3", category:"general_llm", company:"DeepSeek", release_date:"2025-01-10", pricing_tier:"freemium", availability:"API,Web", open_source:1, description:"671B MoE model with frontier capabilities at low cost", base_usage:55, base_attention:92, base_capability:89, base_expert:86, trend:0.5, noise:3.0 },
  { id:"llama-33-70b", name:"Llama 3.3 70B", category:"general_llm", company:"Meta", release_date:"2024-12-06", pricing_tier:"free", availability:"API", open_source:1, description:"Meta open-weight LLM matching larger models", base_usage:65, base_attention:68, base_capability:82, base_expert:80, trend:0.0, noise:1.5 },
  { id:"grok-3", name:"Grok 3", category:"general_llm", company:"xAI", release_date:"2025-02-17", pricing_tier:"paid", availability:"Web,API", open_source:0, description:"xAI latest model trained on Colossus cluster", base_usage:42, base_attention:88, base_capability:86, base_expert:80, trend:0.7, noise:3.5 },
  { id:"mistral-large-2", name:"Mistral Large 2", category:"general_llm", company:"Mistral AI", release_date:"2024-07-24", pricing_tier:"freemium", availability:"API,Web", open_source:0, description:"128k context flagship model from Mistral", base_usage:38, base_attention:52, base_capability:80, base_expert:76, trend:-0.1, noise:1.5 },
  { id:"qwen-25-72b", name:"Qwen 2.5 72B", category:"general_llm", company:"Alibaba", release_date:"2024-09-19", pricing_tier:"free", availability:"API", open_source:1, description:"Leading open-weight model from Alibaba Cloud", base_usage:35, base_attention:48, base_capability:82, base_expert:74, trend:0.1, noise:2.0 },
  { id:"perplexity", name:"Perplexity", category:"general_llm", company:"Perplexity AI", release_date:"2024-11-15", pricing_tier:"freemium", availability:"Web,Mobile,API", open_source:0, description:"AI-powered answer engine with real-time search", base_usage:72, base_attention:76, base_capability:78, base_expert:75, trend:0.2, noise:1.8 },
  { id:"command-r-plus", name:"Command R+", category:"general_llm", company:"Cohere", release_date:"2024-04-04", pricing_tier:"freemium", availability:"API", open_source:0, description:"Enterprise-focused RAG-optimized LLM", base_usage:28, base_attention:35, base_capability:75, base_expert:70, trend:-0.2, noise:1.2 },
];

// Map of synthetic signal names for seed raw_signals
const SEED_SIGNAL_MAP: Record<string, (e: EntitySeed, usage: number, attention: number, capability: number, expert: number) => [string, number][]> = {
  usage: (e, usage) => [
    ['pypi_downloads', usage * 1000 * (0.5 + rand())],
    ['npm_downloads', usage * 800 * (0.5 + rand())],
    ['huggingface_signal', usage * 50 * (0.3 + rand())],
    ['github_stars', usage * 200 * (0.5 + rand())],
  ],
  attention: (_e, _u, attention) => [
    ['hackernews_signal', attention * 2 * (0.3 + rand())],
    ['reddit_signal', attention * 5 * (0.3 + rand())],
    ['smolai_signal', attention * 1.5 * (0.2 + rand())],
  ],
  capability: (_e, _u, _a, capability) => [
    ['open_router_signal', capability * (0.8 + rand() * 0.4)],
  ],
  expert: (_e, _u, _a, _c, expert) => [
    ['semantic_scholar_citations', expert * 10 * (0.3 + rand())],
  ],
};

export async function seedDatabase(): Promise<void> {
  const db = await ensureDb();

  const countResult = await db.execute('SELECT COUNT(*) as c FROM entities');
  const count = countResult.rows[0] as unknown as { c: number };
  if (count.c > 0) return;

  // Build all statements
  const stmts: { sql: string; args: any[] }[] = [];

  for (const e of entities) {
    stmts.push({
      sql: `INSERT OR IGNORE INTO entities (id, name, category, company, release_date, pricing_tier, availability, open_source, description, logo_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [e.id, e.name, e.category, e.company, e.release_date, e.pricing_tier, e.availability, e.open_source, e.description, ''],
    });

    const now = new Date('2026-02-25');
    let usage = e.base_usage;
    let attention = e.base_attention;
    let capability = e.base_capability;
    let expert = e.base_expert;

    for (let d = 29; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];

      usage = clamp(usage + e.trend * 0.4 + gaussRand() * e.noise, 5, 100);
      attention = clamp(attention + e.trend * 0.3 + gaussRand() * e.noise * 1.2, 5, 100);
      capability = clamp(capability + e.trend * 0.1 + gaussRand() * e.noise * 0.3, 5, 100);
      expert = clamp(expert + e.trend * 0.05 + gaussRand() * e.noise * 0.2, 5, 100);

      const total = Math.round((0.45 * usage + 0.30 * attention + 0.15 * capability + 0.10 * expert) * 100) / 100;

      // Confidence based on synthetic signal availability (most entities have ~3-4 signals)
      const signalCount = 3 + Math.floor(rand() * 4); // 3-6 signals
      const confidence = signalCount / 8;
      const band = (1 - confidence) * 10;
      const confidenceLower = Math.max(0, Math.round((total - band) * 100) / 100);
      const confidenceUpper = Math.min(100, Math.round((total + band) * 100) / 100);

      stmts.push({
        sql: `INSERT OR IGNORE INTO daily_scores (entity_id, date, usage_score, attention_score, capability_score, expert_score, total_score, confidence_lower, confidence_upper)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [e.id, dateStr,
          Math.round(usage*100)/100, Math.round(attention*100)/100,
          Math.round(capability*100)/100, Math.round(expert*100)/100,
          total, confidenceLower, confidenceUpper],
      });

      // Insert synthetic raw signals
      for (const [, signalFn] of Object.entries(SEED_SIGNAL_MAP)) {
        const signals = signalFn(e, usage, attention, capability, expert);
        for (const [signalName, rawValue] of signals) {
          stmts.push({
            sql: `INSERT OR IGNORE INTO raw_signals (entity_id, date, signal_name, raw_value)
                  VALUES (?, ?, ?, ?)`,
            args: [e.id, dateStr, signalName, Math.round(rawValue * 100) / 100],
          });
        }
      }
    }
  }

  // Batch in chunks of 1000 (Turso batch limit)
  for (let i = 0; i < stmts.length; i += 1000) {
    const chunk = stmts.slice(i, i + 1000);
    await db.batch(chunk, 'write');
  }
}
