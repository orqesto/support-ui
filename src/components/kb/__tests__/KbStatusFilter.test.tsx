import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KbStatusFilter } from '../KbStatusFilter';

describe('KbStatusFilter', () => {
  it('offers the three decision filters next to the old ones', () => {
    const onChange = vi.fn();
    render(<KbStatusFilter value="approved" onChange={onChange} />);
    for (const name of [
      'Needs your decision',
      'Suggested change',
      'Set aside',
      'Removed automatically',
      'Approved',
      'Pending',
      'Hidden',
      'Rejected',
      'All',
    ])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suggested change' }));
    expect(onChange).toHaveBeenCalledWith('suggested_change');
  });

  it('marks only the chosen filter as pressed, for screen readers', () => {
    render(<KbStatusFilter value="set_aside" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Set aside' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Approved' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });
});
