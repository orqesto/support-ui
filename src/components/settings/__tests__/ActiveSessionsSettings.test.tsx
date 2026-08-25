/**
 * The devices list is a security control, so the properties worth pinning are the ones where
 * being wrong is silent: revoking the wrong row, or revoking the current session and leaving the
 * user on a page that looks signed in but cannot make a request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ActiveSessionsSettings } from '@/components/settings/ActiveSessionsSettings';
import { sessionsService, type ActiveSession } from '@/services/sessions.service';

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const session = (over: Partial<ActiveSession>): ActiveSession => ({
  id: 1,
  familyId: 'fam-1',
  userAgent: CHROME_MAC,
  ipAddress: '203.0.113.9',
  lastUsedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  isCurrent: false,
  ...over,
});

let assignedHref: string | null = null;

beforeEach(() => {
  assignedHref = null;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname: '/settings',
      set href(value: string) {
        assignedHref = value;
      },
      get href() {
        return assignedHref ?? '';
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const confirm = async (label: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name: label }));
  // The dialog repeats the verb; the last matching button is the one inside it.
  const buttons = await screen.findAllByRole('button', { name: label });
  fireEvent.click(buttons[buttons.length - 1]);
};

describe('ActiveSessionsSettings', () => {
  it('lists the devices and marks the one being used', async () => {
    vi.spyOn(sessionsService, 'list').mockResolvedValue([
      session({ id: 1, isCurrent: true }),
      session({ id: 2, userAgent: SAFARI_IPHONE, ipAddress: '198.51.100.4' }),
    ]);

    render(<ActiveSessionsSettings />);

    expect(await screen.findByText('Chrome on Mac')).toBeInTheDocument();
    expect(screen.getByText('Safari on iPhone')).toBeInTheDocument();
    expect(screen.getAllByText('This device')).toHaveLength(1);
  });

  it('revokes the row that was clicked, and only that row', async () => {
    vi.spyOn(sessionsService, 'list').mockResolvedValue([
      session({ id: 1, isCurrent: true }),
      session({ id: 2, userAgent: SAFARI_IPHONE }),
    ]);
    const revoke = vi.spyOn(sessionsService, 'revoke').mockResolvedValue();

    render(<ActiveSessionsSettings />);
    await screen.findByText('Safari on iPhone');

    // Second row's button — the phone, not the current laptop.
    const buttons = screen.getAllByRole('button', { name: /^Sign out$/ });
    fireEvent.click(buttons[1]);
    const inDialog = await screen.findAllByRole('button', { name: /^Sign out$/ });
    fireEvent.click(inDialog[inDialog.length - 1]);

    await waitFor(() => expect(revoke).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByText('Safari on iPhone')).toBeNull());
    // The current device survives — a revoke that took the wrong row with it would be invisible
    // here otherwise.
    expect(screen.getByText('Chrome on Mac')).toBeInTheDocument();
    expect(assignedHref).toBeNull();
  });

  it('leaves for the login screen when the CURRENT session is the one revoked', async () => {
    // Otherwise the user sits on a settings page whose every subsequent request 401s.
    vi.spyOn(sessionsService, 'list').mockResolvedValue([session({ id: 1, isCurrent: true })]);
    vi.spyOn(sessionsService, 'revoke').mockResolvedValue();

    render(<ActiveSessionsSettings />);
    await screen.findByText('Chrome on Mac');
    await confirm(/^Sign out$/);

    await waitFor(() => expect(assignedHref).toBe('/login'));
  });

  it('still leaves when log-out-everywhere errors — the cookies are gone either way', async () => {
    vi.spyOn(sessionsService, 'list').mockResolvedValue([session({ id: 1, isCurrent: true })]);
    const all = vi
      .spyOn(sessionsService, 'logoutEverywhere')
      .mockRejectedValue(new Error('network'));

    render(<ActiveSessionsSettings />);
    await screen.findByText('Chrome on Mac');
    await confirm(/Log out everywhere/);

    await waitFor(() => expect(all).toHaveBeenCalled());
    await waitFor(() => expect(assignedHref).toBe('/login'));
  });

  it('says the list is empty rather than implying something is broken', async () => {
    // A session opened before this shipped has no row. "No devices" must not read as an error.
    vi.spyOn(sessionsService, 'list').mockResolvedValue([]);

    render(<ActiveSessionsSettings />);

    expect(await screen.findByText(/No signed-in devices are being tracked/)).toBeInTheDocument();
  });
});
