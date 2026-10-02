/**
 * A dialog has to hold the page still while it is open.
 *
 * Without it the body scrolls behind the overlay: a wheel gesture aimed at the dialog moves the
 * page underneath, and on a tall dialog — a Stripe checkout especially — the content being read
 * slides away. This affected EVERY dialog in the app, not only the payment one.
 *
 * The restore behaviour is the part worth pinning: putting back `''` instead of the previous
 * value would leave a page that manages its own scrolling permanently unscrollable after a
 * dialog closed, which is a worse bug than the one being fixed.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Dialog, DialogContent } from '../Dialog';

/** Two dialogs stacked the way the merge picker opens its confirm: outer first, inner second. */
const Stacked = ({ outer, inner }: { outer: boolean; inner: boolean }) => (
  <>
    <Dialog open={outer} onOpenChange={vi.fn()}>
      <DialogContent>picker</DialogContent>
    </Dialog>
    <Dialog open={inner} onOpenChange={vi.fn()}>
      <DialogContent>confirm</DialogContent>
    </Dialog>
  </>
);

const renderDialog = (open: boolean) =>
  render(
    <Dialog open={open} onOpenChange={vi.fn()}>
      <DialogContent>body</DialogContent>
    </Dialog>
  );

describe('Dialog scroll lock', () => {
  it('locks the page while open and releases it on close', () => {
    const { rerender } = renderDialog(true);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Dialog open={false} onOpenChange={vi.fn()}>
        <DialogContent>body</DialogContent>
      </Dialog>
    );
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('leaves the page alone when closed', () => {
    document.body.style.overflow = '';
    renderDialog(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the PREVIOUS overflow, not an empty string', () => {
    // A page that manages its own scrolling must get its value back — otherwise closing a dialog
    // silently breaks that page's scrolling for the rest of the session.
    document.body.style.overflow = 'scroll';
    const { unmount } = renderDialog(true);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('scroll');
    document.body.style.overflow = '';
  });

  it('two stacked dialogs closed in ONE update give the page its own value back', () => {
    // A merge closes the picker and its confirm together; the phone page scrolls the document.
    document.body.style.overflow = 'visible';
    const { rerender } = render(<Stacked outer inner={false} />);
    rerender(<Stacked outer inner />);
    expect(document.body.style.overflow).toBe('hidden');
    act(() => rerender(<Stacked outer={false} inner={false} />));
    expect(document.body.style.overflow).toBe('visible');
    document.body.style.overflow = '';
  });

  it('closing the OUTER one first keeps the page still until the inner one closes too', () => {
    document.body.style.overflow = 'visible';
    const { rerender } = render(<Stacked outer inner={false} />);
    rerender(<Stacked outer inner />);
    rerender(<Stacked outer={false} inner />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Stacked outer={false} inner={false} />);
    expect(document.body.style.overflow).toBe('visible');
    document.body.style.overflow = '';
  });

  it('closing the INNER one first also ends with the page’s own value', () => {
    document.body.style.overflow = 'visible';
    const { rerender } = render(<Stacked outer inner={false} />);
    rerender(<Stacked outer inner />);
    rerender(<Stacked outer inner={false} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Stacked outer={false} inner={false} />);
    expect(document.body.style.overflow).toBe('visible');
    document.body.style.overflow = '';
  });
});
