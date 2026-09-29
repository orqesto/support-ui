/**
 * F1 (KB consolidation #873): the moderator's side-by-side review of a proposed merge.
 *
 * What it can get wrong: sending a member the moderator unticked, letting a file ride along that
 * nobody ticked, letting a member whose text changed since the proposal be ticked (the server
 * drops it — the tick would lie), offering Accept to someone who may not decide it, and reporting
 * an `expired` accept or a discarded answer as success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbConsolidationDetail } from '@/services/kbConsolidation.service';

const getMembers = vi.fn<(id: number) => Promise<KbConsolidationDetail>>();
const accept = vi.fn<(id: number, body: unknown) => Promise<unknown>>();
const decline = vi.fn<(id: number) => Promise<void>>();
let permissions: { isOrgAdmin: boolean; manageKb: boolean } = { isOrgAdmin: false, manageKb: true };

vi.mock('@/services/kbConsolidation.service', () => ({
  kbConsolidationService: {
    getMembers: (id: number) => getMembers(id),
    accept: (id: number, body: unknown) => accept(id, body),
    decline: (id: number) => decline(id),
  },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isOrgAdmin: permissions.isOrgAdmin,
    hasPermission: (perm: string) => perm === 'manage_knowledge_base' && permissions.manageKb,
  }),
}));

const { KbConsolidationReview } = await import('../KbConsolidationReview');
const { KB_CONSOLIDATION_DECIDED_EVENT } = await import('@/lib/kbConsolidation');

const member = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  gone: false as const,
  publicId: `KB-${id}`,
  question: `Question ${id}?`,
  answer: `Answer ${id}.`,
  date: '2026-09-20T10:00:00.000Z',
  approved: true,
  conversationId: 500 + id,
  conversationPublicId: `SUP-${id}`,
  attachments: [] as { id: number; filename: string | null }[],
  editedSinceProposed: false,
  labelNow: 'refund',
  languageNow: 'en',
  stillEligible: true,
  covered: false,
  alreadyCounted: false,
  ...over,
});

const detail = (over: Partial<KbConsolidationDetail> = {}): KbConsolidationDetail => ({
  suggestionId: 77,
  type: 'consolidate',
  status: 'pending',
  label: 'refund',
  language: 'en',
  proposed: { question: 'How do refunds work?', answer: 'Refunds take 5 days.' },
  proposedAnswer: null,
  conflicts: [{ summary: 'One says 5 days, one says 10', memberIds: [1, 2] }],
  rationale: 'All ask about refunds.',
  metrics: { conversations: 3, customers: 3, sameThread: true },
  // The members route's real shape (BE ffb025c3): each judge-dropped entry carries its public id.
  judgeDropped: [
    { id: 9, reason: 'about one order only', publicId: 'KB-9' },
    { id: 10, reason: 'a raw email', publicId: null },
  ],
  case: null,
  members: [
    member(1, { attachments: [{ id: 41, filename: 'invoice.pdf' }] }),
    member(2),
    member(3),
    member(4, { editedSinceProposed: true, question: 'Edited question?' }),
  ],
  canDecide: true,
  ...over,
});

const renderReview = () =>
  render(
    <MemoryRouter>
      <KbConsolidationReview suggestionId={77} />
    </MemoryRouter>
  );

const box = (name: RegExp | string) => screen.getByRole<HTMLInputElement>('checkbox', { name });

beforeEach(() => {
  vi.clearAllMocks();
  permissions = { isOrgAdmin: false, manageKb: true };
  accept.mockResolvedValue({ id: 77, status: 'accepted', caseId: 900, linked: 3, dropped: [] });
  decline.mockResolvedValue();
});
afterEach(cleanup);

describe('KbConsolidationReview (F1)', () => {
  it('shows every member side by side with its thread link, the draft, badges, conflicts and judge drops', async () => {
    getMembers.mockResolvedValue(detail());
    renderReview();
    expect(await screen.findByText('Question 1?')).toBeInTheDocument();
    expect(screen.getByText('Answer 2.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thread SUP-3' })).toHaveAttribute(
      'href',
      '/messages?id=503'
    );
    expect(screen.getByDisplayValue('How do refunds work?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Refunds take 5 days.')).toBeInTheDocument();
    expect(screen.getByText('AI-drafted')).toBeInTheDocument();
    expect(screen.getByText('same thread')).toBeInTheDocument();
    expect(screen.getByText('3 customers')).toBeInTheDocument();
    // Entries are named the way the KB list names them: "#KB-1", never a bare row id.
    expect(
      within(screen.getByRole('list', { name: 'Conflicts' })).getByRole('listitem')
    ).toHaveTextContent('One says 5 days, one says 10 (#KB-1, #KB-2)');
    // Judge-dropped entries are named by their own public id; "#<id>" only when it is null.
    expect(screen.getByText(/about one order only/)).toHaveTextContent(
      '#KB-9 — about one order only'
    );
    expect(screen.getByText(/a raw email/)).toHaveTextContent('#10 — a raw email');
  });

  it('a member edited since proposed says so and can NOT be ticked', async () => {
    getMembers.mockResolvedValue(detail());
    renderReview();
    await screen.findByText('Edited question?');
    expect(screen.getByText('edited since proposed — will be left out')).toBeInTheDocument();
    const edited = box('Include #KB-4');
    expect(edited.checked).toBe(false);
    expect(edited.disabled).toBe(true);
  });

  it('marks a member already declined for this case — and still lets it be ticked (LOW-3)', async () => {
    // `covered` (members route): a declined or unmerged verdict already covers this entry or its
    // conversation for this case/key. The moderator should know; the choice stays theirs.
    getMembers.mockResolvedValue(
      detail({ members: [member(1), member(2, { covered: true }), member(3)] })
    );
    renderReview();
    const marked = within(await screen.findByTestId('member-2'));
    expect(marked.getByText('declined before')).toBeInTheDocument();
    expect(within(screen.getByTestId('member-1')).queryByText('declined before')).toBeNull();
    const tick = box('Include #KB-2');
    expect(tick.checked).toBe(true);
    expect(tick.disabled).toBe(false);
  });

  it('attach to a case that no longer exists has a complete title (LOW-4)', async () => {
    getMembers.mockResolvedValue(
      detail({ type: 'attach', proposed: null, case: null, members: [member(5)] })
    );
    renderReview();
    expect(
      await screen.findByText('Proposed: add these entries to a case that no longer exists')
    ).toBeInTheDocument();
  });

  it('marks an already-counted member', async () => {
    getMembers.mockResolvedValue(
      detail({ members: [member(1), member(2, { alreadyCounted: true })] })
    );
    renderReview();
    expect(await screen.findByText('already counted')).toBeInTheDocument();
  });

  it('keeps no file unless ticked, and only files of ticked members; the body carries exactly the choices', async () => {
    getMembers.mockResolvedValue(detail());
    renderReview();
    await screen.findByText('Question 1?');

    const keep = box('Keep invoice.pdf');
    expect(keep.checked).toBe(false); // default: nothing rides along

    // Untick member 3 and edit the draft.
    fireEvent.click(box('Include #KB-3'));
    fireEvent.change(screen.getByDisplayValue('Refunds take 5 days.'), {
      target: { value: 'Refunds take 5 working days.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Accept merge/ }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept).toHaveBeenCalledWith(77, {
      question: 'How do refunds work?',
      answer: 'Refunds take 5 working days.',
      memberIds: [1, 2],
      attachmentIds: [],
    });
  });

  it('a kept file is sent; unticking its member drops the file and disables its box', async () => {
    getMembers.mockResolvedValue(detail());
    renderReview();
    await screen.findByText('Question 1?');
    fireEvent.click(box('Keep invoice.pdf'));
    expect(box('Keep invoice.pdf').checked).toBe(true);

    fireEvent.click(box('Include #KB-1'));
    expect(box('Keep invoice.pdf').checked).toBe(false);
    expect(box('Keep invoice.pdf').disabled).toBe(true);

    fireEvent.click(box('Include #KB-1'));
    fireEvent.click(box('Keep invoice.pdf'));
    fireEvent.click(screen.getByRole('button', { name: /Accept merge/ }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept.mock.calls[0][1]).toMatchObject({ memberIds: [1, 2, 3], attachmentIds: [41] });
  });

  it('a merge needs two ticked entries', async () => {
    getMembers.mockResolvedValue(detail());
    renderReview();
    await screen.findByText('Question 1?');
    fireEvent.click(box('Include #KB-2'));
    fireEvent.click(box('Include #KB-3'));
    expect(screen.getByRole('button', { name: /Accept merge/ })).toBeDisabled();
    expect(screen.getByText('Tick at least two entries to merge.')).toBeInTheDocument();
  });

  it('when canDecide is false, Accept and Decline are disabled and the reason is shown', async () => {
    getMembers.mockResolvedValue(detail({ canDecide: false }));
    renderReview();
    await screen.findByText('Question 1?');
    expect(screen.getByRole('button', { name: /Accept merge/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Decline/ })).toBeDisabled();
    expect(screen.getByTestId('accept-blocked-reason')).toHaveTextContent(
      /needs knowledge-base permission for every department/
    );
  });

  it('renders nothing and fetches nothing without manage_knowledge_base', () => {
    permissions = { isOrgAdmin: false, manageKb: false };
    const { container } = renderReview();
    expect(container).toBeEmptyDOMElement();
    expect(getMembers).not.toHaveBeenCalled();
  });

  it('an EXPIRED accept says nothing was changed — not success', async () => {
    getMembers.mockResolvedValue(detail());
    accept.mockResolvedValue({ id: 77, status: 'expired', reason: 'Fewer than two left.' });
    renderReview();
    await screen.findByText('Question 1?');
    fireEvent.click(screen.getByRole('button', { name: /Accept merge/ }));
    expect(
      await screen.findByText(/Nothing was changed — this proposal expired/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Merged into case/)).not.toBeInTheDocument();
  });

  it('attach: the case is read-only, no answer is sent unless the moderator opts in, and a discarded answer is reported', async () => {
    getMembers.mockResolvedValue(
      detail({
        type: 'attach',
        proposed: null,
        proposedAnswer: 'Refunds take 7 days now.',
        case: {
          id: 900,
          publicId: 'KB-900',
          question: 'How do refunds work?',
          answer: 'Refunds take 5 days.',
          editedSinceProposed: false,
        },
        members: [member(5)],
      })
    );
    accept.mockResolvedValue({
      id: 77,
      status: 'accepted',
      caseId: 900,
      linked: 1,
      dropped: [],
      answerDiscarded: true,
    });
    renderReview();
    await screen.findByText('Question 5?');
    expect(screen.queryByDisplayValue('How do refunds work?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add to case/ }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept.mock.calls[0][1]).toEqual({ memberIds: [5], attachmentIds: [] });
    expect(await screen.findByText(/Your refreshed answer was NOT saved/)).toBeInTheDocument();
  });

  it('a successful accept names the case, counts in words that agree, and lists dropped entries', async () => {
    getMembers.mockResolvedValue(detail());
    // The real accept result (consolidationApply.ts) carries the case's public id.
    accept.mockResolvedValue({
      id: 77,
      status: 'accepted',
      caseId: 900,
      casePublicId: 'KB-900',
      linked: 1,
      dropped: [2, 3],
    });
    renderReview();
    await screen.findByText('Question 1?');
    fireEvent.click(screen.getByRole('button', { name: /Accept merge/ }));
    expect(
      await screen.findByText(/Merged into case #KB-900 — 1 entry linked\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2 entries were left out because they changed or left the knowledge base/)
    ).toHaveTextContent('(#KB-2, #KB-3)');
  });

  it('a case with no public id yet is named by its row id', async () => {
    getMembers.mockResolvedValue(detail());
    accept.mockResolvedValue({
      id: 77,
      status: 'accepted',
      caseId: 900,
      casePublicId: null,
      linked: 3,
      dropped: [],
    });
    renderReview();
    await screen.findByText('Question 1?');
    fireEvent.click(screen.getByRole('button', { name: /Accept merge/ }));
    expect(
      await screen.findByText(/Merged into case #900 — 3 entries linked\./)
    ).toBeInTheDocument();
  });

  it('attach names the case "#KB-900" in its heading', async () => {
    getMembers.mockResolvedValue(
      detail({
        type: 'attach',
        proposed: null,
        proposedAnswer: null,
        case: {
          id: 900,
          publicId: 'KB-900',
          question: 'Q',
          answer: 'A',
          editedSinceProposed: false,
        },
        members: [member(5)],
      })
    );
    renderReview();
    expect(
      await screen.findByText('Proposed: add these entries to case #KB-900')
    ).toBeInTheDocument();
    expect(screen.getByText(/Case #KB-900 — its standard answer/)).toBeInTheDocument();
  });

  it('a decision is announced so the bell re-counts; a failed one is not', async () => {
    const heard = vi.fn();
    window.addEventListener(KB_CONSOLIDATION_DECIDED_EVENT, heard);
    try {
      getMembers.mockResolvedValue(detail());
      accept.mockRejectedValueOnce(new Error('boom'));
      renderReview();
      await screen.findByText('Question 1?');
      fireEvent.click(screen.getByRole('button', { name: /Accept merge/ }));
      expect(await screen.findByText(/boom|Could not accept/)).toBeInTheDocument();
      expect(heard).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: /Decline/ }));
      await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener(KB_CONSOLIDATION_DECIDED_EVENT, heard);
    }
  });

  it('attach: opting in sends the refreshed answer', async () => {
    getMembers.mockResolvedValue(
      detail({
        type: 'attach',
        proposed: null,
        proposedAnswer: 'Refunds take 7 days now.',
        case: { id: 900, publicId: null, question: 'Q', answer: 'A', editedSinceProposed: false },
        members: [member(5)],
      })
    );
    renderReview();
    await screen.findByText('Question 5?');
    fireEvent.click(box(/Also replace the case's answer/));
    fireEvent.click(screen.getByRole('button', { name: /Add to case/ }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept.mock.calls[0][1]).toEqual({
      memberIds: [5],
      attachmentIds: [],
      answer: 'Refunds take 7 days now.',
    });
  });
});
