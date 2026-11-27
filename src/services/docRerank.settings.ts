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

/** `drafts.shortTextLanguage` (`ai.short_text_language`, on by default): the same shape, read by
 * `readDocRerank`. Absent on a backend that predates the switch. */
export type ShortTextLanguageSetting = DocRerankSetting;

/** The boolean switches of GET `drafts`; each absent on a backend that predates it. */
export type DraftToggles = {
  /** The re-ranking step's switch; absent ⇒ the card says it arrives later. */
  docRerank?: DocRerankSetting;
  /** The short-text language reading's switch; absent ⇒ the card shows none. */
  shortTextLanguage?: ShortTextLanguageSetting;
};
/** The same switches in PUT /settings/drafts. */
export type DraftTogglesIn = { docRerank?: boolean; shortTextLanguage?: boolean };

/** Both boolean switches of `drafts`, each present only when the backend sends it. */
export const readDraftToggles = (raw: Record<string, unknown>): DraftToggles => {
  const docRerank = readDocRerank(raw.docRerank);
  const shortTextLanguage = readDocRerank(raw.shortTextLanguage);
  return {
    ...(docRerank ? { docRerank } : {}),
    ...(shortTextLanguage ? { shortTextLanguage } : {}),
  };
};
