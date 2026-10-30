/**
 * The source list's mark-imported warning (support-service#1229): a problem the last poll had marking
 * imported mail read or labelling it. Kept out of integrations.service.ts, which sits at the repo's
 * max-lines cap.
 */
/** A problem the last poll had writing to the mailbox (support-service#1229). */
export type MarkImportedWarning = { status: 'failed' | 'label_unsupported'; error?: string };

export const normalizeMarkImportedWarning = (raw: unknown): MarkImportedWarning | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const { status, error } = raw as { status?: unknown; error?: unknown };
  if (status !== 'failed' && status !== 'label_unsupported') return null;
  return { status, ...(typeof error === 'string' ? { error } : {}) };
};

/** Whether the source's mark-imported setting is on (IMAP: `email`, Gmail: `gmail`). */
export const markImportedOn = (config: unknown): boolean => {
  const sections = config as
    | {
        email?: { markImported?: { enabled?: unknown } };
        gmail?: { markImported?: { enabled?: unknown } };
      }
    | null
    | undefined;
  return (
    sections?.email?.markImported?.enabled === true ||
    sections?.gmail?.markImported?.enabled === true
  );
};
