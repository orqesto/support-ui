/**
 * The one close-on-outside implementation. Nine components hand-rolled their own before it
 * existed; anything new goes through this so the semantics stay one thing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useClickOutside } from '../useClickOutside';

afterEach(cleanup);

const Probe = ({ active, onClose }: { active: boolean; onClose: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, active, onClose);
  return (
    <div>
      <div ref={ref} data-testid="inside">
        inside
      </div>
      <div data-testid="outside">outside</div>
    </div>
  );
};

describe('useClickOutside', () => {
  it('closes on a mousedown outside and on Escape, not on a click inside', () => {
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId('inside'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does nothing while inactive — a closed menu costs no listeners', () => {
    const onClose = vi.fn();
    render(<Probe active={false} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId('outside'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
