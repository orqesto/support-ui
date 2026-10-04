/**
 * KB quality review — the Quality tab's list and its bulk "remove". It must only ever send the
 * removals the moderator ticked, never a rewrite suggestion, and say what the server did with
 * each (an entry edited since the review is left alone, not reported as removed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LearningSuggestion } from '@/services/learning.service';

const bulkReject = vi.fn<(ids: number[]) => Promise<unknown>>();
const getDetail = vi.fn<(id: number) => Promise<unknown>>();
vi.mock('@/services/kbQuality.service', () => ({
  kbQualityService: {
    bulkReject: (ids: number[]) => bulkReject(ids),
    getDetail: (id: number) => getDetail(id),
  },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: true, hasPermission: () => true }),
}));

const { KbQualityList, describeBulkResult } = await import('../KbQualityList');

const row = (id: number, verdict: 'improve' | 'remove', preview: string): LearningSuggestion => ({
  id,
  domain: 'kb_quality' as LearningSuggestion['domain'],
  suggestionType: 'entry_review',
  status: 'pending',
  payload: { verdict, entryId: id + 100, publicId: `KB-${id + 100}`, reasons: verdict === 'remove' ? ['no_answer'] : ['raw_email'], questionPreview: preview },
  evidenceEventIds: null,
  evidenceCount: 1,
  confidence: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '9999-12-31T00:00:00.000Z',
});

const rows = [row(1, 'improve', 'Hi Anna, where is my parcel'), row(2, 'remove', 'ok'), row(3, 'remove', 'Order 5512')];

beforeEach(() => {
  vi.clearAllMocks();
  getDetail.mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

const renderList = (onChanged = vi.fn()) => {
  render(
    <MemoryRouter>
      <KbQualityList rows={rows} onChanged={onChanged} />
    </MemoryRouter>
  );
  return onChanged;
};

describe('KbQualityList', () => {
  it('lists removals first, each by its summary, and reads no entry until one is opened', async () => {
    renderList();
    const items = within(screen.getByRole('list', { name: 'Quality suggestions' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Remove #KB-102 — no real answer: ok');
    expect(items[1]).toHaveTextContent('Remove #KB-103');
    expect(items[2]).toHaveTextContent('Rewrite #KB-101 — question is a whole email: Hi Anna, where is my parcel');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getDetail).not.toHaveBeenCalled();
    fireEvent.click(within(items[2]).getByRole('button', { name: 'Review' }));
    await waitFor(() => expect(getDetail).toHaveBeenCalledWith(1));
  });

  it('a rewrite suggestion cannot be ticked for bulk removal', () => {
    renderList();
    const rewrite = screen.getByText(/Rewrite #KB-101/).closest('li') as HTMLElement;
    expect(within(rewrite).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('removes only the ticked removals, after a confirmation, and re-reads the list', async () => {
    bulkReject.mockResolvedValue({ results: [], rejected: 1, expired: 0, failed: 0 });
    const onChanged = renderList();
    const button = screen.getByRole('button', { name: /Remove selected \(0\)/ });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Remove #KB-103/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove selected \(1\)/ }));
    expect(bulkReject).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(bulkReject).toHaveBeenCalledWith([3]));
    expect(await screen.findByText('Removed 1 entry.')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('"Select all removals" ticks every removal and no rewrite', async () => {
    bulkReject.mockResolvedValue({ results: [], rejected: 2, expired: 0, failed: 0 });
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: /Select all removals \(2\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove selected \(2\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(bulkReject).toHaveBeenCalledWith([2, 3]));
  });

  it('says so when nothing is waiting', () => {
    render(
      <MemoryRouter>
        <KbQualityList rows={[]} onChanged={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('No quality suggestions waiting for review.')).toBeInTheDocument();
  });
});

describe('describeBulkResult', () => {
  it('names what was left alone and what failed — never folds them into "removed"', () => {
    expect(describeBulkResult({ results: [], rejected: 3, expired: 1, failed: 2 })).toBe(
      'Removed 3 entries. 1 had changed since the review and was left alone. 2 could not be removed (already decided, or an error) — reload to see them.'
    );
    expect(describeBulkResult({ results: [], rejected: 0, expired: 2, failed: 0 })).toBe(
      'Removed 0 entries. 2 had changed since the review and were left alone.'
    );
  });
});
