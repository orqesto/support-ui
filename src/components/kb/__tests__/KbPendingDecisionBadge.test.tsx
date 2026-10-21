import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KbPendingDecisionBadge } from '../KbPendingDecisionBadge';

afterEach(cleanup);

describe('KbPendingDecisionBadge', () => {
  it('shows the highest-priority decision and how many more wait', () => {
    render(
      <KbPendingDecisionBadge
        decision={{ suggestionId: 1, kind: 'approve_capture', reasons: [], canDecide: true }}
        others={1}
      />
    );
    expect(screen.getByText('Needs approval')).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('says why the viewer cannot decide (departments they do not moderate)', () => {
    render(
      <KbPendingDecisionBadge
        decision={{ suggestionId: 2, kind: 'remove', reasons: [], canDecide: false }}
      />
    );
    expect(screen.getByText('Suggested: remove')).toBeInTheDocument();
    expect(
      screen.getByText("You can't decide this one — it covers departments you don't moderate.")
    ).toBeInTheDocument();
  });

  it('shows the set-aside reason and nothing else for a set-aside entry', () => {
    render(<KbPendingDecisionBadge decision={null} setAsideReason="raw_email" />);
    expect(screen.getByText('Raw email')).toBeInTheDocument();
    expect(screen.queryByText(/more/)).toBeNull();
  });

  it('renders nothing for an entry with neither', () => {
    const { container } = render(<KbPendingDecisionBadge decision={null} />);
    expect(container.textContent).toBe('');
  });

  it('compact (the KB table): the action on one line, the full label as its tooltip — no two-line pill', () => {
    render(
      <KbPendingDecisionBadge
        decision={{ suggestionId: 3, kind: 'merge', reasons: [], canDecide: false }}
        compact
      />
    );
    const badge = screen.getByText('Merge?').parentElement!;
    expect(badge).toHaveAttribute('title', 'Suggested: merge');
    expect(badge.className).toContain('whitespace-nowrap');
    // Seen short; the full wording is what a screen reader reads.
    expect(screen.getByText('Merge?')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Suggested: merge')).toHaveClass('sr-only');
    expect(screen.getByText('Not yours to decide').parentElement).toHaveAttribute(
      'title',
      "You can't decide this one — it covers departments you don't moderate."
    );
    expect(
      screen.getByText("You can't decide this one — it covers departments you don't moderate.")
    ).toHaveClass('sr-only');
  });

  it('says when a suggestion expires, once it is within 14 days', () => {
    const inDays = (days: number) =>
      new Date(Date.now() + days * 86_400_000 - 60_000).toISOString();
    const { rerender } = render(
      <KbPendingDecisionBadge
        decision={{
          suggestionId: 3,
          kind: 'merge',
          reasons: [],
          canDecide: true,
          expiresAt: inDays(3),
        }}
      />
    );
    expect(screen.getByText('Expires in 3 days')).toBeInTheDocument();
    rerender(
      <KbPendingDecisionBadge
        decision={{
          suggestionId: 3,
          kind: 'merge',
          reasons: [],
          canDecide: true,
          expiresAt: inDays(30),
        }}
      />
    );
    expect(screen.queryByText(/Expires in/)).toBeNull();
  });

  it('an expired capture review says it is still waiting', () => {
    render(
      <KbPendingDecisionBadge
        decision={{
          suggestionId: 4,
          kind: 'approve_capture',
          reasons: [],
          canDecide: true,
          expiresAt: '2026-10-01T00:00:00.000Z',
          expired: true,
        }}
      />
    );
    expect(screen.getByText('Expired — still waiting')).toBeInTheDocument();
  });
});
