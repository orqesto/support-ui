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
import { render } from '@testing-library/react';
import { Dialog, DialogContent } from '../Dialog';

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
});
