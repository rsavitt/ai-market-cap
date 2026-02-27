import { entityRegistry } from '../entity-registry';

interface GitHubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

export async function collectGitHub(): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  for (const entity of entityRegistry) {
    if (!entity.sources.github) continue;

    let totalStars = 0;

    for (const repo of entity.sources.github) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repo}`,
          { headers, signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) continue;

        const data = await res.json() as GitHubRepo;
        totalStars += data.stargazers_count ?? 0;
      } catch {
        // Skip failed repos
      }
    }

    if (totalStars > 0) {
      results.set(entity.id, totalStars);
    }
  }

  return results;
}
