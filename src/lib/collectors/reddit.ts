import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

interface RedditResponse {
  data: {
    children: { data: { score: number; num_comments: number } }[];
    dist: number;
  };
}

let accessToken: string | null = null;
let tokenExpiry = 0;

async function getRedditToken(): Promise<string | null> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ai-market-cap/1.0',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json() as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return accessToken;
  } catch {
    return null;
  }
}

export async function collectReddit(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  const token = await getRedditToken();
  if (!token) return results; // Skip if no credentials

  const BATCH_SIZE = 5;

  async function processEntity(entity: typeof entityRegistry[number]) {
    let totalScore = 0;
    let totalPosts = 0;

    for (const query of entity.sources.reddit) {
      try {
        const params = new URLSearchParams({
          q: `${query} subreddit:MachineLearning OR subreddit:artificial OR subreddit:LocalLLaMA OR subreddit:ChatGPT`,
          sort: 'new',
          t: 'week',
          limit: '25',
        });
        const res = await fetchWithRetry(
          `https://oauth.reddit.com/search?${params}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'ai-market-cap/1.0',
            },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!res.ok) continue;

        const data = await res.json() as RedditResponse;
        totalPosts += data.data?.dist ?? 0;
        for (const child of data.data?.children ?? []) {
          totalScore += child.data?.score ?? 0;
        }
      } catch {
        // Skip failed queries
      }
    }

    const signal = totalScore + totalPosts * 5;
    if (signal > 0) {
      results.set(entity.id, signal);
    }
  }

  for (let i = 0; i < entityRegistry.length; i += BATCH_SIZE) {
    const batch = entityRegistry.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(processEntity));
    if (i + BATCH_SIZE < entityRegistry.length) {
      await delay(200);
    }
  }

  return results;
}
