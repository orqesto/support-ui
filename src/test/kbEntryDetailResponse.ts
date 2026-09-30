/**
 * The body of `GET /api/knowledge-base/entries/:id` as the backend really sends it (BE branch
 * feat/kb-consolidation @ 7555b385): `getKBEntry` (unifiedKBService.ts) builds the detail shape,
 * `getEntry` (knowledgeBaseController.ts) adds `capturedVia`, `consolidatedInto`, `publicId` and,
 * through `withConsolidationFields`, a `consolidation` object ONLY when the entry belongs to (or
 * was detached from) a case; `sanitizeKBEntryForApi` then trims `metadata` to three keys.
 *
 * Tests of the detail drawer and `?id=` deep links use this instead of a list row: the two
 * shapes differ (the detail has `similarity`, `timesReferenced`, `topics`…), and a mock in the
 * list's shape once hid that the detail lacked the consolidation fields entirely (FE audit H1).
 */
import type { KBEntry } from '@/services/kb.service';

type DetailOptions = {
  id: number;
  title?: string;
  approved?: boolean;
  hidden?: boolean;
  publicId?: string | null;
  capturedVia?: string | null;
  /** The case this entry is merged into — the backend then adds `consolidation.state 'merged'`. */
  consolidatedInto?: number | null;
  /** Its source (mailbox, document) was removed — kept for the record, never used. */
  sourceDeleted?: boolean;
  /** What `withConsolidationFields` finds for that case id. */
  casePublicId?: string | null;
  caseExists?: boolean;
  question?: string;
  answer?: string;
  /** Case rows: the backend's `canUnmerge` for the viewer (BE sends it on case rows only). */
  canUnmerge?: boolean;
};

export const kbEntryDetailResponse = (options: DetailOptions): { success: true; data: KBEntry } => {
  const question = options.question ?? 'Where is my refund?';
  const answer = options.answer ?? '5 days.';
  const consolidatedInto = options.consolidatedInto ?? null;
  const data = {
    id: options.id,
    type: 'qa_pair' as const,
    title: options.title ?? question,
    // The shape every backend writer builds (blank line between the halves).
    content: `Question: ${question}\n\nAnswer: ${answer}`,
    similarity: 1,
    qualityScore: 0.8,
    topics: [],
    category: 'support',
    technicalLevel: null,
    actionable: false,
    typeData: { question, answer },
    metadata: {},
    timesReferenced: 0,
    lastReferencedAt: null,
    approved: options.approved ?? false,
    approvedBy: null,
    approvedAt: null,
    hidden: options.hidden ?? false,
    rejectedAt: null,
    rejectedBy: null,
    usageCount: 0,
    createdAt: '2026-09-19T09:00:00.000Z',
    departmentId: null,
    capturedVia: options.capturedVia ?? 'resolve',
    consolidatedInto,
    publicId: options.publicId ?? null,
    sourceDeleted: options.sourceDeleted ?? false,
    ...(options.canUnmerge !== undefined && { canUnmerge: options.canUnmerge }),
    ...(consolidatedInto !== null && {
      consolidation: {
        state: 'merged' as const,
        caseId: consolidatedInto,
        casePublicId: options.caseExists === false ? null : (options.casePublicId ?? null),
        caseExists: options.caseExists ?? true,
      },
    }),
  };
  return { success: true, data: data as KBEntry };
};
