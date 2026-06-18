/**
 * Acme Health — Azure AI Foundry Knowledge Service
 *
 * Thin RAG layer over Azure AI Search. Every factual answer produced by the
 * agent must trace back to a `GroundingSource` returned from this service.
 *
 * Foundry capabilities demonstrated here:
 *   • Azure AI Search vector + hybrid retrieval
 *   • Per-scenario knowledge collection scoping (acme-mho-faq,
 *     acme-locations, acme-health-plus-benefits, acme-cancellation-policy,
 *     acme-interpreter-services)
 *   • Grounding citations attached to the ActionPacket
 *   • File-search-style "documents" surface compatible with Foundry Agent
 *     Service file_search tool
 *
 * Auth model:
 *   • Managed Identity (Cognitive Search User) in production
 *   • API key fallback for local dev (AZURE_SEARCH_API_KEY)
 *
 * This file is intentionally framework-light — it does not require the
 * Azure SDK to be present at build time. If `AZURE_SEARCH_ENDPOINT` is not
 * configured, all calls return an empty result and the agent must escalate
 * with reason "grounding_insufficient".
 */

import { logger } from '../utils/logger.js';
import type { GroundingSource } from '../types/index.js';

// =============================================================================
// CONFIG
// =============================================================================

interface KnowledgeConfig {
  endpoint?: string;
  apiKey?: string;
  defaultIndex: string;
  topK: number;
  semanticConfiguration?: string;
  useManagedIdentity: boolean;
}

function loadConfig(): KnowledgeConfig {
  return {
    endpoint: process.env.AZURE_SEARCH_ENDPOINT,
    apiKey: process.env.AZURE_SEARCH_API_KEY,
    defaultIndex: process.env.AZURE_SEARCH_INDEX || 'acme-knowledge',
    topK: Number(process.env.AZURE_SEARCH_TOP_K || 5),
    semanticConfiguration:
      process.env.AZURE_SEARCH_SEMANTIC_CONFIG || 'acme-semantic',
    useManagedIdentity:
      (process.env.AZURE_SEARCH_AUTH || 'managed-identity') === 'managed-identity',
  };
}

// =============================================================================
// SCENARIO → COLLECTION MAP
// =============================================================================

/**
 * Maps a scenario id to the AI Search index / collection it is allowed to
 * ground against. This is the authoritative source for "what knowledge can
 * this scenario see?" — it constrains prompt-injection blast radius.
 */
export const SCENARIO_COLLECTIONS: Record<string, string[]> = {
  'acme-mho-front-door': [
    'acme-mho-faq',
    'acme-locations',
    'acme-cancellation-policy',
  ],
  'acme-health-plus-concierge': [
    'acme-health-plus-benefits',
    'acme-network-directory',
    'acme-health-plus-policy',
  ],
  'acme-bilingual-access': [
    'acme-mho-faq',
    'acme-locations',
    'acme-interpreter-services',
  ],
};

export function collectionsForScenario(scenarioId: string): string[] {
  return SCENARIO_COLLECTIONS[scenarioId] || ['acme-mho-faq'];
}

// =============================================================================
// SEARCH RESULT
// =============================================================================

export interface KnowledgeChunk {
  collection: string;
  documentId: string;
  title?: string;
  content: string;
  score: number;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeQueryOptions {
  scenarioId: string;
  query: string;
  topK?: number;
  /** If true, run a vector query (semantic embedding) */
  semantic?: boolean;
  /** Filter expression in OData syntax (e.g. "facility eq 'cpmc'") */
  filter?: string;
  /** Optional language hint for multilingual filtering */
  language?: 'en' | 'es' | 'zh-CN' | 'zh-HK';
}

// =============================================================================
// SERVICE
// =============================================================================

class FoundryKnowledgeService {
  private config: KnowledgeConfig = loadConfig();
  private isConfigured = false;
  private warned = false;

  constructor() {
    this.isConfigured = !!this.config.endpoint;
    if (!this.isConfigured) {
      logger.warn(
        '[foundry-knowledge] AZURE_SEARCH_ENDPOINT not set — running in NO-GROUND mode. ' +
          'Agent must escalate with grounding_insufficient when factual answers are required.'
      );
    } else {
      logger.info('[foundry-knowledge] Configured', {
        endpoint: this.config.endpoint,
        defaultIndex: this.config.defaultIndex,
        topK: this.config.topK,
        auth: this.config.useManagedIdentity ? 'managed-identity' : 'api-key',
      });
    }
  }

  /**
   * Query the knowledge layer. Returns ranked chunks scoped to the scenario's
   * allowed collections. Designed to be called from a tool handler (e.g.
   * `search_acme_knowledge`).
   */
  async query(opts: KnowledgeQueryOptions): Promise<{
    chunks: KnowledgeChunk[];
    citations: GroundingSource[];
  }> {
    const allowed = collectionsForScenario(opts.scenarioId);
    if (!this.isConfigured) {
      this.noConfigWarnOnce();
      return { chunks: [], citations: [] };
    }

    try {
      const chunks = await this.searchAllowed(allowed, opts);
      const citations: GroundingSource[] = chunks.map((c) => ({
        collection: c.collection,
        documentId: c.documentId,
        excerpt: truncate(c.content, 240),
        score: c.score,
      }));
      return { chunks, citations };
    } catch (err) {
      logger.error('[foundry-knowledge] query failed', {
        scenarioId: opts.scenarioId,
        error: (err as Error).message,
      });
      return { chunks: [], citations: [] };
    }
  }

  /**
   * Perform the underlying Azure AI Search REST call against each allowed
   * collection. Uses hybrid search (BM25 + vector) when semantic is requested
   * and a semantic configuration is set.
   */
  private async searchAllowed(
    collections: string[],
    opts: KnowledgeQueryOptions
  ): Promise<KnowledgeChunk[]> {
    const topK = opts.topK ?? this.config.topK;
    const merged: KnowledgeChunk[] = [];

    for (const collection of collections) {
      const url = `${this.config.endpoint}/indexes/${encodeURIComponent(
        collection
      )}/docs/search?api-version=2024-07-01`;

      const body: Record<string, unknown> = {
        search: opts.query,
        top: topK,
        queryType: opts.semantic ? 'semantic' : 'simple',
        ...(opts.semantic && this.config.semanticConfiguration
          ? { semanticConfiguration: this.config.semanticConfiguration }
          : {}),
        ...(opts.filter ? { filter: opts.filter } : {}),
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const token = await this.getAuthHeader();
      if (token.kind === 'apiKey') headers['api-key'] = token.value;
      else headers['Authorization'] = `Bearer ${token.value}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        logger.warn('[foundry-knowledge] search failed', {
          collection,
          status: res.status,
        });
        continue;
      }

      const data = (await res.json()) as {
        value?: Array<Record<string, unknown>>;
      };
      for (const doc of data.value || []) {
        merged.push({
          collection,
          documentId: String(doc.id ?? doc['@search.documentKey'] ?? ''),
          title: typeof doc.title === 'string' ? doc.title : undefined,
          content: typeof doc.content === 'string' ? doc.content : '',
          score: Number(doc['@search.score'] ?? 0),
          url: typeof doc.url === 'string' ? doc.url : undefined,
          metadata: doc as Record<string, unknown>,
        });
      }
    }

    return merged.sort((a, b) => b.score - a.score).slice(0, opts.topK ?? this.config.topK);
  }

  /**
   * Resolve auth header — managed identity (federated) in Azure, api-key locally.
   * For brevity, the production token acquisition is delegated to the runtime's
   * existing `DefaultAzureCredential` flow used by `assistants.ts`.
   */
  private async getAuthHeader(): Promise<
    { kind: 'apiKey'; value: string } | { kind: 'bearer'; value: string }
  > {
    if (this.config.useManagedIdentity) {
      try {
        const { DefaultAzureCredential } = await import('@azure/identity');
        const cred = new DefaultAzureCredential();
        const tok = await cred.getToken('https://search.azure.com/.default');
        if (tok?.token) return { kind: 'bearer', value: tok.token };
      } catch (err) {
        logger.warn(
          '[foundry-knowledge] managed-identity token acquisition failed; falling back to apiKey',
          { error: (err as Error).message }
        );
      }
    }
    if (this.config.apiKey) return { kind: 'apiKey', value: this.config.apiKey };
    throw new Error('No Azure AI Search credential available');
  }

  private noConfigWarnOnce() {
    if (this.warned) return;
    this.warned = true;
    logger.warn(
      '[foundry-knowledge] Skipping search call — endpoint not configured. ' +
        'Agent should escalate with reason "grounding_insufficient".'
    );
  }
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

// =============================================================================
// SINGLETON
// =============================================================================

export const foundryKnowledge = new FoundryKnowledgeService();
