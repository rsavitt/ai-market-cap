import { getAllEntities, getAllEntitySources, type Entity, type EntitySourceRow } from './db';

export interface EntitySources {
  pypi: string[] | null;
  npm: string[] | null;
  github: string[] | null;
  huggingface: string[] | null;
  hackernews: string[];
  reddit: string[];
  openRouter: string | null;
  semanticScholar: string[];
  groq: string | null;
  artificialAnalysis: string | null;
  smolai: string[];
  openWebUI: string[];
}

export interface RegisteredEntity {
  id: string;
  name: string;
  category: string;
  company: string;
  release_date: string;
  pricing_tier: string;
  availability: string;
  open_source: number;
  description: string;
  sources: EntitySources;
}

// Module-level cache
let cachedRegistry: RegisteredEntity[] | null = null;

function assembleSourcesFromRows(rows: EntitySourceRow[]): EntitySources {
  const sources: EntitySources = {
    pypi: null,
    npm: null,
    github: null,
    huggingface: null,
    hackernews: [],
    reddit: [],
    openRouter: null,
    semanticScholar: [],
    groq: null,
    artificialAnalysis: null,
    smolai: [],
    openWebUI: [],
  };

  for (const row of rows) {
    switch (row.source_type) {
      case 'pypi':
        if (!sources.pypi) sources.pypi = [];
        sources.pypi.push(row.source_value);
        break;
      case 'npm':
        if (!sources.npm) sources.npm = [];
        sources.npm.push(row.source_value);
        break;
      case 'github':
        if (!sources.github) sources.github = [];
        sources.github.push(row.source_value);
        break;
      case 'huggingface':
        if (!sources.huggingface) sources.huggingface = [];
        sources.huggingface.push(row.source_value);
        break;
      case 'hackernews':
        sources.hackernews.push(row.source_value);
        break;
      case 'reddit':
        sources.reddit.push(row.source_value);
        break;
      case 'openRouter':
        sources.openRouter = row.source_value;
        break;
      case 'semanticScholar':
        sources.semanticScholar.push(row.source_value);
        break;
      case 'groq':
        sources.groq = row.source_value;
        break;
      case 'artificialAnalysis':
        sources.artificialAnalysis = row.source_value;
        break;
      case 'smolai':
        sources.smolai.push(row.source_value);
        break;
      case 'openWebUI':
        sources.openWebUI.push(row.source_value);
        break;
    }
  }

  return sources;
}

async function loadRegistry(): Promise<RegisteredEntity[]> {
  const [entities, allSources] = await Promise.all([
    getAllEntities(),
    getAllEntitySources(),
  ]);

  // Group sources by entity_id
  const sourcesByEntity = new Map<string, EntitySourceRow[]>();
  for (const s of allSources) {
    if (!sourcesByEntity.has(s.entity_id)) sourcesByEntity.set(s.entity_id, []);
    sourcesByEntity.get(s.entity_id)!.push(s);
  }

  return entities.map((e: Entity) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    company: e.company,
    release_date: e.release_date,
    pricing_tier: e.pricing_tier,
    availability: e.availability,
    open_source: e.open_source,
    description: e.description,
    sources: assembleSourcesFromRows(sourcesByEntity.get(e.id) ?? []),
  }));
}

export function invalidateRegistryCache(): void {
  cachedRegistry = null;
}

export async function getEntityRegistry(): Promise<RegisteredEntity[]> {
  if (cachedRegistry) return cachedRegistry;
  cachedRegistry = await loadRegistry();
  return cachedRegistry;
}

export async function getEntity(id: string): Promise<RegisteredEntity | undefined> {
  const registry = await getEntityRegistry();
  return registry.find(e => e.id === id);
}

export async function getAllEntityIds(): Promise<string[]> {
  const registry = await getEntityRegistry();
  return registry.map(e => e.id);
}
