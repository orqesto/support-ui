/**
 * The console must not offer a delete the server will refuse.
 *
 * `acknowledgeIdpManaged=true` used to erase an IdP-owned account. The server stopped
 * honouring it, because overriding it did real damage: the directory re-creates the account
 * under a NEW id but does not re-send its group memberships, so the person returns
 * provisioned with no access and unable to sign in at all — and a re-sync cannot repair it.
 * On taco that happened twice in three days, and one of those deletes also took a
 * colleague's password with it.
 *
 * So the dialog now explains instead of acting. Leaving the button in place would turn that
 * explanation into a raw 409 toast.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';

describe('ConfirmDialog — hideConfirm', () => {
  it('drops the confirm button when the action cannot succeed', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        onConfirm={() => {
          throw new Error('must never be reachable when hideConfirm is set');
        }}
        title="Delete account?"
        description="This account cannot be deleted here."
        confirmText="Delete account"
        cancelText="Close"
        hideConfirm
      />
    );
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('CONTROL: keeps the confirm button for an ordinary destructive action', () => {
    // Without this, hiding the button unconditionally would pass the test above while
    // breaking every other delete in the console.
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        title="Delete account?"
        description="This permanently deletes the account."
        confirmText="Delete account"
      />
    );
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
  });
});
