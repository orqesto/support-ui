/**
 * "Change Initial Sync Range" with the calendar (2026-10-22): a preset saves its days and clears a
 * stored since day; Custom… saves the day; a stored since day is what the dialog opens on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const update = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { update: (...args: unknown[]) => update(...args) },
}));

const { GmailSyncRangeDialog } = await import('../GmailSyncRangeDialog');

const open = (source: { currentDays: number; currentSince?: string | null }) =>
  render(
    <GmailSyncRangeDialog
      source={{ id: 5, name: 'Support', ...source }}
      onClose={vi.fn()}
      onRefresh={vi.fn(() => Promise.resolve())}
      onShowAlert={vi.fn()}
    />
  );

beforeEach(() => {
  update.mockReset().mockResolvedValue({});
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 22, 10));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GmailSyncRangeDialog', () => {
  it('a preset saves its days and clears a since day', async () => {
    open({ currentDays: 30, currentSince: '2026-09-01' });
    fireEvent.click(screen.getByRole('button', { name: /since 1 sep 2026/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to quick choices' }));
    fireEvent.click(screen.getByRole('button', { name: 'Last 90 Days' }));
    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(5, {
        type: 'gmail',
        config: { gmail: { bulkImportDays: 90, bulkImportSince: null } },
      })
    );
  });

  it('Custom… saves the day', async () => {
    open({ currentDays: 30 });
    fireEvent.click(screen.getByRole('button', { name: /last 30 days/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom…' }));
    fireEvent.click(screen.getByRole('button', { name: '3 October 2026' }));
    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(5, {
        type: 'gmail',
        config: { gmail: { bulkImportSince: new Date(2026, 9, 3).toISOString() } },
      })
    );
  });
});
