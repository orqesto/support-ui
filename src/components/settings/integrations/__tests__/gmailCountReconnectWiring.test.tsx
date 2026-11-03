/**
 * The count panel's "Reconnect Google Account" (shown when Google rejects a mailbox's stored
 * sign-in, MAILBOX_SIGN_IN) is wired to the CARD's reconnect for that row. Rendering the panel
 * alone cannot see this: without the card passing `onReconnect` the button silently never renders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const connectWithPopup = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const countGmailMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/gmail-oauth.service', () => ({
  gmailOAuthService: {
    connectWithPopup: (...args: unknown[]) => connectWithPopup(...args),
    hasPendingRedirectResult: () => false,
    consumePendingRedirectResult: () => Promise.resolve(null),
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: (...args: unknown[]) => countGmailMessages(...args),
    update: vi.fn(),
  },
}));
vi.mock('@/hooks/useCreateSourceDepartments', () => ({
  useCreateSourceDepartments: () => ({
    departments: [{ id: 1, name: 'Support' }],
    loading: false,
    selectedIds: [1],
    setSelectedIds: vi.fn(),
    defaultDepartmentId: 1,
    setDefaultDepartmentId: vi.fn(),
    assignToNewSource: vi.fn(() => Promise.resolve(true)),
  }),
}));

import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const paused = {
  id: 68,
  name: 'Gmail-orders@militech.info',
  type: 'gmail' as const,
  enabled: false,
  isKnowledgeBase: false,
  config: { user: 'orders@militech.info', gmail: { searchQuery: '', bulkImportDays: 7 } },
};

afterEach(cleanup);

describe('Gmail card: Reconnect from the count panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 68, email: 'orders@militech.info' },
    });
  });

  it('a count Google refuses offers Reconnect, which runs the card’s reconnect for that mailbox', async () => {
    countGmailMessages.mockRejectedValue(
      Object.assign(new Error('rejected'), {
        status: 400,
        data: {
          code: 'MAILBOX_SIGN_IN',
          error: 'Google rejected the stored sign-in. Reconnect it.',
        },
      })
    );
    render(
      <GmailIntegrationCard
        integrations={[paused] as never}
        onRefresh={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Check count and start/ }));
    expect(await screen.findByText(/Google rejected the stored sign-in/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Google Account' }));
    await waitFor(() => expect(connectWithPopup).toHaveBeenCalledTimes(1));
    expect(connectWithPopup.mock.calls[0][0]).toEqual({});
  });

  it('a mailbox held down for a rejected sign-in shows Reconnect beside the badge, wired to the card', async () => {
    const heldDown = {
      ...paused,
      enabled: true,
      syncHold: { reason: 'auth_failed', retryInMs: 3_600_000, since: Date.now() },
    };
    render(
      <GmailIntegrationCard
        integrations={[heldDown] as never}
        onRefresh={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() => expect(connectWithPopup).toHaveBeenCalledTimes(1));
  });
});
