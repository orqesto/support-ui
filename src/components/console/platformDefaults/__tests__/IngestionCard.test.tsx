/**
 * Platform Defaults → Mail import (2026-10-18): the import run budget and the two queue rates,
 * saved as a PARTIAL PUT /settings/ingestion. A backend without the block: no inputs, only why.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const puts: { url: string; body: unknown }[] = [];
const toastFailure = vi.fn<(scope: string, error: unknown) => void>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return Promise.resolve({ data: { success: true } });
    },
    get: () => new Promise(() => undefined),
  },
}));
vi.mock('@/lib/toast', () => ({
  toast: {
    failure: (scope: string, error: unknown) => toastFailure(scope, error),
    success: () => undefined,
  },
}));

const { IngestionCard, INGESTION_NOT_DEPLOYED } = await import('../IngestionCard');
const { normalizeIngestion } = await import('@/services/platformSettings.service');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const SETTING = {
  importRunBudgetMinutes: { value: 7, source: 'default' as const, min: 1, max: 30 },
  attachmentsPerMinute: { value: 30, source: 'db' as const, min: 5, max: 600 },
  kbMessagesPerMinute: { value: 40, source: 'default' as const, min: 5, max: 300 },
};
const budget = () => screen.getByLabelText(/Import run budget/);
const attachments = () => screen.getByLabelText(/Attachments per minute/);
const kb = () => screen.getByLabelText(/Knowledge-base messages per minute/);
const save = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  puts.length = 0;
  toastFailure.mockReset();
});
afterEach(cleanup);

describe('IngestionCard', () => {
  it('shows the saved values and where each comes from', () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    expect(budget()).toHaveValue(7);
    expect(attachments()).toHaveValue(30);
    expect(kb()).toHaveValue(40);
    expect(screen.getAllByText('Default')).toHaveLength(2);
    expect(screen.getAllByText('Console')).toHaveLength(1);
    expect(save()).toBeDisabled();
  });

  it('saves only the field that changed, with PUT /settings/ingestion', async () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    fireEvent.change(attachments(), { target: { value: '200' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/settings/ingestion',
      body: { attachmentsPerMinute: 200 },
    });
  });

  it('two changed fields are sent together, the untouched one is not', async () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    fireEvent.change(budget(), { target: { value: '10' } });
    fireEvent.change(kb(), { target: { value: '60' } });
    fireEvent.click(save());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ importRunBudgetMinutes: 10, kbMessagesPerMinute: 60 });
  });

  it('a value outside the bounds, a fraction or blank: the bounds are said and nothing is sent', () => {
    wrap(<IngestionCard ingestion={SETTING} />);
    for (const bad of ['4', '601', '1.5', '']) {
      fireEvent.change(attachments(), { target: { value: bad } });
      expect(screen.getByText('Enter a whole number from 5 to 600.')).toBeInTheDocument();
      expect(save()).toBeDisabled();
    }
    fireEvent.change(attachments(), { target: { value: '5' } });
    expect(screen.queryByText(/Enter a whole number/)).toBeNull();
    expect(save()).toBeEnabled();
    expect(puts).toHaveLength(0);
  });

  it('a backend that has the budget but not the rates: only the budget is offered', () => {
    wrap(<IngestionCard ingestion={{ importRunBudgetMinutes: SETTING.importRunBudgetMinutes }} />);
    expect(budget()).toBeInTheDocument();
    expect(screen.queryByLabelText(/Attachments per minute/)).toBeNull();
    expect(screen.queryByLabelText(/Knowledge-base messages per minute/)).toBeNull();
  });

  it('no ingestion block (older backend): no inputs, says it arrives with the next release', () => {
    wrap(<IngestionCard ingestion={undefined} />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(INGESTION_NOT_DEPLOYED)).toBeInTheDocument();
  });
});

describe('normalizeIngestion', () => {
  it('keeps the fields that are whole numbers with whole bounds', () => {
    expect(normalizeIngestion(SETTING)).toEqual(SETTING);
  });

  it('drops a malformed field, keeps the rest; nothing usable is absent', () => {
    expect(
      normalizeIngestion({ ...SETTING, attachmentsPerMinute: { value: '30', source: 'db' } })
    ).toEqual({
      importRunBudgetMinutes: SETTING.importRunBudgetMinutes,
      kbMessagesPerMinute: SETTING.kbMessagesPerMinute,
    });
    expect(
      normalizeIngestion({ attachmentsPerMinute: { value: 5, source: 'db' } })
    ).toBeUndefined();
    expect(normalizeIngestion({})).toBeUndefined();
    expect(normalizeIngestion(undefined)).toBeUndefined();
    expect(normalizeIngestion([])).toBeUndefined();
  });

  it('an unknown source reads as the default', () => {
    expect(
      normalizeIngestion({ kbMessagesPerMinute: { value: 40, source: 'x', min: 5, max: 300 } })
        ?.kbMessagesPerMinute?.source
    ).toBe('default');
  });
});
