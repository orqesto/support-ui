/**
 * What the reply's SUCCESS answer says went wrong after the reply was out. Read defensively from
 * the raw body — the frontend can be ahead of the backend, and the other way round:
 *  - `kbCapture: 'failed'` ("Send, resolve & save to KB": the save could not be started; the
 *    other values, 'queued' and 'background', mean it was);
 *  - `warnings: string[]` — stable codes for steps that did not finish (files not stored, the
 *    resolve not applied…). A known code gets its own sentence, any other one generic sentence;
 *    a missing or malformed field says nothing.
 */
export const KB_SAVE_NOT_STARTED =
  'Reply sent and resolved — but the knowledge-base save did not start. Use Promote to KB on the thread to save it.';
export const FILES_NOT_STORED = 'Reply sent — but its files could not be saved on this thread.';
export const RESOLVE_NOT_APPLIED =
  'Reply sent — but resolving failed. Resolve it from the Resolve row.';
export const STEP_NOT_FINISHED =
  'Reply sent — but a follow-up step did not finish. Check the thread.';

type Kind = 'kb' | 'files' | 'resolve' | 'other';

/** The step a warning code is about, read from its words: the exact codes may still change. */
const kindOf = (code: string): Kind => {
  const words = code.toLowerCase();
  if (/kb|knowledge/.test(words)) return 'kb';
  if (/attachment|file/.test(words)) return 'files';
  if (/resolve/.test(words)) return 'resolve';
  return 'other';
};

const SENTENCE: Record<Kind, string> = {
  kb: KB_SAVE_NOT_STARTED,
  files: FILES_NOT_STORED,
  resolve: RESOLVE_NOT_APPLIED,
  other: STEP_NOT_FINISHED,
};

const field = (body: unknown, name: string): unknown => {
  if (typeof body !== 'object' || body === null) return undefined;
  const top = (body as Record<string, unknown>)[name];
  if (top !== undefined) return top;
  const data = (body as { data?: unknown }).data;
  return typeof data === 'object' && data !== null
    ? (data as Record<string, unknown>)[name]
    : undefined;
};

export const afterSendNotes = (
  body: unknown
): { kbSaveFailed: boolean; resolveFailed: boolean; sentences: string[] } => {
  const warnings = field(body, 'warnings');
  const kinds = new Set<Kind>(
    Array.isArray(warnings)
      ? warnings.filter((code): code is string => typeof code === 'string').map(kindOf)
      : []
  );
  if (field(body, 'kbCapture') === 'failed') kinds.add('kb');
  // The thread was not resolved: "sent and resolved" would be untrue, the resolve sentence stands.
  if (kinds.has('resolve')) kinds.delete('kb');
  return {
    kbSaveFailed: kinds.has('kb'),
    resolveFailed: kinds.has('resolve'),
    sentences: (['resolve', 'kb', 'files', 'other'] as const)
      .filter((kind) => kinds.has(kind))
      .map((kind) => SENTENCE[kind]),
  };
};
