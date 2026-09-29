/**
 * F4 (KB consolidation #873): the KB list's view of merged cases.
 *
 * ⛔ A merged ORIGINAL is hidden because it lives on in its case. Offering Approve/Unhide on it
 * invites an action the server refuses (409) — and reading "Hidden" hides where it went. A CASE
 * row's hide/reject/delete UNMERGES it, so it must be confirmed and say what comes back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';
import { kbEntryDetailResponse } from '@/test/kbEntryDetailResponse';

type KBEntry = KbServiceModule.KBEntry;

const update = vi.fn<(...args: unknown[]) => unknown>();
const getById = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      update: (...args: unknown[]) => update(...args),
      getById: (...args: unknown[]) => getById(...args),
    },
  };
});
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));

const { KBEntryCard } = await import('../KBEntryCard');
const { KBTableView } = await import('../KBTableView');
const { KBStatusBadge } = await import('../KBStatusBadge');
const { KBEntryDetail } = await import('../KBEntryDetail');

const entry = (over: Partial<KBEntry> = {}): KBEntry => ({
  id: 7,
  type: 'qa_pair',
  title: 'Where is my refund?',
  content: 'Question: Where is my refund?\nAnswer: 5 days.',
  category: 'support',
  departmentId: null,
  qualityScore: 0.8,
  approved: false,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-09-19T09:00:00.000Z',
  typeData: { question: 'Where is my refund?', answer: '5 days.' },
  ...over,
});

const merged = entry({
  hidden: true,
  consolidatedInto: 9,
  consolidation: { state: 'merged', caseId: 9, casePublicId: 'KB-9', caseExists: true },
});
const caseRow = entry({ id: 9, approved: true, capturedVia: 'consolidation', publicId: 'KB-9' });

const handlers = () => ({
  onView: vi.fn(),
  onApprove: vi.fn(),
  onHide: vi.fn(),
  onReject: vi.fn(),
  onDelete: vi.fn(),
  onUnmerge: vi.fn(),
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('KB list — consolidation states (F4)', () => {
  it('a merged original reads "merged into #X", linked to the case', () => {
    render(
      <MemoryRouter>
        <KBStatusBadge entry={merged} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'merged into #KB-9' })).toHaveAttribute(
      'href',
      '/knowledge-base?id=9'
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('a merged original offers no Approve / Unhide / Reject / Hide / Delete — card and table', () => {
    for (const View of [KBEntryCard, KBTableView]) {
      const props = handlers();
      render(
        <MemoryRouter>
          {View === KBEntryCard ? (
            <KBEntryCard entry={merged} canReview {...props} />
          ) : (
            <KBTableView entries={[merged]} loading={false} canReview {...props} />
          )}
        </MemoryRouter>
      );
      for (const name of ['Approve', 'Unhide', 'Restore', 'Reject', 'Hide', 'Delete']) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
      cleanup();
    }
  });

  it('control: a plain hidden entry still offers Unhide', () => {
    render(
      <MemoryRouter>
        <KBEntryCard entry={entry({ hidden: true })} canReview {...handlers()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Unhide' })).toBeInTheDocument();
  });

  it('a detached original says so — with or without its case', () => {
    render(
      <MemoryRouter>
        <KBStatusBadge
          entry={entry({
            hidden: true,
            consolidation: { state: 'detached', caseId: 9, casePublicId: 'KB-9', caseExists: true },
          })}
        />
        <KBStatusBadge
          entry={entry({
            hidden: true,
            consolidation: { state: 'detached', caseId: 12, casePublicId: null, caseExists: false },
          })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('detached from case #KB-9')).toBeInTheDocument();
    expect(screen.getByText('detached (case removed)')).toBeInTheDocument();
  });

  it('a detached entry that is no longer hidden reads by its own state, not "detached" (MED-1)', () => {
    // The backend sends `detached` only while hidden (consolidationFields.ts); the badge must not
    // override Approved/Pending if one arrives anyway.
    render(
      <MemoryRouter>
        <KBStatusBadge
          entry={entry({
            hidden: false,
            approved: true,
            consolidatedInto: null,
            consolidation: { state: 'detached', caseId: 9, casePublicId: 'KB-9', caseExists: true },
          })}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText(/detached from case/)).not.toBeInTheDocument();
  });

  it('a case row offers Unmerge (to a reviewer only)', () => {
    const props = handlers();
    render(
      <MemoryRouter>
        <KBEntryCard entry={caseRow} canReview {...props} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unmerge' }));
    expect(props.onUnmerge).toHaveBeenCalledWith(caseRow);
    cleanup();
    render(
      <MemoryRouter>
        <KBEntryCard entry={caseRow} canReview={false} {...handlers()} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Unmerge' })).not.toBeInTheDocument();
  });

  it('editing a Q&A entry sends question + answer; a case row notes to Unmerge instead', async () => {
    // The drawer re-reads the entry: the mock is the detail route's real body, not a list row.
    getById.mockResolvedValue(
      kbEntryDetailResponse({
        id: 9,
        approved: true,
        capturedVia: 'consolidation',
        publicId: 'KB-9',
      })
    );
    update.mockResolvedValue({ success: true, data: caseRow });
    render(
      <MemoryRouter>
        <KBEntryDetail entry={caseRow} onClose={vi.fn()} canReview {...handlers()} />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: /Edit/ }));
    expect(screen.getByText(/to change what this case is about/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: '7 days.' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith(9, {
      title: 'Where is my refund?',
      category: 'support',
      question: 'Where is my refund?',
      answer: '7 days.',
    });
  });

  it('the drawer acts on the entry it fetched, not the row it was opened with (H1)', async () => {
    // Opened with a row that says nothing about consolidation; the detail route says it is a case.
    getById.mockResolvedValue(
      kbEntryDetailResponse({
        id: 9,
        approved: true,
        capturedVia: 'consolidation',
        publicId: 'KB-9',
      })
    );
    const props = handlers();
    render(
      <MemoryRouter>
        <KBEntryDetail
          entry={entry({ id: 9, approved: true })}
          onClose={vi.fn()}
          canReview
          {...props}
        />
      </MemoryRouter>
    );
    expect(await screen.findByText('Case')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Unmerge/ }));
    expect(props.onUnmerge).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, capturedVia: 'consolidation' })
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(props.onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ capturedVia: 'consolidation' })
    );
  });

  it('a merged original opened from a bare row offers nothing the server refuses (H1)', async () => {
    getById.mockResolvedValue(
      kbEntryDetailResponse({ id: 7, hidden: true, consolidatedInto: 9, casePublicId: 'KB-9' })
    );
    render(
      <MemoryRouter>
        <KBEntryDetail
          entry={entry({ id: 7, hidden: true })}
          onClose={vi.fn()}
          canReview
          {...handlers()}
        />
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: 'merged into #KB-9' })).toBeInTheDocument();
    for (const name of [/Approve/, /Unhide/, /Restore/, /Edit/, /Delete/, /Reject/, /^Hide$/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  describe('an entry whose source was removed (LOW-6)', () => {
    const retiredCase = entry({
      id: 9,
      approved: true,
      capturedVia: 'consolidation',
      publicId: 'KB-9',
      sourceDeleted: true,
    });
    const retiredOriginal = entry({
      hidden: true,
      sourceDeleted: true,
      consolidatedInto: 9,
      consolidation: { state: 'merged', caseId: 9, casePublicId: 'KB-9', caseExists: true },
    });
    // Unmerge stays: bringing a retired case's originals back is legitimate (the server allows it).
    const SERVING = ['Approve', 'Reject', 'Hide', 'Unhide', 'Restore'];

    it('reads "Source removed — not used", never "Approved · Case" or "merged into"', () => {
      render(
        <MemoryRouter>
          <KBStatusBadge entry={retiredCase} />
          <KBStatusBadge entry={retiredOriginal} />
        </MemoryRouter>
      );
      const marks = screen.getAllByText('Source removed — not used');
      expect(marks).toHaveLength(2);
      // The stale sweep retires entries too (no mailbox or KB deleted) — no cause is named.
      expect(marks[0]).toHaveAttribute(
        'title',
        'Its source is no longer in the knowledge base, so it is not used.'
      );
      expect(screen.queryByText('Approved')).not.toBeInTheDocument();
      expect(screen.queryByText('Case')).not.toBeInTheDocument();
      expect(screen.queryByText(/merged into/)).not.toBeInTheDocument();
    });

    it('card and table offer nothing that implies it serves answers; Delete stays', () => {
      for (const View of [KBEntryCard, KBTableView]) {
        render(
          <MemoryRouter>
            {View === KBEntryCard ? (
              <KBEntryCard entry={retiredCase} canReview {...handlers()} />
            ) : (
              <KBTableView entries={[retiredCase]} loading={false} canReview {...handlers()} />
            )}
          </MemoryRouter>
        );
        for (const name of SERVING) {
          expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        }
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unmerge' })).toBeInTheDocument();
        cleanup();
      }
    });

    it('the drawer, fed by the detail route, says the same and offers the same', async () => {
      getById.mockResolvedValue(
        kbEntryDetailResponse({
          id: 9,
          approved: true,
          capturedVia: 'consolidation',
          publicId: 'KB-9',
          sourceDeleted: true,
        })
      );
      render(
        <MemoryRouter>
          <KBEntryDetail entry={entry({ id: 9 })} onClose={vi.fn()} canReview {...handlers()} />
        </MemoryRouter>
      );
      expect(await screen.findByText('Source removed — not used')).toBeInTheDocument();
      for (const name of [/Approve/, /Reject/, /^Hide$/, /Unhide/, /Restore/, /Edit/]) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Unmerge/ })).toBeInTheDocument();
    });

    it("on the deployed backend (detail without sourceDeleted) the drawer keeps the list's answer (MED-1)", async () => {
      // Prod's detail route (getKBEntry) sends no sourceDeleted / capturedVia / publicId; its
      // list does. The drawer must not read a retired entry as live.
      const prodDetail = kbEntryDetailResponse({ id: 7, approved: true });
      for (const key of ['sourceDeleted', 'capturedVia', 'publicId', 'consolidatedInto'] as const) {
        delete (prodDetail.data as Record<string, unknown>)[key];
      }
      getById.mockResolvedValue(prodDetail);
      render(
        <MemoryRouter>
          <KBEntryDetail
            entry={entry({ id: 7, approved: true, sourceDeleted: true })}
            onClose={vi.fn()}
            canReview
            {...handlers()}
          />
        </MemoryRouter>
      );
      expect(await screen.findByText('Source removed — not used')).toBeInTheDocument();
      for (const name of [/Approve/, /^Hide$/]) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });
  });
});
