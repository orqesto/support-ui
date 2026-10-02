/**
 * FE audit pass 7 (NIT): while the Reset dialog animates out, its title must still name the
 * limit — never "Reset the  limit?". jsdom has no exit animation, so the dialog is stubbed to
 * render its title whatever `open` says: the frame a closing dialog shows.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/managedAiUsage.service', () => ({
  managedAiUsageService: { updatePlatformLimits: () => Promise.resolve() },
}));
vi.mock('sonner', () => ({ toast: { success: () => {}, warning: () => {}, error: () => {} } }));
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ title, onConfirm }: { title: string; onConfirm: () => void }) => (
    <div>
      <p data-testid="confirm-title">{title}</p>
      <button type="button" onClick={onConfirm}>
        Confirm stub
      </button>
    </div>
  ),
}));

const { TokenLimitsCard } = await import('../TokenLimitsCard');

afterEach(cleanup);

describe('TokenLimitsCard reset dialog title', () => {
  it('keeps the limit name after the dialog is closed', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TokenLimitsCard
          budgets={{
            kb: { limit: 7_000_000, source: 'default' },
            regular: { limit: 2_000_000, source: 'platform' },
            ownKeyEnforced: false,
            workspaceOverrides: {},
          }}
        />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear the platform setting for regular work' })
    );
    expect(screen.getByTestId('confirm-title').textContent).toBe('Reset the regular work limit?');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stub' }));
    expect(screen.getByTestId('confirm-title').textContent).toBe('Reset the regular work limit?');
  });
});
