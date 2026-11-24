/**
 * Onboarding channels — a list re-read that fails after "Start sync".
 *
 * The step's `fetchIntegrations` swallowed every error and, on an unsuccessful response, set the
 * list to `[]`. It is the `onRefresh` the Gmail row gets, so a failed re-read after a start
 * resolved: the row never knew the list was stale (it kept saying "waiting for review" for a
 * mailbox that had started) and an unsuccessful response wiped every row. It now rejects and
 * keeps the rows it has, the way the Settings page's read does. Invented data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const getAll = vi.fn<() => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () => getAll(),
    countGmailMessages: () => Promise.resolve({ count: 120, capped: false, query: 'q' }),
    update: () => Promise.resolve({ success: true }),
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
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { ChannelsStep } from '../steps/ChannelsStep';

const paused = {
  id: 91,
  name: 'Gmail-help91@shop.example',
  type: 'gmail' as const,
  enabled: false,
  lastCheckAt: null,
  config: { user: 'help91@shop.example', gmail: { searchQuery: '', bulkImportDays: 30 } },
};

const startFromStep = async () => {
  render(
    <ThemeProvider>
      <ChannelsStep onConnectedChange={vi.fn()} />
    </ThemeProvider>
  );
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  fireEvent.click(screen.getAllByRole('button', { name: /Gmail/ })[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'Check count and start' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Start sync' }));
};

describe('Onboarding channels — a failed list re-read after a start', () => {
  beforeEach(() => {
    getAll.mockReset();
  });

  it('⛔ an unsuccessful response: the row says the sync started and the mailbox stays listed', async () => {
    getAll.mockResolvedValueOnce({ success: true, data: [paused] });
    getAll.mockResolvedValue({ success: false, error: 'Server error' });
    await startFromStep();
    await waitFor(() => expect(screen.getByText('Sync started')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Sync started.');
    expect(screen.queryByText(/waiting for review/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Gmail/ })[0]).toHaveTextContent('1 not syncing');
  });

  it('⛔ a network error: the row says the sync started, not "waiting for review"', async () => {
    getAll.mockResolvedValueOnce({ success: true, data: [paused] });
    getAll.mockRejectedValue(new Error('Network Error'));
    await startFromStep();
    await waitFor(() => expect(screen.getByText('Sync started')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Sync started.');
    expect(screen.queryByText(/waiting for review/)).not.toBeInTheDocument();
  });

  it('CONTROL: a re-read that works shows the live mailbox', async () => {
    getAll.mockResolvedValueOnce({ success: true, data: [paused] });
    getAll.mockResolvedValue({ success: true, data: [{ ...paused, enabled: true }] });
    await startFromStep();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Gmail/ })[0]).toHaveTextContent('1 connected'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
