/**
 * The Gmail row's slot under a switched-off mailbox.
 *
 * - It said "Not syncing — waiting for review" for every switched-off mailbox, also one a person
 *   paused after it had synced for months. The row's `lastCheckAt` (the last completed poll; null
 *   = never polled) tells the two apart; without it the wording is true for both.
 * - A start whose list re-read failed reported "Could not start sync" although the mailbox was
 *   syncing, and the row stayed the paused one. The start is reported as started, the row says
 *   so, and the list is read again until it catches up.
 * Invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const countGmailMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const update = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: (...args: unknown[]) => countGmailMessages(...args),
    update: (...args: unknown[]) => update(...args),
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { GmailRowCount, LIST_REREAD_MS } = await import('../GmailCountReview');

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const mailbox = (enabled: boolean, lastCheckAt?: string | null) => ({
  id: 70,
  name: 'Gmail-box70@shop.example',
  type: 'gmail' as const,
  enabled,
  ...(lastCheckAt === undefined ? {} : { lastCheckAt }),
  isKnowledgeBase: false,
  config: { user: 'box70@shop.example', gmail: { searchQuery: '', bulkImportDays: 30 } },
});

const strip = (lastCheckAt?: string | null) =>
  render(
    <GmailRowCount
      integration={mailbox(false, lastCheckAt) as never}
      open={false}
      onOpen={vi.fn()}
      onClose={vi.fn()}
      onRefresh={() => Promise.resolve()}
      onShowAlert={vi.fn()}
    />
  );

const onShowAlert = vi.fn<(alert: { title: string; description: string }) => void>();

/** The card around the row: the list it holds is replaced only by a successful re-read. */
const Card = ({ onRefresh }: { onRefresh: () => Promise<void> }) => {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(true);
  return (
    <GmailRowCount
      integration={mailbox(enabled, null) as never}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onRefresh={async () => {
        await onRefresh();
        setEnabled(true);
      }}
      onShowAlert={onShowAlert}
    />
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  countGmailMessages.mockResolvedValue({ count: 120, capped: false, query: 'q' });
  update.mockResolvedValue({ success: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Gmail row — a switched-off mailbox says why it is off', () => {
  it('⛔ a mailbox paused by a person (polled before) does not read "waiting for review"', () => {
    strip('2026-11-20T10:00:00.000Z');
    expect(screen.getByText('Paused — not syncing.')).toBeInTheDocument();
    expect(screen.queryByText(/waiting for review/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check count and start' })).toBeInTheDocument();
  });

  it('CONTROL: a mailbox never polled (a new connect) still waits for review', () => {
    strip(null);
    expect(screen.getByText('Not syncing — waiting for review.')).toBeInTheDocument();
  });

  it('⛔ a row that does not say (no lastCheckAt) gets wording true for both', () => {
    strip(undefined);
    expect(screen.getByText('Not syncing.')).toBeInTheDocument();
    expect(screen.queryByText(/waiting for review|Paused/)).not.toBeInTheDocument();
  });
});

describe('Gmail row — a start whose list re-read fails', () => {
  it('⛔ is reported as started, and the row does not show the paused strip', async () => {
    const onRefresh = vi.fn(() => Promise.reject(new Error('Network Error')));
    render(<Card onRefresh={onRefresh} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start sync' }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(onShowAlert.mock.calls[0][0].title).toBe('Sync started');
    expect(onShowAlert.mock.calls[0][0].description).toMatch(/could not be refreshed/);
    expect(screen.queryByText(/waiting for review/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Sync started.');
  });

  it('⛔ the list is read again until it catches up, then the row is the live one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onRefresh = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue(undefined);
    render(<Card onRefresh={onRefresh} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start sync' }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_REREAD_MS);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Sync started.');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_REREAD_MS);
    });
    expect(onRefresh).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/not syncing/i)).not.toBeInTheDocument();
  });

  it('CONTROL: a start the server refused still says "Could not start sync"', async () => {
    update.mockRejectedValue(
      Object.assign(new Error('nope'), { status: 400, data: { error: 'nope' } })
    );
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Card onRefresh={onRefresh} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start sync' }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(onShowAlert.mock.calls[0][0].title).toBe('Could not start sync');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('CONTROL: a start whose re-read works says started with no refresh note', async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<Card onRefresh={onRefresh} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start sync' }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(onShowAlert.mock.calls[0][0].title).toBe('Sync started');
    expect(onShowAlert.mock.calls[0][0].description).not.toMatch(/could not be refreshed/);
    expect(screen.queryByText(/not syncing/i)).not.toBeInTheDocument();
  });
});
