import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiLookupPanel } from '../CustomApiLookupPanel';
import { RowFields } from '../customApiRowFields';
import type * as LookupService from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

type CustomApiLookupResult = LookupService.CustomApiLookupResult;
type RunnableLookup = LookupService.RunnableLookup;

/**
 * A record in a customer's LIST opens in the typed-value lookup of the same connection and
 * category — the card that carries the order's tracking — and a web address in a card is a link.
 */

const run = vi.fn<(body: unknown) => Promise<CustomApiLookupResult[]>>();
const lookupOptions = vi.fn<(surface: string) => Promise<RunnableLookup[]>>();
const scrollIntoView = vi.fn();

vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>('@/services/customApiLookup.service');
  return {
    ...actual,
    customApiLookupService: {
      run: (body: unknown) => run(body),
      availability: () => Promise.resolve(true),
      lookupOptions: (surface: string) => lookupOptions(surface),
    },
  };
});

const option = (over: Partial<RunnableLookup>): RunnableLookup =>
  ({
    label: 'Lookup',
    connectionName: 'Example shop',
    resultShape: 'one',
    category: 'order',
    storesRecords: true,
    ...over,
  }) as RunnableLookup;

const LIST_FIELDS = [
  { path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' },
  { path: 'status', label: 'Status', kind: 'plain', role: 'status' },
] as CustomApiLookupResult['fields'];

const list = (): CustomApiLookupResult =>
  ({
    endpointId: 7,
    label: 'Their orders',
    connectionName: 'Example shop',
    resultShape: 'many',
    category: 'order',
    status: 'ok',
    rows: [
      { order_id: '100001', status: 'Completed' },
      { order_id: '100002', status: 'Completed' },
    ],
    fields: LIST_FIELDS,
  }) as CustomApiLookupResult;

const details = (over: Partial<CustomApiLookupResult> = {}): CustomApiLookupResult =>
  ({
    endpointId: 8,
    label: 'Order details',
    connectionName: 'Example shop',
    resultShape: 'one',
    category: 'order',
    status: 'needs_input',
    rows: [],
    fields: [],
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

const pressLookUp = async () => {
  await userEvent.click((await screen.findAllByRole('button', { name: /^look up$/i }))[0]);
};

beforeEach(() => {
  run.mockReset();
  lookupOptions.mockReset();
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
  lookupOptions.mockResolvedValue([
    option({ endpointId: 7, label: 'Their orders', parameterSource: 'identity' }),
    option({ endpointId: 8, label: 'Order details', parameterSource: 'manual' }),
  ]);
});

describe('a web address in a card', () => {
  it('⛔ an address the browser cannot open stays as TEXT — a vendor value never vanishes', () => {
    rtlRender(
      <RowFields
        row={{ link: 'http://[not-an-address' }}
        fields={[{ path: 'link', label: 'Tracking link', kind: 'plain' }]}
      />
    );
    expect(screen.getByText('http://[not-an-address')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('opening a listed order in its details lookup', () => {
  it('runs the details lookup for THAT order number and scrolls to its card', async () => {
    run.mockResolvedValueOnce([list(), details()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await pressLookUp();

    run.mockResolvedValueOnce([
      details({
        status: 'ok',
        rows: [{ order_id: '100002', tracking: 'https://track.example.com/?n=TRK-1' }],
        fields: [
          { path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' },
          { path: 'tracking', label: 'Tracking link', kind: 'plain', role: 'tracking_link' },
        ],
      }),
    ]);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Show details of Order 100002' })
    );

    await waitFor(() =>
      expect(run).toHaveBeenLastCalledWith({
        conversationId: 1,
        endpointId: 8,
        parameter: '100002',
      })
    );
    // The carrier's page opens in a new tab rather than being copied out by hand.
    const link = await screen.findByRole('link', { name: 'https://track.example.com/?n=TRK-1' });
    expect(link.getAttribute('target')).toBe('_blank');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it('CONTROL: no typed-value lookup of the same kind ⇒ the number is plain text', async () => {
    lookupOptions.mockResolvedValue([
      option({ endpointId: 7, label: 'Their orders', parameterSource: 'identity' }),
      option({
        endpointId: 8,
        label: 'Order details',
        parameterSource: 'manual',
        connectionName: 'Another system',
      }),
    ]);
    run.mockResolvedValueOnce([list(), details({ connectionName: 'Another system' })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await pressLookUp();

    expect(await screen.findByText('100002', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Show details of/ })).toBeNull();
  });
});
