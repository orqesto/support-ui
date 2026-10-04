/**
 * KB quality review — mutation-survivor kills for the single review (Stryker, 2026-10-04). Each
 * case pins a branch (what is shown, what is enabled, what is sent) a mutant could flip with the
 * behaviour suite still green.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbQualityDetail } from '@/services/kbQuality.service';

const getDetail = vi.fn<(id: number) => Promise<KbQualityDetail>>();
const accept = vi.fn<(id: number, body: unknown) => Promise<unknown>>();
const keep = vi.fn<(id: number) => Promise<void>>();
vi.mock('@/services/kbQuality.service', () => ({
  kbQualityService: {
    getDetail: (id: number) => getDetail(id),
    accept: (id: number, body: unknown) => accept(id, body),
    keep: (id: number) => keep(id),
  },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: true, hasPermission: () => true }),
}));

const { KbQualityReview, QUALITY_ANSWER_MAX, QUALITY_QUESTION_MAX } = await import('../KbQualityReview');
const { KB_CONSOLIDATION_DECIDED_EVENT } = await import('@/lib/kbConsolidation');

const entry = (over: Partial<NonNullable<KbQualityDetail['entry']>> = {}): NonNullable<KbQualityDetail['entry']> => ({
  id: 12,
  publicId: 'KB-12',
  question: 'Where is my parcel?',
  answer: 'Use the tracking link.',
  approved: true,
  timesReferenced: 0,
  date: null,
  conversationId: null,
  conversationPublicId: null,
  ...over,
});
const detail = (over: Partial<KbQualityDetail> = {}): KbQualityDetail => ({
  suggestionId: 41,
  status: 'pending',
  verdict: 'improve',
  reasons: ['raw_email'],
  note: '',
  proposed: { question: 'Where is my parcel?', answer: 'Track it.' },
  rewriteProblem: null,
  inputTruncated: false,
  entry: entry(),
  editedSinceProposed: false,
  stillEligible: true,
  canDecide: true,
  ...over,
});

const renderReview = (onDecided?: () => void) =>
  render(
    <MemoryRouter>
      <KbQualityReview suggestionId={41} onDecided={onDecided} />
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('what the review shows', () => {
  it('reason badges are red for a removal, amber for a rewrite', async () => {
    getDetail.mockResolvedValue(detail({ verdict: 'remove', reasons: ['outdated'] }));
    renderReview();
    expect((await screen.findByText('out of date')).className).toContain('text-destructive');
    cleanup();
    getDetail.mockResolvedValue(detail());
    renderReview();
    expect((await screen.findByText('question is a whole email')).className).toContain('text-warning');
  });

  it('an approved, never-used entry carries neither badge; a once-used one says "once"', async () => {
    getDetail.mockResolvedValue(detail());
    renderReview();
    await screen.findByText('Proposed: rewrite #KB-12');
    expect(screen.queryByText('not approved')).not.toBeInTheDocument();
    expect(screen.queryByText(/^used /)).not.toBeInTheDocument();
    cleanup();
    getDetail.mockResolvedValue(detail({ entry: entry({ timesReferenced: 1 }) }));
    renderReview();
    expect(await screen.findByText('used once')).toBeInTheDocument();
  });

  it('no note, no "why" line; no thread, no link; a missing answer reads "—"', async () => {
    getDetail.mockResolvedValue(detail({ entry: entry({ answer: null }) }));
    renderReview();
    await screen.findByText('Proposed: rewrite #KB-12');
    expect(screen.queryByText(/Why the AI flagged it/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('the AI badge and the truncation warning only come with an AI proposal', async () => {
    getDetail.mockResolvedValue(detail({ proposed: null, inputTruncated: true, verdict: 'remove' }));
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Rewrite it instead/ }));
    expect(screen.queryByText('AI-drafted')).not.toBeInTheDocument();
    expect(screen.queryByText(/longer than the AI could read/)).not.toBeInTheDocument();
  });

  it('a rewrite problem is only explained for a rewrite with no proposal', async () => {
    getDetail.mockResolvedValue(detail({ verdict: 'remove', proposed: null, rewriteProblem: 'failed' }));
    renderReview();
    await screen.findByText('Proposed: remove #KB-12');
    expect(screen.queryByText(/could not write a replacement/)).not.toBeInTheDocument();
    cleanup();
    getDetail.mockResolvedValue(detail({ rewriteProblem: 'failed' }));
    renderReview();
    await screen.findByText('Proposed: rewrite #KB-12');
    expect(screen.queryByText(/could not write a replacement/)).not.toBeInTheDocument();
  });

  it('a decided suggestion keeps its text read-only', async () => {
    getDetail.mockResolvedValue(detail({ status: 'declined' }));
    renderReview();
    expect(await screen.findByLabelText('Question')).toBeDisabled();
    expect(screen.getByLabelText('Answer')).toBeDisabled();
    expect(screen.queryByTestId('quality-blocked-reason')).not.toBeInTheDocument();
  });

  it('Remove is the primary (red) action for a removal until the moderator starts a rewrite', async () => {
    getDetail.mockResolvedValue(detail({ verdict: 'remove', proposed: null }));
    renderReview();
    expect((await screen.findByRole('button', { name: /Remove entry/ })).className).toContain('bg-destructive');
    fireEvent.click(screen.getByRole('button', { name: /Rewrite it instead/ }));
    expect(screen.getByRole('button', { name: /Remove entry/ })).not.toHaveClass('bg-destructive');
    cleanup();
    getDetail.mockResolvedValue(detail());
    renderReview();
    expect(await screen.findByRole('button', { name: /Remove entry/ })).not.toHaveClass('bg-destructive');
  });
});

describe('what the review shows — the positive cases', () => {
  it('an unapproved entry says so; a note is shown; an AI proposal carries its badge', async () => {
    getDetail.mockResolvedValue(detail({ note: 'a whole email', entry: entry({ approved: false }) }));
    renderReview();
    expect(await screen.findByText('not approved')).toBeInTheDocument();
    expect(screen.getByText(/Why the AI flagged it/)).toBeInTheDocument();
    expect(screen.getByText('a whole email')).toBeInTheDocument();
    expect(screen.getByText('AI-drafted')).toBeInTheDocument();
  });
});

describe('what is sent, and the bounds', () => {
  it('sends trimmed text; exactly the server bounds are allowed', async () => {
    getDetail.mockResolvedValue(detail());
    accept.mockResolvedValue({ status: 'applied', entryId: 12 });
    renderReview();
    const question = 'q'.repeat(QUALITY_QUESTION_MAX);
    const answer = 'a'.repeat(QUALITY_ANSWER_MAX);
    fireEvent.change(await screen.findByLabelText('Question'), { target: { value: `  ${question}  ` } });
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: `  ${answer}\n` } });
    expect(screen.queryByTestId('quality-blocked-reason')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save rewrite/ }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith(41, { action: 'apply', question, answer }));
  });

  it('an answer of only spaces is no answer', async () => {
    getDetail.mockResolvedValue(detail());
    renderReview();
    fireEvent.change(await screen.findByLabelText('Answer'), { target: { value: '   ' } });
    expect(screen.getByTestId('quality-blocked-reason')).toHaveTextContent('The entry needs an answer.');
  });

  it('cancelling the remove confirmation removes nothing', async () => {
    getDetail.mockResolvedValue(detail({ verdict: 'remove', proposed: null }));
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Remove entry/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(accept).not.toHaveBeenCalled();
    expect(screen.queryByText(/deleted after 90 days\. Until then/)).not.toBeInTheDocument();
  });
});

describe('failures', () => {
  it('a load failure says so', async () => {
    getDetail.mockRejectedValue(new Error('down'));
    renderReview();
    expect(await screen.findByText(/down|Could not load this suggestion/)).toBeInTheDocument();
  });

  it('a failed save says so, keeps the review, and the buttons work again', async () => {
    getDetail.mockResolvedValue(detail());
    accept.mockRejectedValue(new Error('server said no'));
    const onDecided = vi.fn();
    renderReview(onDecided);
    fireEvent.click(await screen.findByRole('button', { name: /Save rewrite/ }));
    expect(await screen.findByText(/server said no|Could not save the decision/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save rewrite/ })).toBeEnabled();
    expect(onDecided).not.toHaveBeenCalled();
    expect(getDetail).toHaveBeenCalledTimes(1);
  });

  it('a failed "keep" says so too', async () => {
    getDetail.mockResolvedValue(detail());
    keep.mockRejectedValue(new Error('keep failed'));
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Keep as is/ }));
    expect(await screen.findByText(/keep failed|Could not save the decision/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keep as is/ })).toBeEnabled();
  });

  it('a 404 (gone) re-reads and tells the bell; a still-pending re-read keeps the error', async () => {
    getDetail.mockResolvedValue(detail());
    accept.mockRejectedValue(Object.assign(new Error('Suggestion not found'), { status: 404 }));
    const announced = vi.fn();
    window.addEventListener(KB_CONSOLIDATION_DECIDED_EVENT, announced);
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Save rewrite/ }));
    await waitFor(() => expect(getDetail).toHaveBeenCalledTimes(2));
    expect(announced).toHaveBeenCalled();
    expect(await screen.findByText(/Suggestion not found|Could not save/)).toBeInTheDocument();
    window.removeEventListener(KB_CONSOLIDATION_DECIDED_EVENT, announced);
  });

  it('an outcome with no entry id names "The entry"', async () => {
    getDetail.mockResolvedValue(detail());
    accept.mockResolvedValue({ status: 'applied' });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: /Save rewrite/ }));
    expect(await screen.findByText('The entry was rewritten and approved.')).toBeInTheDocument();
  });
});
