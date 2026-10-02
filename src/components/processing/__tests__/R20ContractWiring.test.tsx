/**
 * FE audit pass 20 — the summary contract and the indicator's mine lines:
 * - BE R20 `resumeAdmittedAt` is read defensively (absent or a non-answer is null);
 * - a mine a resume admitted is "resuming now", calm — one line per mailbox;
 * - the stuck line's plural, with the way out (F6).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normaliseSummary } from '@/services/importProgress.service';
import { ProcessingIndicator } from '../ProcessingIndicator';

const RESET = '2026-10-02T00:00:00.000Z';
const WINDOW_END = '2026-10-02T00:30:00.000Z';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// One mailbox's entry as the final controller writes it: its mine alone is paused, no resume of it
// queued (kbResumeStateOf with no job: resumeQueued false, waitingForSlot false).
const raw = (sourceId: number, over: Record<string, unknown> = {}) => ({
  sourceId,
  name: `Mailbox ${sourceId}`,
  type: 'gmail',
  unavailable: false,
  inProgress: 0,
  problems: 0,
  pausedByLimit: 1,
  pausedUntil: RESET,
  resumeWindowEnd: WINDOW_END,
  minePausedUntil: RESET,
  mineResumeWindowEnd: WINDOW_END,
  resumeQueued: false,
  waitingForSlot: false,
  releaseQueuedAt: null,
  resumeAdmittedAt: null,
  countCapped: false,
  ...over,
});
const indicator = (entries: ReturnType<typeof normaliseSummary>) => {
  render(<ProcessingIndicator entries={entries} onOpen={() => undefined} />);
  const button = screen.getByTestId('processing-indicator');
  return {
    label: button.getAttribute('aria-label'),
    warns: button.querySelector('.text-warning') !== null,
  };
};

describe('normaliseSummary — BE R20 resumeAdmittedAt', () => {
  it('a time is kept; a non-answer is null; absent (a backend from before the limits) is null', () => {
    const [admitted, unknown, older] = normaliseSummary([
      raw(1, { resumeAdmittedAt: '2026-10-02T02:59:00.000Z' }),
      raw(2, { resumeAdmittedAt: 7 }),
      (({ resumeAdmittedAt: _gone, ...rest }) => rest)(raw(3)),
    ]);
    expect(admitted.resumeAdmittedAt).toBe('2026-10-02T02:59:00.000Z');
    expect(unknown.resumeAdmittedAt).toBeNull();
    expect(older.resumeAdmittedAt).toBeNull();
  });
});

describe('the indicator over admitted and stuck mines', () => {
  it('two mines a resume admitted past their window: "resuming now", calm', () => {
    const seen = indicator(
      normaliseSummary([
        raw(1, { resumeQueued: true, resumeAdmittedAt: '2026-10-02T02:59:00.000Z' }),
        raw(2, { resumeQueued: true, resumeAdmittedAt: '2026-10-02T02:58:00.000Z' }),
      ])
    );
    expect(seen.label).toBe('2 knowledge-base mines paused at the daily AI limit are resuming now');
    expect(seen.warns).toBe(false);
  });

  it('two stuck mines: plural, with the way out for both mailboxes', () => {
    const seen = indicator(normaliseSummary([raw(1), raw(2)]));
    expect(seen.label).toBe(
      '2 knowledge-base mines paused at the daily AI limit have no resume queued and will not continue by themselves; re-mine those mailboxes to continue'
    );
    expect(seen.warns).toBe(true);
  });
});
