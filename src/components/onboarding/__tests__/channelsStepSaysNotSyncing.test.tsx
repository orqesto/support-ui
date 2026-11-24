/**
 * A Gmail mailbox connected in the wizard is saved PAUSED until its message count is
 * reviewed. The channel row said "1 connected" with a green check over it, so the review was
 * missed and nothing synced. The row has to say the mailbox is not syncing yet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';

let rows: unknown[] = [];
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () => Promise.resolve({ success: true, data: rows }),
    countGmailMessages: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/features/settings/services/gmail-oauth.service', () => ({
  gmailOAuthService: {
    connectWithPopup: vi.fn(),
    hasPendingRedirectResult: () => false,
    consumePendingRedirectResult: () => Promise.resolve(null),
  },
}));
vi.mock('@/features/settings/hooks/useGmailOAuthAvailability', () => ({ useGmailOAuthAvailability: () => true }));

import { ChannelsStep } from '../steps/ChannelsStep';

const gmail = (enabled: boolean, id = 91, lastCheckAt: string | null = null) => ({
  id,
  name: `Gmail-help${id}@shop.example`,
  type: 'gmail' as const,
  enabled,
  lastCheckAt,
  config: { user: 'help@shop.example', gmail: { searchQuery: '', bulkImportDays: 30 } },
});

const renderStep = async () => {
  render(
    <ThemeProvider>
      <ChannelsStep onConnectedChange={vi.fn()} />
    </ThemeProvider>
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
};

describe('Onboarding channels — a paused mailbox is not "connected"', () => {
  beforeEach(() => {
    rows = [];
  });

  it('⛔ a Gmail mailbox waiting for review says it is not syncing', async () => {
    rows = [gmail(false)];
    await renderStep();
    expect(screen.getByRole('button', { name: /Gmail/ })).toHaveTextContent('1 not syncing — open to review');
    expect(screen.queryByText('1 connected')).not.toBeInTheDocument();
  });

  it('CONTROL: a syncing Gmail mailbox still reads "1 connected"', async () => {
    rows = [gmail(true)];
    await renderStep();
    expect(screen.getByText('1 connected')).toBeInTheDocument();
    expect(screen.queryByText(/not syncing/)).not.toBeInTheDocument();
  });

  it('⛔ a switched-off IMAP mailbox has no review to open: plain "not syncing"', async () => {
    rows = [{ ...gmail(false, 92, '2026-11-20T10:00:00Z'), type: 'email', name: 'IMAP box' }];
    await renderStep();
    const imapRow = screen.getByRole('button', { name: /IMAP|Email/ });
    expect(imapRow).toHaveTextContent('1 not syncing');
    expect(imapRow).not.toHaveTextContent(/open to review/);
  });

  it('⛔ a Gmail mailbox paused by a person (polled before) has no review to open', async () => {
    rows = [gmail(false, 93, '2026-11-20T10:00:00Z')];
    await renderStep();
    const row = screen.getByRole('button', { name: /Gmail/ });
    expect(row).toHaveTextContent('1 not syncing');
    expect(row).not.toHaveTextContent(/open to review/);
  });

  it('⛔ two Gmail mailboxes, one waiting for review: the live one is still counted', async () => {
    rows = [gmail(true, 94, '2026-11-20T10:00:00Z'), gmail(false, 95)];
    await renderStep();
    const row = screen.getByRole('button', { name: /Gmail/ });
    expect(row).toHaveTextContent('1 connected');
    expect(row).toHaveTextContent('1 not syncing — open to review');
  });
});
