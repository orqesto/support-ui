import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Popover } from '../Popover';

/**
 * Popover and Escape — one press, one layer:
 *  - Escape on the trigger or in the panel closes the popover and goes no further: the page's own
 *    Escape (a document listener closes the open thread, a window one clears a selection) never
 *    sees it. Until 2026-11-12 the popover listened on the document like them, ran after them, and
 *    one Escape closed both.
 *  - Escape in a modal dialog above it (a question asked from the panel) is the dialog's alone.
 *  - A popover INSIDE a modal still closes on its own Escape.
 */

const pageEscape = vi.fn();
const onPageKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') pageEscape();
};
beforeEach(() => {
  document.addEventListener('keydown', onPageKey);
  window.addEventListener('keydown', onPageKey);
});
afterEach(() => {
  document.removeEventListener('keydown', onPageKey);
  window.removeEventListener('keydown', onPageKey);
  cleanup();
  vi.clearAllMocks();
});

const Harness = ({ withQuestion = false }: { withQuestion?: boolean }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        ariaLabel="Panel"
        width={200}
        trigger={({ toggle }) => <Button onClick={toggle}>Open</Button>}
      >
        <Button>Inside</Button>
      </Popover>
      {withQuestion && (
        <div role="dialog" aria-modal="true" aria-label="Question">
          <Button>Answer</Button>
        </div>
      )}
    </>
  );
};

const panel = () => screen.queryByRole('dialog', { name: 'Panel' });
const press = (target: Element) =>
  act(() => {
    fireEvent.keyDown(target, { key: 'Escape' });
  });
const openIt = () => fireEvent.click(screen.getByRole('button', { name: 'Open' }));

describe('Popover — Escape', () => {
  it('in the panel: closes it, focus back on the trigger, the page never sees it', async () => {
    render(<Harness />);
    openIt();
    const inside = screen.getByRole('button', { name: 'Inside' });
    expect(document.activeElement).toBe(inside);
    press(inside);
    expect(panel()).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }))
    );
    expect(pageEscape).not.toHaveBeenCalled();
  });

  it('on the trigger: closes it, the page never sees it', () => {
    render(<Harness />);
    openIt();
    press(screen.getByRole('button', { name: 'Open' }));
    expect(panel()).toBeNull();
    expect(pageEscape).not.toHaveBeenCalled();
  });

  it('focus elsewhere on the page: still closes it', () => {
    render(<Harness />);
    openIt();
    press(document.body);
    expect(panel()).toBeNull();
  });

  it('in a modal question above it: the popover stays open', () => {
    render(<Harness withQuestion />);
    openIt();
    press(screen.getByRole('button', { name: 'Answer' }));
    expect(panel()).not.toBeNull();
  });

  it('a click in a modal question above it is not a "press outside"', () => {
    render(<Harness withQuestion />);
    openIt();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Answer' }));
    expect(panel()).not.toBeNull();
  });

  it('CONTROL: a click outside closes it', () => {
    render(<Harness />);
    openIt();
    fireEvent.mouseDown(document.body);
    expect(panel()).toBeNull();
  });

  it('a popover inside a modal is not under it: Escape elsewhere in that modal still closes it', () => {
    render(
      <div role="dialog" aria-modal="true" aria-label="Settings">
        <Harness />
        <Button>Other field</Button>
      </div>
    );
    openIt();
    press(screen.getByRole('button', { name: 'Other field' }));
    expect(panel()).toBeNull();
  });
});
