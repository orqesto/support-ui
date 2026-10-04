/**
 * KB consolidation #873 (FE audit M5): the merges page lists every pending proposal. It must not
 * fan out one `/members` request per proposal on load — a department with forty proposals
 * would fire forty reads of every member's full text before anyone opens one. Members load
 * when a proposal is opened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const suggestion = (id: number, domain: string, suggestionType: string, payload = {}) => ({
  id,
  domain,
  suggestionType,
  status: 'pending',
  payload,
  evidenceEventIds: null,
  evidenceCount: 1,
  confidence: null,
  createdAt: '2026-09-19T09:00:00.000Z',
  expiresAt: '2026-10-19T09:00:00.000Z',
});

const listSuggestions = vi.fn<(...args: unknown[]) => unknown>();
const getMembers = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('@/services/learning.service', () => ({
  learningService: { listSuggestions: (...args: unknown[]) => listSuggestions(...args) },
}));
vi.mock('@/services/kbConsolidation.service', () => ({
  kbConsolidationService: { getMembers: (id: number) => getMembers(id) },
}));
vi.mock('@/services/kbQuality.service', () => ({
  kbQualityService: { getDetail: () => new Promise(() => {}), bulkReject: vi.fn(), getStatus: () => Promise.resolve(null) },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: true, hasPermission: () => true }),
}));

const { KbMergesReviewPage } = await import('../KbMergesReviewPage');

beforeEach(() => {
  vi.clearAllMocks();
  listSuggestions.mockResolvedValue([
    suggestion(1, 'kb_quality', 'consolidate', { label: 'refund', memberIds: [4, 5, 6] }),
    suggestion(2, 'kb_quality', 'attach', { label: 'shipping', memberIds: [8] }),
    suggestion(3, 'kb_quality', 'promote', {}),
  ]);
  getMembers.mockReturnValue(new Promise(() => {}));
});
afterEach(cleanup);

describe('merges page loads members lazily (M5)', () => {
  it('lists every pending merge by its summary and reads no members until one is opened', async () => {
    render(
      <MemoryRouter>
        <KbMergesReviewPage />
      </MemoryRouter>
    );
    expect(
      await screen.findByText('Merge 3 similar knowledge base answers “refund” into one case')
    ).toBeInTheDocument();
    expect(screen.getByText('Add 1 entry to a case “shipping”')).toBeInTheDocument();
    // The promote row is not a merge.
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getMembers).not.toHaveBeenCalled();

    const second = screen
      .getByText('Add 1 entry to a case “shipping”')
      .closest('li') as HTMLElement;
    fireEvent.click(within(second).getByRole('button', { name: 'Review' }));
    await waitFor(() => expect(getMembers).toHaveBeenCalledTimes(1));
    expect(getMembers).toHaveBeenCalledWith(2);
  });
});

describe('the Quality tab (KB quality review)', () => {
  const renderAt = (url: string) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <KbMergesReviewPage />
      </MemoryRouter>
    );

  it('keeps quality suggestions off the Merges tab and lists them on the Quality tab', async () => {
    listSuggestions.mockResolvedValue([
      suggestion(1, 'kb_quality', 'consolidate', { label: 'refund', memberIds: [4, 5] }),
      suggestion(7, 'kb_quality', 'entry_review', { verdict: 'remove', entryId: 70, reasons: ['no_answer'], questionPreview: 'ok' }),
    ]);
    renderAt('/knowledge-base/merges');
    expect(await screen.findByText('Merge 2 similar knowledge base answers “refund” into one case')).toBeInTheDocument();
    expect(screen.queryByText(/Remove #70/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quality/ }));
    expect(await screen.findByText('Remove #70 — no real answer: ok')).toBeInTheDocument();
    expect(screen.queryByText(/Merge 2 similar/)).not.toBeInTheDocument();
  });

  it('opens on Quality when no merges are waiting but quality suggestions are', async () => {
    listSuggestions.mockResolvedValue([
      suggestion(7, 'kb_quality', 'entry_review', { verdict: 'improve', entryId: 70, reasons: ['raw_email'] }),
    ]);
    renderAt('/knowledge-base/merges');
    expect(await screen.findByText('Rewrite #70 — question is a whole email')).toBeInTheDocument();
  });

  it('honours ?tab=quality and an explicit ?tab=merges', async () => {
    listSuggestions.mockResolvedValue([
      suggestion(7, 'kb_quality', 'entry_review', { verdict: 'improve', entryId: 70, reasons: ['raw_email'] }),
    ]);
    renderAt('/knowledge-base/merges?tab=merges');
    expect(await screen.findByText('No merges waiting for review.')).toBeInTheDocument();
  });
});
