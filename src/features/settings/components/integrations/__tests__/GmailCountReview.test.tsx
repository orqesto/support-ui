import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const countGmailMessages = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const update = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: (...args: unknown[]) => countGmailMessages(...args),
    update: (...args: unknown[]) => update(...args),
  },
}));

// A native stand-in, so a setting can be changed without driving react-select's menu.
vi.mock('@/components/ui/Select', () => ({
  Select: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

import {
  GmailCountReview,
  formatGmailCount,
  type GmailCountReviewSource,
} from '@/features/settings/components/integrations/GmailCountReview';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

/** Petro source 68 as it was connected on 2026-09-16, but paused. */
const paused: GmailCountReviewSource = {
  id: 68,
  email: 'orders@militech.info',
  enabled: false,
  isKnowledgeBase: true,
  searchQuery: '',
  bulkImportDays: 7,
};

describe('formatGmailCount', () => {
  it('an exact count names the number', () => {
    expect(formatGmailCount({ count: 1234, capped: false })).toBe(
      'Found 1,234 messages matching your criteria'
    );
    expect(formatGmailCount({ count: 1, capped: false })).toBe(
      'Found 1 message matching your criteria'
    );
  });

  it('a capped count never reads as exact', () => {
    expect(formatGmailCount({ count: 50000, capped: true })).toBe('At least 50,000 messages match');
  });
});

describe('GmailCountReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countGmailMessages.mockResolvedValue({ count: 1200, capped: false, query: 'after:2026/09/09' });
    update.mockResolvedValue({ success: true });
  });

  it('Google rejected the stored sign-in (MAILBOX_SIGN_IN): the error offers Reconnect, which calls the card', async () => {
    countGmailMessages.mockRejectedValue(
      Object.assign(new Error('rejected'), {
        status: 400,
        data: {
          code: 'MAILBOX_SIGN_IN',
          error:
            'Google rejected the stored sign-in for this mailbox. Reconnect it, then check the count.',
        },
      })
    );
    const onReconnect = vi.fn();
    render(
      <GmailCountReview
        source={paused}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
        onReconnect={onReconnect}
      />
    );
    expect(await screen.findByText(/Google rejected the stored sign-in/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Google Account' }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('after Reconnect the count runs again: the old refusal does not stay on screen', async () => {
    countGmailMessages
      .mockRejectedValueOnce(
        Object.assign(new Error('rejected'), {
          status: 400,
          data: {
            code: 'MAILBOX_SIGN_IN',
            error: 'Google rejected the stored sign-in. Reconnect it.',
          },
        })
      )
      .mockResolvedValueOnce({ count: 42, capped: false, query: 'after:2026/09/09' });
    const onReconnect = vi.fn(() => Promise.resolve());
    render(
      <GmailCountReview
        source={paused}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
        onReconnect={onReconnect}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect Google Account' }));
    expect(await screen.findByText(/Found 42 messages/)).toBeInTheDocument();
    expect(screen.queryByText(/Google rejected the stored sign-in/)).toBeNull();
    expect(countGmailMessages).toHaveBeenCalledTimes(2);
  });

  it('CONTROL: any other count failure shows its message and no Reconnect button', async () => {
    countGmailMessages.mockRejectedValue(
      Object.assign(new Error('failed'), {
        status: 500,
        data: { error: 'The count failed. Try again; if it keeps failing, contact support.' },
      })
    );
    render(
      <GmailCountReview
        source={paused}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(await screen.findByText(/The count failed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconnect Google Account' })).toBeNull();
  });

  it('a just-connected PAUSED source is counted at once, with its KB flag and range', async () => {
    render(
      <GmailCountReview
        source={paused}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    expect(await screen.findByText(/Found 1,200 messages/)).toBeInTheDocument();
    expect(countGmailMessages).toHaveBeenCalledWith(
      68,
      { searchQuery: '', bulkImportDays: 7, isKnowledgeBase: true },
      expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal })
    );
    expect(screen.getByText(/NOT syncing yet/)).toBeInTheDocument();
  });

  it('a count is cleared when a setting changes — it described a different query', async () => {
    render(
      <GmailCountReview
        source={paused}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    await screen.findByText(/Found 1,200 messages/);
    fireEvent.click(screen.getByRole('button', { name: /last 7 days/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 Days' }));
    expect(screen.queryByText(/Found 1,200 messages/)).not.toBeInTheDocument();
  });

  it('Start sync enables the source with the settings on screen', async () => {
    const onStarted = vi.fn();
    render(
      <GmailCountReview
        source={paused}
        onStarted={onStarted}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    await screen.findByText(/Found 1,200 messages/);
    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    // `type` is required by the PATCH handler — without it the backend answered 400 and the
    // source stayed paused (prod, 2026-09-18). This assertion used to pin the call WITHOUT it.
    expect(update).toHaveBeenCalledWith(68, {
      type: 'gmail',
      enabled: true,
      // A preset also clears a stored since day: it would otherwise outrank the preset.
      config: { gmail: { searchQuery: '', bulkImportDays: 7, bulkImportSince: null } },
    });
  });

  it('Custom… a since day: Start sync saves the day, and the count reaches back to it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T07:00:00Z'));
    try {
      const onStarted = vi.fn();
      render(
        <GmailCountReview
          source={paused}
          onStarted={onStarted}
          onClose={vi.fn()}
          onShowAlert={vi.fn()}
        />
      );
      await screen.findByText(/Found 1,200 messages/);
      fireEvent.click(screen.getByRole('button', { name: /last 7 days/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Custom…' }));
      fireEvent.click(screen.getByRole('button', { name: '3 October 2026' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));
      await waitFor(() => expect(onStarted).toHaveBeenCalled());
      expect(update).toHaveBeenLastCalledWith(68, {
        type: 'gmail',
        enabled: true,
        config: { gmail: { searchQuery: '', bulkImportSince: new Date(2026, 9, 3).toISOString() } },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a live source is count-only: no Start sync, and no automatic count', () => {
    render(
      <GmailCountReview
        source={{ ...paused, enabled: true }}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Start sync' })).not.toBeInTheDocument();
    expect(countGmailMessages).not.toHaveBeenCalled();
  });

  it("shows the server's error instead of a number", async () => {
    countGmailMessages.mockRejectedValue(
      Object.assign(new Error('x'), { data: { error: 'This Gmail source has no stored sign-in.' } })
    );
    render(
      <GmailCountReview
        source={paused}
        onStarted={vi.fn()}
        onClose={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('no stored sign-in');
  });
});
