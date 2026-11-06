/**
 * The similar-message / knowledge-base results the AI tab shows (moved out of
 * `components/messages/AiTabPanel` in modularity task F2, so the session cache in
 * `lib/similarResultsCache` can name them without importing the panel).
 */
export type KBAttachment = {
  id: number;
  filename: string;
  originalFilename: string;
  url: string;
  mimeType: string;
};

export type KBReference = { documentationId: number; documentTitle: string; similarity: number };

export type ChunkReference = { chunkId: number; chunkIndex: number; metadata: unknown };

export type SimilarResult = {
  messageId?: number;
  documentationId?: number;
  directReply: string;
  similarity: number;
  source: 'documentation' | 'message';
  documentTitle?: string;
  content?: string;
  subject?: string | null;
  sender?: string;
  references?: KBReference[] | ChunkReference[];
  attachments?: KBAttachment[];
};
