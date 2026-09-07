/**
 * One track for every "which of these" switch: the Messages and Tickets view toggles both
 * render through it, so a look change lands on both or neither.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SegmentedControl } from '../SegmentedControl';

afterEach(cleanup);

const segments = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

describe('SegmentedControl', () => {
  it('marks exactly the active segment pressed and reports a pick', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl ariaLabel="View" value="a" onChange={onChange} segments={[...segments]} />
    );
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('is a labelled group', () => {
    render(
      <SegmentedControl ariaLabel="View" value="a" onChange={vi.fn()} segments={[...segments]} />
    );
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument();
  });
});
