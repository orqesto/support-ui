import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
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
    assignToNewSource: () => Promise.resolve(true),
  }),
}));

import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const pausedRow = {
  id: 68,
  name: 'Gmail-orders@deuspower.info',
  type: 'gmail' as const,
  enabled: false,
  isKnowledgeBase: true,
  config: { user: 'orders@deuspower.info', gmail: { searchQuery: '', bulkImportDays: 7 } },
};

/**
 * WIRING. Taco 2026-09-16: a Gmail source synced 25,000 messages the moment Google sign-in
 * finished. The fix only works if the card asks for a PAUSED create and then opens the count —
 * drop either and the source syncs before anyone sees a number, with every unit test green.
 */
describe('Gmail connect — saved paused, count first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectWithPopup.mockResolvedValue({ success: true, data: { id: 68, email: 'orders@deuspower.info' } });
    countGmailMessages.mockResolvedValue({ count: 1200, capped: false, query: 'after:2026/09/09' });
  });

  it('Connect asks the backend for a PAUSED source', async () => {
    render(<GmailIntegrationCard integrations={[]} onRefresh={vi.fn()} onShowAlert={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => expect(connectWithPopup).toHaveBeenCalled());
    expect(connectWithPopup.mock.calls[0][0]).toMatchObject({ startPaused: true });
  });

  it('a paused row says it is not syncing and opens its count', async () => {
    render(
      <GmailIntegrationCard
        integrations={[pausedRow] as never}
        onRefresh={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    expect(screen.getByText('Paused — not syncing.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check count and start' }));
    expect(await screen.findByText(/Found 1,200 messages/)).toBeInTheDocument();
    expect(countGmailMessages).toHaveBeenCalledWith(68, {
      searchQuery: '',
      bulkImportDays: 7,
      isKnowledgeBase: true,
    });
  });

  it('after connecting, the new source opens its count without another click', async () => {
    const { rerender } = render(
      <GmailIntegrationCard integrations={[]} onRefresh={vi.fn()} onShowAlert={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => expect(connectWithPopup).toHaveBeenCalled());
    // The parent's refresh delivers the new row.
    rerender(
      <ThemeProvider>
        <GmailIntegrationCard
          integrations={[pausedRow] as never}
          onRefresh={vi.fn()}
          onShowAlert={vi.fn()}
        />
      </ThemeProvider>
    );
    expect(await screen.findByText(/Found 1,200 messages/)).toBeInTheDocument();
  });
});
