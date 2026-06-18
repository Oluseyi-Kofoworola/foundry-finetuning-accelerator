/**
 * Acme Health — search_acme_knowledge tool
 *
 * The single grounding tool the agent calls to fetch Acme-approved
 * knowledge (FAQs, locations, cancellation policy, plan benefits,
 * interpreter services). The retrieved citations are returned to the model
 * so it can quote them, and they are also written onto the ActionPacket as
 * `groundingSources`.
 *
 * Foundry capability demonstrated:
 *   • Knowledge / File search via Azure AI Search
 *   • Indirect prompt-injection defense on retrieved documents
 *   • Citation contract carried into the staff-facing ActionPacket
 */

import { createTool } from './registry.js';
import type { ToolResult } from '../types/index.js';
import { foundryKnowledge, collectionsForScenario } from '../services/foundry-knowledge.js';
import { contentSafety } from '../services/content-safety.js';
import { foundryTracing } from '../services/foundry-tracing.js';

interface SearchArgs extends Record<string, unknown> {
  query: string;
  semantic?: boolean;
  language?: 'en' | 'es' | 'zh-CN' | 'zh-HK';
}

interface SearchResultPayload {
  chunks: Array<{
    collection: string;
    documentId: string;
    title?: string;
    excerpt: string;
    score: number;
  }>;
  citations: Array<{
    collection: string;
    documentId: string;
    excerpt: string;
    score?: number;
  }>;
  grounded: boolean;
  collectionsSearched: string[];
}

export const searchAcmeKnowledgeTool = createTool<SearchArgs, SearchResultPayload>({
  name: 'search_acme_knowledge',
  description:
    'Search Acme-approved knowledge (MHO FAQs, locations, cancellation policy, ' +
    'Acme Health Plus benefits, interpreter services). MUST be called before ' +
    'answering any factual question. Returns citations that you MUST quote from. ' +
    'If `grounded` is false, you must escalate and not improvise.',
  category: 'knowledge',
  isMocked: false,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: "The user's question, rewritten as a search query.",
      },
      semantic: {
        type: 'boolean',
        description: 'Use semantic (vector) search. Default true.',
      },
      language: {
        type: 'string',
        enum: ['en', 'es', 'zh-CN', 'zh-HK'],
        description: 'Language of the source content to prefer.',
      },
    },
    required: ['query'],
  },
  handler: async (args, context): Promise<ToolResult<SearchResultPayload>> => {
    const scenarioId = context.scenarioId || 'acme-mho-front-door';
    const collections = collectionsForScenario(scenarioId);

    // Indirect prompt injection defense — screen the query itself first
    const screen = await contentSafety.screenUserInput(context.sessionId, args.query);
    if (screen.action === 'blocked') {
      foundryTracing.recordGrounding({
        sessionId: context.sessionId,
        query: args.query,
        collections,
        hitCount: 0,
        success: false,
      });
      return {
        success: false,
        error: `Query blocked by content safety: ${screen.reason ?? 'unknown'}`,
        data: {
          chunks: [],
          citations: [],
          grounded: false,
          collectionsSearched: collections,
        },
      };
    }

    const effectiveQuery = screen.action === 'redacted' && screen.redactedText
      ? screen.redactedText
      : args.query;

    const { chunks, citations } = await foundryKnowledge.query({
      scenarioId,
      query: effectiveQuery,
      semantic: args.semantic ?? true,
      language: args.language,
    });

    // Screen each retrieved chunk for indirect prompt injection. If any
    // chunk is flagged, drop it from the response.
    const safeChunks: typeof chunks = [];
    for (const c of chunks) {
      const groundScreen = await contentSafety.screenGroundingContent(context.sessionId, c.content);
      if (groundScreen.action === 'allowed') safeChunks.push(c);
    }

    foundryTracing.recordGrounding({
      sessionId: context.sessionId,
      query: effectiveQuery,
      collections,
      hitCount: safeChunks.length,
      topScore: safeChunks[0]?.score,
      success: safeChunks.length > 0,
    });

    return {
      success: true,
      data: {
        chunks: safeChunks.map((c) => ({
          collection: c.collection,
          documentId: c.documentId,
          title: c.title,
          excerpt: c.content.length > 400 ? `${c.content.slice(0, 399)}…` : c.content,
          score: c.score,
        })),
        citations: citations
          .filter((cit) => safeChunks.some((c) => c.documentId === cit.documentId))
          .map((cit) => ({
            collection: cit.collection,
            documentId: cit.documentId,
            excerpt: cit.excerpt ?? '',
            score: cit.score,
          })),
        grounded: safeChunks.length > 0,
        collectionsSearched: collections,
      },
    };
  },
});
