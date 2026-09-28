import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Settings → Workspace → Open Conversations (support-service #858: `GET/PATCH
 * /api/organizations/open-conversation-window`, `{ days }`, 1–365, PATCH org-admin only).
 *
 * What must hold:
 * - the number shown is the one the SERVER holds — after a save, the one its 200 echoed; after a
 *   refused save, the old one — never what was typed;
 * - input the backend's schema refuses (0, 366, a fraction, blank) is refused here in words and
 *   never sent;
 * - a backend without the route (404: the frontend deploys on push, the backend on a tag) reads
 *   as "not released yet", not as an error, and offers no dead control;
 * - the tab is workspace policy, so a moderator never sees it.
 */
const getOpenConversationWindow = vi.fn<() => Promise<{ days: number }>>();
const updateOpenConversationWindow = vi.fn<(days: number) => Promise<{ days: number }>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getOpenConversationWindow: () => getOpenConversationWindow(),
    updateOpenConversationWindow: (days: number) => updateOpenConversationWindow(days),
  },
}));
const permissions = { isAdmin: false, isOrgAdmin: true };
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => permissions }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
// The other Workspace tabs are not under test; stub them so the tab test mounts only the shell.
vi.mock('../CategoriesSettings', () => ({ CategoriesSettings: () => <div>categories</div> }));
vi.mock('../LabelsSettings', () => ({ LabelsSettings: () => null }));
vi.mock('../RoutingKeysSettings', () => ({ RoutingKeysSettings: () => null }));
vi.mock('../BusinessHoursSettings', () => ({ BusinessHoursSettings: () => null }));
vi.mock('../SLAConfigSettings', () => ({ SLAConfigSettings: () => null }));
vi.mock('../SecuritySettings', () => ({ SecuritySettings: () => null }));
vi.mock('../WorkspaceDetailsSettings', () => ({ WorkspaceDetailsSettings: () => null }));

import { OpenConversationWindowSettings } from '../OpenConversationWindowSettings';
import { OrganizationSettings } from '../OrganizationSettings';
import { apiError } from '@/test/apiError';

const daysInput = () => screen.getByLabelText('Days');
const saveButton = () => screen.getByRole('button', { name: /save/i });

beforeEach(() => {
  vi.clearAllMocks();
  permissions.isAdmin = false;
  permissions.isOrgAdmin = true;
});

describe('OpenConversationWindowSettings', () => {
  it('shows the stored window and saves a new one, then shows what the server stored', async () => {
    getOpenConversationWindow.mockResolvedValue({ days: 14 });
    // The server's echo differs from the typed value on purpose: the card must show the echo.
    updateOpenConversationWindow.mockResolvedValue({ days: 31 });
    render(<OpenConversationWindowSettings />);

    expect(await screen.findByText(/Currently 14 days/)).toBeInTheDocument();
    expect(daysInput()).toHaveValue(14);
    expect(saveButton()).toBeDisabled();

    fireEvent.change(daysInput(), { target: { value: '30' } });
    expect(saveButton()).not.toBeDisabled();
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateOpenConversationWindow).toHaveBeenCalledWith(30));
    expect(await screen.findByText(/Currently 31 days/)).toBeInTheDocument();
    expect(daysInput()).toHaveValue(31);
    expect(screen.getByText(/Saved: 31 days/)).toBeInTheDocument();

    // Editing again withdraws the notice: it must not stand beside a number that is not saved.
    fireEvent.change(daysInput(), { target: { value: '40' } });
    expect(screen.queryByText(/Saved:/)).not.toBeInTheDocument();
  });

  it.each(['0', '366', '2.5', ''])('refuses %j in words and sends nothing', async (typed) => {
    getOpenConversationWindow.mockResolvedValue({ days: 14 });
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    fireEvent.change(daysInput(), { target: { value: typed } });
    fireEvent.click(saveButton());

    expect(
      await screen.findByText('Enter a whole number of days from 1 to 365.')
    ).toBeInTheDocument();
    expect(updateOpenConversationWindow).not.toHaveBeenCalled();
  });

  it('a refused save shows the reason and keeps the stored number', async () => {
    getOpenConversationWindow.mockResolvedValue({ days: 14 });
    updateOpenConversationWindow.mockRejectedValue(
      await apiError(403, { error: 'Admin access required' })
    );
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    fireEvent.change(daysInput(), { target: { value: '7' } });
    fireEvent.click(saveButton());

    expect(await screen.findByText(/Admin access required/)).toBeInTheDocument();
    expect(screen.getByText(/Currently 14 days/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved:/)).not.toBeInTheDocument();
  });

  it('a backend without the route (404) says it is not released yet and offers no control', async () => {
    getOpenConversationWindow.mockRejectedValue(await apiError(404, { error: 'Not found' }));
    render(<OpenConversationWindowSettings />);

    expect(await screen.findByText(/not available on this deployment yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Days')).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't/)).not.toBeInTheDocument();
  });

  it('a failed read is an error, not a default window', async () => {
    getOpenConversationWindow.mockRejectedValue(await apiError(500, { error: 'boom' }));
    render(<OpenConversationWindowSettings />);

    expect(
      await screen.findByText(/Couldn't load the open-conversation window/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Days')).not.toBeInTheDocument();
  });
});

describe('Workspace → Open Conversations tab', () => {
  it('an org admin can open it by deep link', async () => {
    getOpenConversationWindow.mockResolvedValue({ days: 14 });
    render(
      <MemoryRouter>
        <OrganizationSettings section="open-conversations" />
      </MemoryRouter>
    );
    expect(screen.getByText('Open Conversations')).toBeInTheDocument();
    expect(await screen.findByText(/Currently 14 days/)).toBeInTheDocument();
  });

  it('a moderator sees neither the tab nor the card, even by deep link', () => {
    permissions.isOrgAdmin = false;
    render(
      <MemoryRouter>
        <OrganizationSettings section="open-conversations" />
      </MemoryRouter>
    );
    expect(screen.queryByText('Open Conversations')).not.toBeInTheDocument();
    expect(screen.getByText('categories')).toBeInTheDocument();
    expect(getOpenConversationWindow).not.toHaveBeenCalled();
  });
});
