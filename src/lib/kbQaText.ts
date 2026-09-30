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

/** How the text a Q&A entry SHOWS (`content`) relates to the halves AI drafts read (`typeData`). */
export type QaDrift = 'none' | 'parsed' | 'unparsed';

export type EditableQa = {
  /** Where the dialog's question/answer fields start. */
  question: string;
  answer: string;
  /** The halves AI drafts read today — what a save compares against. */
  own: { question: string; answer: string };
  drift: QaDrift;
};

/**
 * What the Q&A edit dialog starts from (FE passes 21–22).
 *
 * The deployed edit (before #873) rewrote only `content`, so an entry edited then SHOWS text that
 * AI drafts do not read. Drift is decided by EXACT comparison with the two shapes every writer
 * builds from the halves ("Question: …\n\nAnswer: …" / "Q: …\n\nA: …") — never by parsing, which
 * misreads a question that itself quotes "Answer:" after a blank line. Only the FULL content counts
 * (never the list's 300-char cut). Drifted content that parses ⇒ the fields start from it
 * ('parsed'); a free-form correction that does not ⇒ they keep the halves ('unparsed').
 */
export const editableQaOf = (entry: KBEntry, contentIsFull: boolean): EditableQa | null => {
  const own = qaTextOf(entry);
  if (!own) return null;
  const content = (entry.content ?? '').trim();
  const standard = [
    `Question: ${own.question}\n\nAnswer: ${own.answer}`,
    `Q: ${own.question}\n\nA: ${own.answer}`,
  ].map((form) => form.trim());
  if (!contentIsFull || content === '' || standard.includes(content)) {
    return { ...own, own, drift: 'none' };
  }
  const shown = splitQaContent(content);
  return shown ? { ...shown, own, drift: 'parsed' } : { ...own, own, drift: 'unparsed' };
};

/** Where a Q&A edit started: the title / category / halves shown, the AI's halves, the drift. */
export type QaEditStart = EditableQa & { title: string | null; category: string | null };

/**
 * The body of a Q&A save: ONLY what changed. Title / category when set to a NEW non-blank value
 * (both backends ignore a blank one and would answer 400 on an otherwise empty body — FE pass 23
 * LOW-1). The question and answer (plus the same text as `content`, which a backend without
 * question/answer support reads) when they differ from what AI drafts read — or, for a drifted
 * entry, from the shown text the fields started from, so it can be put back to the AI's own text
 * (FE pass 23 LOW-2). A title-only save never rewrites an entry's text (FE pass 22 LOW-1).
 * Empty ⇒ nothing to save.
 */
export const qaSaveBody = (
  form: { title: string; category: string; question: string; answer: string },
  start: QaEditStart
): Record<string, string> => {
  const body: Record<string, string> = {};
  const changed = (value: string, initial: string | null) =>
    value.trim() !== '' && value.trim() !== (initial ?? '').trim();
  if (changed(form.title, start.title)) body.title = form.title;
  if (changed(form.category, start.category)) body.category = form.category;
  const question = form.question.trim();
  const answer = form.answer.trim();
  const differs = (halves: { question: string; answer: string }) =>
    question !== halves.question.trim() || answer !== halves.answer.trim();
  if (differs(start.own) || (start.drift !== 'none' && differs(start))) {
    Object.assign(body, {
      question,
      answer,
      content: `Question: ${question}\n\nAnswer: ${answer}`,
    });
  }
  return body;
};

/** What the edit dialog says when the shown text and the AI's halves differ — no promise about
 * what a save does, which depends on the backend (FE pass 22 LOW-3). */
export const QA_DRIFT_NOTE: Record<Exclude<QaDrift, 'none'>, string> = {
  parsed:
    "This entry's shown text differs from the question and answer AI drafts use. The fields below start from the shown text.",
  unparsed:
    "This entry's shown text (Content, in the entry) differs from the question and answer AI drafts use, below. Saving without changing them leaves both as they are.",
};

/** A Q&A save needs both halves (a blank one would silently keep the old text, FE pass 20 LOW-4)
 * and something to send (FE pass 22). */
export const qaCanSave = (
  form: { title: string; category: string; question: string; answer: string },
  start: QaEditStart
): boolean =>
  form.question.trim() !== '' &&
  form.answer.trim() !== '' &&
  Object.keys(qaSaveBody(form, start)).length > 0;

/** Where ANY edit started: what the dialog showed, plus the Q&A baseline when it edits halves. */
export type EditStart = {
  title: string | null;
  category: string | null;
  content: string;
  qa: EditableQa | null;
};

type EditForm = {
  title: string;
  category: string;
  content: string;
  question: string;
  answer: string;
};

/**
 * The body of any KB entry save — ONLY what changed, on both paths. The content path (non-Q&A
 * entries, and resolve/promote captures, which keep "Q: …\n\nA: …" content and no halves) sends
 * `content` only when it was edited: the branch backend re-parses a Q&A `content` it receives and
 * answers 400 when a free-form one no longer parses, so a title-only rename of such a capture
 * must not send it (FE pass 24 LOW-1). Empty ⇒ nothing to save.
 */
export const editSaveBody = (form: EditForm, start: EditStart): Record<string, string> => {
  if (start.qa)
    return qaSaveBody(form, { ...start.qa, title: start.title, category: start.category });
  const body: Record<string, string> = {};
  const changed = (value: string, initial: string | null) =>
    value.trim() !== '' && value.trim() !== (initial ?? '').trim();
  if (changed(form.title, start.title)) body.title = form.title;
  if (changed(form.category, start.category)) body.category = form.category;
  if (changed(form.content, start.content)) body.content = form.content;
  return body;
};

/** Anything to save — and, for Q&A, both halves filled (FE pass 20 LOW-4). */
export const editCanSave = (form: EditForm, start: EditStart): boolean =>
  start.qa
    ? qaCanSave(form, { ...start.qa, title: start.title, category: start.category })
    : Object.keys(editSaveBody(form, start)).length > 0;
