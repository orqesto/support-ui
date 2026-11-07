/** Platform Defaults → Mail import: fairness between workspaces (`queue.fairness`, 2026-11-07). */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const puts: { url: string; body: unknown }[] = [];
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return Promise.resolve({ data: { success: true } });
    },
    get: () => new Promise(() => undefined),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { failure: () => undefined, success: () => undefined } }));

const { IngestionCard } = await import('../IngestionCard');
const { normalizeIngestion, normalizeFairOrder } = await import(
  '@/services/platformSettings.service'
);

const wrap = (node: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const BUDGET = { value: 7, source: 'default' as const, min: 1, max: 30 };
const CAP = { value: 0, source: 'default' as const, min: 0, max: 20 };
const SWITCH = 'Share background work fairly between workspaces';
const CAP_LABEL = 'Jobs one workspace may run at once';

beforeEach(() => {
  puts.length = 0;
});
afterEach(cleanup);

describe('Mail import: fairness between workspaces', () => {
  const card = () =>
    wrap(
      <IngestionCard
        ingestion={normalizeIngestion({ importRunBudgetMinutes: BUDGET, workspaceActiveCap: CAP })}
        fairOrder={normalizeFairOrder({ value: true, source: 'default' })}
      />
    );

  it('shows the switch on and the cap at 0 (automatic)', () => {
    card();
    expect(screen.getByLabelText(SWITCH)).toBeChecked();
    expect(screen.getByLabelText(CAP_LABEL)).toHaveValue(0);
  });

  it('turning it off saves only fairOrder: false', async () => {
    card();
    fireEvent.click(screen.getByLabelText(SWITCH));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ fairOrder: false });
  });

  it('saves a cap on its own', async () => {
    card();
    fireEvent.change(screen.getByLabelText(CAP_LABEL), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ workspaceActiveCap: 2 });
  });

  it('CONTROL: an older backend that reports neither shows no fairness section', () => {
    wrap(<IngestionCard ingestion={normalizeIngestion({ importRunBudgetMinutes: BUDGET })} />);
    expect(screen.queryByText('Fairness between workspaces')).toBeNull();
    expect(screen.queryByLabelText(SWITCH)).toBeNull();
  });

  it('reads the switch only when it is a boolean', () => {
    expect(normalizeFairOrder({ value: 'yes' })).toBeUndefined();
    expect(normalizeFairOrder({ value: false, source: 'db' })).toEqual({
      value: false,
      source: 'db',
    });
  });
});
