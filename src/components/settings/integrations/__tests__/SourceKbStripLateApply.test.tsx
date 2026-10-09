/**
 * A history-range apply that finishes after its dialog was cancelled must not close the dialog of
 * ANOTHER mailbox opened in the meantime (the store holds one open id for the whole page).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KbRangeRequest } from '@/services/kbRangeTypes';
import { useKbRangeDialogStore } from '@/stores/kbRangeDialogStore';

let handler: (id: number, body: KbRangeRequest) => Promise<unknown> = () =>
  Promise.reject(new Error('no handler'));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { kbHistoryRange: (id: number, body: KbRangeRequest) => handler(id, body) },
}));
vi.mock('@/services/kb.service', () => ({
  kbService: {
    getMiningForecast: () => Promise.reject(new Error('none')),
    reprocessSource: () => Promise.resolve({}),
  },
}));
vi.mock('@/components/ui/Select', () => ({
  Select: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const { SourceKbStrip } = await import('../SourceKbStrip');

const policyOf = (id: number) => ({
  sourceId: id,
  type: 'gmail',
  name: `box-${id}`,
  enabled: true,
  kbCutoff: '2026-09-01T00:00:00Z',
  currentDays: 30,
  options: [7, 30, 90].map((days) => ({
    days,
    label: `${days} days`,
    isCurrent: days === 30,
    selectable: true,
  })),
  planMaxHistoryDays: null,
  sweepInProgress: false,
  lastSweep: {
    state: 'complete',
    at: null,
    capSkipped: null,
    threadsWaiting: null,
    aiSkipped: null,
    aiReason: null,
    aiIncompleteSince: null,
    pausedUntil: null,
  },
  blocked: null,
  openWindowDays: 3,
  kbLimitReachedToday: false,
  aiMode: 'managed',
  aiUnavailable: null,
});

beforeEach(() => useKbRangeDialogStore.getState().close());
afterEach(cleanup);

describe('SourceKbStrip dialog close', () => {
  it('a late apply for mailbox A leaves mailbox B’s dialog open', async () => {
    let finishA: (value: unknown) => void = () => undefined;
    handler = (id, body) =>
      body.days === undefined
        ? Promise.resolve(policyOf(id))
        : id === 1
          ? new Promise((resolve) => {
              finishA = resolve;
            })
          : Promise.resolve({});
    const strip = (id: number) => (
      <SourceKbStrip
        key={id}
        source={{
          id,
          name: `box-${id}`,
          type: 'gmail',
          isKnowledgeBase: true,
          kbMarkedAt: '2026-09-01T00:00:00Z',
        }}
        onShowAlert={vi.fn()}
      />
    );
    render(
      <>
        {strip(1)}
        {strip(2)}
      </>
    );
    const [openA, openB] = screen.getAllByRole('button', { name: /History range/ });
    fireEvent.click(openA);
    const select = await screen.findByLabelText('Read history from');
    fireEvent.change(select, { target: { value: '7' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save range' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(useKbRangeDialogStore.getState().openSourceId).toBeNull());
    fireEvent.click(openB);
    await screen.findByLabelText('Read history from');
    expect(useKbRangeDialogStore.getState().openSourceId).toBe(2);
    await act(() =>
      Promise.resolve(
        finishA({ applied: true, days: 7, direction: 'narrower', sweepRequested: false })
      )
    );
    expect(useKbRangeDialogStore.getState().openSourceId).toBe(2);
    expect(screen.getByLabelText('Read history from')).toBeTruthy();
  });
});
