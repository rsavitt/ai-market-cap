import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { invalidateRegistryCache } from '@/lib/entity-registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const apiKey = process.env.ADMIN_API_KEY;
  const authHeader = request.headers.get('authorization');
  const providedKey = authHeader?.replace('Bearer ', '');
  if (apiKey && providedKey === apiKey) return true;
  if (!apiKey) return true; // dev mode
  return false;
}

interface SeedEntity {
  id: string;
  name: string;
  category: string;
  company: string;
  release_date: string;
  pricing_tier: string;
  availability: string;
  open_source: number;
  description: string;
  sources: Record<string, string | string[] | null>;
}

const SEED_ENTITIES: SeedEntity[] = [
  // ── CODING ──
  {
    id: "github-copilot", name: "GitHub Copilot", category: "coding", company: "Microsoft",
    release_date: "2023-03-22", pricing_tier: "paid", availability: "API,Web,IDE", open_source: 0,
    description: "AI pair programmer integrated into major IDEs",
    sources: {
      github: ["github/copilot.vim", "github/copilot-docs"],
      hackernews: ["GitHub Copilot", "Copilot"],
      smolai: ["GitHub Copilot", "Copilot"],
      reddit: ["GitHub Copilot", "Copilot coding"],
      semanticScholar: ["Evaluating Large Language Models Trained on Code"],
      stackoverflow: ["github-copilot", "copilot"],
    }
  },
  {
    id: "cursor", name: "Cursor", category: "coding", company: "Anysphere",
    release_date: "2024-03-15", pricing_tier: "freemium", availability: "Web,IDE", open_source: 0,
    description: "AI-first code editor with deep codebase understanding",
    sources: {
      github: ["getcursor/cursor"],
      hackernews: ["Cursor AI", "Cursor editor", "Cursor IDE"],
      smolai: ["Cursor AI", "Cursor editor", "Cursor IDE"],
      reddit: ["Cursor AI", "Cursor editor"],
      cloudflareRadar: "cursor.com",
      stackoverflow: ["cursor-editor", "cursor-ai"],
    }
  },
  {
    id: "claude-code", name: "Claude Code", category: "coding", company: "Anthropic",
    release_date: "2025-02-24", pricing_tier: "paid", availability: "API,CLI", open_source: 0,
    description: "Agentic CLI coding tool by Anthropic",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude Code", "Anthropic Claude Code"],
      smolai: ["Claude Code", "Anthropic Claude Code"],
      reddit: ["Claude Code", "claude code CLI"],
      stackoverflow: ["claude-code", "anthropic-api"],
    }
  },
  {
    id: "deepseek-coder-v3", name: "DeepSeek Coder V3", category: "coding", company: "DeepSeek",
    release_date: "2025-01-20", pricing_tier: "freemium", availability: "API,Web", open_source: 1,
    description: "Open-source code LLM with MoE architecture",
    sources: {
      github: ["deepseek-ai/DeepSeek-Coder-V2"],
      huggingface: ["deepseek-ai/DeepSeek-Coder-V2-Instruct"],
      hackernews: ["DeepSeek Coder", "DeepSeek code"],
      smolai: ["DeepSeek Coder", "DeepSeek code"],
      reddit: ["DeepSeek Coder", "DeepSeek coding"],
      semanticScholar: ["DeepSeek-Coder-V2"],
      cloudflareRadar: "deepseek.com",
      ollama: ["deepseek-coder-v2"],
      stackoverflow: ["deepseek-coder"],
    }
  },
  {
    id: "codex-cli", name: "Codex CLI", category: "coding", company: "OpenAI",
    release_date: "2025-04-16", pricing_tier: "freemium", availability: "CLI", open_source: 1,
    description: "Open-source CLI agent for coding tasks",
    sources: {
      npm: ["@openai/codex"],
      github: ["openai/codex"],
      hackernews: ["Codex CLI", "OpenAI Codex CLI"],
      smolai: ["Codex CLI", "OpenAI Codex CLI"],
      reddit: ["Codex CLI", "OpenAI Codex"],
      stackoverflow: ["openai-codex"],
    }
  },
  {
    id: "gemini-code-assist", name: "Gemini Code Assist", category: "coding", company: "Google",
    release_date: "2024-12-11", pricing_tier: "freemium", availability: "API,Web,IDE", open_source: 0,
    description: "Google AI coding assistant powered by Gemini",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      github: ["google-gemini/generative-ai-python"],
      hackernews: ["Gemini Code Assist", "Google Code Assist"],
      smolai: ["Gemini Code Assist", "Google Code Assist"],
      reddit: ["Gemini Code Assist"],
      stackoverflow: ["gemini-code-assist"],
    }
  },
  {
    id: "windsurf", name: "Windsurf", category: "coding", company: "Codeium",
    release_date: "2024-11-13", pricing_tier: "freemium", availability: "IDE", open_source: 0,
    description: "Agentic IDE with Cascade flow system",
    sources: {
      hackernews: ["Windsurf", "Codeium Windsurf"],
      smolai: ["Windsurf", "Codeium Windsurf"],
      reddit: ["Windsurf IDE", "Windsurf editor"],
      cloudflareRadar: "windsurf.com",
      stackoverflow: ["windsurf-editor"],
    }
  },
  {
    id: "amazon-q-developer", name: "Amazon Q Developer", category: "coding", company: "Amazon",
    release_date: "2024-04-30", pricing_tier: "freemium", availability: "API,IDE", open_source: 0,
    description: "AWS-integrated AI coding assistant",
    sources: {
      hackernews: ["Amazon Q Developer", "Amazon Q"],
      smolai: ["Amazon Q Developer", "Amazon Q"],
      reddit: ["Amazon Q Developer"],
      stackoverflow: ["amazon-q"],
    }
  },
  {
    id: "tabnine", name: "Tabnine", category: "coding", company: "Tabnine",
    release_date: "2023-08-01", pricing_tier: "freemium", availability: "IDE", open_source: 0,
    description: "Privacy-focused AI code completion",
    sources: {
      hackernews: ["Tabnine"],
      smolai: ["Tabnine"],
      reddit: ["Tabnine"],
      cloudflareRadar: "tabnine.com",
      stackoverflow: ["tabnine"],
    }
  },
  {
    id: "devin", name: "Devin", category: "coding", company: "Cognition",
    release_date: "2025-03-12", pricing_tier: "paid", availability: "Web", open_source: 0,
    description: "Autonomous AI software engineer",
    sources: {
      github: ["CognitionAI/devin-swebench-results"],
      hackernews: ["Devin AI", "Cognition Devin"],
      smolai: ["Devin AI", "Cognition Devin"],
      reddit: ["Devin AI", "Cognition Devin"],
      cloudflareRadar: "devin.ai",
      stackoverflow: ["devin-ai"],
    }
  },

  // ── IMAGE ──
  {
    id: "midjourney-v6", name: "Midjourney v6.1", category: "image", company: "Midjourney",
    release_date: "2024-07-30", pricing_tier: "paid", availability: "Web", open_source: 0,
    description: "Leading AI image generation via Discord and web",
    sources: {
      hackernews: ["Midjourney"],
      smolai: ["Midjourney"],
      reddit: ["Midjourney"],
      semanticScholar: ["Midjourney"],
      cloudflareRadar: "midjourney.com",
      stackoverflow: ["midjourney"],
    }
  },
  {
    id: "dall-e-3", name: "DALL-E 3", category: "image", company: "OpenAI",
    release_date: "2023-10-03", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Text-to-image model integrated with ChatGPT",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      hackernews: ["DALL-E 3", "DALL-E"],
      smolai: ["DALL-E 3", "DALL-E"],
      reddit: ["DALL-E 3", "DALLE 3"],
      semanticScholar: ["DALL-E 3 improving image generation with better captions"],
      stackoverflow: ["dall-e", "dalle"],
    }
  },
  {
    id: "flux-pro", name: "Flux 1.1 Pro", category: "image", company: "Black Forest Labs",
    release_date: "2024-10-01", pricing_tier: "freemium", availability: "API,Web", open_source: 1,
    description: "State-of-the-art open image model",
    sources: {
      github: ["black-forest-labs/flux"],
      huggingface: ["black-forest-labs/FLUX.1-dev", "black-forest-labs/FLUX.1-schnell"],
      hackernews: ["Flux AI", "FLUX image", "Black Forest Labs"],
      smolai: ["Flux AI", "FLUX image", "Black Forest Labs"],
      reddit: ["Flux AI", "FLUX model"],
      semanticScholar: ["FLUX scalable diffusion transformers"],
      stackoverflow: ["flux-ai"],
    }
  },
  {
    id: "stable-diffusion-35", name: "Stable Diffusion 3.5", category: "image", company: "Stability AI",
    release_date: "2024-10-22", pricing_tier: "free", availability: "API,Web", open_source: 1,
    description: "Open-weight diffusion model with MMDiT architecture",
    sources: {
      pypi: ["diffusers"],
      github: ["Stability-AI/StableDiffusion", "Stability-AI/generative-models"],
      huggingface: ["stabilityai/stable-diffusion-3.5-large"],
      hackernews: ["Stable Diffusion 3", "Stable Diffusion"],
      smolai: ["Stable Diffusion 3", "Stable Diffusion"],
      reddit: ["Stable Diffusion 3.5", "SD3.5"],
      semanticScholar: ["Scaling rectified flow transformers for high-resolution image synthesis"],
      cloudflareRadar: "stability.ai",
      stackoverflow: ["stable-diffusion"],
    }
  },
  {
    id: "ideogram-2", name: "Ideogram 2.0", category: "image", company: "Ideogram",
    release_date: "2024-08-19", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Best-in-class text rendering in AI images",
    sources: {
      hackernews: ["Ideogram"],
      smolai: ["Ideogram"],
      reddit: ["Ideogram"],
      cloudflareRadar: "ideogram.ai",
      stackoverflow: ["ideogram"],
    }
  },
  {
    id: "imagen-3", name: "Google Imagen 3", category: "image", company: "Google",
    release_date: "2024-08-01", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Google highest quality image generation model",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      hackernews: ["Imagen 3", "Google Imagen"],
      smolai: ["Imagen 3", "Google Imagen"],
      reddit: ["Imagen 3", "Google Imagen"],
      semanticScholar: ["Imagen 3"],
      stackoverflow: ["imagen"],
    }
  },
  {
    id: "adobe-firefly-3", name: "Adobe Firefly 3", category: "image", company: "Adobe",
    release_date: "2024-04-23", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "Commercially safe AI image generation",
    sources: {
      hackernews: ["Adobe Firefly"],
      smolai: ["Adobe Firefly"],
      reddit: ["Adobe Firefly"],
      stackoverflow: ["adobe-firefly"],
    }
  },
  {
    id: "leonardo-ai", name: "Leonardo AI", category: "image", company: "Leonardo AI",
    release_date: "2024-03-01", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Production-quality image generation platform",
    sources: {
      hackernews: ["Leonardo AI"],
      smolai: ["Leonardo AI"],
      reddit: ["Leonardo AI"],
      cloudflareRadar: "leonardo.ai",
      stackoverflow: ["leonardo-ai"],
    }
  },
  {
    id: "recraft-v3", name: "Recraft V3", category: "image", company: "Recraft",
    release_date: "2024-10-29", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Professional design-focused image generation",
    sources: {
      hackernews: ["Recraft"],
      smolai: ["Recraft"],
      reddit: ["Recraft"],
      cloudflareRadar: "recraft.ai",
      stackoverflow: ["recraft"],
    }
  },
  {
    id: "playground-v3", name: "Playground v3", category: "image", company: "Playground AI",
    release_date: "2024-11-05", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "Consumer-friendly AI image generation",
    sources: {
      hackernews: ["Playground AI"],
      smolai: ["Playground AI"],
      reddit: ["Playground AI"],
      stackoverflow: ["playground-ai"],
    }
  },

  // ── VIDEO ──
  {
    id: "sora", name: "Sora", category: "video", company: "OpenAI",
    release_date: "2025-02-10", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "Text-to-video model with world simulation",
    sources: {
      hackernews: ["Sora", "OpenAI Sora"],
      smolai: ["Sora", "OpenAI Sora"],
      reddit: ["Sora", "OpenAI Sora"],
      semanticScholar: ["Video generation models as world simulators"],
      cloudflareRadar: "sora.com",
      stackoverflow: ["sora", "openai-sora"],
    }
  },
  {
    id: "runway-gen3", name: "Runway Gen-3 Alpha", category: "video", company: "Runway",
    release_date: "2024-06-17", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "Professional AI video generation and editing",
    sources: {
      github: ["runwayml/sdk-python"],
      hackernews: ["Runway Gen-3", "Runway AI"],
      smolai: ["Runway Gen-3", "Runway AI"],
      reddit: ["Runway Gen-3", "Runway AI"],
      cloudflareRadar: "runwayml.com",
      stackoverflow: ["runway-ml"],
    }
  },
  {
    id: "kling-1-6", name: "Kling 1.6", category: "video", company: "Kuaishou",
    release_date: "2024-12-10", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "High-quality video generation from China",
    sources: {
      hackernews: ["Kling video", "Kling AI"],
      smolai: ["Kling video", "Kling AI"],
      reddit: ["Kling AI", "Kling video"],
      cloudflareRadar: "klingai.com",
      stackoverflow: ["kling-ai"],
    }
  },
  {
    id: "pika-2", name: "Pika 2.0", category: "video", company: "Pika Labs",
    release_date: "2024-11-27", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "Consumer video generation with scene effects",
    sources: {
      hackernews: ["Pika Labs", "Pika AI"],
      smolai: ["Pika Labs", "Pika AI"],
      reddit: ["Pika Labs", "Pika AI"],
      cloudflareRadar: "pika.art",
      stackoverflow: ["pika-ai"],
    }
  },
  {
    id: "veo-2", name: "Veo 2", category: "video", company: "Google",
    release_date: "2024-12-16", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "Google latest video generation model",
    sources: {
      hackernews: ["Veo 2", "Google Veo"],
      smolai: ["Veo 2", "Google Veo"],
      reddit: ["Veo 2", "Google Veo"],
      stackoverflow: ["google-veo"],
    }
  },
  {
    id: "minimax-video", name: "Minimax Video-01", category: "video", company: "MiniMax",
    release_date: "2024-12-05", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Long-form video generation with HaiLuo",
    sources: {
      hackernews: ["MiniMax video", "MiniMax AI"],
      smolai: ["MiniMax video", "MiniMax AI"],
      reddit: ["MiniMax AI"],
      cloudflareRadar: "minimax.io",
      stackoverflow: ["minimax-video"],
    }
  },
  {
    id: "luma-dream-machine", name: "Luma Dream Machine", category: "video", company: "Luma AI",
    release_date: "2024-06-12", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Fast high-quality video generation",
    sources: {
      hackernews: ["Luma Dream Machine", "Luma AI"],
      smolai: ["Luma Dream Machine", "Luma AI"],
      reddit: ["Luma Dream Machine", "Luma AI"],
      cloudflareRadar: "lumalabs.ai",
      stackoverflow: ["luma-ai"],
    }
  },
  {
    id: "hailuo-ai", name: "HaiLuo AI", category: "video", company: "MiniMax",
    release_date: "2024-09-22", pricing_tier: "free", availability: "Web", open_source: 0,
    description: "Free video generation with long clip support",
    sources: {
      hackernews: ["HaiLuo"],
      smolai: ["HaiLuo"],
      reddit: ["HaiLuo AI"],
      cloudflareRadar: "hailuoai.video",
      stackoverflow: ["hailuo"],
    }
  },
  {
    id: "synthesia", name: "Synthesia", category: "video", company: "Synthesia",
    release_date: "2024-06-01", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "AI avatar video platform for enterprise",
    sources: {
      hackernews: ["Synthesia"],
      smolai: ["Synthesia"],
      reddit: ["Synthesia"],
      cloudflareRadar: "synthesia.io",
      stackoverflow: ["synthesia"],
    }
  },
  {
    id: "invideo-ai", name: "Invideo AI", category: "video", company: "Invideo",
    release_date: "2024-05-15", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "AI-powered video creation from text prompts",
    sources: {
      hackernews: ["Invideo AI"],
      smolai: ["Invideo AI"],
      reddit: ["Invideo AI"],
      cloudflareRadar: "invideo.io",
      stackoverflow: ["invideo"],
    }
  },

  // ── AUDIO ──
  {
    id: "elevenlabs", name: "ElevenLabs", category: "audio", company: "ElevenLabs",
    release_date: "2024-01-01", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Leading AI voice synthesis and cloning platform",
    sources: {
      pypi: ["elevenlabs"],
      github: ["elevenlabs/elevenlabs-python", "elevenlabs/elevenlabs-js"],
      hackernews: ["ElevenLabs"],
      smolai: ["ElevenLabs"],
      reddit: ["ElevenLabs"],
      cloudflareRadar: "elevenlabs.io",
      stackoverflow: ["elevenlabs"],
    }
  },
  {
    id: "suno", name: "Suno", category: "audio", company: "Suno AI",
    release_date: "2024-03-22", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "AI music generation from text prompts",
    sources: {
      hackernews: ["Suno AI", "Suno music"],
      smolai: ["Suno AI", "Suno music"],
      reddit: ["Suno AI", "Suno music"],
      cloudflareRadar: "suno.com",
      stackoverflow: ["suno-ai"],
    }
  },
  {
    id: "udio", name: "Udio", category: "audio", company: "Udio",
    release_date: "2024-04-10", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "AI music generation with high-fidelity audio",
    sources: {
      hackernews: ["Udio"],
      smolai: ["Udio"],
      reddit: ["Udio"],
      cloudflareRadar: "udio.com",
      stackoverflow: ["udio"],
    }
  },
  {
    id: "openai-whisper", name: "Whisper", category: "audio", company: "OpenAI",
    release_date: "2023-11-06", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Open-source speech recognition model",
    sources: {
      pypi: ["openai-whisper"],
      github: ["openai/whisper"],
      huggingface: ["openai/whisper-large-v3"],
      hackernews: ["Whisper OpenAI", "Whisper speech"],
      smolai: ["Whisper OpenAI", "Whisper speech"],
      reddit: ["Whisper OpenAI"],
      groq: "whisper-large-v3",
      semanticScholar: ["Robust Speech Recognition via Large-Scale Weak Supervision"],
      stackoverflow: ["whisper", "openai-whisper"],
    }
  },
  {
    id: "notebooklm", name: "NotebookLM", category: "audio", company: "Google",
    release_date: "2024-09-11", pricing_tier: "free", availability: "Web", open_source: 0,
    description: "AI research assistant with audio overview podcasts",
    sources: {
      hackernews: ["NotebookLM"],
      smolai: ["NotebookLM"],
      reddit: ["NotebookLM"],
      stackoverflow: ["notebooklm"],
    }
  },

  // ── GENERAL LLMs ──
  {
    id: "gpt-4o-mini", name: "GPT-4o Mini", category: "general_llm", company: "OpenAI",
    release_date: "2024-07-18", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "Small, fast, affordable multimodal model for lightweight tasks",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node"],
      hackernews: ["GPT-4o mini", "GPT-4o-mini"],
      smolai: ["GPT-4o mini", "GPT-4o-mini"],
      reddit: ["GPT-4o mini", "GPT-4o-mini"],
      openRouter: "openai/gpt-4o-mini",
      openWebUI: ["gpt-4o-mini"],
      lmsysArena: "gpt-4o-mini-2024-07-18",
      semanticScholar: ["GPT-4o mini system card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-4o-mini", "openai-api"],
    }
  },
  {
    id: "gpt-4o", name: "GPT-4o", category: "general_llm", company: "OpenAI",
    release_date: "2024-05-13", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "OpenAI flagship multimodal model",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node"],
      hackernews: ["GPT-4o", "GPT4o", "GPT-4o coding", "GPT-4o code"],
      smolai: ["GPT-4o", "GPT4o", "GPT-4o coding", "GPT-4o code"],
      reddit: ["GPT-4o", "GPT4o", "GPT-4o coding", "GPT-4o code"],
      openRouter: "openai/gpt-4o",
      lmsysArena: "gpt-4o-2024-08-06",
      semanticScholar: ["GPT-4o system card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-4o", "openai-api"],
    }
  },
  {
    id: "claude-35-sonnet", name: "Claude 3.5 Sonnet", category: "general_llm", company: "Anthropic",
    release_date: "2024-10-22", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "Anthropic most capable and balanced model",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude 3.5 Sonnet"],
      smolai: ["Claude 3.5 Sonnet"],
      reddit: ["Claude 3.5 Sonnet"],
      openRouter: "anthropic/claude-3.5-sonnet",
      lmsysArena: "claude-3-5-sonnet-20241022",
      semanticScholar: ["The Claude 3 Model Family", "Claude 3.5 Sonnet Model Card Addendum", "Model Card Addendum: Claude 3.5 Haiku and Upgraded Claude 3.5 Sonnet"],
      cloudflareRadar: "claude.ai",
      stackoverflow: ["claude", "anthropic"],
    }
  },
  {
    id: "gemini-2-flash", name: "Gemini 2.0 Flash", category: "general_llm", company: "Google",
    release_date: "2025-02-05", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "Fast efficient multimodal model from Google",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      github: ["google-gemini/generative-ai-python"],
      hackernews: ["Gemini 2.0 Flash", "Gemini Flash"],
      smolai: ["Gemini 2.0 Flash", "Gemini Flash"],
      reddit: ["Gemini 2.0 Flash", "Gemini Flash"],
      openRouter: "google/gemini-2.0-flash-001",
      lmsysArena: "gemini-2.0-flash-001",
      semanticScholar: ["Gemini: A Family of Highly Capable Multimodal Models"],
      stackoverflow: ["gemini-api", "google-gemini"],
    }
  },
  {
    id: "deepseek-v3", name: "DeepSeek V3", category: "general_llm", company: "DeepSeek",
    release_date: "2025-01-10", pricing_tier: "freemium", availability: "API,Web", open_source: 1,
    description: "671B MoE model with frontier capabilities at low cost",
    sources: {
      github: ["deepseek-ai/DeepSeek-V3"],
      huggingface: ["deepseek-ai/DeepSeek-V3"],
      hackernews: ["DeepSeek V3", "DeepSeek-V3"],
      smolai: ["DeepSeek V3", "DeepSeek-V3"],
      reddit: ["DeepSeek V3", "DeepSeek-V3"],
      openRouter: "deepseek/deepseek-chat",
      openWebUI: ["deepseek-chat"],
      lmsysArena: "deepseek-v3",
      semanticScholar: ["DeepSeek-V3 Technical Report"],
      cloudflareRadar: "deepseek.com",
      ollama: ["deepseek-v3"],
      stackoverflow: ["deepseek"],
    }
  },
  {
    id: "llama-33-70b", name: "Llama 3.3 70B", category: "general_llm", company: "Meta",
    release_date: "2024-12-06", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Meta open-weight LLM matching larger models",
    sources: {
      pypi: ["transformers"],
      github: ["meta-llama/llama3"],
      huggingface: ["meta-llama/Llama-3.3-70B-Instruct"],
      hackernews: ["Llama 3.3", "Llama 3"],
      smolai: ["Llama 3.3", "Llama 3"],
      reddit: ["Llama 3.3", "Llama 3"],
      openRouter: "meta-llama/llama-3.3-70b-instruct",
      groq: "llama-3.3-70b-versatile",
      lmsysArena: "llama-3.3-70b-instruct",
      hfLeaderboard: "meta-llama/Llama-3.3-70B-Instruct",
      semanticScholar: ["The Llama 3 Herd of Models"],
      ollama: ["llama3.3"],
      stackoverflow: ["llama", "meta-llama"],
    }
  },
  {
    id: "grok-3", name: "Grok 3", category: "general_llm", company: "xAI",
    release_date: "2025-02-17", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "xAI latest model trained on Colossus cluster",
    sources: {
      github: ["xai-org/grok-prompts"],
      hackernews: ["Grok 3", "Grok xAI"],
      smolai: ["Grok 3", "Grok xAI"],
      reddit: ["Grok 3", "xAI Grok"],
      openRouter: "x-ai/grok-3",
      lmsysArena: "grok-3-preview-02-24",
      stackoverflow: ["grok", "xai"],
    }
  },
  {
    id: "mistral-large-2", name: "Mistral Large 2", category: "general_llm", company: "Mistral AI",
    release_date: "2024-07-24", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "128k context flagship model from Mistral",
    sources: {
      pypi: ["mistralai"], npm: ["@mistralai/mistralai"],
      github: ["mistralai/mistral-inference"],
      huggingface: ["mistralai/Mistral-Large-Instruct-2407"],
      hackernews: ["Mistral Large", "Mistral AI"],
      smolai: ["Mistral Large", "Mistral AI"],
      reddit: ["Mistral Large", "Mistral AI"],
      openRouter: "mistralai/mistral-large",
      lmsysArena: "mistral-large-2407",
      hfLeaderboard: "mistralai/Mistral-Large-Instruct-2411",
      semanticScholar: ["Mistral 7B"],
      cloudflareRadar: "mistral.ai",
      ollama: ["mistral"],
      stackoverflow: ["mistral", "mistral-ai"],
    }
  },
  {
    id: "qwen-25-72b", name: "Qwen 2.5 72B", category: "general_llm", company: "Alibaba",
    release_date: "2024-09-19", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Leading open-weight model from Alibaba Cloud",
    sources: {
      github: ["QwenLM/Qwen2.5"],
      huggingface: ["Qwen/Qwen2.5-72B-Instruct"],
      hackernews: ["Qwen 2.5", "Qwen"],
      smolai: ["Qwen 2.5", "Qwen"],
      reddit: ["Qwen 2.5", "Qwen"],
      openRouter: "qwen/qwen-2.5-72b-instruct",
      openWebUI: ["qwen2.5:72b"],
      lmsysArena: "qwen2.5-72b-instruct",
      hfLeaderboard: "Qwen/Qwen2.5-72B-Instruct",
      semanticScholar: ["Qwen2 Technical Report"],
      ollama: ["qwen2.5:72b"],
      stackoverflow: ["qwen"],
    }
  },
  {
    id: "perplexity", name: "Perplexity", category: "general_llm", company: "Perplexity AI",
    release_date: "2024-11-15", pricing_tier: "freemium", availability: "Web,Mobile,API", open_source: 0,
    description: "AI-powered answer engine with real-time search",
    sources: {
      github: ["ppl-ai/pplx-kernels"],
      hackernews: ["Perplexity AI", "Perplexity"],
      smolai: ["Perplexity AI", "Perplexity"],
      reddit: ["Perplexity AI", "Perplexity"],
      openWebUI: ["sonar"],
      cloudflareRadar: "perplexity.ai",
      stackoverflow: ["perplexity"],
    }
  },
  {
    id: "command-r-plus", name: "Command R+", category: "general_llm", company: "Cohere",
    release_date: "2024-04-04", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Enterprise-focused RAG-optimized LLM",
    sources: {
      pypi: ["cohere"], npm: ["cohere-ai"],
      hackernews: ["Command R+", "Cohere"],
      smolai: ["Command R+", "Cohere"],
      reddit: ["Command R+", "Cohere"],
      openRouter: "cohere/command-r-plus-08-2024",
      lmsysArena: "command-r-plus-08-2024",
      hfLeaderboard: "CohereForAI/c4ai-command-r-plus",
      semanticScholar: ["Command R+ scalable retrieval augmented generation"],
      cloudflareRadar: "cohere.com",
      ollama: ["command-r-plus"],
      stackoverflow: ["cohere"],
    }
  },
  {
    id: "gpt-4-5", name: "GPT-4.5", category: "general_llm", company: "OpenAI",
    release_date: "2025-02-27", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "OpenAI largest and most capable model with improved EQ",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["GPT-4.5"],
      smolai: ["GPT-4.5"],
      reddit: ["GPT-4.5", "GPT 4.5"],
      lmsysArena: "gpt-4.5-preview-2025-02-27",
      semanticScholar: ["GPT-4 Technical Report"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-4.5", "openai-api"],
    }
  },
  {
    id: "claude-37-sonnet", name: "Claude 3.7 Sonnet", category: "general_llm", company: "Anthropic",
    release_date: "2025-02-24", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "Anthropic hybrid reasoning model with extended thinking",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude 3.7", "Claude 3.7 Sonnet"],
      smolai: ["Claude 3.7", "Claude 3.7 Sonnet"],
      reddit: ["Claude 3.7 Sonnet", "Claude 3.7"],
      openRouter: "anthropic/claude-3.7-sonnet",
      lmsysArena: "claude-3-7-sonnet-20250219",
      semanticScholar: ["The Claude 3 Model Family", "Claude 3.7 Sonnet System Card"],
      cloudflareRadar: "claude.ai",
      stackoverflow: ["claude", "anthropic"],
    }
  },
  {
    id: "claude-4-sonnet", name: "Claude Sonnet 4", category: "general_llm", company: "Anthropic",
    release_date: "2025-05-22", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "Anthropic latest Sonnet with improved coding and instruction following",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude Sonnet 4", "Claude 4 Sonnet"],
      smolai: ["Claude Sonnet 4", "Claude 4 Sonnet"],
      reddit: ["Claude Sonnet 4", "Claude 4"],
      openRouter: "anthropic/claude-sonnet-4",
      lmsysArena: "claude-sonnet-4-20250514",
      semanticScholar: ["The Claude 3 Model Family", "Claude 3.7 Sonnet System Card", "System Card: Claude Opus 4 & Claude Sonnet 4"],
      cloudflareRadar: "claude.ai",
      stackoverflow: ["claude", "anthropic"],
    }
  },
  {
    id: "claude-opus-4-6", name: "Claude Opus 4.6", category: "general_llm", company: "Anthropic",
    release_date: "2025-10-01", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "Anthropic most capable model for complex reasoning and coding",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude Opus 4.6"],
      smolai: ["Claude Opus 4.6"],
      reddit: ["Claude Opus 4.6"],
      openRouter: "anthropic/claude-opus-4",
      openWebUI: ["claude-opus-4.6"],
      lmsysArena: "claude-opus-4-6",
      semanticScholar: ["The Claude 3 Model Family", "System Card: Claude Opus 4 & Claude Sonnet 4", "System Card: Claude Opus 4.6 & Claude Sonnet 4.6"],
      cloudflareRadar: "claude.ai",
      stackoverflow: ["claude", "anthropic"],
    }
  },
  {
    id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", category: "general_llm", company: "Anthropic",
    release_date: "2025-10-01", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "Fast and capable model balancing performance and cost",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude Sonnet 4.6"],
      smolai: ["Claude Sonnet 4.6"],
      reddit: ["Claude Sonnet 4.6"],
      openRouter: "anthropic/claude-sonnet-4.6",
      openWebUI: ["claude-sonnet-4-6", "claude-sonnet-4.6"],
      lmsysArena: "claude-sonnet-4-6",
      semanticScholar: ["The Claude 3 Model Family", "System Card: Claude Opus 4 & Claude Sonnet 4", "System Card: Claude Opus 4.6 & Claude Sonnet 4.6"],
      cloudflareRadar: "claude.ai",
      stackoverflow: ["claude", "anthropic"],
    }
  },
  {
    id: "claude-haiku-4-5", name: "Claude Haiku 4.5", category: "general_llm", company: "Anthropic",
    release_date: "2025-10-01", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Anthropic fastest and most affordable model",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude Haiku 4.5"],
      smolai: ["Claude Haiku 4.5"],
      reddit: ["Claude Haiku"],
      openRouter: "anthropic/claude-haiku-4.5",
      openWebUI: ["claude-haiku"],
      lmsysArena: "claude-haiku-4-5-20251001",
      semanticScholar: ["The Claude 3 Model Family", "System Card: Claude Haiku 4.5"],
      cloudflareRadar: "claude.ai",
      stackoverflow: ["claude", "anthropic"],
    }
  },
  {
    id: "gemini-25-pro", name: "Gemini 2.5 Pro", category: "general_llm", company: "Google",
    release_date: "2025-03-25", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Google thinking model with 1M token context",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      github: ["google-gemini/generative-ai-python"],
      hackernews: ["Gemini 2.5 Pro", "Gemini 2.5"],
      smolai: ["Gemini 2.5 Pro", "Gemini 2.5"],
      reddit: ["Gemini 2.5 Pro", "Gemini 2.5"],
      openRouter: "google/gemini-2.5-pro",
      openWebUI: ["gemini-2.5-pro"],
      lmsysArena: "gemini-2.5-pro",
      semanticScholar: ["Gemini 2.5: Pushing the Frontier"],
      stackoverflow: ["gemini-api", "google-gemini"],
    }
  },
  {
    id: "llama-4-scout", name: "Llama 4 Scout", category: "general_llm", company: "Meta",
    release_date: "2025-04-05", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Meta 109B MoE model with 10M token context",
    sources: {
      pypi: ["transformers"],
      github: ["meta-llama/llama-models"],
      huggingface: ["meta-llama/Llama-4-Scout-17B-16E-Instruct"],
      hackernews: ["Llama 4", "Llama 4 Scout"],
      smolai: ["Llama 4", "Llama 4 Scout"],
      reddit: ["Llama 4", "Llama 4 Scout"],
      openRouter: "meta-llama/llama-4-scout",
      groq: "meta-llama/llama-4-scout-17b-16e-instruct",
      lmsysArena: "llama-4-scout-17b-16e-instruct",
      semanticScholar: ["The Llama 3 Herd of Models"],
      ollama: ["llama4-scout"],
      stackoverflow: ["llama", "meta-llama"],
    }
  },
  {
    id: "deepseek-r1", name: "DeepSeek R1", category: "general_llm", company: "DeepSeek",
    release_date: "2025-01-20", pricing_tier: "freemium", availability: "API,Web", open_source: 1,
    description: "Open-source reasoning model rivaling o1",
    sources: {
      github: ["deepseek-ai/DeepSeek-R1"],
      huggingface: ["deepseek-ai/DeepSeek-R1"],
      hackernews: ["DeepSeek R1", "DeepSeek-R1"],
      smolai: ["DeepSeek R1", "DeepSeek-R1"],
      reddit: ["DeepSeek R1", "DeepSeek-R1"],
      openRouter: "deepseek/deepseek-r1",
      openWebUI: ["deepseek-r1"],
      lmsysArena: "deepseek-r1",
      semanticScholar: ["DeepSeek-R1"],
      cloudflareRadar: "deepseek.com",
      ollama: ["deepseek-r1"],
      stackoverflow: ["deepseek-r1"],
    }
  },
  {
    id: "o3", name: "o3", category: "general_llm", company: "OpenAI",
    release_date: "2025-04-16", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "OpenAI most capable reasoning model",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["OpenAI o3", "o3 model"],
      smolai: ["OpenAI o3", "o3 model"],
      reddit: ["OpenAI o3", "o3 model"],
      openRouter: "openai/o3",
      openWebUI: ["o3"],
      lmsysArena: "o3-2025-04-16",
      semanticScholar: ["OpenAI o1 System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["openai-o3", "openai-api"],
    }
  },
  {
    id: "o3-mini", name: "o3-mini", category: "general_llm", company: "OpenAI",
    release_date: "2025-01-31", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Cost-efficient reasoning model from OpenAI",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["o3-mini", "o3 mini"],
      smolai: ["o3-mini", "o3 mini"],
      reddit: ["o3-mini", "o3 mini"],
      openRouter: "openai/o3-mini",
      lmsysArena: "o3-mini",
      semanticScholar: ["OpenAI o1 System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["o3-mini", "openai-api"],
    }
  },
  {
    id: "gpt-5-2", name: "GPT-5.2", category: "general_llm", company: "OpenAI",
    release_date: "2025-09-01", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "OpenAI most advanced model with major agentic coding improvements",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["GPT-5", "GPT 5.2"],
      smolai: ["GPT-5", "GPT 5.2"],
      reddit: ["GPT-5", "GPT 5.2"],
      openRouter: "openai/gpt-5.2",
      openWebUI: ["gpt-5.2", "gpt-5"],
      lmsysArena: "gpt-5.2",
      semanticScholar: ["OpenAI GPT-5 System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-5", "openai-api"],
    }
  },
  {
    id: "gpt-5-3-codex", name: "GPT-5.3-Codex", category: "general_llm", company: "OpenAI",
    release_date: "2026-02-05", pricing_tier: "paid", availability: "API,Web,CLI,IDE", open_source: 0,
    description: "Most capable agentic coding model, 25% faster than GPT-5.2-Codex with broader knowledge work capabilities",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node", "openai/codex"],
      hackernews: ["GPT-5.3-Codex", "GPT-5.3 Codex", "GPT 5.3"],
      smolai: ["GPT-5.3-Codex", "GPT-5.3 Codex", "GPT 5.3"],
      reddit: ["GPT-5.3-Codex", "GPT-5.3 Codex", "GPT 5.3"],
      openRouter: "openai/gpt-5.3-codex",
      openWebUI: ["gpt-5.3-codex"],
      semanticScholar: ["GPT-5.3-Codex System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["openai-codex", "gpt-5"],
    }
  },
  {
    id: "gpt-5-3-codex-spark", name: "GPT-5.3-Codex-Spark", category: "general_llm", company: "OpenAI",
    release_date: "2026-02-12", pricing_tier: "paid", availability: "API,Web,CLI,IDE", open_source: 0,
    description: "Smaller real-time coding variant of GPT-5.3-Codex for interactive development",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node", "openai/codex"],
      hackernews: ["GPT-5.3-Codex-Spark", "Codex Spark"],
      smolai: ["GPT-5.3-Codex-Spark", "Codex Spark"],
      reddit: ["GPT-5.3-Codex-Spark", "Codex Spark"],
      openRouter: "openai/gpt-5.3-codex-spark",
      openWebUI: ["gpt-5.3-codex-spark"],
      semanticScholar: ["GPT-5.3-Codex System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["openai-codex"],
    }
  },
  {
    id: "gemini-3-pro", name: "Gemini 3 Pro", category: "general_llm", company: "Google",
    release_date: "2025-10-01", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Google flagship frontier model for high-precision multimodal reasoning",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      github: ["google-gemini/generative-ai-python"],
      hackernews: ["Gemini 3", "Gemini 3 Pro"],
      smolai: ["Gemini 3", "Gemini 3 Pro"],
      reddit: ["Gemini 3", "Gemini 3 Pro"],
      openRouter: "google/gemini-3-pro-preview",
      openWebUI: ["gemini-3-pro"],
      lmsysArena: "gemini-3-pro",
      semanticScholar: ["Gemini: A Family of Highly Capable Multimodal Models"],
      stackoverflow: ["gemini-api"],
    }
  },
  {
    id: "deepseek-v3-2", name: "DeepSeek V3.2", category: "general_llm", company: "DeepSeek",
    release_date: "2025-08-01", pricing_tier: "freemium", availability: "API,Web", open_source: 1,
    description: "Efficient MoE model balancing reasoning and tool-use performance",
    sources: {
      github: ["deepseek-ai/DeepSeek-V3"],
      huggingface: ["deepseek-ai/DeepSeek-V3"],
      hackernews: ["DeepSeek V3.2", "DeepSeek-V3.2"],
      smolai: ["DeepSeek V3.2", "DeepSeek-V3.2"],
      reddit: ["DeepSeek V3.2"],
      openRouter: "deepseek/deepseek-chat-v3-0324",
      openWebUI: ["deepseek-v3.2"],
      lmsysArena: "deepseek-v3.2",
      semanticScholar: ["DeepSeek-V3 Technical Report"],
      cloudflareRadar: "deepseek.com",
      stackoverflow: ["deepseek"],
    }
  },
  {
    id: "mistral-large-3", name: "Mistral Large 3", category: "general_llm", company: "Mistral AI",
    release_date: "2025-07-01", pricing_tier: "freemium", availability: "API,Web", open_source: 1,
    description: "Sparse MoE with 41B active parameters under Apache 2.0",
    sources: {
      pypi: ["mistralai"], npm: ["@mistralai/mistralai"],
      github: ["mistralai/mistral-inference"],
      huggingface: ["mistralai/Mistral-Large-3-675B-Instruct-2512"],
      hackernews: ["Mistral Large 3", "Mistral AI"],
      smolai: ["Mistral Large 3", "Mistral AI"],
      reddit: ["Mistral Large 3"],
      openRouter: "mistralai/mistral-large-2512",
      openWebUI: ["mistral-large-3"],
      lmsysArena: "mistral-large-3",
      semanticScholar: ["Mistral 7B"],
      cloudflareRadar: "mistral.ai",
      ollama: ["mistral-large"],
      stackoverflow: ["mistral", "mistral-ai"],
    }
  },
  {
    id: "grok-4", name: "Grok 4", category: "general_llm", company: "xAI",
    release_date: "2025-07-01", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "xAI latest model with strong agentic tool-calling capabilities",
    sources: {
      github: ["xai-org/grok-prompts"],
      hackernews: ["Grok 4", "xAI Grok 4"],
      smolai: ["Grok 4", "xAI Grok 4"],
      reddit: ["Grok 4", "xAI Grok"],
      openRouter: "x-ai/grok-4",
      openWebUI: ["grok-4-fast"],
      lmsysArena: "grok-4-0709",
      stackoverflow: ["grok"],
    }
  },
  {
    id: "gemini-3-flash", name: "Gemini 3 Flash", category: "general_llm", company: "Google",
    release_date: "2025-12-17", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Google fast and efficient Gemini 3 model for high-throughput tasks",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      github: ["google-gemini/generative-ai-python"],
      hackernews: ["Gemini 3 Flash", "Gemini Flash"],
      smolai: ["Gemini 3 Flash", "Gemini Flash"],
      reddit: ["Gemini 3 Flash"],
      openRouter: "google/gemini-3-flash-preview",
      openWebUI: ["gemini-3-flash"],
      lmsysArena: "gemini-3-flash",
      semanticScholar: ["Gemini: A Family of Highly Capable Multimodal Models"],
      stackoverflow: ["gemini-api"],
    }
  },
  {
    id: "gemini-25-flash", name: "Gemini 2.5 Flash", category: "general_llm", company: "Google",
    release_date: "2025-09-01", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Google fast thinking model balancing speed and capability",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      github: ["google-gemini/generative-ai-python"],
      hackernews: ["Gemini 2.5 Flash"],
      smolai: ["Gemini 2.5 Flash"],
      reddit: ["Gemini 2.5 Flash"],
      openRouter: "google/gemini-2.5-flash",
      openWebUI: ["gemini-2.5-flash"],
      lmsysArena: "gemini-2.5-flash",
      semanticScholar: ["Gemini 2.5: Pushing the Frontier"],
      stackoverflow: ["gemini-api"],
    }
  },
  {
    id: "gemini-31-pro", name: "Gemini 3.1 Pro", category: "general_llm", company: "Google",
    release_date: "2026-02-19", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Google latest frontier model with improved reasoning and tool use",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      github: ["google-gemini/generative-ai-python"],
      hackernews: ["Gemini 3.1", "Gemini 3.1 Pro"],
      smolai: ["Gemini 3.1", "Gemini 3.1 Pro"],
      reddit: ["Gemini 3.1 Pro"],
      openRouter: "google/gemini-3.1-pro-preview",
      lmsysArena: "gemini-3.1-pro-preview",
      semanticScholar: ["Gemini: A Family of Highly Capable Multimodal Models"],
      stackoverflow: ["gemini-api"],
    }
  },
  {
    id: "claude-45-sonnet", name: "Claude Sonnet 4.5", category: "general_llm", company: "Anthropic",
    release_date: "2025-09-29", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Anthropic balanced model with strong reasoning and coding",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude 4.5 Sonnet", "Claude Sonnet 4.5"],
      smolai: ["Claude 4.5 Sonnet", "Claude Sonnet 4.5"],
      reddit: ["Claude 4.5 Sonnet", "Claude Sonnet 4.5"],
      openRouter: "anthropic/claude-sonnet-4.5",
      openWebUI: ["claude-sonnet-4.5", "claude-sonnet-4-5"],
      lmsysArena: "claude-sonnet-4-5-20250929",
      semanticScholar: ["The Claude 3 Model Family", "System Card: Claude Sonnet 4.5"],
      cloudflareRadar: "claude.ai",
      stackoverflow: ["claude", "anthropic"],
    }
  },
  {
    id: "claude-45-opus", name: "Claude Opus 4.5", category: "general_llm", company: "Anthropic",
    release_date: "2025-11-24", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "Anthropic previous-gen flagship for complex analysis",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude 4.5 Opus", "Claude Opus 4.5"],
      smolai: ["Claude 4.5 Opus", "Claude Opus 4.5"],
      reddit: ["Claude 4.5 Opus", "Claude Opus 4.5"],
      openRouter: "anthropic/claude-opus-4.5",
      openWebUI: ["claude-opus-4.5"],
      lmsysArena: "claude-opus-4-5-20251101",
      semanticScholar: ["The Claude 3 Model Family", "System Card: Claude Opus 4.5"],
      cloudflareRadar: "claude.ai",
      stackoverflow: ["claude", "anthropic"],
    }
  },
  {
    id: "gpt-5-mini", name: "GPT-5 Mini", category: "general_llm", company: "OpenAI",
    release_date: "2025-08-07", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Compact GPT-5 variant balancing capability and cost",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["GPT-5 mini", "GPT-5-mini"],
      smolai: ["GPT-5 mini", "GPT-5-mini"],
      reddit: ["GPT-5 mini"],
      openRouter: "openai/gpt-5-mini",
      openWebUI: ["gpt-5-mini"],
      lmsysArena: "gpt-5-mini-high",
      semanticScholar: ["OpenAI GPT-5 System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-5", "openai-api"],
    }
  },
  {
    id: "gpt-5-nano", name: "GPT-5 Nano", category: "general_llm", company: "OpenAI",
    release_date: "2025-08-07", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Smallest GPT-5 model for lightweight and embedded use",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["GPT-5 nano"],
      smolai: ["GPT-5 nano"],
      reddit: ["GPT-5 nano"],
      openRouter: "openai/gpt-5-nano",
      lmsysArena: "gpt-5-nano-high",
      semanticScholar: ["OpenAI GPT-5 System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-5", "openai-api"],
    }
  },
  {
    id: "gpt-oss-120b", name: "GPT-OSS 120B", category: "general_llm", company: "OpenAI",
    release_date: "2025-11-01", pricing_tier: "free", availability: "API", open_source: 1,
    description: "OpenAI first open-weight model at 120B parameters",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      huggingface: ["openai/gpt-oss-120b"],
      hackernews: ["GPT-OSS", "GPT OSS 120B"],
      smolai: ["GPT-OSS", "GPT OSS 120B"],
      reddit: ["GPT-OSS", "GPT OSS"],
      openRouter: "openai/gpt-oss-120b",
      groq: "openai/gpt-oss-120b",
      openWebUI: ["gpt-oss:120b", "gpt-oss-120b"],
      lmsysArena: "gpt-oss-120b",
      ollama: ["gpt-oss:120b"],
      stackoverflow: ["gpt-oss", "openai-api"],
    }
  },
  {
    id: "gpt-41", name: "GPT-4.1", category: "general_llm", company: "OpenAI",
    release_date: "2025-04-14", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Optimized GPT-4 variant with improved coding and instruction following",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["GPT-4.1"],
      smolai: ["GPT-4.1"],
      reddit: ["GPT-4.1", "GPT 4.1"],
      openRouter: "openai/gpt-4.1",
      openWebUI: ["gpt-4.1"],
      lmsysArena: "gpt-4.1-2025-04-14",
      semanticScholar: ["GPT-4 Technical Report"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-4.1", "openai-api"],
    }
  },
  {
    id: "gpt-41-mini", name: "GPT-4.1 Mini", category: "general_llm", company: "OpenAI",
    release_date: "2025-04-14", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Compact GPT-4.1 for fast affordable tasks",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["GPT-4.1 mini"],
      smolai: ["GPT-4.1 mini"],
      reddit: ["GPT-4.1 mini"],
      openRouter: "openai/gpt-4.1-mini",
      openWebUI: ["gpt-4.1-mini"],
      lmsysArena: "gpt-4.1-mini-2025-04-14",
      semanticScholar: ["GPT-4 Technical Report"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-4.1", "openai-api"],
    }
  },
  {
    id: "minimax-m25", name: "MiniMax M2.5", category: "general_llm", company: "MiniMax",
    release_date: "2026-02-11", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "MiniMax latest frontier model with massive API usage",
    sources: {
      github: ["MiniMax-AI/MiniMax-M1"],
      huggingface: ["MiniMaxAI/MiniMax-M2.5"],
      hackernews: ["MiniMax", "MiniMax M2"],
      smolai: ["MiniMax", "MiniMax M2"],
      reddit: ["MiniMax AI", "MiniMax M2"],
      openRouter: "minimax/minimax-m2.5",
      openWebUI: ["minimax-m2"],
      lmsysArena: "minimax-m2.5",
      semanticScholar: ["MiniMax-01 scaling foundation models mixture-of-experts"],
      cloudflareRadar: "minimax.io",
      stackoverflow: ["minimax"],
    }
  },
  {
    id: "glm-5", name: "GLM-5", category: "general_llm", company: "Zhipu AI",
    release_date: "2026-02-11", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Zhipu AI flagship bilingual model",
    sources: {
      github: ["THUDM/GLM-4"],
      huggingface: ["zai-org/GLM-5"],
      hackernews: ["GLM-5", "Zhipu AI"],
      smolai: ["GLM-5", "Zhipu AI"],
      reddit: ["GLM-5", "Zhipu"],
      openRouter: "z-ai/glm-5",
      openWebUI: ["glm-5"],
      lmsysArena: "glm-5",
      semanticScholar: ["GLM-4 all tools practical tool calling"],
      ollama: ["glm4"],
      stackoverflow: ["glm", "chatglm"],
    }
  },
  {
    id: "kimi-k25", name: "Kimi K2.5", category: "general_llm", company: "Moonshot AI",
    release_date: "2026-01-27", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Moonshot AI latest model with strong reasoning capabilities",
    sources: {
      github: ["MoonshotAI/Kimi-K2"],
      huggingface: ["moonshotai/Kimi-K2.5"],
      hackernews: ["Kimi K2", "Moonshot AI"],
      smolai: ["Kimi K2", "Moonshot AI"],
      reddit: ["Kimi K2", "Moonshot"],
      openRouter: "moonshotai/kimi-k2.5",
      openWebUI: ["kimi-k2"],
      groq: "moonshotai/kimi-k2-instruct-0905",
      lmsysArena: "kimi-k2.5-thinking",
      semanticScholar: ["Kimi K2: Open Agentic Intelligence"],
      stackoverflow: ["kimi", "moonshot"],
    }
  },
  {
    id: "step-35-flash", name: "Step 3.5 Flash", category: "general_llm", company: "StepFun",
    release_date: "2025-10-01", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "StepFun fast inference model with strong multilingual capabilities",
    sources: {
      github: ["stepfun-ai/Step3"],
      huggingface: ["stepfun-ai/Step-3.5-Flash"],
      hackernews: ["StepFun", "Step Flash"],
      smolai: ["StepFun", "Step Flash"],
      reddit: ["StepFun"],
      openRouter: "stepfun/step-3.5-flash",
      lmsysArena: "step-3.5-flash",
      stackoverflow: ["stepfun"],
    }
  },
  {
    id: "qwen3-235b", name: "Qwen 3 235B", category: "general_llm", company: "Alibaba",
    release_date: "2025-07-25", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Alibaba largest open-weight MoE model with 22B active parameters",
    sources: {
      github: ["QwenLM/Qwen3"],
      huggingface: ["Qwen/Qwen3-235B-A22B"],
      hackernews: ["Qwen 3", "Qwen3"],
      smolai: ["Qwen 3", "Qwen3"],
      reddit: ["Qwen 3", "Qwen3"],
      openRouter: "qwen/qwen3-235b-a22b",
      openWebUI: ["qwen3:235b"],
      lmsysArena: "qwen3-235b-a22b",
      semanticScholar: ["Qwen3 Technical Report"],
      ollama: ["qwen3:235b"],
      stackoverflow: ["qwen"],
    }
  },
  {
    id: "grok-41", name: "Grok 4.1", category: "general_llm", company: "xAI",
    release_date: "2025-12-01", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "xAI updated Grok with improved speed and capability",
    sources: {
      github: ["xai-org/grok-prompts"],
      hackernews: ["Grok 4.1", "xAI Grok"],
      smolai: ["Grok 4.1", "xAI Grok"],
      reddit: ["Grok 4.1"],
      openRouter: "x-ai/grok-4.1-fast",
      openWebUI: ["grok-4-1", "grok-4.1"],
      lmsysArena: "grok-4.1",
      stackoverflow: ["grok"],
    }
  },
  {
    id: "gpt-oss-20b", name: "GPT-OSS 20B", category: "general_llm", company: "OpenAI",
    release_date: "2025-11-01", pricing_tier: "free", availability: "API", open_source: 1,
    description: "OpenAI compact open-weight model at 20B parameters",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python"],
      hackernews: ["GPT-OSS 20B", "GPT-OSS"],
      smolai: ["GPT-OSS 20B"],
      reddit: ["GPT-OSS 20B", "GPT OSS"],
      groq: "openai/gpt-oss-20b",
      openWebUI: ["gpt-oss:20b", "gpt-oss-20b"],
      lmsysArena: "gpt-oss-20b",
      ollama: ["gpt-oss:20b"],
      stackoverflow: ["gpt-oss", "openai-api"],
    }
  },
  {
    id: "llama-31-8b", name: "Llama 3.1 8B", category: "general_llm", company: "Meta",
    release_date: "2024-07-23", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Meta compact open-weight LLM for efficient inference",
    sources: {
      pypi: ["transformers"],
      github: ["meta-llama/llama3"],
      huggingface: ["meta-llama/Llama-3.1-8B-Instruct"],
      hackernews: ["Llama 3.1", "Llama 3.1 8B"],
      smolai: ["Llama 3.1", "Llama 3.1 8B"],
      reddit: ["Llama 3.1 8B", "Llama 3.1"],
      openRouter: "meta-llama/llama-3.1-8b-instruct",
      openWebUI: ["llama3.1:8b"],
      groq: "llama-3.1-8b-instant",
      lmsysArena: "llama-3.1-8b-instruct",
      hfLeaderboard: "meta-llama/Llama-3.1-8B-Instruct",
      semanticScholar: ["The Llama 3 Herd of Models"],
      ollama: ["llama3.1:8b"],
      stackoverflow: ["llama", "meta-llama"],
    }
  },
  {
    id: "llama-4-maverick", name: "Llama 4 Maverick", category: "general_llm", company: "Meta",
    release_date: "2025-04-05", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Meta 400B MoE model with 128 experts for frontier performance",
    sources: {
      pypi: ["transformers"],
      github: ["meta-llama/llama-models"],
      huggingface: ["meta-llama/Llama-4-Maverick-17B-128E-Instruct"],
      hackernews: ["Llama 4 Maverick", "Llama 4"],
      smolai: ["Llama 4 Maverick", "Llama 4"],
      reddit: ["Llama 4 Maverick", "Llama 4"],
      openRouter: "meta-llama/llama-4-maverick",
      groq: "meta-llama/llama-4-maverick-17b-128e-instruct",
      lmsysArena: "llama-4-maverick-17b-128e-instruct",
      semanticScholar: ["The Llama 3 Herd of Models"],
      ollama: ["llama4-maverick"],
      stackoverflow: ["llama", "meta-llama"],
    }
  },
  {
    id: "qwen3-32b", name: "Qwen 3 32B", category: "general_llm", company: "Alibaba",
    release_date: "2025-07-25", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Alibaba mid-size open-weight model with strong reasoning",
    sources: {
      github: ["QwenLM/Qwen3"],
      huggingface: ["Qwen/Qwen3-32B"],
      hackernews: ["Qwen 3 32B", "Qwen3"],
      smolai: ["Qwen 3 32B", "Qwen3"],
      reddit: ["Qwen 3 32B", "Qwen3"],
      openRouter: "qwen/qwen3-32b",
      groq: "qwen/qwen3-32b",
      lmsysArena: "qwen3-32b",
      semanticScholar: ["Qwen3 Technical Report"],
      ollama: ["qwen3:32b"],
      stackoverflow: ["qwen"],
    }
  },
  // ── NEW MODELS FROM OPENROUTER ──

  // OpenAI - GPT-5.1
  {
    id: "gpt-5-1", name: "GPT-5.1", category: "general_llm", company: "OpenAI",
    release_date: "2025-11-12", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "GPT-5 series update with shopping research and multimodal features",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node"],
      hackernews: ["GPT-5.1", "GPT 5.1"],
      smolai: ["GPT-5.1", "GPT 5.1"],
      reddit: ["GPT-5.1", "GPT 5.1"],
      openRouter: "openai/gpt-5.1",
      openWebUI: ["gpt-5.1"],
      lmsysArena: "gpt-5.1",
      semanticScholar: ["OpenAI GPT-5 System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["gpt-5", "openai-api"],
    }
  },
  // OpenAI - GPT-5.1-Codex-Max
  {
    id: "gpt-5-1-codex-max", name: "GPT-5.1-Codex-Max", category: "general_llm", company: "OpenAI",
    release_date: "2025-11-19", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "Extended thinking Codex variant of GPT-5.1 for complex coding tasks",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node", "openai/codex"],
      hackernews: ["GPT-5.1-Codex-Max", "GPT-5.1 Codex"],
      smolai: ["GPT-5.1-Codex-Max", "GPT-5.1 Codex"],
      reddit: ["GPT-5.1-Codex-Max", "GPT-5.1 Codex"],
      openRouter: "openai/gpt-5.1-codex-max",
      semanticScholar: ["OpenAI GPT-5 System Card"],
      cloudflareRadar: "chatgpt.com",
      stackoverflow: ["openai-codex"],
    }
  },
  // OpenAI - GPT-5.2-Codex
  {
    id: "gpt-5-2-codex", name: "GPT-5.2-Codex", category: "general_llm", company: "OpenAI",
    release_date: "2025-12-11", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "Coding-specialized variant of GPT-5.2 for agentic development",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node", "openai/codex"],
      hackernews: ["GPT-5.2-Codex", "GPT-5.2 Codex"],
      smolai: ["GPT-5.2-Codex", "GPT-5.2 Codex"],
      reddit: ["GPT-5.2-Codex", "GPT-5.2 Codex"],
      openRouter: "openai/gpt-5.2-codex",
      openWebUI: ["gpt-5.2-codex"],
      semanticScholar: ["OpenAI GPT-5 System Card"],
      stackoverflow: ["openai-codex"],
    }
  },
  // OpenAI - GPT-5.2-Pro
  {
    id: "gpt-5-2-pro", name: "GPT-5.2-Pro", category: "general_llm", company: "OpenAI",
    release_date: "2025-12-11", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "Pro tier of GPT-5.2 with extended capabilities for complex reasoning",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node"],
      hackernews: ["GPT-5.2-Pro", "GPT-5.2 Pro"],
      smolai: ["GPT-5.2-Pro", "GPT-5.2 Pro"],
      reddit: ["GPT-5.2-Pro", "GPT-5.2 Pro"],
      openRouter: "openai/gpt-5.2-pro",
      openWebUI: ["gpt-5.2-pro"],
      lmsysArena: "gpt-5.2-high",
      semanticScholar: ["OpenAI GPT-5 System Card"],
      stackoverflow: ["gpt-5", "openai-api"],
    }
  },
  // OpenAI - GPT Audio
  {
    id: "gpt-audio", name: "GPT Audio", category: "audio", company: "OpenAI",
    release_date: "2025-08-28", pricing_tier: "paid", availability: "API", open_source: 0,
    description: "OpenAI native audio model for natural speech generation and real-time conversation",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node"],
      hackernews: ["GPT Audio", "gpt-audio", "OpenAI audio model"],
      smolai: ["GPT Audio", "gpt-audio"],
      reddit: ["GPT Audio", "gpt-audio"],
      openRouter: "openai/gpt-audio",
      stackoverflow: ["openai-audio"],
    }
  },
  // OpenAI - GPT Audio Mini
  {
    id: "gpt-audio-mini", name: "GPT Audio Mini", category: "audio", company: "OpenAI",
    release_date: "2025-08-28", pricing_tier: "paid", availability: "API", open_source: 0,
    description: "Smaller GPT Audio variant for cost-effective audio tasks",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node"],
      hackernews: ["GPT Audio Mini", "gpt-audio-mini"],
      smolai: ["GPT Audio Mini", "gpt-audio-mini"],
      reddit: ["GPT Audio Mini", "gpt-audio-mini"],
      openRouter: "openai/gpt-audio-mini",
      stackoverflow: ["openai-audio"],
    }
  },

  // Google - Gemini 3.1 Flash
  {
    id: "gemini-31-flash", name: "Gemini 3.1 Flash", category: "general_llm", company: "Google",
    release_date: "2026-02-26", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Fast lightweight Gemini 3.1 variant with image generation capabilities",
    sources: {
      github: ["google-gemini/generative-ai-python"],
      hackernews: ["Gemini 3.1 Flash"],
      smolai: ["Gemini 3.1 Flash"],
      reddit: ["Gemini 3.1 Flash"],
      openRouter: "google/gemini-3.1-flash-image-preview",
      openWebUI: ["gemini-3.1-flash"],
      semanticScholar: ["Gemini: A Family of Highly Capable Multimodal Models"],
      stackoverflow: ["gemini-api"],
    }
  },

  // Mistral - Ministral 14B
  {
    id: "ministral-14b", name: "Ministral 14B", category: "general_llm", company: "Mistral AI",
    release_date: "2025-12-02", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Mistral 14B dense model with vision capabilities built via cascade distillation",
    sources: {
      huggingface: ["mistralai/Ministral-3-14B-Instruct-2512"],
      hackernews: ["Ministral 14B", "Ministral"],
      smolai: ["Ministral 14B"],
      reddit: ["Ministral 14B"],
      openRouter: "mistralai/ministral-14b-2512",
      cloudflareRadar: "mistral.ai",
      ollama: ["ministral"],
      stackoverflow: ["mistral"],
    }
  },
  // Mistral - Ministral 8B
  {
    id: "ministral-8b", name: "Ministral 8B", category: "general_llm", company: "Mistral AI",
    release_date: "2025-12-02", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Mistral 8B dense model for efficient edge and local deployment",
    sources: {
      huggingface: ["mistralai/Ministral-3-8B-Instruct-2512"],
      hackernews: ["Ministral 8B"],
      smolai: ["Ministral 8B"],
      reddit: ["Ministral 8B"],
      openRouter: "mistralai/ministral-8b-2512",
      lmsysArena: "ministral-8b-2410",
      hfLeaderboard: "mistralai/Ministral-8B-Instruct-2410",
      cloudflareRadar: "mistral.ai",
      ollama: ["ministral:8b"],
      stackoverflow: ["mistral"],
    }
  },
  // Mistral - Ministral 3B
  {
    id: "ministral-3b", name: "Ministral 3B", category: "general_llm", company: "Mistral AI",
    release_date: "2025-12-02", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Smallest Mistral 3 model for ultra-lightweight deployment",
    sources: {
      huggingface: ["mistralai/Ministral-3-3B-Instruct-2512"],
      hackernews: ["Ministral 3B"],
      smolai: ["Ministral 3B"],
      reddit: ["Ministral 3B"],
      openRouter: "mistralai/ministral-3b-2512",
      cloudflareRadar: "mistral.ai",
      ollama: ["ministral:3b"],
      stackoverflow: ["mistral"],
    }
  },
  // Mistral - Devstral 2
  {
    id: "devstral-2", name: "Devstral 2", category: "general_llm", company: "Mistral AI",
    release_date: "2025-12-09", pricing_tier: "freemium", availability: "API", open_source: 1,
    description: "123B dense coding model with 256K context, 73% on SWE-bench Verified",
    sources: {
      huggingface: ["mistralai/Devstral-2-123B-Instruct-2512"],
      hackernews: ["Devstral 2", "Devstral"],
      smolai: ["Devstral 2", "Devstral"],
      reddit: ["Devstral 2", "Devstral"],
      openRouter: "mistralai/devstral-2512",
      cloudflareRadar: "mistral.ai",
      ollama: ["devstral"],
      stackoverflow: ["mistral", "devstral"],
    }
  },
  // Mistral - Mistral Small Creative
  {
    id: "mistral-small-creative", name: "Mistral Small Creative", category: "general_llm", company: "Mistral AI",
    release_date: "2025-12-16", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Experimental small model for creative writing, roleplay and narrative generation",
    sources: {
      hackernews: ["Mistral Small Creative"],
      smolai: ["Mistral Small Creative"],
      reddit: ["Mistral Small Creative"],
      openRouter: "mistralai/mistral-small-creative",
      cloudflareRadar: "mistral.ai",
      stackoverflow: ["mistral"],
    }
  },

  // Qwen 3.5 series
  {
    id: "qwen-35-397b", name: "Qwen 3.5 397B", category: "general_llm", company: "Alibaba",
    release_date: "2026-02-16", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Alibaba flagship open-weight agentic model with 397B params (17B active MoE)",
    sources: {
      github: ["QwenLM/Qwen3.5"],
      huggingface: ["Qwen/Qwen3.5-397B-A17B"],
      hackernews: ["Qwen 3.5", "Qwen3.5"],
      smolai: ["Qwen 3.5", "Qwen3.5"],
      reddit: ["Qwen 3.5", "Qwen3.5"],
      openRouter: "qwen/qwen3.5-397b-a17b",
      lmsysArena: "qwen3.5-397b-a17b",
      semanticScholar: ["Qwen3 Technical Report"],
      ollama: ["qwen3.5:397b"],
      stackoverflow: ["qwen"],
    }
  },
  {
    id: "qwen-35-plus", name: "Qwen 3.5 Plus", category: "general_llm", company: "Alibaba",
    release_date: "2026-02-16", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Hosted Qwen 3.5 with 1M context window and built-in tools",
    sources: {
      hackernews: ["Qwen 3.5 Plus", "Qwen3.5-Plus"],
      smolai: ["Qwen 3.5 Plus"],
      reddit: ["Qwen 3.5 Plus"],
      openRouter: "qwen/qwen3.5-plus",
      stackoverflow: ["qwen"],
    }
  },
  {
    id: "qwen-35-122b", name: "Qwen 3.5 122B", category: "general_llm", company: "Alibaba",
    release_date: "2026-02-16", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Mid-size Qwen 3.5 MoE model with 122B params (10B active)",
    sources: {
      huggingface: ["Qwen/Qwen3.5-122B-A10B"],
      hackernews: ["Qwen 3.5 122B"],
      smolai: ["Qwen 3.5 122B"],
      reddit: ["Qwen 3.5 122B"],
      openRouter: "qwen/qwen3.5-122b-a10b",
      stackoverflow: ["qwen"],
    }
  },
  {
    id: "qwen-35-35b", name: "Qwen 3.5 35B", category: "general_llm", company: "Alibaba",
    release_date: "2026-02-24", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Compact multimodal Qwen 3.5 MoE model with 35B params (3B active)",
    sources: {
      huggingface: ["Qwen/Qwen3.5-35B-A3B"],
      hackernews: ["Qwen 3.5 35B"],
      smolai: ["Qwen 3.5 35B"],
      reddit: ["Qwen 3.5 35B"],
      openRouter: "qwen/qwen3.5-35b-a3b",
      stackoverflow: ["qwen"],
    }
  },
  {
    id: "qwen-35-27b", name: "Qwen 3.5 27B", category: "general_llm", company: "Alibaba",
    release_date: "2026-02-16", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Dense 27B Qwen 3.5 model for efficient deployment",
    sources: {
      huggingface: ["Qwen/Qwen3.5-27B"],
      hackernews: ["Qwen 3.5 27B"],
      smolai: ["Qwen 3.5 27B"],
      reddit: ["Qwen 3.5 27B"],
      openRouter: "qwen/qwen3.5-27b",
      ollama: ["qwen3.5:27b"],
      stackoverflow: ["qwen"],
    }
  },
  {
    id: "qwen-35-flash", name: "Qwen 3.5 Flash", category: "general_llm", company: "Alibaba",
    release_date: "2026-02-16", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Fast lightweight Qwen 3.5 variant optimized for speed",
    sources: {
      hackernews: ["Qwen 3.5 Flash"],
      smolai: ["Qwen 3.5 Flash"],
      reddit: ["Qwen 3.5 Flash"],
      openRouter: "qwen/qwen3.5-flash",
      stackoverflow: ["qwen"],
    }
  },
  // Qwen 3 - Coder Next / Max Thinking
  {
    id: "qwen3-coder-next", name: "Qwen 3 Coder Next", category: "general_llm", company: "Alibaba",
    release_date: "2025-12-01", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Alibaba coding-specialized model built on Qwen 3 architecture",
    sources: {
      hackernews: ["Qwen 3 Coder", "Qwen3 Coder"],
      smolai: ["Qwen 3 Coder"],
      reddit: ["Qwen 3 Coder"],
      openRouter: "qwen/qwen3-coder-next",
      stackoverflow: ["qwen"],
    }
  },
  {
    id: "qwen3-max-thinking", name: "Qwen 3 Max Thinking", category: "general_llm", company: "Alibaba",
    release_date: "2025-12-01", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Extended reasoning variant of Qwen 3 Max with chain-of-thought",
    sources: {
      hackernews: ["Qwen 3 Max"],
      smolai: ["Qwen 3 Max"],
      reddit: ["Qwen 3 Max"],
      openRouter: "qwen/qwen3-max-thinking",
      stackoverflow: ["qwen"],
    }
  },

  // DeepSeek V3.2 Speciale
  {
    id: "deepseek-v3-2-speciale", name: "DeepSeek V3.2 Speciale", category: "general_llm", company: "DeepSeek",
    release_date: "2025-12-01", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Enhanced variant of DeepSeek V3.2 with improved capabilities",
    sources: {
      hackernews: ["DeepSeek V3.2 Speciale"],
      smolai: ["DeepSeek V3.2 Speciale"],
      reddit: ["DeepSeek V3.2 Speciale"],
      openRouter: "deepseek/deepseek-v3.2-speciale",
      lmsysArena: "deepseek-v3.2-exp",
      cloudflareRadar: "deepseek.com",
      stackoverflow: ["deepseek"],
    }
  },

  // ByteDance Seed models
  {
    id: "seed-20-mini", name: "Seed 2.0 Mini", category: "general_llm", company: "ByteDance",
    release_date: "2026-02-10", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "ByteDance compact agent model from the Seed 2.0 series",
    sources: {
      hackernews: ["ByteDance Seed", "Seed 2.0"],
      smolai: ["ByteDance Seed", "Seed 2.0"],
      reddit: ["ByteDance Seed", "Seed 2.0"],
      openRouter: "bytedance/seed-2.0-mini",
      lmsysArena: "dola-seed-2.0-preview",
      stackoverflow: ["bytedance-seed"],
    }
  },
  {
    id: "seed-16", name: "Seed 1.6", category: "general_llm", company: "ByteDance",
    release_date: "2025-10-01", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "ByteDance general-purpose language model",
    sources: {
      hackernews: ["ByteDance Seed 1.6", "Seed 1.6"],
      smolai: ["Seed 1.6"],
      reddit: ["Seed 1.6"],
      openRouter: "bytedance/seed-1.6",
      stackoverflow: ["bytedance-seed"],
    }
  },
  {
    id: "seed-16-flash", name: "Seed 1.6 Flash", category: "general_llm", company: "ByteDance",
    release_date: "2025-10-01", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Fast lightweight variant of ByteDance Seed 1.6",
    sources: {
      hackernews: ["Seed 1.6 Flash"],
      smolai: ["Seed 1.6 Flash"],
      reddit: ["Seed 1.6 Flash"],
      openRouter: "bytedance/seed-1.6-flash",
      stackoverflow: ["bytedance-seed"],
    }
  },

  // MiniMax M2.1
  {
    id: "minimax-m21", name: "MiniMax M2.1", category: "general_llm", company: "MiniMax",
    release_date: "2025-12-23", pricing_tier: "freemium", availability: "API", open_source: 1,
    description: "Enhanced multi-language programming model for real-world complex tasks",
    sources: {
      huggingface: ["MiniMaxAI/MiniMax-M2.1"],
      hackernews: ["MiniMax M2.1"],
      smolai: ["MiniMax M2.1"],
      reddit: ["MiniMax M2.1"],
      openRouter: "minimax/minimax-m2.1",
      lmsysArena: "minimax-m2.1-preview",
      cloudflareRadar: "minimax.io",
      stackoverflow: ["minimax"],
    }
  },

  // GLM newer versions
  {
    id: "glm-47", name: "GLM-4.7", category: "general_llm", company: "Zhipu AI",
    release_date: "2025-12-22", pricing_tier: "free", availability: "API", open_source: 1,
    description: "400B open-weight model with 200K context, 73.8% SWE-bench Verified",
    sources: {
      github: ["THUDM/GLM-4"],
      hackernews: ["GLM-4.7", "GLM 4.7"],
      smolai: ["GLM-4.7", "GLM 4.7"],
      reddit: ["GLM-4.7", "GLM 4.7"],
      openRouter: "z-ai/glm-4.7",
      lmsysArena: "glm-4.7",
      stackoverflow: ["glm", "chatglm"],
    }
  },
  {
    id: "glm-47-flash", name: "GLM-4.7 Flash", category: "general_llm", company: "Zhipu AI",
    release_date: "2025-12-22", pricing_tier: "free", availability: "API", open_source: 1,
    description: "Fast lightweight variant of GLM-4.7",
    sources: {
      hackernews: ["GLM-4.7 Flash"],
      smolai: ["GLM-4.7 Flash"],
      reddit: ["GLM-4.7 Flash"],
      openRouter: "z-ai/glm-4.7-flash",
      lmsysArena: "glm-4.7-flash",
      stackoverflow: ["glm", "chatglm"],
    }
  },

  // Amazon Nova
  {
    id: "amazon-nova-2-lite", name: "Amazon Nova 2 Lite", category: "general_llm", company: "Amazon",
    release_date: "2025-12-01", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Amazon lightweight multimodal model for cost-effective tasks",
    sources: {
      hackernews: ["Amazon Nova", "Nova 2 Lite"],
      smolai: ["Amazon Nova"],
      reddit: ["Amazon Nova"],
      openRouter: "amazon/nova-2-lite-v1",
      stackoverflow: ["amazon-nova"],
    }
  },
];

function flattenSources(entityId: string, sources: Record<string, string | string[] | null>): { source_type: string; source_value: string }[] {
  const rows: { source_type: string; source_value: string }[] = [];
  for (const [type, value] of Object.entries(sources)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        rows.push({ source_type: type, source_value: v });
      }
    } else {
      rows.push({ source_type: type, source_value: value });
    }
  }
  return rows;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await ensureDb();
    let entitiesInserted = 0;
    let sourcesInserted = 0;

    // Insert entities
    const entityStmts: { sql: string; args: any[] }[] = [];
    for (const e of SEED_ENTITIES) {
      entityStmts.push({
        sql: `INSERT OR IGNORE INTO entities (id, name, category, company, release_date, pricing_tier, availability, open_source, description, logo_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
        args: [e.id, e.name, e.category, e.company, e.release_date, e.pricing_tier, e.availability, e.open_source, e.description],
      });
    }
    await db.batch(entityStmts, 'write');
    entitiesInserted = SEED_ENTITIES.length;

    // Insert sources
    const sourceStmts: { sql: string; args: any[] }[] = [];
    for (const e of SEED_ENTITIES) {
      const rows = flattenSources(e.id, e.sources);
      for (const r of rows) {
        sourceStmts.push({
          sql: `INSERT OR IGNORE INTO entity_sources (entity_id, source_type, source_value) VALUES (?, ?, ?)`,
          args: [e.id, r.source_type, r.source_value],
        });
        sourcesInserted++;
      }
    }
    await db.batch(sourceStmts, 'write');

    invalidateRegistryCache();

    return NextResponse.json({
      success: true,
      entitiesInserted,
      sourcesInserted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
