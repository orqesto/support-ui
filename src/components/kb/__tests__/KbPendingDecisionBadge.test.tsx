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
});
