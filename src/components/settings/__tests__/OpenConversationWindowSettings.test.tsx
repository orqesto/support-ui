import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Settings → Workspace → Open Conversations (support-service #858: `GET/PATCH
 * /api/organizations/open-conversation-window`, `{ days }`, 1–365, PATCH org-admin only; and
 * `days: 0` = OFF on a backend that reports `off` + `liveMailWindowHours`).
 *
 * What must hold:
 * - on: a Select of 7 / 14 / 1 month (30) / Custom, Custom revealing a days Input (1–365);
 * - off: a Toggle, offered only when the backend supports it, saving `days: 0`; the copy quotes the
 *   backend's live-mail allowance (never a hard-coded day) in every state;
 * - the number shown is the one the SERVER holds — after a save, the one its 200 echoed; after a
 *   refused save, the old one — never what was typed;
 * - input the backend's schema refuses (0, 366, a fraction, blank) is refused here in words and
 *   never sent;
 * - a backend without the route (404: the frontend deploys on push, the backend on a tag) reads
 *   as "not released yet", not as an error, and offers no dead control;
 * - the tab is workspace policy, so a moderator never sees it.
 */
type WindowSetting = { days: number; offSupported: boolean; liveMailWindowHours: number | null };
const getOpenConversationWindow = vi.fn<() => Promise<WindowSetting>>();
const updateOpenConversationWindow = vi.fn<(days: number) => Promise<WindowSetting>>();
/** A backend with off support (24 h live allowance), holding `days`. */
const supported = (days: number): WindowSetting => ({
  days,
  offSupported: true,
  liveMailWindowHours: 24,
});
/** A backend released before off support: `{ days }` only. */
const legacy = (days: number): WindowSetting => ({
  days,
  offSupported: false,
  liveMailWindowHours: null,
});
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
const presetSelect = () => screen.getByLabelText('Window');
const offSwitch = () => screen.getByRole('switch', { name: 'Use an open-conversation window' });
const saveButton = () => screen.getByRole('button', { name: /save/i });
const chooseCustom = () => fireEvent.change(presetSelect(), { target: { value: 'custom' } });

beforeEach(() => {
  vi.clearAllMocks();
  permissions.isAdmin = false;
  permissions.isOrgAdmin = true;
});

describe('OpenConversationWindowSettings', () => {
  it('shows the stored window and saves a new one, then shows what the server stored', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(14));
    // The server's echo differs from the typed value on purpose: the card must show the echo.
    updateOpenConversationWindow.mockResolvedValue(supported(31));
    render(<OpenConversationWindowSettings />);

    expect(await screen.findByText(/Currently 14 days/)).toBeInTheDocument();
    expect(presetSelect()).toHaveValue('14');
    expect(screen.queryByLabelText('Days')).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    fireEvent.change(presetSelect(), { target: { value: '30' } });
    expect(saveButton()).not.toBeDisabled();
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateOpenConversationWindow).toHaveBeenCalledWith(30));
    expect(await screen.findByText(/Currently 31 days/)).toBeInTheDocument();
    // 31 is no preset: the card shows it as Custom with the stored number.
    expect(presetSelect()).toHaveValue('custom');
    expect(daysInput()).toHaveValue(31);
    expect(screen.getByText(/Saved: 31 days/)).toBeInTheDocument();

    // Editing again withdraws the notice: it must not stand beside a number that is not saved.
    fireEvent.change(daysInput(), { target: { value: '40' } });
    expect(screen.queryByText(/Saved:/)).not.toBeInTheDocument();
  });

  it('offers 7 / 14 / 1 month / Custom, and Custom saves the typed number', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(14));
    updateOpenConversationWindow.mockResolvedValue(supported(200));
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    const labels = Array.from((presetSelect() as HTMLSelectElement).options).map(
      (option) => `${option.value}:${option.text}`
    );
    expect(labels).toEqual(['7:7 days', '14:14 days', '30:1 month (30 days)', 'custom:Custom']);

    chooseCustom();
    fireEvent.change(daysInput(), { target: { value: '200' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateOpenConversationWindow).toHaveBeenCalledWith(200));
    expect(await screen.findByText(/Currently 200 days/)).toBeInTheDocument();
  });

  it.each([
    [7, '7'],
    [30, '30'],
    [1, 'custom'],
    [365, 'custom'],
  ])('a stored %i shows as %s', async (days, shown) => {
    getOpenConversationWindow.mockResolvedValue(supported(days));
    render(<OpenConversationWindowSettings />);
    await screen.findByText(new RegExp(`Currently ${days} days?\\.`));
    expect(presetSelect()).toHaveValue(shown);
    if (shown === 'custom') expect(daysInput()).toHaveValue(days);
  });

  it.each(['0', '366', '2.5', '-1', ''])(
    'Custom refuses %j in words and sends nothing',
    async (typed) => {
      getOpenConversationWindow.mockResolvedValue(supported(14));
      render(<OpenConversationWindowSettings />);
      await screen.findByText(/Currently 14 days/);

      chooseCustom();
      fireEvent.change(daysInput(), { target: { value: typed } });
      fireEvent.click(saveButton());

      expect(
        await screen.findByText('Enter a whole number of days from 1 to 365.')
      ).toBeInTheDocument();
      expect(updateOpenConversationWindow).not.toHaveBeenCalled();
    }
  );

  it('a refused save shows the reason and keeps the stored number', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(14));
    updateOpenConversationWindow.mockRejectedValue(
      await apiError(403, { error: 'Admin access required' })
    );
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    fireEvent.change(presetSelect(), { target: { value: '7' } });
    fireEvent.click(saveButton());

    expect(await screen.findByText(/Admin access required/)).toBeInTheDocument();
    expect(screen.getByText(/Currently 14 days/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved:/)).not.toBeInTheDocument();
  });

  it('a backend without the route (404) says it is not released yet and offers no control', async () => {
    getOpenConversationWindow.mockRejectedValue(await apiError(404, { error: 'Not found' }));
    render(<OpenConversationWindowSettings />);

    expect(await screen.findByText(/not available on this deployment yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Window')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn't/)).not.toBeInTheDocument();
  });

  // What a released backend WITHOUT the route really answers: the path falls through to
  // `/api/organizations/:id` (requireGlobalAdmin → 403 for an org admin; getById → 400 for a
  // global admin). A test that only feeds a 404 proves a branch no real old backend reaches.
  it.each([
    [403, 'Global admin access required'],
    [400, 'Invalid organization ID'],
  ])(
    'a released backend without the route (%i %s) also reads as not released yet',
    async (status, message) => {
      getOpenConversationWindow.mockRejectedValue(await apiError(status, { error: message }));
      render(<OpenConversationWindowSettings />);

      expect(await screen.findByText(/not available on this deployment yet/)).toBeInTheDocument();
      expect(screen.queryByText(/Couldn't/)).not.toBeInTheDocument();
    }
  );

  it('any OTHER 403 is a real refusal and is shown as one', async () => {
    getOpenConversationWindow.mockRejectedValue(
      await apiError(403, { error: 'Insufficient permissions' })
    );
    render(<OpenConversationWindowSettings />);

    expect(await screen.findByText(/Insufficient permissions/)).toBeInTheDocument();
    expect(screen.queryByText(/not available on this deployment yet/)).not.toBeInTheDocument();
  });

  it('a second click while saving sends nothing more', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(14));
    let finish: (value: WindowSetting) => void = () => undefined;
    updateOpenConversationWindow.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    );
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    fireEvent.change(presetSelect(), { target: { value: '30' } });
    // Held from before the click: while saving, the button shows its loading state.
    const button = saveButton();
    fireEvent.click(button);
    await waitFor(() => expect(updateOpenConversationWindow).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    finish(supported(30));

    expect(await screen.findByText(/Currently 30 days/)).toBeInTheDocument();
    expect(updateOpenConversationWindow).toHaveBeenCalledTimes(1);
  });

  it('a failed read is an error, not a default window', async () => {
    getOpenConversationWindow.mockRejectedValue(await apiError(500, { error: 'boom' }));
    render(<OpenConversationWindowSettings />);

    expect(
      await screen.findByText(/Couldn't load the open-conversation window/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Window')).not.toBeInTheDocument();
  });
});

describe('OpenConversationWindowSettings — Off', () => {
  it('turning it off saves days 0 and says what off means, quoting the live allowance', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(14));
    updateOpenConversationWindow.mockResolvedValue(supported(0));
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    expect(offSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/up to 24 hours late\) becomes open work/)).toBeInTheDocument();
    fireEvent.click(offSwitch());
    // Off hides the length controls: there is no window to choose.
    expect(screen.queryByLabelText('Window')).not.toBeInTheDocument();
    expect(saveButton()).not.toBeDisabled();
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateOpenConversationWindow).toHaveBeenCalledWith(0));
    expect(
      await screen.findByText(
        'Currently off: only email dated in the last 24 hours becomes open work.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Saved: off\./)).toBeInTheDocument();
    expect(offSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(saveButton()).toBeDisabled();
  });

  it('a stored OFF shows the switch off; turning it on offers 14 and saves it', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(0));
    updateOpenConversationWindow.mockResolvedValue(supported(14));
    render(<OpenConversationWindowSettings />);

    expect(await screen.findByText(/Currently off/)).toBeInTheDocument();
    expect(offSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Window')).not.toBeInTheDocument();
    // The off copy never talks about "the window" it does not have.
    expect(screen.getByText(/dated in the last 24 hours\s+reopens/)).toBeInTheDocument();
    expect(screen.queryByText(/inside the window/)).not.toBeInTheDocument();

    fireEvent.click(offSwitch());
    expect(presetSelect()).toHaveValue('14');
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateOpenConversationWindow).toHaveBeenCalledWith(14));
    expect(await screen.findByText(/Currently 14 days/)).toBeInTheDocument();
  });

  it('the copy follows the backend allowance — 48 hours, never a hard-coded day', async () => {
    getOpenConversationWindow.mockResolvedValue({
      days: 0,
      offSupported: true,
      liveMailWindowHours: 48,
    });
    render(<OpenConversationWindowSettings />);

    expect(
      await screen.findByText(
        'Currently off: only email dated in the last 48 hours becomes open work.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/24 hours/)).not.toBeInTheDocument();
  });

  it('a backend WITHOUT off support gets no switch, and the presets still save', async () => {
    getOpenConversationWindow.mockResolvedValue(legacy(14));
    updateOpenConversationWindow.mockResolvedValue(legacy(7));
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/Off:/)).not.toBeInTheDocument();
    fireEvent.change(presetSelect(), { target: { value: '7' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateOpenConversationWindow).toHaveBeenCalledWith(7));
    expect(await screen.findByText(/Currently 7 days/)).toBeInTheDocument();
    // After saving against the older backend, still no switch.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('a 400 on saving off (a backend that lost off support) is said plainly and changes nothing', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(14));
    updateOpenConversationWindow.mockRejectedValue(
      await apiError(400, { error: 'Validation failed' })
    );
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    fireEvent.click(offSwitch());
    fireEvent.click(saveButton());

    expect(
      await screen.findByText(/This server does not accept turning the window off/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Currently 14 days/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved:/)).not.toBeInTheDocument();
  });

  it('CONTROL: a 400 on saving a number is still shown as the server said it', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(14));
    updateOpenConversationWindow.mockRejectedValue(
      await apiError(400, { error: 'Validation failed' })
    );
    render(<OpenConversationWindowSettings />);
    await screen.findByText(/Currently 14 days/);

    fireEvent.change(presetSelect(), { target: { value: '7' } });
    fireEvent.click(saveButton());

    expect(await screen.findByText(/Validation failed/)).toBeInTheDocument();
    expect(screen.queryByText(/turning the window off/)).not.toBeInTheDocument();
  });
});

describe('Workspace → Open Conversations tab', () => {
  it('an org admin can open it by deep link', async () => {
    getOpenConversationWindow.mockResolvedValue(supported(14));
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
