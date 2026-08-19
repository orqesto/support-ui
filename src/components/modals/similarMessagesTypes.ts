export type SimilarMessage = {
  messageId?: number;
  content: string;
  subject?: string | null;
  sender?: string;
  directReply: string;
  directReplyEnglish?: string;
  detectedLanguage?: string;
  similarity: number;
  repliedAt?: string | null;
  repliedBy?: number | null;
  source: 'documentation' | 'message';
  documentationId?: number;
  parentDocId?: number;
  documentTitle?: string;
  /**
   * True when this hit came from the backend's org-wide rescue pass: the conversation's own
   * department had no knowledge, so the whole organisation was searched. Surfaced rather than
   * silent because it means the answer may come from a department the agent does not serve.
   */
  viaOrgWideFallback?: boolean;
  chunkId?: number;
  chunkIndex?: number;
  chunkMetadata?: { extractedText?: string; page?: number };
  references?: Array<{
    chunkId: number;
    chunkIndex: number;
    metadata: unknown;
  }>;
};

export const getSimilarityColor = (similarity: number): string => {
  if (similarity >= 0.9) return 'text-green-600 dark:text-green-400';
  if (similarity >= 0.8) return 'text-blue-600 dark:text-blue-400';
  return 'text-amber-600 dark:text-amber-400';
};

export const getSimilarityBadge = (similarity: number): string => {
  if (similarity >= 0.9) return 'Very Similar';
  if (similarity >= 0.8) return 'Similar';
  return 'Somewhat Similar';
};

/** A `sources[]` entry from GET /api/messages/:id/suggested-answer. */
export type SuggestedAnswerSource = {
  type: 'documentation' | 'ticket' | 'message' | 'knowledge_base';
  id: number;
  parentDocId?: number;
  chunkIndex?: number;
  title?: string;
  content: string;
  answer?: string;
  similarity: number;
  metadata?: Record<string, unknown>;
};

/**
 * A mined KB entry links like documentation (knowledge-base?id=), not like a message — the
 * convention findSimilarResolvedMessages already uses for KB hits. Before this, a
 * `knowledge_base` source fell through to the 'message' branch with NO id set, so it rendered
 * with no title, no badge and nothing to click.
 */
const isDocLike = (type: SuggestedAnswerSource['type']): boolean =>
  type === 'documentation' || type === 'knowledge_base';

/** Pure — extracted from SimilarMessagesDialog so the branch above is testable. */
export const toSimilarMessages = (sources: SuggestedAnswerSource[]): SimilarMessage[] =>
  sources.map((source) => ({
    messageId: source.type === 'message' ? source.id : undefined,
    content: source.content,
    subject: source.title ?? null,
    sender: source.metadata?.sender as string | undefined,
    directReply: source.answer ?? source.content,
    similarity: source.similarity,
    repliedAt: source.metadata?.repliedAt as string | null | undefined,
    source: isDocLike(source.type) ? 'documentation' : 'message',
    documentationId: isDocLike(source.type) ? source.id : undefined,
    // Chunk fields belong to uploaded-doc chunks only — a KB entry has no parent document
    // to deep-link into, so they stay undefined for it.
    parentDocId: source.type === 'documentation' ? source.parentDocId : undefined,
    chunkIndex: source.type === 'documentation' ? source.chunkIndex : undefined,
    documentTitle: isDocLike(source.type) ? source.title : undefined,
    viaOrgWideFallback: source.metadata?.viaOrgWideFallback === true,
  }));
