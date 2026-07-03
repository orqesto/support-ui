/**
 * AI Feature Types for Frontend
 */
import type { Attachment as ApiAttachment } from '@/types/api';

// Contradiction Detection Types
export type ContradictionCheckResult = {
  hasContradiction: boolean;
  contradictingMessageId?: number;
  contradictingMessageDate?: string;
  originalStatement?: string;
  currentStatement?: string;
  confidence: 'high' | 'medium' | 'low';
  explanation?: string;
};

export type ContradictionCheckMetadata = {
  triggeredBy: 'auto_pattern' | 'manual_request';
  claimToVerify: string;
  checkedAt: string;
  result: ContradictionCheckResult;
  tokenUsage?: number;
  costEstimate?: number;
};

// Attachment Relevance Types
export type AttachmentRelevanceScores = {
  descriptionMatch: number;
  kbMatch: number;
  overallRelevance: number;
};

export type AttachmentRelevanceMetadata = {
  isRelevant: boolean;
  flaggedAsUnusual: boolean;
  scores: AttachmentRelevanceScores;
  assessedAt: string;
  reason?: string;
};

export type AttachmentMetadata = {
  relevanceToOrg?: AttachmentRelevanceMetadata;
  analyzed?: boolean;
  analyzedAt?: string;
  includeInAnalysis?: boolean;
  contentSummary?: string;
  detectedType?: 'invoice' | 'quote' | 'contract' | 'technical_doc' | 'image' | 'other';
  keyEntities?: string[];
  language?: string;
};

// Message Metadata Extensions
export type MessageAttachmentsAnalyzed = {
  count: number;
  hasUnusualAttachments: boolean;
  files: Array<{
    attachmentId: number;
    filename: string;
    mimeType: string;
    includedInAnalysis: boolean;
    textLength: number;
    relevanceScore?: number;
    flaggedAsUnusual?: boolean;
  }>;
  assessedAt?: string;
};

// Extended Message Metadata
export type MessageMetadata = {
  contradictionCheck?: ContradictionCheckMetadata;
  intraMessageContradictionCheck?: ContradictionCheckMetadata;
  attachmentsAnalyzed?: MessageAttachmentsAnalyzed;
  spamCheck?: {
    isSpam: boolean;
    confidence: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

// Canonical FE attachment shape (single source of truth, imported by the
// services + components that used to each declare their own). It is the generated
// backend contract (18 fields, no phantom `messageId`/`isOutgoing`) with `metadata`
// narrowed to the richer AttachmentMetadata the UI renders.
export type Attachment = Omit<ApiAttachment, 'metadata'> & { metadata?: AttachmentMetadata | null };
