/**
 * `AlertDialog` awaited `onConfirm()` and then closed itself. Any dialog the handler
 * opened in the meantime was closed again the instant it appeared.
 *
 * That is not hypothetical: `PricingPage` reuses ONE piece of dialog state for both
 * the "are you sure" prompt and the result, and shows an error dialog from its catch.
 * A failed plan upgrade therefore told the user NOTHING — not the wrong message, no
 * dialog at all. It is the only consumer that passes `onConfirm`, and it was broken.
 *
 * `ConfirmDialog` invokes without awaiting, which is why it never had this.
 */
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AlertDialog } from '@/components/ui/AlertDialog';

/** Mirrors PricingPage: one dialog state, reused for the prompt and the outcome. */
const SharedStateDialog = ({ action }: { action: () => Promise<void> }) => {
  const [dialog, setDialog] = useState({
    open: true,
    title: 'Confirm Upgrade',
    description: 'Are you sure?',
    confirmAction: true,
  });
  const run = async () => {
    setDialog({ ...dialog, open: false });
    try {
      await action();
      setDialog({ open: true, title: 'Success!', description: 'Upgraded.', confirmAction: false });
    } catch {
      setDialog({ open: true, title: 'Error', description: 'Your card was declined.', confirmAction: false });
    }
  };
  return (
    <AlertDialog
      open={dialog.open}
      onOpenChange={(open) => setDialog({ ...dialog, open })}
      title={dialog.title}
      description={dialog.description}
      onConfirm={dialog.confirmAction ? run : undefined}
      confirmText={dialog.confirmAction ? 'Upgrade' : 'OK'}
    />
  );
};

describe('AlertDialog confirm', () => {
  it('does not close a dialog the handler opened — the failure reason must survive', async () => {
    render(<SharedStateDialog action={() => Promise.reject(new Error('declined'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(await screen.findByText('Your card was declined.')).toBeInTheDocument();
    // The control: still on screen after everything settles, not flashed and closed.
    await waitFor(() => expect(screen.getByText('Error')).toBeInTheDocument());
  });

  it('lets a success message through the same way', async () => {
    render(<SharedStateDialog action={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(await screen.findByText('Upgraded.')).toBeInTheDocument();
  });

  it('still closes when the handler opens nothing', async () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog
        open
        onOpenChange={onOpenChange}
        title="Confirm"
        description="Sure?"
        onConfirm={vi.fn()}
        confirmText="Yes"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('runs the handler exactly once', async () => {
    const onConfirm = vi.fn();
    render(
      <AlertDialog open onOpenChange={vi.fn()} title="C" description="D" onConfirm={onConfirm} confirmText="Yes" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});
