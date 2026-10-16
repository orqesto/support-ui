/**
 * The row's Review dialog with the REAL quality review: a suggestion decided elsewhere (409) shows
 * its real status, reports no decision, and the close then re-reads the list exactly once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbQualityDetail } from '@/services/kbQuality.service';

const getDetail = vi.fn<(id: number) => Promise<KbQualityDetail>>();
const accept = vi.fn<(id: number, body: unknown) => Promise<unknown>>();

vi.mock('@/services/kbQuality.service', () => ({
  kbQualityService: {
    getDetail: (id: number) => getDetail(id),
    accept: (id: number, body: unknown) => accept(id, body),
    keep: () => Promise.resolve(),
  },
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: true, hasPermission: () => true }),
}));

const { KbDecisionDialog } = await import('../KbDecisionDialog');

const detail = (over: Partial<KbQualityDetail> = {}): KbQualityDetail => ({
  suggestionId: 63,
  status: 'pending',
  verdict: 'improve',
  reasons: ['raw_email'],
  note: 'The question is a whole message.',
  proposed: { question: 'How do I change my plan?', answer: 'Open Billing and pick a plan.' },
  rewriteProblem: null,
  inputTruncated: false,
  entry: {
    id: 70,
    publicId: 'KB-70',
    question: 'Hello team, how do I change my plan? Thanks',
    answer: 'Open Billing and pick a plan.',
    approved: false,
    timesReferenced: 1,
    date: '2026-09-01T10:00:00.000Z',
    conversationId: 500,
    conversationPublicId: 'SUP-500',
  },
  editedSinceProposed: false,
  stillEligible: true,
  canDecide: true,
  ...over,
});

afterEach(cleanup);

describe('KbDecisionDialog with the real quality review', () => {
  it('decided elsewhere (409): no decision is reported, and closing re-reads the list once', async () => {
    getDetail.mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail({ status: 'accepted' }));
    accept.mockRejectedValue(
      Object.assign(new Error('This suggestion was already decided.'), { status: 409 })
    );
    const onDecided = vi.fn();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <KbDecisionDialog
          decision={{ suggestionId: 63, kind: 'rewrite', reasons: [], canDecide: true }}
          onClose={onClose}
          onDecided={onDecided}
        />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: /Save rewrite/ }));
    expect(await screen.findByText(/no longer pending \(accepted\)/)).toBeInTheDocument();
    expect(onDecided).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(false); // false ⇒ the page re-reads on close
  });
});
