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
      reddit: ["GitHub Copilot", "Copilot coding"],
    }
  },
  {
    id: "cursor", name: "Cursor", category: "coding", company: "Anysphere",
    release_date: "2024-03-15", pricing_tier: "freemium", availability: "Web,IDE", open_source: 0,
    description: "AI-first code editor with deep codebase understanding",
    sources: {
      github: ["getcursor/cursor"],
      hackernews: ["Cursor AI", "Cursor editor", "Cursor IDE"],
      reddit: ["Cursor AI", "Cursor editor"],
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
      reddit: ["Claude Code", "claude code CLI"],
    }
  },
  {
    id: "gpt4o-coding", name: "GPT-4o (Coding)", category: "coding", company: "OpenAI",
    release_date: "2024-05-13", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "GPT-4o optimized for code generation and review",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node"],
      hackernews: ["GPT-4o coding", "GPT-4o code"],
      reddit: ["GPT-4o coding", "GPT-4o code"],
      artificialAnalysis: "gpt-4o",
      openRouter: "openai/gpt-4o",
      semanticScholar: "GPT-4o system card",
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
      reddit: ["DeepSeek Coder", "DeepSeek coding"],
      artificialAnalysis: "deepseek-coder-v3",
      semanticScholar: "DeepSeek-Coder-V2",
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
      reddit: ["Codex CLI", "OpenAI Codex"],
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
      reddit: ["Gemini Code Assist"],
    }
  },
  {
    id: "windsurf", name: "Windsurf", category: "coding", company: "Codeium",
    release_date: "2024-11-13", pricing_tier: "freemium", availability: "IDE", open_source: 0,
    description: "Agentic IDE with Cascade flow system",
    sources: {
      hackernews: ["Windsurf", "Codeium Windsurf"],
      reddit: ["Windsurf IDE", "Windsurf editor"],
    }
  },
  {
    id: "amazon-q-developer", name: "Amazon Q Developer", category: "coding", company: "Amazon",
    release_date: "2024-04-30", pricing_tier: "freemium", availability: "API,IDE", open_source: 0,
    description: "AWS-integrated AI coding assistant",
    sources: {
      hackernews: ["Amazon Q Developer", "Amazon Q"],
      reddit: ["Amazon Q Developer"],
    }
  },
  {
    id: "tabnine", name: "Tabnine", category: "coding", company: "Tabnine",
    release_date: "2023-08-01", pricing_tier: "freemium", availability: "IDE", open_source: 0,
    description: "Privacy-focused AI code completion",
    sources: {
      hackernews: ["Tabnine"],
      reddit: ["Tabnine"],
    }
  },
  {
    id: "devin", name: "Devin", category: "coding", company: "Cognition",
    release_date: "2025-03-12", pricing_tier: "paid", availability: "Web", open_source: 0,
    description: "Autonomous AI software engineer",
    sources: {
      hackernews: ["Devin AI", "Cognition Devin"],
      reddit: ["Devin AI", "Cognition Devin"],
    }
  },

  // ── IMAGE ──
  {
    id: "midjourney-v6", name: "Midjourney v6.1", category: "image", company: "Midjourney",
    release_date: "2024-07-30", pricing_tier: "paid", availability: "Web", open_source: 0,
    description: "Leading AI image generation via Discord and web",
    sources: {
      hackernews: ["Midjourney"],
      reddit: ["Midjourney"],
      semanticScholar: "Midjourney",
    }
  },
  {
    id: "dall-e-3", name: "DALL-E 3", category: "image", company: "OpenAI",
    release_date: "2023-10-03", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Text-to-image model integrated with ChatGPT",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      hackernews: ["DALL-E 3", "DALL-E"],
      reddit: ["DALL-E 3", "DALLE 3"],
      semanticScholar: "DALL-E 3 improving image generation with better captions",
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
      reddit: ["Flux AI", "FLUX model"],
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
      reddit: ["Stable Diffusion 3.5", "SD3.5"],
      semanticScholar: "Scaling rectified flow transformers for high-resolution image synthesis",
    }
  },
  {
    id: "ideogram-2", name: "Ideogram 2.0", category: "image", company: "Ideogram",
    release_date: "2024-08-19", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Best-in-class text rendering in AI images",
    sources: {
      hackernews: ["Ideogram"],
      reddit: ["Ideogram"],
    }
  },
  {
    id: "imagen-3", name: "Google Imagen 3", category: "image", company: "Google",
    release_date: "2024-08-01", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Google highest quality image generation model",
    sources: {
      pypi: ["google-generativeai"], npm: ["@google/generative-ai"],
      hackernews: ["Imagen 3", "Google Imagen"],
      reddit: ["Imagen 3", "Google Imagen"],
      semanticScholar: "Imagen 3",
    }
  },
  {
    id: "adobe-firefly-3", name: "Adobe Firefly 3", category: "image", company: "Adobe",
    release_date: "2024-04-23", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "Commercially safe AI image generation",
    sources: {
      hackernews: ["Adobe Firefly"],
      reddit: ["Adobe Firefly"],
    }
  },
  {
    id: "leonardo-ai", name: "Leonardo AI", category: "image", company: "Leonardo AI",
    release_date: "2024-03-01", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Production-quality image generation platform",
    sources: {
      hackernews: ["Leonardo AI"],
      reddit: ["Leonardo AI"],
    }
  },
  {
    id: "recraft-v3", name: "Recraft V3", category: "image", company: "Recraft",
    release_date: "2024-10-29", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Professional design-focused image generation",
    sources: {
      hackernews: ["Recraft"],
      reddit: ["Recraft"],
    }
  },
  {
    id: "playground-v3", name: "Playground v3", category: "image", company: "Playground AI",
    release_date: "2024-11-05", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "Consumer-friendly AI image generation",
    sources: {
      hackernews: ["Playground AI"],
      reddit: ["Playground AI"],
    }
  },

  // ── VIDEO ──
  {
    id: "sora", name: "Sora", category: "video", company: "OpenAI",
    release_date: "2025-02-10", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "Text-to-video model with world simulation",
    sources: {
      hackernews: ["Sora", "OpenAI Sora"],
      reddit: ["Sora", "OpenAI Sora"],
      semanticScholar: "Video generation models as world simulators",
    }
  },
  {
    id: "runway-gen3", name: "Runway Gen-3 Alpha", category: "video", company: "Runway",
    release_date: "2024-06-17", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "Professional AI video generation and editing",
    sources: {
      hackernews: ["Runway Gen-3", "Runway AI"],
      reddit: ["Runway Gen-3", "Runway AI"],
    }
  },
  {
    id: "kling-1-6", name: "Kling 1.6", category: "video", company: "Kuaishou",
    release_date: "2024-12-10", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "High-quality video generation from China",
    sources: {
      hackernews: ["Kling video", "Kling AI"],
      reddit: ["Kling AI", "Kling video"],
    }
  },
  {
    id: "pika-2", name: "Pika 2.0", category: "video", company: "Pika Labs",
    release_date: "2024-11-27", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "Consumer video generation with scene effects",
    sources: {
      hackernews: ["Pika Labs", "Pika AI"],
      reddit: ["Pika Labs", "Pika AI"],
    }
  },
  {
    id: "veo-2", name: "Veo 2", category: "video", company: "Google",
    release_date: "2024-12-16", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "Google latest video generation model",
    sources: {
      hackernews: ["Veo 2", "Google Veo"],
      reddit: ["Veo 2", "Google Veo"],
    }
  },
  {
    id: "minimax-video", name: "Minimax Video-01", category: "video", company: "MiniMax",
    release_date: "2024-12-05", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Long-form video generation with HaiLuo",
    sources: {
      hackernews: ["MiniMax video", "MiniMax AI"],
      reddit: ["MiniMax AI"],
    }
  },
  {
    id: "luma-dream-machine", name: "Luma Dream Machine", category: "video", company: "Luma AI",
    release_date: "2024-06-12", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Fast high-quality video generation",
    sources: {
      hackernews: ["Luma Dream Machine", "Luma AI"],
      reddit: ["Luma Dream Machine", "Luma AI"],
    }
  },
  {
    id: "hailuo-ai", name: "HaiLuo AI", category: "video", company: "MiniMax",
    release_date: "2024-09-22", pricing_tier: "free", availability: "Web", open_source: 0,
    description: "Free video generation with long clip support",
    sources: {
      hackernews: ["HaiLuo"],
      reddit: ["HaiLuo AI"],
    }
  },
  {
    id: "synthesia", name: "Synthesia", category: "video", company: "Synthesia",
    release_date: "2024-06-01", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "AI avatar video platform for enterprise",
    sources: {
      hackernews: ["Synthesia"],
      reddit: ["Synthesia"],
    }
  },
  {
    id: "invideo-ai", name: "Invideo AI", category: "video", company: "Invideo",
    release_date: "2024-05-15", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "AI-powered video creation from text prompts",
    sources: {
      hackernews: ["Invideo AI"],
      reddit: ["Invideo AI"],
    }
  },

  // ── AUDIO ──
  {
    id: "elevenlabs", name: "ElevenLabs", category: "audio", company: "ElevenLabs",
    release_date: "2024-01-01", pricing_tier: "freemium", availability: "Web,API", open_source: 0,
    description: "Leading AI voice synthesis and cloning platform",
    sources: {
      pypi: ["elevenlabs"],
      github: ["elevenlabs/elevenlabs-python"],
      hackernews: ["ElevenLabs"],
      reddit: ["ElevenLabs"],
    }
  },
  {
    id: "suno", name: "Suno", category: "audio", company: "Suno AI",
    release_date: "2024-03-22", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "AI music generation from text prompts",
    sources: {
      hackernews: ["Suno AI", "Suno music"],
      reddit: ["Suno AI", "Suno music"],
    }
  },
  {
    id: "udio", name: "Udio", category: "audio", company: "Udio",
    release_date: "2024-04-10", pricing_tier: "freemium", availability: "Web", open_source: 0,
    description: "AI music generation with high-fidelity audio",
    sources: {
      hackernews: ["Udio"],
      reddit: ["Udio"],
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
      reddit: ["Whisper OpenAI"],
      semanticScholar: "Robust Speech Recognition via Large-Scale Weak Supervision",
    }
  },
  {
    id: "notebooklm", name: "NotebookLM", category: "audio", company: "Google",
    release_date: "2024-09-11", pricing_tier: "free", availability: "Web", open_source: 0,
    description: "AI research assistant with audio overview podcasts",
    sources: {
      hackernews: ["NotebookLM"],
      reddit: ["NotebookLM"],
    }
  },

  // ── GENERAL LLMs ──
  {
    id: "gpt-4o", name: "GPT-4o", category: "general_llm", company: "OpenAI",
    release_date: "2024-05-13", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "OpenAI flagship multimodal model",
    sources: {
      pypi: ["openai"], npm: ["openai"],
      github: ["openai/openai-python", "openai/openai-node"],
      hackernews: ["GPT-4o", "GPT4o"],
      reddit: ["GPT-4o", "GPT4o"],
      artificialAnalysis: "gpt-4o",
      openRouter: "openai/gpt-4o",
      semanticScholar: "GPT-4o system card",
    }
  },
  {
    id: "claude-35-sonnet", name: "Claude 3.5 Sonnet", category: "general_llm", company: "Anthropic",
    release_date: "2024-10-22", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "Anthropic most capable and balanced model",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude 3.5 Sonnet", "Claude Sonnet"],
      reddit: ["Claude 3.5 Sonnet", "Claude Sonnet"],
      artificialAnalysis: "claude-3-5-sonnet",
      openRouter: "anthropic/claude-3.5-sonnet",
      semanticScholar: "The Claude 3 Model Family",
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
      reddit: ["Gemini 2.0 Flash", "Gemini Flash"],
      artificialAnalysis: "gemini-2-0-flash",
      openRouter: "google/gemini-2.0-flash-001",
      semanticScholar: "Gemini: A Family of Highly Capable Multimodal Models",
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
      reddit: ["DeepSeek V3", "DeepSeek-V3"],
      artificialAnalysis: "deepseek-v3",
      openRouter: "deepseek/deepseek-chat",
      semanticScholar: "DeepSeek-V3 Technical Report",
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
      reddit: ["Llama 3.3", "Llama 3"],
      artificialAnalysis: "llama-3-3-70b",
      openRouter: "meta-llama/llama-3.3-70b-instruct",
      semanticScholar: "The Llama 3 Herd of Models",
    }
  },
  {
    id: "grok-3", name: "Grok 3", category: "general_llm", company: "xAI",
    release_date: "2025-02-17", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "xAI latest model trained on Colossus cluster",
    sources: {
      hackernews: ["Grok 3", "Grok xAI"],
      reddit: ["Grok 3", "xAI Grok"],
      artificialAnalysis: "grok-3",
      openRouter: "x-ai/grok-3",
    }
  },
  {
    id: "mistral-large-2", name: "Mistral Large 2", category: "general_llm", company: "Mistral AI",
    release_date: "2024-07-24", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "128k context flagship model from Mistral",
    sources: {
      pypi: ["mistralai"], npm: ["@mistralai/mistralai"],
      github: ["mistralai/mistral-inference"],
      hackernews: ["Mistral Large", "Mistral AI"],
      reddit: ["Mistral Large", "Mistral AI"],
      artificialAnalysis: "mistral-large-2",
      openRouter: "mistralai/mistral-large",
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
      reddit: ["Qwen 2.5", "Qwen"],
      artificialAnalysis: "qwen-2-5-72b",
      openRouter: "qwen/qwen-2.5-72b-instruct",
      semanticScholar: "Qwen2 Technical Report",
    }
  },
  {
    id: "perplexity", name: "Perplexity", category: "general_llm", company: "Perplexity AI",
    release_date: "2024-11-15", pricing_tier: "freemium", availability: "Web,Mobile,API", open_source: 0,
    description: "AI-powered answer engine with real-time search",
    sources: {
      hackernews: ["Perplexity AI", "Perplexity"],
      reddit: ["Perplexity AI", "Perplexity"],
    }
  },
  {
    id: "command-r-plus", name: "Command R+", category: "general_llm", company: "Cohere",
    release_date: "2024-04-04", pricing_tier: "freemium", availability: "API", open_source: 0,
    description: "Enterprise-focused RAG-optimized LLM",
    sources: {
      pypi: ["cohere"], npm: ["cohere-ai"],
      hackernews: ["Command R+", "Cohere"],
      reddit: ["Command R+", "Cohere"],
      artificialAnalysis: "command-r-plus",
      openRouter: "cohere/command-r-plus",
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
      reddit: ["GPT-4.5", "GPT 4.5"],
      artificialAnalysis: "gpt-4-5",
      openRouter: "openai/gpt-4.5-preview",
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
      reddit: ["Claude 3.7 Sonnet", "Claude 3.7"],
      artificialAnalysis: "claude-3-7-sonnet",
      openRouter: "anthropic/claude-3.7-sonnet",
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
      reddit: ["Claude Sonnet 4", "Claude 4"],
      artificialAnalysis: "claude-sonnet-4",
      openRouter: "anthropic/claude-sonnet-4",
    }
  },
  {
    id: "claude-opus-4-6", name: "Claude Opus 4.6", category: "general_llm", company: "Anthropic",
    release_date: "2025-10-01", pricing_tier: "paid", availability: "API,Web", open_source: 0,
    description: "Anthropic most capable model for complex reasoning and coding",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude Opus", "Claude Opus 4"],
      reddit: ["Claude Opus", "Claude Opus 4"],
      artificialAnalysis: "claude-opus-4",
      openRouter: "anthropic/claude-opus-4",
    }
  },
  {
    id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", category: "general_llm", company: "Anthropic",
    release_date: "2025-10-01", pricing_tier: "freemium", availability: "API,Web,Mobile", open_source: 0,
    description: "Fast and capable model balancing performance and cost",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude Sonnet 4.6", "Claude Sonnet"],
      reddit: ["Claude Sonnet 4.6"],
      artificialAnalysis: "claude-sonnet-4-6",
      openRouter: "anthropic/claude-sonnet-4-6",
    }
  },
  {
    id: "claude-haiku-4-5", name: "Claude Haiku 4.5", category: "general_llm", company: "Anthropic",
    release_date: "2025-10-01", pricing_tier: "freemium", availability: "API,Web", open_source: 0,
    description: "Anthropic fastest and most affordable model",
    sources: {
      pypi: ["anthropic"], npm: ["@anthropic-ai/sdk"],
      github: ["anthropics/anthropic-sdk-python", "anthropics/anthropic-sdk-typescript"],
      hackernews: ["Claude Haiku", "Claude Haiku 4"],
      reddit: ["Claude Haiku"],
      artificialAnalysis: "claude-haiku-4-5",
      openRouter: "anthropic/claude-haiku-4-5",
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
      reddit: ["Gemini 2.5 Pro", "Gemini 2.5"],
      artificialAnalysis: "gemini-2-5-pro",
      openRouter: "google/gemini-2.5-pro-preview-03-25",
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
      reddit: ["Llama 4", "Llama 4 Scout"],
      artificialAnalysis: "llama-4-scout",
      openRouter: "meta-llama/llama-4-scout",
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
      reddit: ["DeepSeek R1", "DeepSeek-R1"],
      artificialAnalysis: "deepseek-r1",
      openRouter: "deepseek/deepseek-r1",
      semanticScholar: "DeepSeek-R1",
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
      reddit: ["OpenAI o3", "o3 model"],
      artificialAnalysis: "o3",
      openRouter: "openai/o3",
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
      reddit: ["o3-mini", "o3 mini"],
      artificialAnalysis: "o3-mini",
      openRouter: "openai/o3-mini",
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
      reddit: ["GPT-5", "GPT 5.2"],
      artificialAnalysis: "gpt-5-2",
      openRouter: "openai/gpt-5.2",
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
      reddit: ["Gemini 3", "Gemini 3 Pro"],
      artificialAnalysis: "gemini-3-pro",
      openRouter: "google/gemini-3-pro",
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
      reddit: ["DeepSeek V3.2"],
      artificialAnalysis: "deepseek-v3-2",
      openRouter: "deepseek/deepseek-chat-v3-0324",
    }
  },
  {
    id: "mistral-large-3", name: "Mistral Large 3", category: "general_llm", company: "Mistral AI",
    release_date: "2025-07-01", pricing_tier: "freemium", availability: "API,Web", open_source: 1,
    description: "Sparse MoE with 41B active parameters under Apache 2.0",
    sources: {
      pypi: ["mistralai"], npm: ["@mistralai/mistralai"],
      github: ["mistralai/mistral-inference"],
      hackernews: ["Mistral Large 3", "Mistral AI"],
      reddit: ["Mistral Large 3"],
      artificialAnalysis: "mistral-large-3",
      openRouter: "mistralai/mistral-large-3",
    }
  },
  {
    id: "grok-4", name: "Grok 4", category: "general_llm", company: "xAI",
    release_date: "2025-07-01", pricing_tier: "paid", availability: "Web,API", open_source: 0,
    description: "xAI latest model with strong agentic tool-calling capabilities",
    sources: {
      hackernews: ["Grok 4", "xAI Grok 4"],
      reddit: ["Grok 4", "xAI Grok"],
      artificialAnalysis: "grok-4",
      openRouter: "x-ai/grok-4",
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
