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
      'Changed automatically',
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

  it('on an older backend it offers "Removed automatically" instead', () => {
    render(<KbStatusFilter value="approved" onChange={() => {}} autoChanged={false} />);
    expect(screen.getByRole('button', { name: 'Removed automatically' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changed automatically' })).toBeNull();
  });

  it('before the backend has answered it offers NEITHER automatic status', () => {
    render(<KbStatusFilter value="approved" onChange={() => {}} autoChanged={null} />);
    expect(screen.queryByRole('button', { name: 'Removed automatically' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Changed automatically' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Approved' })).toBeInTheDocument();
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
