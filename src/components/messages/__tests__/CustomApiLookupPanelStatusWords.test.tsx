/**
 * L2 P2 on the thread panel — split from `CustomApiLookupPanel.test.tsx`, which reached its
 * 650-line cap. Same harness, one subject: what an agent reads for a vendor's status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import type { CustomApiLookupResult } from '@/services/customApiLookup.service';
import type { User } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const run = vi.fn<(body: unknown) => Promise<CustomApiLookupResult[]>>();
const availability = vi.fn<(surface: string) => Promise<boolean>>();
vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/services/customApiLookup.service'
  );
  return {
    ...actual,
    customApiLookupService: {
      run: (body: unknown) => run(body),
      availability: (surface: string) => availability(surface),
    },
  };
});

const { CustomApiLookupPanel } = await import('../CustomApiLookupPanel');

const card = (over: Partial<CustomApiLookupResult> = {}): CustomApiLookupResult =>
  ({
    endpointId: 20,
    label: 'this order',
    connectionName: 'DeusPower',
    resultShape: 'one',
    status: 'ok',
    rows: [{ status: 'in_transit' }],
    fields: [{ path: 'status', label: 'Status', kind: 'plain' }],
    ...over,
  }) as CustomApiLookupResult;

const render = (ui: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return rtlRender(ui, { wrapper });
};

const press = async () => {
  await userEvent.click((await screen.findAllByRole('button', { name: /look up/i }))[0]);
};

beforeEach(() => {
  run.mockReset();
  availability.mockReset();
  availability.mockResolvedValue(true);
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});
afterEach(cleanup);

/**
 * L2 P2 — the admin's word for a vendor status, on the rendered row.
 *
 * ⛔ The backend emits `status__label` only for a mapped value on a field tagged `status`. An
 * unmapped value must fall through to what the vendor literally said: the product never invents a
 * word for `3`.
 */
describe('the status vocabulary on a row', () => {
  it("🔴 shows the admin's word instead of the vendor's value", async () => {
    run.mockResolvedValueOnce([
      card({
        rows: [{ status: 'in_transit', status__label: 'On its way' }],
        fields: [{ path: 'status', label: 'Status', kind: 'plain' }],
      }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText('On its way')).toBeTruthy();
    expect(screen.queryByText('in_transit')).toBeNull();
  });

  it('CONTROL: an UNMAPPED status shows the vendor value verbatim', async () => {
    // Without this, a renderer that dropped the value whenever it lacked a word would pass the
    // test above and show an agent nothing at all.
    run.mockResolvedValueOnce([
      card({
        rows: [{ status: 'AWAITING_FULFILMENT' }],
        fields: [{ path: 'status', label: 'Status', kind: 'plain' }],
      }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText('AWAITING_FULFILMENT')).toBeTruthy();
  });

  it('never renders the companion key as a field of its own', async () => {
    // With no configured fields the panel falls back to the row's own keys — `status__label` is
    // the projection's bookkeeping and would appear as a column called `status__label`.
    run.mockResolvedValueOnce([
      card({ rows: [{ status: 'in_transit', status__label: 'On its way' }], fields: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/status/i)).toBeTruthy();
    expect(screen.queryByText(/status__label/)).toBeNull();
  });
});
