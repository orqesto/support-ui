/**
 * KB quality review: the moderator's decision on ONE learned entry the nightly review flagged.
 *
 * What it can get wrong: sending the AI's text when the moderator edited it, sending a rewrite
 * the server will refuse (empty, over its bounds), offering a decision to someone who may not
 * make it or on an entry that changed since, and reporting an expired decision as done.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbQualityDetail } from '@/services/kbQuality.service';

const getDetail = vi.fn<(id: number) => Promise<KbQualityDetail>>();
const accept = vi.fn<(id: number, body: unknown) => Promise<unknown>>();
const keep = vi.fn<(id: number) => Promise<void>>();
let manageKb = true;

vi.mock('@/services/kbQuality.service', () => ({
  kbQualityService: {
    getDetail: (id: number) => getDetail(id),
    accept: (id: number, body: unknown) => accept(id, body),
    keep: (id: number) => keep(id),
  },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isOrgAdmin: false,
    hasPermission: (perm: string) => perm === 'manage_knowledge_base' && manageKb,
  }),
}));

const { KbQualityReview, QUALITY_QUESTION_MAX } = await import('../KbQualityReview');
const { KB_CONSOLIDATION_DECIDED_EVENT } = await import('@/lib/kbConsolidation');

const detail = (over: Partial<KbQualityDetail> = {}): KbQualityDetail => ({
  suggestionId: 41,
  status: 'pending',
  verdict: 'improve',
  reasons: ['raw_email'],
  note: 'The question is a whole email.',
  proposed: { question: 'Where is my parcel?', answer: 'Use the tracking link.' },
  rewriteProblem: null,
  entry: {
    id: 12,
    publicId: 'KB-12',
    question: 'Hi Anna,\nwhere is my parcel?\nBest regards',
    answer: 'You can use the tracking link.',
    approved: false,
    timesReferenced: 3,
    date: '2026-09-20T10:00:00.000Z',
    conversationId: 900,
    conversationPublicId: 'SUP-900',
  },
  editedSinceProposed: false,
  stillEligible: true,
  canDecide: true,
  ...over,
});

const renderReview = (onDecided = vi.fn()) => {
  render(
    <MemoryRouter>
      <KbQualityReview suggestionId={41} onDecided={onDecided} />
    </MemoryRouter>
  );
  return onDecided;
};

beforeEach(() => {
  vi.clearAllMocks();
  manageKb = true;
});
afterEach(cleanup);

describe('KbQualityReview — improve', () => {
  it('shows the entry as it is, the reasons, and the AI rewrite prefilled for editing', async () => {
    getDetail.mockResolvedValue(detail());
    renderReview();
    expect(await screen.findByText('Proposed: rewrite #KB-12')).toBeInTheDocument();
    expect(screen.getByText('question is a whole email')).toBeInTheDocument();
    expect(screen.getByText('used 3 times')).toBeInTheDocument();
    expect(screen.getByText(/where is my parcel\?\s*Best regards/)).toBeInTheDocument();
    expect(screen.getByLabelText('Question')).toHaveValue('Where is my parcel?');
    expect(screen.getByLabelText('Answer')).toHaveValue('Use the tracking link.');
    expect(screen.getByRole('link', { name: 'Thread SUP-900' })).toHaveAttribute('href', '/messages?id=900');
  });

  it('saves the text the moderator EDITED, not the AI proposal', async () => {
    getDetail.mockResolvedValue(detail());
    accept.mockResolvedValue({ id: 41, status: 'applied', entryId: 12, publicId: 'KB-12' });
    const announced = vi.fn();
    window.addEventListener(KB_CONSOLIDATION_DECIDED_EVENT, announced);
    const onDecided = renderReview();
    fireEvent.change(await screen.findByLabelText('Answer'), { target: { value: '  Track it in your account.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Save rewrite/ }));
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept).toHaveBeenCalledWith(41, { action: 'apply', question: 'Where is my parcel?', answer: 'Track it in your account.' });
    expect(await screen.findByText('#KB-12 was rewritten and approved.')).toBeInTheDocument();
    expect(onDecided).toHaveBeenCalledWith(expect.objectContaining({ kind: 'applied' }));
    expect(announced).toHaveBeenCalled();
    window.removeEventListener(KB_CONSOLIDATION_DECIDED_EVENT, announced);
  });

  it('will not send a rewrite the server refuses: empty, or over its bounds', async () => {
    getDetail.mockResolvedValue(detail());
    renderReview();
    const question = await screen.findByLabelText('Question');
    fireEvent.change(question, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /Save rewrite/ })).toBeDisabled();
    expect(screen.getByTestId('quality-blocked-reason')).toHaveTextContent('The entry needs a question.');
    fireEvent.change(question, { target: { value: 'q'.repeat(QUALITY_QUESTION_MAX + 1) } });
    expect(screen.getByRole('button', { name: /Save rewrite/ })).toBeDisabled();
    // Control: a valid question enables it again.
    fireEvent.change(question, { target: { value: 'Where is my parcel?' } });
    expect(screen.getByRole('button', { name: /Save rewrite/ })).toBeEnabled();
  });

  it('says why there is no rewrite and starts from the entry’s own text', async () => {
    getDetail.mockResolvedValue(detail({ proposed: null, rewriteProblem: 'nothing_reusable' }));
    renderReview();
    expect(await screen.findByText(/found nothing in the answer that would help another customer/)).toBeInTheDocument();
    expect(screen.getByLabelText('Answer')).toHaveValue('You can use the tracking link.');
  });
});

describe('KbQualityReview — remove', () => {
  it('offers Remove and Keep, and a rewrite only on request', async () => {
    getDetail.mockResolvedValue(detail({ verdict: 'remove', reasons: ['customer_specific'], proposed: null }));
    accept.mockResolvedValue({ id: 41, status: 'rejected', entryId: 12, publicId: 'KB-12' });
    renderReview();
    expect(await screen.findByText('Proposed: remove #KB-12')).toBeInTheDocument();
    expect(screen.getByText('only fits one customer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Question')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove entry/ }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith(41, { action: 'reject' }));
    expect(await screen.findByText(/#KB-12 was removed/)).toBeInTheDocument();
  });

  it('"Rewrite it instead" opens the editor on the entry’s text and saves it as a rewrite', async () => {
    getDetail.mockResolvedValue(detail({ verdict: 'remove', reasons: ['outdated'], proposed: null }));
    accept.mockResolvedValue({ id: 41, status: 'applied', entryId: 12 });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Rewrite it instead/ }));
    expect(screen.getByLabelText('Question')).toHaveValue('Hi Anna,\nwhere is my parcel?\nBest regards');
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Where is my parcel?' } });
    fireEvent.click(screen.getByRole('button', { name: /Save rewrite/ }));
    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith(41, { action: 'apply', question: 'Where is my parcel?', answer: 'You can use the tracking link.' })
    );
  });

  it('"Keep as is" declines it', async () => {
    getDetail.mockResolvedValue(detail({ verdict: 'remove', reasons: ['no_answer'] }));
    keep.mockResolvedValue();
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Keep as is/ }));
    await waitFor(() => expect(keep).toHaveBeenCalledWith(41));
    expect(await screen.findByText(/Kept as is/)).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
  });
});

describe('KbQualityReview — who may decide, and when', () => {
  it('a moderator who does not cover the whole scope sees it but cannot decide', async () => {
    getDetail.mockResolvedValue(detail({ canDecide: false }));
    renderReview();
    expect(await screen.findByTestId('quality-blocked-reason')).toHaveTextContent('every department this mailbox serves');
    expect(screen.getByRole('button', { name: /Save rewrite/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove entry/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Keep as is/ })).toBeDisabled();
  });

  it('an entry edited since the review cannot be acted on — it will expire', async () => {
    getDetail.mockResolvedValue(detail({ editedSinceProposed: true }));
    renderReview();
    expect(await screen.findByTestId('quality-blocked-reason')).toHaveTextContent('changed or left the knowledge base');
    expect(screen.getByRole('button', { name: /Remove entry/ })).toBeDisabled();
  });

  it('reports an expired decision as "nothing was changed", never as done', async () => {
    getDetail.mockResolvedValue(detail());
    accept.mockResolvedValue({ id: 41, status: 'expired', reason: 'The entry was edited.' });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Save rewrite/ }));
    expect(await screen.findByText(/Nothing was changed — this suggestion expired. The entry was edited./)).toBeInTheDocument();
  });

  it('a decided suggestion shows its status and no buttons', async () => {
    getDetail.mockResolvedValue(detail({ status: 'accepted' }));
    renderReview();
    expect(await screen.findByText(/no longer pending \(accepted\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove entry/ })).not.toBeInTheDocument();
  });

  it('renders nothing and reads nothing for someone without the knowledge-base permission', async () => {
    manageKb = false;
    getDetail.mockResolvedValue(detail());
    const { container } = render(
      <MemoryRouter>
        <KbQualityReview suggestionId={41} />
      </MemoryRouter>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
    expect(getDetail).not.toHaveBeenCalled();
  });
});
