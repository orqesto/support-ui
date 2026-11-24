import { autoReplyReasonWords } from './autoReplyReasons';
import type { GhostOption } from './messageDetailConstants';

/**
 * What the thread says on a draft that was an AUTOMATIC reply not sent (2026-11-24): kept in
 * check-only mode, or held by a check — the reason in plain words. Each has its own colour from
 * the palette (success / warning), so neither reads as an ordinary suggestion (the AI colour).
 */
export type GhostTone = 'ai' | 'would_send' | 'held';

const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** The badge text, or null for an ordinary suggestion. */
export const autoStatusText = (
  option: Pick<GhostOption, 'autoStatus' | 'confidence'>
): string | null => {
  const status = option.autoStatus;
  if (!status) return null;
  if (status.kind === 'would_send') return 'Check only · would have been sent';
  if (
    status.reason === 'low_confidence' &&
    option.confidence !== undefined &&
    status.threshold !== undefined
  ) {
    return `Held · confidence ${percent(option.confidence)} below ${percent(status.threshold)}`;
  }
  return `Held · ${autoReplyReasonWords(status.reason) ?? 'held for a person'}`;
};

export const ghostToneOf = (option: Pick<GhostOption, 'autoStatus'>): GhostTone =>
  option.autoStatus?.kind ?? 'ai';

/** Theme tokens per tone (light and dark come from the tokens themselves). */
export const GHOST_TONE: Record<
  GhostTone,
  { line: string; text: string; badge: string; hover: string }
> = {
  ai: {
    line: 'border-ai-line',
    text: 'text-ai',
    badge: 'border-ai-line bg-ai-muted',
    hover: 'group-hover:bg-ai-muted group-focus-visible:bg-ai-muted',
  },
  would_send: {
    line: 'border-success-line',
    text: 'text-success',
    badge: 'border-success-line bg-success-muted',
    hover: 'group-hover:bg-success-muted group-focus-visible:bg-success-muted',
  },
  held: {
    line: 'border-warning-line',
    text: 'text-warning',
    badge: 'border-warning-line bg-warning-muted',
    hover: 'group-hover:bg-warning-muted group-focus-visible:bg-warning-muted',
  },
};
