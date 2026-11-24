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

const gmail = (enabled: boolean) => ({
  id: 91,
  name: 'Gmail-help@shop.example',
  type: 'gmail' as const,
  enabled,
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
});
