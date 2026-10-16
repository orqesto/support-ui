import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KbBulkDecisionBar } from '../KbBulkDecisionBar';

const bulk = {
  selected: new Set<number>(),
  toggle: () => {},
  clear: () => {},
  busy: false,
  selectableIds: [1, 2],
  selectable: () => true,
  captureCount: 0,
  removeCount: 0,
  approveSelected: () => Promise.resolve({ done: 0, skipped: 0, failed: 0 }),
  rejectSelected: () => Promise.resolve({ done: 0, skipped: 0, failed: 0 }),
  removeSelected: () => Promise.resolve({ done: 0, skipped: 0, failed: 0 }),
};

describe('KbBulkDecisionBar', () => {
  it('is hidden below md, like the checkbox table it acts on', () => {
    render(<KbBulkDecisionBar bulk={bulk} mode="needs_decision" />);
    const bar = screen.getByText('Select all (2)').closest('div.hidden');
    expect(bar).not.toBeNull();
    expect(bar).toHaveClass('md:flex');
  });
});
