import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const countGmailMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const countImapMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: (...args: unknown[]) => countGmailMessages(...args),
    countImapMessages: (...args: unknown[]) => countImapMessages(...args),
    update: vi.fn(),
    getIntegrations: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

import { GmailCountReview } from '@/components/settings/integrations/GmailCountReview';
import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const gmailSource = {
  id: 68,
  email: 'orders@example.com',
  enabled: false,
  isKnowledgeBase: false,
  searchQuery: '',
  bulkImportDays: 7,
};
const renderGmail = () =>
  render(
    <GmailCountReview
      source={gmailSource}
      onStarted={vi.fn()}
      onClose={vi.fn()}
      onShowAlert={vi.fn()}
    />
  );
const sample = {
  id: 'm1',
  from: 'simon@client.com',
  subject: 'Refund request #42',
  date: '2026-09-10',
};

describe('Gmail count compared with Odly', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows In Odly / Missing and lists a missing sample', async () => {
    countGmailMessages.mockResolvedValue({
      count: 120,
      capped: false,
      query: 'q',
      inOdly: 117,
      missing: 3,
      missingSamples: [sample],
    });
    renderGmail();
    expect(await screen.findByText('In Odly: 117 · Missing: 3')).toBeInTheDocument();
    expect(screen.getByText('Not in Odly, for example:')).toBeInTheDocument();
    expect(screen.getByText(/Refund request #42/)).toBeInTheDocument();
  });

  it('missing 0 on a complete count says all in Odly', async () => {
    countGmailMessages.mockResolvedValue({
      count: 50,
      capped: false,
      query: 'q',
      inOdly: 50,
      missing: 0,
      missingSamples: [],
    });
    renderGmail();
    expect(await screen.findByText(/all in Odly/)).toBeInTheDocument();
    expect(screen.queryByText('Not in Odly, for example:')).not.toBeInTheDocument();
  });

  it('a capped count is called partial and never "all in Odly"', async () => {
    countGmailMessages.mockResolvedValue({
      count: 5000,
      capped: true,
      query: 'q',
      inOdly: 5000,
      missing: 0,
      missingSamples: [],
    });
    renderGmail();
    expect(await screen.findByText(/Partial comparison: only the newest 5,000/)).toBeInTheDocument();
    expect(screen.queryByText(/all in Odly/)).not.toBeInTheDocument();
  });
});

const imapRow = {
  id: 12,
  name: 'Email-info@shop.eu',
  type: 'email' as const,
  enabled: true,
  isKnowledgeBase: false,
  hasCredentials: true,
  config: {
    email: { host: 'mail.shop.eu', port: 993, user: 'info@shop.eu', password: 'x', secure: true },
  },
};
const renderCard = () =>
  render(
    <EmailIntegrationCard
      integrations={[imapRow] as never}
      onRefresh={vi.fn()}
      onShowAlert={vi.fn()}
    />
  );
const imapResult = (over: Record<string, unknown> = {}) => ({
  count: 160,
  inOdly: 150,
  missing: 4,
  unverifiable: 0,
  capped: false,
  folders: [
    { name: 'INBOX', count: 120 },
    { name: 'Sent', count: 40 },
  ],
  missingSamples: [sample],
  windowDays: 30,
  perRunLimit: 500,
  ...over,
});

describe('IMAP "Compare with Odly" on a saved source', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the row id and shows mailbox, per-folder counts, in Odly and missing', async () => {
    countImapMessages.mockResolvedValue(imapResult());
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    await waitFor(() => expect(countImapMessages).toHaveBeenCalledWith(12));
    expect(
      await screen.findByText('Mailbox (last 30 days): 160 messages (INBOX 120 · Sent 40)')
    ).toBeInTheDocument();
    expect(screen.getByText('In Odly: 150 · Missing: 4')).toBeInTheDocument();
    expect(screen.queryByText(/Can't verify/)).not.toBeInTheDocument();
    expect(screen.getByText(/Refund request #42/)).toBeInTheDocument();
  });

  it("shows Can't verify only when > 0, and never adds it into missing", async () => {
    countImapMessages.mockResolvedValue(imapResult({ unverifiable: 6, windowDays: 0 }));
    renderCard();
    fireEvent.click(screen.getByLabelText('Compare with Odly'));
    expect(
      await screen.findByText("In Odly: 150 · Missing: 4 · Can't verify: 6")
    ).toBeInTheDocument();
    expect(screen.getByText(/Mailbox \(all time\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Missing: 10/)).not.toBeInTheDocument();
  });
});
