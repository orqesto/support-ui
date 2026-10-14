import type { KBEntry } from '@/services/kb.service';

/**
 * The conversation a KB entry was captured from, for the list's Source column — or null.
 *
 * Save to KB stores it as `metadata.sourceMessageId`. The AUTOMATIC capture on Resolve stores it
 * as `typeData.questionMessageId` with `typeData.source = 'resolved_message'` — a CONVERSATION id
 * there (BE `messageReplyTrainingData.ts`), unlike a mined pair's `questionMessageId`, which is a
 * message EVENT id and so is never read here. Reading only the first, every auto-captured entry
 * showed "-" (found recording a demo, 2026-10-14).
 */
export const kbSourceConversationId = (
  entry: Pick<KBEntry, 'metadata' | 'typeData'>
): number | null => {
  const saved = entry.metadata?.sourceMessageId;
  if (typeof saved === 'number') return saved;
  const typeData = entry.typeData;
  if (typeData?.source === 'resolved_message' && typeof typeData.questionMessageId === 'number') {
    return typeData.questionMessageId;
  }
  return null;
};
