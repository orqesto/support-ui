/**
 * KB quality review — mutation-survivor kills for the list and its bulk remove (Stryker,
 * 2026-10-04). The single review is stubbed so a decision can be fired directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LearningSuggestion } from '@/services/learning.service';

const bulkReject = vi.fn<(ids: number[]) => Promise<unknown>>();
vi.mock('@/services/kbQuality.service', () => ({ kbQualityService: { bulkReject: (ids: number[]) => bulkReject(ids) } }));
vi.mock('@/components/kb/KbQualityReview', () => ({
  KbQualityReview: ({ suggestionId, onDecided }: { suggestionId: number; onDecided?: () => void }) => (
    <button type="button" onClick={() => onDecided?.()}>{`decide ${suggestionId}`}</button>
  ),
}));

const { KbQualityList, describeBulkResult } = await import('../KbQualityList');
const { KB_CONSOLIDATION_DECIDED_EVENT } = await import('@/lib/kbConsolidation');

const row = (id: number, verdict: 'improve' | 'remove'): LearningSuggestion => ({
  id,
  domain: 'kb_quality' as LearningSuggestion['domain'],
  suggestionType: 'entry_review',
  status: 'pending',
  payload: { verdict, entryId: id, reasons: [] },
  evidenceEventIds: null,
  evidenceCount: 1,
  confidence: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '9999-12-31T00:00:00.000Z',
});

const renderList = (rows: LearningSuggestion[]) =>
  render(
    <MemoryRouter>
      <KbQualityList rows={rows} onChanged={vi.fn()} />
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('KbQualityList', () => {
  it('within a verdict, older suggestions come first', () => {
    renderList([row(9, 'remove'), row(3, 'remove'), row(5, 'improve'), row(1, 'improve')]);
    const names = within(screen.getByRole('list', { name: 'Quality suggestions' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent?.match(/#\d+/)?.[0]);
    expect(names).toEqual(['#3', '#9', '#1', '#5']);
  });

  it('a row can be unticked, and "select all" untoggles everything', () => {
    renderList([row(2, 'remove'), row(3, 'remove')]);
    const selectAll = screen.getByRole('checkbox', { name: /Select all removals \(2\)/ });
    expect(selectAll).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Remove #2/ }));
    expect(screen.getByRole('button', { name: /Remove selected \(1\)/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Remove #2/ }));
    expect(screen.getByRole('button', { name: /Remove selected \(0\)/ })).toBeDisabled();
    fireEvent.click(selectAll);
    expect(selectAll).toBeChecked();
    fireEvent.click(selectAll);
    expect(screen.getByRole('button', { name: /Remove selected \(0\)/ })).toBeDisabled();
  });

  it('the confirmation counts what it removes: one entry, or n entries', async () => {
    renderList([row(2, 'remove'), row(3, 'remove')]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Remove #2/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove selected \(1\)/ }));
    expect(await screen.findByText('Remove 1 entry?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Remove 1 entry?')).not.toBeInTheDocument());
    expect(bulkReject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select all removals/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove selected \(2\)/ }));
    expect(await screen.findByText('Remove 2 entries?')).toBeInTheDocument();
  });

  it('a row decided in its own review leaves the selection and can no longer be ticked', () => {
    renderList([row(2, 'remove'), row(3, 'remove')]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Remove #2/ }));
    const item = screen.getByText(/Remove #2/).closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: /^Review/ }));
    fireEvent.click(within(item).getByRole('button', { name: 'decide 2' }));
    expect(within(item).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove selected \(0\)/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Select all removals \(1\)/ })).toBeInTheDocument();
  });

  it('a bulk remove tells the bell, clears the selection, and shows its result', async () => {
    bulkReject.mockResolvedValue({ results: [], rejected: 2, expired: 0, failed: 0, forbidden: 0 });
    const announced = vi.fn();
    window.addEventListener(KB_CONSOLIDATION_DECIDED_EVENT, announced);
    renderList([row(2, 'remove'), row(3, 'remove')]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Select all removals/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove selected \(2\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Removed 2 entries.')).toBeInTheDocument();
    expect(announced).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Remove selected \(0\)/ })).toBeDisabled();
    window.removeEventListener(KB_CONSOLIDATION_DECIDED_EVENT, announced);
  });
});

describe('describeBulkResult — green only when everything was removed', () => {
  const clean = { results: [], rejected: 1, expired: 0, failed: 0, forbidden: 0 };
  it.each([
    ['an expired one', { expired: 1 }],
    ['a forbidden one', { forbidden: 1 }],
    ['a failed one', { failed: 1 }],
    ['nothing removed', { rejected: 0 }],
  ])('%s makes it a warning', (_label, over) => {
    expect(describeBulkResult({ ...clean, ...over }).variant).toBe('warning');
  });

  it('one removed, nothing else: success, singular', () => {
    expect(describeBulkResult(clean)).toEqual({ variant: 'success', text: 'Removed 1 entry.' });
  });
});
