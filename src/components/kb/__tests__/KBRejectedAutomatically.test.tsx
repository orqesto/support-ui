/**
 * Pass-5 F1: the backend rejects some entries itself (`rejectedBy` null) — a duplicate automatic
 * Q&A of a ticket, or one a "Save to KB" capture superseded — and marks them
 * `metadata.rejectedReason = 'auto_capture_superseded'`. Wherever a rejected entry shows, such an
 * entry says so; a person's reject does not, and neither does an entry whose metadata is absent.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KBEntryCard } from '../KBEntryCard';
import { KBStatusBadge } from '../KBStatusBadge';
import type { KBEntry } from '@/services/kb.service';

afterEach(cleanup);

const NOTE = 'Automatic duplicate — rejected automatically as a repeat capture of this ticket';

const rejected = (over: Partial<KBEntry> = {}): KBEntry => ({
  id: 7,
  type: 'qa_pair',
  title: 'Where is my order?',
  content: 'Q: … A: …',
  category: 'support',
  departmentId: null,
  qualityScore: 0.7,
  approved: false,
  hidden: true,
  usageCount: 0,
  createdAt: '2026-09-19T09:00:00.000Z',
  rejectedAt: '2026-10-07T09:00:00.000Z',
  rejectedBy: null,
  metadata: { rejectedReason: 'auto_capture_superseded' },
  ...over,
});

describe('A rejected entry the backend retired itself', () => {
  it('says it is an automatic duplicate, next to its deletion date', () => {
    render(<KBStatusBadge entry={rejected()} />);
    expect(screen.getByText(/^Rejected · deleted after /)).toBeTruthy();
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it('control: a reviewer’s reject has no such note', () => {
    render(<KBStatusBadge entry={rejected({ rejectedBy: 4, metadata: {} })} />);
    expect(screen.getByText(/^Rejected · deleted after /)).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('a person’s reject carrying a stale automatic reason is the person’s: no note', () => {
    render(<KBStatusBadge entry={rejected({ rejectedBy: 4 })} />);
    expect(screen.getByText(/^Rejected · deleted after /)).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('metadata absent (or another reason): no note, and nothing breaks', () => {
    render(<KBStatusBadge entry={rejected({ metadata: undefined })} />);
    expect(screen.getByText(/^Rejected · deleted after /)).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
    cleanup();
    render(<KBStatusBadge entry={rejected({ metadata: { rejectedReason: 'low_quality' } })} />);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('approved again (no longer rejected): the reason left in metadata says nothing', () => {
    render(<KBStatusBadge entry={rejected({ rejectedAt: null, hidden: false, approved: true })} />);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('shows on the list card too', () => {
    const noop = () => undefined;
    render(
      <KBEntryCard
        entry={rejected()}
        canReview
        onView={noop}
        onApprove={noop}
        onHide={noop}
        onUnhide={noop}
        onReject={noop}
        onDelete={noop}
      />
    );
    expect(screen.getByText(NOTE)).toBeTruthy();
  });
});
