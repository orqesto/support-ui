/**
 * A tooltip whose trigger goes away mid-delay (a row re-rendered, a dialog closed) must not leave
 * its show timer behind to fire into an unmounted component.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Tooltip — unmounted while the show is pending', () => {
  it('leaves no timer behind', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <Tooltip content="Ticket #7" side="left" delayDuration={200}>
        <Button>chip</Button>
      </Tooltip>
    );
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.focus(screen.getByRole('button', { name: 'chip' }));
    // CONTROL: the focus did schedule the show (otherwise the 0 below proves nothing).
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
