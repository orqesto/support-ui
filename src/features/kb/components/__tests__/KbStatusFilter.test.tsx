import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KbStatusFilter } from '../KbStatusFilter';

describe('KbStatusFilter', () => {
  it('offers the three decision filters next to the old ones', () => {
    const onChange = vi.fn();
    render(<KbStatusFilter value="approved" onChange={onChange} />);
    for (const name of [
      'Question for you',
      'Engine suggests a change',
      'Skipped by the engine',
      'Changed by the engine',
      'Live',
      'Not live yet',
      'Hidden',
      'Turned down',
      'Everything',
    ])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Engine suggests a change' }));
    expect(onChange).toHaveBeenCalledWith('suggested_change');
  });

  it('on an older backend it offers "Removed automatically" instead', () => {
    render(<KbStatusFilter value="approved" onChange={() => {}} autoChanged={false} />);
    expect(screen.getByRole('button', { name: 'Removed by the engine' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changed by the engine' })).toBeNull();
  });

  it('before the backend has answered it offers NEITHER automatic status', () => {
    render(<KbStatusFilter value="approved" onChange={() => {}} autoChanged={null} />);
    expect(screen.queryByRole('button', { name: 'Removed by the engine' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Changed by the engine' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Live' })).toBeInTheDocument();
  });

  it('marks only the chosen filter as pressed, for screen readers', () => {
    render(<KbStatusFilter value="set_aside" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Skipped by the engine' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });
});
