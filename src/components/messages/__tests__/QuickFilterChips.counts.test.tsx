/**
 * Counts on the quick-filter chips (owner, 2026-09-22). The contract that matters:
 *  - a number shown is the depth of THAT chip's list (backend builds it from the same predicate);
 *  - a MISSING count renders nothing — never 0, which would claim an empty queue against an
 *    older backend that simply does not send the field.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickFilterChips } from '../QuickFilterChips';

const renderChips = (counts?: Record<string, number>) =>
  render(<QuickFilterChips value="all" onChange={vi.fn()} counts={counts} />);

const chip = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });

describe('QuickFilterChips — counts', () => {
  it('shows the count next to each chip it was given', () => {
    renderChips({ open: 12, resolved: 1352, spam: 7 });
    expect(chip('Open')).toHaveTextContent('12');
    expect(chip('Resolved')).toHaveTextContent('1352');
    expect(chip('Spam')).toHaveTextContent('7');
  });

  it('a zero is a real count and is shown (an empty queue is worth knowing)', () => {
    renderChips({ archived: 0 });
    expect(chip('Archived')).toHaveTextContent('0');
  });

  it('an uncounted chip renders bare — no 0, no placeholder', () => {
    renderChips({ open: 3 });
    expect(chip('Not Analysed').textContent?.replace(/\s/g, '')).toBe('NotAnalysed');
  });

  it('no counts at all (older backend): every chip renders bare', () => {
    renderChips(undefined);
    for (const label of ['Open', 'In Progress', 'Resolved', 'Spam', 'Other']) {
      expect(chip(label).textContent).not.toMatch(/\d/);
    }
  });
});
