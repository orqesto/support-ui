import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Dialog } from '../Dialog';

/**
 * A payment form is the case this exists for. Half-entered card details cannot
 * be cheaply redone, and if the customer had already submitted and was in 3-D
 * Secure, an accidental dismissal unmounts the UI while the charge may still
 * complete — leaving them looking at an unpaid screen for a paid subscription.
 *
 * Escape must keep working regardless: a dialog with no keyboard exit is a trap.
 */

afterEach(cleanup);

describe('by default a dialog is dismissible', () => {
  it('closes on a backdrop click', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <p>Card details</p>
      </Dialog>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('a dialog that opts out of backdrop dismissal', () => {
  it('survives a stray click outside the form', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} dismissOnOverlayClick={false}>
        <p>Card details</p>
      </Dialog>
    );

    // There is no backdrop button to click at all — the overlay is inert.
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('Card details')).toBeInTheDocument();
  });

  it('still closes on Escape, so it is never a trap', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} dismissOnOverlayClick={false}>
        <p>Card details</p>
      </Dialog>
    );

    // Fired at the document, not the overlay: that is the point. The old
    // handler only ran when the backdrop itself had focus, so Escape did
    // nothing for a dialog the customer was actually typing in.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
