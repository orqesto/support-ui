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
vi.mock('@/components/ui/ReactSelect', () => ({
  ReactSelect: ({
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
} from '@/components/settings/integrations/GmailCountReview';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

/** Taco source 68 as it was connected on 2026-09-16, but paused. */
const paused: GmailCountReviewSource = {
  id: 68,
  email: 'orders@deuspower.info',
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

  it('a just-connected PAUSED source is counted at once, with its KB flag and range', async () => {
    render(
      <GmailCountReview source={paused} onStarted={vi.fn()} onClose={vi.fn()} onShowAlert={vi.fn()} />
    );
    expect(await screen.findByText(/Found 1,200 messages/)).toBeInTheDocument();
    expect(countGmailMessages).toHaveBeenCalledWith(68, {
      searchQuery: '',
      bulkImportDays: 7,
      isKnowledgeBase: true,
    });
    expect(screen.getByText(/NOT syncing yet/)).toBeInTheDocument();
  });

  it('a count is cleared when a setting changes — it described a different query', async () => {
    render(
      <GmailCountReview source={paused} onStarted={vi.fn()} onClose={vi.fn()} onShowAlert={vi.fn()} />
    );
    await screen.findByText(/Found 1,200 messages/);
    fireEvent.change(screen.getByLabelText('Historical Import Range'), { target: { value: '30' } });
    expect(screen.queryByText(/Found 1,200 messages/)).not.toBeInTheDocument();
  });

  it('Start sync enables the source with the settings on screen', async () => {
    const onStarted = vi.fn();
    render(
      <GmailCountReview source={paused} onStarted={onStarted} onClose={vi.fn()} onShowAlert={vi.fn()} />
    );
    await screen.findByText(/Found 1,200 messages/);
    fireEvent.click(screen.getByRole('button', { name: 'Start sync' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    // `type` is required by the PATCH handler — without it the backend answered 400 and the
    // source stayed paused (prod, 2026-09-18). This assertion used to pin the call WITHOUT it.
    expect(update).toHaveBeenCalledWith(68, {
      type: 'gmail',
      enabled: true,
      config: { gmail: { searchQuery: '', bulkImportDays: 7 } },
    });
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
      <GmailCountReview source={paused} onStarted={vi.fn()} onClose={vi.fn()} onShowAlert={vi.fn()} />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('no stored sign-in');
  });
});
