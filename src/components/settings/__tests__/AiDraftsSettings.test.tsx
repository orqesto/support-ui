import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Settings → AI → "AI drafts off". The switch is the workspace's; only an admin may change it
 * (PATCH is admin-only on the backend), everyone else sees the state and who can change it.
 * Driven through the real `useAiDraftsOff` query, so a save that does not re-read would leave
 * the switch showing what was clicked instead of what the server holds.
 */

const getAiDrafts = vi.fn<() => Promise<{ off: boolean }>>();
const updateAiDrafts = vi.fn<(off: boolean) => Promise<{ off: boolean }>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAiDrafts: () => getAiDrafts(),
    updateAiDrafts: (off: boolean) => updateAiDrafts(off),
  },
}));
const permissions = { isOrgAdmin: true };
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => permissions }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ selectedOrganizationId: 1, user: { organizationId: 1 } }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { AiDraftsSettings } from '../AiDraftsSettings';
import { apiError } from '@/test/apiError';

const renderCard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AiDraftsSettings />
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  permissions.isOrgAdmin = true;
});

describe('AiDraftsSettings', () => {
  it('an admin switches drafts off: PATCH { off: true }, then the switch shows the stored value', async () => {
    let stored = false;
    getAiDrafts.mockImplementation(() => Promise.resolve({ off: stored }));
    updateAiDrafts.mockImplementation((off) => {
      stored = off;
      return Promise.resolve({ off });
    });
    renderCard();

    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);

    await waitFor(() => expect(updateAiDrafts).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
    expect(getAiDrafts.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('a refused save shows the error and the switch keeps what the server holds', async () => {
    getAiDrafts.mockResolvedValue({ off: false });
    updateAiDrafts.mockRejectedValue(await apiError(403, { error: 'Admin access required' }));
    renderCard();

    fireEvent.click(await screen.findByRole('switch'));

    expect(await screen.findByText(/Admin access required/i)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('a non-admin sees the state, cannot change it, and is told who can', async () => {
    permissions.isOrgAdmin = false;
    getAiDrafts.mockResolvedValue({ off: true });
    renderCard();

    const toggle = await screen.findByRole('switch');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/AI drafts are off for this workspace\./i)).toBeInTheDocument();
    expect(screen.getByText(/Only a workspace admin can change this/i)).toBeInTheDocument();
  });

  it('a backend without the setting (404) shows no switch at all, and no error', async () => {
    getAiDrafts.mockRejectedValue(await apiError(404, { error: 'Not found' }));
    renderCard();

    await waitFor(() => expect(getAiDrafts).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't/i)).not.toBeInTheDocument();
  });
});
