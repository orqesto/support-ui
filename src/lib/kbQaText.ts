import type { KBEntry } from '@/services/kb.service';

/** A Q&A entry's own question/answer — what AI drafts read. Null when the entry has none. */
export const qaTextOf = (entry: KBEntry): { question: string; answer: string } | null => {
  if (entry.type !== 'qa_pair') return null;
  const question = entry.typeData?.question;
  const answer = entry.typeData?.answer;
  return typeof question === 'string' && typeof answer === 'string' ? { question, answer } : null;
};

/**
 * A Q&A entry's combined `content` split back into its halves — the backend's `splitQaContent`
 * (knowledgeBaseController.ts): "Question: …\n\nAnswer: …" or "Q: …\n\nA: …". Null otherwise.
 */
export const splitQaContent = (content: string): { question: string; answer: string } | null => {
  const match =
    /^\s*Question:\s*([\s\S]*?)\n\s*\n\s*Answer:\s*([\s\S]*)$/.exec(content) ??
    /^\s*Q:\s*([\s\S]*?)\n\s*\n\s*A:\s*([\s\S]*)$/.exec(content);
  if (!match) return null;
  const question = match[1].trim();
  const answer = match[2].trim();
  return question && answer ? { question, answer } : null;
};

/**
 * What the Q&A edit dialog starts from. Normally the entry's own halves. But the deployed edit
 * (before #873) rewrote only `content`, so an entry edited then SHOWS its corrected text while AI
 * drafts still read the old halves — and a save from the old halves would silently write the old
 * text back over the correction (FE pass 21 LOW-1). So when the FULL content (never the list's
 * 300-char cut) parses and differs, start from it; saving then brings the halves in line.
 */
export const editableQaOf = (
  entry: KBEntry,
  contentIsFull: boolean
): { question: string; answer: string; drifted: boolean } | null => {
  const own = qaTextOf(entry);
  if (!own) return null;
  const shown = contentIsFull ? splitQaContent(entry.content) : null;
  const drifted =
    shown !== null &&
    (shown.question !== own.question.trim() || shown.answer !== own.answer.trim());
  return drifted ? { ...shown, drifted } : { ...own, drifted: false };
};
