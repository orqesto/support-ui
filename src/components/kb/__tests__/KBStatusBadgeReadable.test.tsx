/**
 * Two defects seen in the KB (dark theme), 2026-10-20:
 * 1. Neutral states ("merged into #X", detached, Hidden, Source removed) were the DEFAULT (primary)
 *    pill with `text-muted-foreground` on top — grey on pale blue, near-illegible. They use the
 *    neutral `secondary` variant now.
 * 2. The table's narrow Status column wrapped long text inside a `rounded-full` pill (a red circle,
 *    a tall grey oval). `compact` keeps every pill on one line with a short label, the full
 *    wording in `title`, and the purge date as plain text under the pill.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KBStatusBadge } from '../KBStatusBadge';
import { KBTableView } from '../KBTableView';
import { getBadgeClasses } from '@/components/ui/Badge/badge.styles';
import { AUTO_SUPERSEDED_NOTE, formatPurgeDate } from '@/lib/kbRejection';
import type { KBEntry } from '@/services/kb.service';

// The table's department column needs a query client; it is not what this file tests.
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));

afterEach(cleanup);

const entry = (over: Partial<KBEntry> = {}): KBEntry =>
  ({
    id: 21,
    type: 'qa_pair',
    title: 'How do I reset my password?',
    content: 'Q: … A: …',
    category: 'support',
    departmentId: null,
    qualityScore: 0.8,
    approved: false,
    hidden: false,
    usageCount: 0,
    createdAt: '2026-09-01T09:00:00.000Z',
    rejectedAt: null,
    ...over,
  }) as KBEntry;

const merged = entry({
  hidden: true,
  consolidatedInto: 208,
  consolidation: { state: 'merged', caseId: 208, casePublicId: 'KB-208', caseExists: true },
} as Partial<KBEntry>);
const detached = entry({
  hidden: true,
  consolidation: { state: 'detached', caseId: 208, casePublicId: 'KB-208', caseExists: true },
} as Partial<KBEntry>);
const autoRejected = entry({
  hidden: true,
  rejectedAt: '2026-10-07T09:00:00.000Z',
  rejectedBy: null,
  metadata: { rejectedReason: 'auto_capture_superseded' },
});

const badgeOf = (el: HTMLElement) => el.closest('div') as HTMLElement;
const primaryFill = getBadgeClasses('default')
  .split(' ')
  .find((cls) => cls.startsWith('bg-'))!;

describe('KBStatusBadge — neutral states are readable', () => {
  it('"merged into #KB-208" is a secondary pill, not muted text on the primary fill', () => {
    render(
      <MemoryRouter>
        <KBStatusBadge entry={merged} />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'merged into #KB-208' });
    const badge = badgeOf(link);
    expect(badge).toHaveClass('bg-secondary', 'text-secondary-foreground');
    expect(badge).not.toHaveClass(primaryFill);
    expect(badge).not.toHaveClass('text-muted-foreground');
    // The link takes the pill's ink instead of a link colour of its own.
    expect(link).toHaveClass('text-inherit', 'hover:underline');
  });

  it('detached and Hidden are secondary pills too', () => {
    render(
      <MemoryRouter>
        <KBStatusBadge entry={detached} />
        <KBStatusBadge entry={entry({ hidden: true })} />
      </MemoryRouter>
    );
    for (const text of ['detached from case #KB-208', 'Hidden']) {
      const badge = screen.getByText(text);
      expect(badge).toHaveClass('bg-secondary');
      expect(badge).not.toHaveClass(primaryFill);
      expect(badge).not.toHaveClass('text-muted-foreground');
    }
  });
});

describe('KBStatusBadge — compact (the table) never makes a circle', () => {
  it('rejected: "Rejected" alone on one line, the purge date under it and in the title', () => {
    render(<KBStatusBadge entry={autoRejected} compact />);
    const purge = formatPurgeDate(autoRejected.rejectedAt)!;
    const pill = screen.getByText('Rejected');
    expect(pill).toHaveClass('whitespace-nowrap');
    expect(pill.getAttribute('title')).toContain(purge);
    expect(screen.getByText(`deleted after ${purge}`)).toBeInTheDocument();
    expect(screen.queryByText(/^Rejected · deleted after/)).toBeNull();
  });

  it('automatic duplicate: short label on a rounded-md tag, full sentence in the title', () => {
    render(<KBStatusBadge entry={autoRejected} compact />);
    const pill = screen.getByText('Auto duplicate').parentElement!;
    expect(pill).toHaveClass('rounded-md');
    expect(pill).not.toHaveClass('rounded-full');
    expect(pill).toHaveAttribute('title', AUTO_SUPERSEDED_NOTE);
    // Seen short; the full sentence is read out (a tooltip alone reaches no screen reader).
    expect(screen.getByText('Auto duplicate')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(AUTO_SUPERSEDED_NOTE)).toHaveClass('sr-only');
  });

  it('"merged into #KB-208" and detached wrap, if at all, on a rounded-md tag', () => {
    render(
      <MemoryRouter>
        <KBStatusBadge entry={merged} compact />
        <KBStatusBadge entry={detached} compact />
      </MemoryRouter>
    );
    for (const badge of [
      badgeOf(screen.getByRole('link', { name: 'merged into #KB-208' })),
      screen.getByText('detached from case #KB-208'),
    ]) {
      expect(badge).toHaveClass('rounded-md');
      expect(badge).not.toHaveClass('rounded-full');
    }
  });

  it('the KB table renders the compact badge', () => {
    const noop = () => undefined;
    render(
      <MemoryRouter>
        <KBTableView
          entries={[autoRejected]}
          loading={false}
          canReview
          onView={noop}
          onApprove={noop}
          onHide={noop}
          onUnhide={noop}
          onReject={noop}
          onDelete={noop}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Auto duplicate').parentElement).toHaveAttribute(
      'title',
      AUTO_SUPERSEDED_NOTE
    );
    expect(screen.getByText('Rejected')).toHaveClass('whitespace-nowrap');
  });

  it('the KB table renders a waiting decision compact too ("Merge?", not a two-line pill)', () => {
    const noop = () => undefined;
    render(
      <MemoryRouter>
        <KBTableView
          entries={[
            {
              ...autoRejected,
              pendingDecision: { suggestionId: 9, kind: 'merge', reasons: [], canDecide: true },
            },
          ]}
          loading={false}
          canReview
          onView={noop}
          onApprove={noop}
          onHide={noop}
          onUnhide={noop}
          onReject={noop}
          onDelete={noop}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Merge?').parentElement).toHaveAttribute('title', 'Suggested: merge');
  });

  it('control: without compact (card, detail) the full wording stays, pill shapes unchanged', () => {
    render(
      <MemoryRouter>
        <KBStatusBadge entry={autoRejected} />
        <KBStatusBadge entry={merged} />
      </MemoryRouter>
    );
    expect(screen.getByText(/^Rejected · deleted after /)).not.toHaveClass('whitespace-nowrap');
    expect(badgeOf(screen.getByRole('link', { name: 'merged into #KB-208' }))).toHaveClass(
      'rounded-full'
    );
    // The full sentence wraps wherever it shows, so it is a rounded-md tag here too.
    const note = screen.getByText(AUTO_SUPERSEDED_NOTE);
    expect(note).toHaveClass('rounded-md');
    expect(note).not.toHaveClass('rounded-full');
  });
});
