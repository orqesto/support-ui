import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiLookupPanel } from '../CustomApiLookupPanel';
import { RowFields, trackingOf } from '../customApiRowFields';
import type * as LookupService from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

type CustomApiLookupResult = LookupService.CustomApiLookupResult;
type RunnableLookup = LookupService.RunnableLookup;
type LookupField = LookupService.LookupField;

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

describe('which parcels a record names', () => {
  const number = { path: 'trackings[].no', label: 'No', kind: 'plain', role: 'tracking_number' };
  const link = { path: 'trackings[].link', label: 'Link', kind: 'plain', role: 'tracking_link' };

  it('pairs numbers with links by position when there are as many of each', () => {
    const row = { 'trackings[].no': ['A', 'B'], 'trackings[].link': ['https://a.test', null] };
    expect(trackingOf(row, [number, link] as LookupField[])).toEqual([
      { number: 'A', link: 'https://a.test' },
      { number: 'B', link: null },
    ]);
  });

  it('⛔ two DIFFERENT lists of unequal length: never guesses a link onto a number', () => {
    const otherLink = { ...link, path: 'links[].url' };
    const row = { 'trackings[].no': ['A', 'B'], 'links[].url': ['https://a.test'] };
    expect(trackingOf(row, [number, otherLink] as LookupField[])).toEqual([
      { number: 'A', link: null },
      { number: 'B', link: null },
      { number: null, link: 'https://a.test' },
    ]);
  });
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

const DETAIL_FIELDS = [
  { path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' },
  { path: 'tracking_no', label: 'Tracking number', kind: 'plain', role: 'tracking_number' },
  { path: 'tracking', label: 'Tracking link', kind: 'plain', role: 'tracking_link' },
] as CustomApiLookupResult['fields'];

const opened = (
  orderId: string,
  parcel: string,
  over: Partial<CustomApiLookupResult> = {}
): CustomApiLookupResult =>
  details({
    status: 'ok',
    rows: [
      {
        order_id: orderId,
        tracking_no: parcel,
        tracking: `https://track.example.com/?n=${parcel}`,
      },
    ],
    fields: DETAIL_FIELDS,
    ...over,
  });

const openOrder = async (orderId: string) => {
  await userEvent.click(
    await screen.findByRole('button', { name: `Show details of Order ${orderId}` })
  );
};

describe('opening a listed order in its details lookup', () => {
  it('runs the details lookup for THAT order number and scrolls to its card', async () => {
    run.mockResolvedValueOnce([list(), details()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await pressLookUp();

    run.mockResolvedValueOnce([opened('100002', 'TRK-1')]);
    await openOrder('100002');

    await waitFor(() =>
      expect(run).toHaveBeenLastCalledWith({
        conversationId: 1,
        endpointId: 8,
        parameter: '100002',
      })
    );
    // In the details card AND under the order's row in the list; each opens the carrier's page.
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'TRK-1' })).toHaveLength(2));
    for (const link of screen.getAllByRole('link', { name: 'TRK-1' })) {
      expect(link.getAttribute('href')).toBe('https://track.example.com/?n=TRK-1');
      expect(link.getAttribute('target')).toBe('_blank');
    }
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it('an opened order KEEPS its tracking in the list after the next one is opened', async () => {
    run.mockResolvedValueOnce([list(), details()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await pressLookUp();

    run.mockResolvedValueOnce([opened('100002', 'TRK-2')]);
    await openOrder('100002');
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'TRK-2' })).toHaveLength(2));

    run.mockResolvedValueOnce([opened('100001', 'TRK-1')]);
    await openOrder('100001');
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'TRK-1' })).toHaveLength(2));
    // The details card moved on; the list row still says it.
    expect(screen.getAllByRole('link', { name: 'TRK-2' })).toHaveLength(1);
  });

  it('⛔ a record the ownership check says is SOMEONE ELSE’S is not copied into the list', async () => {
    run.mockResolvedValueOnce([list(), details()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await pressLookUp();

    run.mockResolvedValueOnce([opened('100002', 'TRK-9', { ownership: 'mismatch' })]);
    await openOrder('100002');
    // Only the details card itself, under its own "does NOT belong" flag.
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'TRK-9' })).toHaveLength(1));
  });

  it('a list that carries tracking itself shows it under each order without a click', async () => {
    run.mockResolvedValueOnce([
      {
        ...list(),
        rows: [{ order_id: '100001', status: 'Completed', parcel: 'TRK-5' }],
        fields: [
          ...(LIST_FIELDS ?? []),
          { path: 'parcel', label: 'Tracking number', kind: 'plain', role: 'tracking_number' },
        ],
      } as CustomApiLookupResult,
      details(),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await pressLookUp();

    expect(await screen.findByTestId('record-tracking')).toHaveTextContent('Tracking: TRK-5');
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
