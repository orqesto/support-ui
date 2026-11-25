import { isRecord } from '@/lib/isRecord';
import type { FieldSource } from './resolvedField';

/**
 * The documentation re-ranking step's switch (`ai.doc_rerank`, on by default): one small model
 * call per documentation search picks the sections that answer the question.
 */
/** GET `drafts.docRerank` — whether it is on, and whether it was switched in the console. */
export type DocRerankSetting = {
  value: boolean;
  /** `db` = switched in the console, `default` = never set (on). */
  source: FieldSource;
};

const SOURCES: readonly FieldSource[] = ['db', 'env', 'default'];

/** `drafts.docRerank` when the backend sends a boolean, else undefined (an older backend). */
export const readDocRerank = (raw: unknown): DocRerankSetting | undefined => {
  if (!isRecord(raw) || typeof raw.value !== 'boolean') return undefined;
  return {
    value: raw.value,
    source: SOURCES.includes(raw.source as FieldSource) ? (raw.source as FieldSource) : 'default',
  };
};
