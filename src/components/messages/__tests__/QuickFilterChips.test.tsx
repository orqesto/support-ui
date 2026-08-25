/**
 * The board has always offered these slices as columns; the list could only reach them by TYPING
 * a filter token, so an agent had to already know a queue existed in order to look in it. That
 * asymmetry is why filtered mail read as missing mail.
 *
 * The design claim is that a chip and its board column return the SAME rows. These tests defend
 * that claim structurally — chips are generated from COLUMNS, and the list applies the column's
 * own `fixedFilters` — because a chip row carrying its own predicates would drift from the board
 * within a release and the two views would quietly disagree about what "Spam" means.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickFilterChips } from '../QuickFilterChips';
import { COLUMNS } from '../kanbanColumns';

describe('QuickFilterChips', () => {
  it('offers a chip for every board column — no column can be unreachable from the list', () => {
    render(<QuickFilterChips value="all" onChange={vi.fn()} />);

    for (const col of COLUMNS) {
      expect(screen.getByRole('button', { name: new RegExp(col.label, 'i') })).toBeInTheDocument();
    }
  });

  it('selects a column by id, so the list applies that column own filters', async () => {
    const onChange = vi.fn();
    render(<QuickFilterChips value="all" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /^Spam/i }));

    // The id, never a copy of the predicate — that indirection is what keeps the two views equal.
    expect(onChange).toHaveBeenCalledWith('spam');
  });

  it('clicking the active chip clears it rather than re-applying it', async () => {
    const onChange = vi.fn();
    render(<QuickFilterChips value="spam" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /^Spam/i }));

    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('marks the active chip for assistive tech, not by colour alone', () => {
    render(<QuickFilterChips value="not_analysed" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Not Analysed/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /^Spam/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders a count when known, and NOTHING when unknown', () => {
    const { rerender } = render(
      <QuickFilterChips value="all" onChange={vi.fn()} counts={{ spam: 12 }} />
    );
    expect(screen.getByRole('button', { name: /^Spam\s*12/i })).toBeInTheDocument();

    // An unknown count must not render as 0 — that would claim the queue is empty.
    rerender(<QuickFilterChips value="all" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^Spam\s*0/i })).not.toBeInTheDocument();
  });
});
