/**
 * prod test-workspace, 2026-09-18: the wizard's Gmail row said "1 connected" and the panel under
 * it said "No Gmail accounts connected", while Settings listed usetixly@gmail.com. The mailbox is
 * ticked as a Knowledge Base source, and the step mounted the Gmail card with `defaultKB={false}`,
 * which filters its own list to non-KB mailboxes. #260 removed that prop from the IMAP card only.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const kbGmail = {
  id: 91,
  name: 'Gmail-usetixly@gmail.com',
  type: 'gmail' as const,
  enabled: true,
  isKnowledgeBase: true,
  config: { user: 'usetixly@gmail.com', gmail: { searchQuery: '', bulkImportDays: 0 } },
};
const kbImap = {
  id: 92,
  name: 'kb-imap@example.com',
  type: 'email' as const,
  enabled: true,
  isKnowledgeBase: true,
  config: { user: 'kb-imap@example.com' },
};

vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    getAll: () => Promise.resolve({ success: true, data: [kbGmail, kbImap] }),
    countGmailMessages: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/services/gmail-oauth.service', () => ({
  gmailOAuthService: {
    connectWithPopup: vi.fn(),
    hasPendingRedirectResult: () => false,
    consumePendingRedirectResult: () => Promise.resolve(null),
  },
}));
vi.mock('@/hooks/useGmailOAuthAvailability', () => ({ useGmailOAuthAvailability: () => true }));
vi.mock('@/hooks/useCreateSourceDepartments', () => ({
  useCreateSourceDepartments: () => ({
    departments: [{ id: 1, name: 'Info' }],
    loading: false,
    selectedIds: [1],
    setSelectedIds: vi.fn(),
    defaultDepartmentId: 1,
    setDefaultDepartmentId: vi.fn(),
    assignToNewSource: () => Promise.resolve(true),
  }),
}));

import { ChannelsStep } from '../steps/ChannelsStep';

const openRow = async (name: RegExp) => {
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('ChannelsStep — a Knowledge-Base mailbox is listed where it is counted', () => {
  it('lists a KB-marked Gmail mailbox, not "No Gmail accounts connected"', async () => {
    render(
      <ThemeProvider>
        <ChannelsStep onConnectedChange={vi.fn()} />
      </ThemeProvider>
    );
    await openRow(/Gmail/);
    expect(await screen.findByText(/usetixly@gmail\.com/)).toBeTruthy();
    expect(screen.queryByText('No Gmail accounts connected')).toBeNull();
  });

  it('CONTROL: the IMAP card (fixed by #260) lists its KB mailbox too', async () => {
    render(
      <ThemeProvider>
        <ChannelsStep onConnectedChange={vi.fn()} />
      </ThemeProvider>
    );
    await openRow(/Email \(IMAP\)/);
    expect(await screen.findByText(/kb-imap@example\.com/)).toBeTruthy();
  });
});
