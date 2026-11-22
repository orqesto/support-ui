import type { components } from '@/types/generated/api';

/**
 * What the reply's SUCCESS answer says went wrong after the reply was out
 * (`data: ReplySent` — `kbCapture`, `warnings`). Read defensively from the raw body: the frontend
 * can be ahead of the backend, and the other way round.
 *  - `kbCapture: 'failed'` ("Send, resolve & save to KB": the save could not be started; the
 *    other values, 'queued' and 'background', mean it was);
 *  - `warnings` — stable codes for steps that did not finish after delivery. Each known code has
 *    its own sentence; any other code one generic sentence; a missing or malformed field says
 *    nothing (absent when empty).
 */
type ReplySent = components['schemas']['ReplySent'];
type WarningCode = NonNullable<ReplySent['warnings']>[number];

export const KB_SAVE_NOT_STARTED =
  'Reply sent and resolved, but the knowledge-base save did not start. Use Promote to KB on the thread to save it.';
export const FILES_NOT_STORED = 'Reply sent, but its attachments could not be saved to the thread.';
export const RESOLVE_NOT_APPLIED =
  'Reply sent, but the thread could not be resolved. Resolve it again.';
export const DELIVERY_NOT_RECORDED =
  'Reply sent. The thread may show it as still sending for a moment.';
export const STEP_NOT_FINISHED = 'Reply sent, but a later step did not finish. Check the thread.';

const WARNING_SENTENCE: Record<WarningCode, string> = {
  resolve_not_applied: RESOLVE_NOT_APPLIED,
  files_not_stored: FILES_NOT_STORED,
  delivery_not_recorded: DELIVERY_NOT_RECORDED,
};
const isKnown = (code: string): code is WarningCode =>
  Object.prototype.hasOwnProperty.call(WARNING_SENTENCE, code);

/** A field of the answer's `data` (the contract), or of the body itself (tolerated). */
const field = (body: unknown, name: string): unknown => {
  if (typeof body !== 'object' || body === null) return undefined;
  const data = (body as { data?: unknown }).data;
  if (typeof data === 'object' && data !== null && name in data)
    return (data as Record<string, unknown>)[name];
  return (body as Record<string, unknown>)[name];
};

export const afterSendNotes = (
  body: unknown
): { kbSaveFailed: boolean; resolveFailed: boolean; sentences: string[] } => {
  const raw = field(body, 'warnings');
  const codes = new Set(
    Array.isArray(raw) ? raw.filter((code): code is string => typeof code === 'string') : []
  );
  const resolveFailed = codes.has('resolve_not_applied');
  // Not resolved: "sent and resolved" would be untrue — the resolve sentence stands alone.
  const kbSaveFailed = !resolveFailed && field(body, 'kbCapture') === 'failed';
  const known = (Object.keys(WARNING_SENTENCE) as WarningCode[]).filter((code) => codes.has(code));
  const unknown = [...codes].some((code) => !isKnown(code));
  return {
    kbSaveFailed,
    resolveFailed,
    sentences: [
      ...known
        .filter((code) => code === 'resolve_not_applied')
        .map((code) => WARNING_SENTENCE[code]),
      ...(kbSaveFailed ? [KB_SAVE_NOT_STARTED] : []),
      ...known
        .filter((code) => code !== 'resolve_not_applied')
        .map((code) => WARNING_SENTENCE[code]),
      ...(unknown ? [STEP_NOT_FINISHED] : []),
    ],
  };
};
