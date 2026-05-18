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
