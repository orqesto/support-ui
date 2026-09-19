/**
 * What a reviewer sees on a KB entry, and what everyone else does NOT get offered.
 *
 * ⛔ A rejected entry is also hidden. Labelling it "Hidden" would tell a reviewer it was tucked
 * away by hand when it is on a 90-day clock to deletion.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KBEntryCard } from '../KBEntryCard';
import { KBStatusBadge } from '../KBStatusBadge';
import { purgeDateOf } from '@/lib/kbRejection';
import type { KBEntry } from '@/services/kb.service';

afterEach(cleanup);

const entry = (over: Partial<KBEntry> = {}): KBEntry => ({
  id: 7,
  type: 'qa_pair',
  title: 'Where is my order?',
  content: 'Q: … A: …',
  category: 'support',
  departmentId: null,
  qualityScore: 0.7,
  approved: false,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-09-19T09:00:00.000Z',
  ...over,
});

const card = (props: { entry: KBEntry; canReview: boolean }) => {
  const handlers = {
    onView: vi.fn(),
    onApprove: vi.fn(),
    onHide: vi.fn(),
    onReject: vi.fn(),
    onDelete: vi.fn(),
  };
  render(<KBEntryCard {...handlers} {...props} />);
  return handlers;
};

describe('KB review states', () => {
  it('a rejected entry reads REJECTED with its deletion date, not "Hidden"', () => {
    render(
      <KBStatusBadge entry={entry({ hidden: true, rejectedAt: '2026-09-19T09:00:00.000Z' })} />
    );
    expect(screen.getByText(/Rejected · deleted after/)).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('the purge date is 90 days after the reject', () => {
    const date = purgeDateOf('2026-09-19T00:00:00.000Z');
    expect(date?.toISOString().slice(0, 10)).toBe('2026-12-18');
    expect(purgeDateOf(null)).toBeNull();
  });

  it('a reviewer gets Approve and Reject on a pending entry, and Reject rejects it', () => {
    const handlers = card({ entry: entry(), canReview: true });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(handlers.onReject).toHaveBeenCalledWith(7);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('a rejected entry offers Restore (approve), not Reject again', () => {
    const handlers = card({
      entry: entry({ hidden: true, rejectedAt: '2026-09-19T09:00:00.000Z' }),
      canReview: true,
    });
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(handlers.onApprove).toHaveBeenCalledWith(7);
  });

  it('someone who may not review is offered no review action (the server would 403 it)', () => {
    card({ entry: entry(), canReview: false });
    for (const name of ['Approve', 'Reject', 'Hide', 'Unhide', 'Restore']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /view/i })).toBeInTheDocument();
  });
});
