/** Platform Defaults → Mail import: the bell's wait for an AI priority (`notifications.priority_wait`). */
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
const { normalizeIngestion } = await import('@/services/platformSettings.service');

const wrap = (node: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const BUDGET = { value: 7, source: 'default' as const, min: 1, max: 30 };
const WAIT = { value: 5, source: 'default' as const, min: 1, max: 60 };

beforeEach(() => {
  puts.length = 0;
});
afterEach(cleanup);

describe('Mail import: wait for AI priority', () => {
  it('shows the saved value with its label and hint', () => {
    wrap(
      <IngestionCard
        ingestion={normalizeIngestion({ importRunBudgetMinutes: BUDGET, notificationPriorityWaitMinutes: WAIT })}
      />
    );
    expect(screen.getByLabelText('Wait for AI priority (minutes)')).toHaveValue(5);
    expect(
      screen.getByText(
        'How long a new unassigned mail waits for its AI priority before people with a minimum priority see it.'
      )
    ).toBeInTheDocument();
  });

  it('saves minutes with the ingestion PUT', async () => {
    wrap(
      <IngestionCard
        ingestion={normalizeIngestion({ importRunBudgetMinutes: BUDGET, notificationPriorityWaitMinutes: WAIT })}
      />
    );
    fireEvent.change(screen.getByLabelText('Wait for AI priority (minutes)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ notificationPriorityWaitMinutes: 12 });
  });

  it('is hidden when the server does not report it', () => {
    wrap(<IngestionCard ingestion={normalizeIngestion({ importRunBudgetMinutes: BUDGET })} />);
    expect(screen.queryByLabelText('Wait for AI priority (minutes)')).toBeNull();
  });
});
