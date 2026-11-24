import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

/**
 * The card decides WHICH review may start the sync by itself (settings quick wins, Task 5): only
 * a source that is new from this connect. After the redirect flow the new source is already in
 * the loaded list, so newness comes from the ids saved before leaving for Google; in onboarding
 * the card mounts with no list at all, so an existing mailbox must not read as new. Invented data.
 */

const oauth = vi.hoisted(() => ({
  connectWithPopup: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  redirectToOAuth: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  pending: null as unknown,
}));
vi.mock('@/features/settings/services/gmail-oauth.service', () => ({
  gmailOAuthService: {
    connectWithPopup: (...args: unknown[]) => oauth.connectWithPopup(...args),
    redirectToOAuth: (...args: unknown[]) => oauth.redirectToOAuth(...args),
    hasPendingRedirectResult: () => oauth.pending !== null,
    consumePendingRedirectResult: () => Promise.resolve(oauth.pending),
  },
}));
const countGmailMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const update = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: (...args: unknown[]) => countGmailMessages(...args),
    update: (...args: unknown[]) => update(...args),
  },
}));
const assignToNewSource = vi.fn(() => Promise.resolve(true));
vi.mock('@/features/settings/hooks/useCreateSourceDepartments', () => ({
  useCreateSourceDepartments: () => ({
    departments: [{ id: 1, name: 'Support' }],
    loading: false,
    selectedIds: [1],
    setSelectedIds: vi.fn(),
    defaultDepartmentId: 1,
    setDefaultDepartmentId: vi.fn(),
    assignToNewSource: () => assignToNewSource(),
  }),
}));

import { GmailIntegrationCard } from '@/features/settings/components/integrations/GmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);
const KEY = 'odly.gmail.preConnectIds';
const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

const row = (id: number, enabled = false) => ({
  id,
  name: `Gmail-box${id}@shop.example`,
  type: 'gmail' as const,
  enabled,
  // Never polled: a new connect, which waits for its count review while paused.
  lastCheckAt: null,
  isKnowledgeBase: false,
  config: { user: `box${id}@shop.example`, gmail: { searchQuery: '', bulkImportDays: 30 } },
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  oauth.pending = null;
  countGmailMessages.mockResolvedValue({ count: 1200, capped: false, query: 'q' });
  update.mockResolvedValue({ success: true });
});

describe('Gmail connect › which review starts by itself', () => {
  it('the redirect flow saves the ids of every source before leaving for Google', async () => {
    oauth.connectWithPopup.mockResolvedValue({ success: false, error: 'POPUP_BLOCKED' });
    let savedAtRedirect: string | null = null;
    oauth.redirectToOAuth.mockImplementation(() => {
      savedAtRedirect = sessionStorage.getItem(KEY);
      return Promise.resolve({ success: true, data: { authUrl: 'https://accounts.example/auth' } });
    });
    render(
      <GmailIntegrationCard
        integrations={[row(5, true), { ...row(6, true), type: 'email' as never }] as never}
        onRefresh={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'continue without popup' }));
    await waitFor(() => expect(oauth.redirectToOAuth).toHaveBeenCalled());
    expect(savedAtRedirect).toBe('[5,6]');
  });

  it('back from the redirect with a NEW id: teams assigned, and the sync starts by itself', async () => {
    sessionStorage.setItem(KEY, '[5]');
    oauth.pending = { success: true, data: { id: 70, email: 'box70@shop.example' } };
    render(
      <GmailIntegrationCard
        integrations={[row(5, true), row(70)] as never}
        onRefresh={() => Promise.resolve()}
        onShowAlert={vi.fn()}
      />
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(assignToNewSource).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('back from the redirect with an id that was already a source: no start, no team relink', async () => {
    sessionStorage.setItem(KEY, '[5,70]');
    oauth.pending = { success: true, data: { id: 70, email: 'box70@shop.example' } };
    const onShowAlert = vi.fn<(alert: { description: string }) => void>();
    // Onboarding mounts the card before the list loads: the mailbox must still not read as new.
    render(
      <GmailIntegrationCard
        integrations={[]}
        onRefresh={() => Promise.resolve()}
        onShowAlert={onShowAlert}
      />
    );
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(onShowAlert.mock.calls[0][0].description).toMatch(/already a source here/);
    await settle();
    expect(update).not.toHaveBeenCalled();
    expect(assignToNewSource).not.toHaveBeenCalled();
  });

  it('a failed redirect result clears the saved ids', async () => {
    sessionStorage.setItem(KEY, '[5]');
    oauth.pending = { success: false, error: 'denied' };
    render(<GmailIntegrationCard integrations={[]} onRefresh={vi.fn()} onShowAlert={vi.fn()} />);
    await waitFor(() => expect(sessionStorage.getItem(KEY)).toBeNull());
  });

  it('a new source closed with "Keep paused" and reopened from its "Paused" link never starts by itself', async () => {
    let answerFirst: (value: unknown) => void = () => undefined;
    countGmailMessages.mockImplementationOnce(
      () => new Promise((resolve) => (answerFirst = resolve))
    );
    oauth.connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 70, email: 'box70@shop.example' },
    });
    const { rerender } = render(
      <GmailIntegrationCard
        integrations={[]}
        onRefresh={() => Promise.resolve()}
        onShowAlert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => expect(oauth.connectWithPopup).toHaveBeenCalled());
    rerender(
      <ThemeProvider>
        <GmailIntegrationCard
          integrations={[row(70)] as never}
          onRefresh={() => Promise.resolve()}
          onShowAlert={vi.fn()}
        />
      </ThemeProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Keep paused' }));
    answerFirst({ count: 1200, capped: false, query: 'q' });
    fireEvent.click(await screen.findByRole('button', { name: 'Check count and start' }));
    expect(await screen.findByText(/Found 1,200 messages/)).toBeInTheDocument();
    await settle();
    expect(update).not.toHaveBeenCalled();
  });

  it('CONTROL — a new source by the popup starts by itself', async () => {
    oauth.connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 70, email: 'box70@shop.example' },
    });
    const { rerender } = render(
      <GmailIntegrationCard
        integrations={[]}
        onRefresh={() => Promise.resolve()}
        onShowAlert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => expect(oauth.connectWithPopup).toHaveBeenCalled());
    rerender(
      <ThemeProvider>
        <GmailIntegrationCard
          integrations={[row(70)] as never}
          onRefresh={() => Promise.resolve()}
          onShowAlert={vi.fn()}
        />
      </ThemeProvider>
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  });

  it('an auto-started source never shows "waiting for review" while the list is re-read', async () => {
    oauth.connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 70, email: 'box70@shop.example' },
    });
    let finishRefresh: () => void = () => undefined;
    // The connect's own refresh answers at once; the one after the start is held open.
    const onRefresh = vi.fn(() =>
      update.mock.calls.length === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => (finishRefresh = resolve))
    );
    const { rerender } = render(
      <GmailIntegrationCard integrations={[]} onRefresh={onRefresh} onShowAlert={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => expect(oauth.connectWithPopup).toHaveBeenCalled());
    rerender(
      <ThemeProvider>
        <GmailIntegrationCard integrations={[row(70)] as never} onRefresh={onRefresh} onShowAlert={vi.fn()} />
      </ThemeProvider>
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await settle();
    expect(onRefresh.mock.calls.length).toBeGreaterThan(0);
    // Started, the list not read back yet: the row is still the paused one.
    expect(screen.queryByText(/waiting for review/)).not.toBeInTheDocument();
    rerender(
      <ThemeProvider>
        <GmailIntegrationCard integrations={[row(70, true)] as never} onRefresh={onRefresh} onShowAlert={vi.fn()} />
      </ThemeProvider>
    );
    finishRefresh();
    await settle();
    expect(screen.queryByText(/waiting for review/)).not.toBeInTheDocument();
    expect(screen.queryByText('Not syncing')).not.toBeInTheDocument();
  });

  it('CONTROL — a paused new source closed with "Keep paused" shows "waiting for review"', async () => {
    countGmailMessages.mockResolvedValue({ count: 9000, capped: false, query: 'q' });
    oauth.connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 70, email: 'box70@shop.example' },
    });
    const { rerender } = render(
      <GmailIntegrationCard integrations={[]} onRefresh={() => Promise.resolve()} onShowAlert={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => expect(oauth.connectWithPopup).toHaveBeenCalled());
    rerender(
      <ThemeProvider>
        <GmailIntegrationCard integrations={[row(70)] as never} onRefresh={() => Promise.resolve()} onShowAlert={vi.fn()} />
      </ThemeProvider>
    );
    expect(await screen.findByText(/Found 9,000 messages/)).toBeInTheDocument();
    await settle();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep paused' }));
    expect(await screen.findByText(/Not syncing — waiting for review/)).toBeInTheDocument();
    expect(screen.getByText('Not syncing')).toBeInTheDocument();
  });
});
