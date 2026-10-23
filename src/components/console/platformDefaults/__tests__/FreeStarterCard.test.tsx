/**
 * Platform Defaults → Free AI allowance for the knowledge base (BE #1112): shown in dollars, sent
 * in micros (PUT /settings/free-starter `{ kbAllowanceMicros }`, 0–100,000,000). A backend without
 * the route (404) shows why instead of an input.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const puts: { url: string; body: unknown }[] = [];
let getAnswer: () => Promise<unknown>;
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => getAnswer(),
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return Promise.resolve({ data: { success: true } });
    },
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { failure: () => undefined, success: () => undefined } }));

const { FreeStarterCard, FREE_STARTER_NOT_DEPLOYED, kbAllowanceMicrosFrom } = await import(
  '../FreeStarterCard'
);

const block = (value: number, source = 'default') => ({
  data: { data: { kbAllowanceMicros: { value, source, min: 0, max: 100_000_000 } } },
});
const show = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FreeStarterCard />
    </QueryClientProvider>
  );
const amount = () => screen.getByLabelText(/Allowance \(USD\)/);
const save = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  puts.length = 0;
  getAnswer = () => Promise.resolve(block(1_000_000));
});
afterEach(cleanup);

describe('kbAllowanceMicrosFrom (dollars → micros)', () => {
  it('converts dollars to whole micros; 0 is allowed', () => {
    expect(kbAllowanceMicrosFrom('1', 0, 100_000_000)).toBe(1_000_000);
    expect(kbAllowanceMicrosFrom('2.5', 0, 100_000_000)).toBe(2_500_000);
    expect(kbAllowanceMicrosFrom('0', 0, 100_000_000)).toBe(0);
  });

  it('blank, negative, not a number or above the max ⇒ null', () => {
    expect(kbAllowanceMicrosFrom('', 0, 100_000_000)).toBeNull();
    expect(kbAllowanceMicrosFrom('-1', 0, 100_000_000)).toBeNull();
    expect(kbAllowanceMicrosFrom('abc', 0, 100_000_000)).toBeNull();
    expect(kbAllowanceMicrosFrom('100.01', 0, 100_000_000)).toBeNull();
    expect(kbAllowanceMicrosFrom('100', 0, 100_000_000)).toBe(100_000_000);
  });
});

describe('FreeStarterCard', () => {
  it('shows the saved micros in dollars; Save stays off until it changes', async () => {
    show();
    await waitFor(() => expect(amount()).toHaveValue(1));
    expect(save()).toBeDisabled();
  });

  it('sends the typed dollars as micros', async () => {
    show();
    await waitFor(() => expect(amount()).toHaveValue(1));
    fireEvent.change(amount(), { target: { value: '2.75' } });
    fireEvent.click(save());
    await waitFor(() =>
      expect(puts).toEqual([
        {
          url: '/api/admin/platform/settings/free-starter',
          body: { kbAllowanceMicros: 2_750_000 },
        },
      ])
    );
  });

  it('an amount above $100 is refused before sending', async () => {
    show();
    await waitFor(() => expect(amount()).toHaveValue(1));
    fireEvent.change(amount(), { target: { value: '150' } });
    expect(screen.getByText('Enter an amount from $0.00 to $100.00.')).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('a backend without the route (404): says so, no input', async () => {
    getAnswer = () => Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
    show();
    expect(await screen.findByText(FREE_STARTER_NOT_DEPLOYED)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Allowance \(USD\)/)).not.toBeInTheDocument();
  });
});
