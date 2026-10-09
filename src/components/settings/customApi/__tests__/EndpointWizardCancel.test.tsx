import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointWizard } from '../EndpointWizard';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

/**
 * ⛔ TYPED MOCKS, not `vi.fn()` with a spread of `unknown[]`. An untyped mock returns `any`, and
 * the spread hands `any` straight back to the caller — four `no-unsafe-return` errors, which is a
 * CI failure and not a style note. Typing them also means a test that calls one of these with the
 * wrong argument count fails at compile time rather than passing vacuously.
 */
const createEndpoint = vi.fn<(connectionId: number, input: unknown) => Promise<Connection>>();
const updateEndpoint =
  vi.fn<(connectionId: number, endpointId: number, input: unknown) => Promise<Connection>>();
const sendTest =
  vi.fn<
    (
      connectionId: number,
      endpointId: number,
      parameter?: string
    ) => Promise<Svc.EndpointTestResult>
  >();
const removeEndpoint = vi.fn<(connectionId: number, endpointId: number) => Promise<void>>();
const shapeSample =
  vi.fn<
    (connectionId: number, endpointId: number, sample: string) => Promise<Svc.EndpointTestResult>
  >();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      createEndpoint: (connectionId: number, input: unknown) => createEndpoint(connectionId, input),
      updateEndpoint: (connectionId: number, endpointId: number, input: unknown) =>
        updateEndpoint(connectionId, endpointId, input),
      sendTest: (connectionId: number, endpointId: number, parameter?: string) =>
        sendTest(connectionId, endpointId, parameter),
      shapeSample: (connectionId: number, endpointId: number, sample: string) =>
        shapeSample(connectionId, endpointId, sample),
      removeEndpoint: (connectionId: number, endpointId: number) =>
        removeEndpoint(connectionId, endpointId),
    },
  };
});

/**
 * The availability cache the thread panel reads (F2, 2026-09-19). A spy rather than a real
 * QueryClient: what matters here is WHEN the form drops it — after a successful write, never
 * after a failed one. The hook itself is tested against a real client in its own file.
 */
const invalidate = vi.fn<() => void>();
vi.mock('@/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => invalidate,
}));

const connection = (): Connection => ({
  id: 1,
  name: 'Militech',
  purpose: null,
  baseUrl: 'https://shop.example/index.php',
  enabled: true,
  authType: 'header',
  authHeaderName: 'X-Oc-Restadmin-Id',
  hasCredential: true,
  headers: {},
  timeoutMs: 10000,
  scopeMode: 'all',
  piiAcknowledgedBy: 7,
  piiAcknowledgedAt: '2026-09-19T10:00:00.000Z',
  departmentIds: [],
  endpoints: [],
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
});

/**
 * The shape the API really returns when a lookup is created: the whole connection, with EVERY
 * field the contract declares.
 *
 * ⛔ Written out in full rather than cast past, because a fixture describing a row shape the API
 * cannot produce is what caused four defects in CA-3: the test and the code agreed with each
 * other and both disagreed with the vendor. TypeScript refused the short version, which is the
 * check working.
 */
const withNewEndpoint = (): Connection => ({
  ...connection(),
  endpoints: [
    {
      id: 99,
      connectionId: 1,
      label: "This customer's orders",
      path: '/rest/order',
      method: 'GET',
      parameterSource: 'manual',
      identityField: null,
      sourceEndpointId: null,
      sourceFieldPath: null,
      ownershipSourceEndpointId: null,
      recordFormatPrefix: null,
      recordFormatLength: null,
      recordFormatCharset: null,
      headers: {},
      requestBodyTemplate: null,
      fieldPaths: [],
      resultShape: 'many',
      rowCap: 25,
      surface: 'both',
      // L2: every endpoint that predates categories has none, which stays valid.
      category: null,
      // L2 P2: no vocabulary yet, which every lookup that predates it has.
      statusLabels: {},
      seenStatuses: [],
      enabled: true,
      effectivelyEnabled: true,
      chainBroken: false,
      hasResponseSkeleton: false,
      skeletonSource: null,
      dataPath: null,
      templateKey: null,
      createdAt: '2026-09-19T10:00:00.000Z',
      updatedAt: '2026-09-19T10:00:00.000Z',
    },
  ],
});

const REAL_PATHS = [
  'order_id',
  'name',
  'status',
  'date_added',
  'products[].name',
  'total',
  'currency_code',
];

const noop = () => {};

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/What should agents call this/i), "Customer's orders");
  await user.type(screen.getByLabelText(/Address in your system/i), '/rest/order');
};

beforeEach(() => {
  createEndpoint.mockReset().mockResolvedValue(withNewEndpoint());
  updateEndpoint.mockReset().mockResolvedValue(withNewEndpoint());
  sendTest.mockReset().mockResolvedValue({ outcome: { status: 'ok' }, paths: REAL_PATHS });
  shapeSample.mockReset().mockResolvedValue({ outcome: { status: 'ok' }, paths: REAL_PATHS });
  invalidate.mockReset();
  removeEndpoint.mockReset().mockResolvedValue(undefined);
});

describe('⛔ Cancel undoes what Test saved (FE audit H7, 2026-09-29)', () => {
  const stored = () => ({
    ...withNewEndpoint().endpoints[0],
    id: 99,
    label: 'Orders',
    path: '/rest/order?email={value}',
    fieldPaths: [
      { path: 'order_id', label: 'Order', kind: 'plain' as const, role: 'identifier' as const },
    ],
  });
  const cancel = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Cancel' }));

  it('an EDIT: Test saves the new address, Cancel writes the original back, then leaves', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const ep = stored();
    render(
      <EndpointWizard connection={connection()} endpoint={ep} onClose={onClose} onSaved={noop} />
    );
    const address = screen.getByLabelText(/Address in your system/i);
    await user.clear(address);
    await user.type(address, '/rest/broken?email={{value}');
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(1));
    expect(updateEndpoint.mock.calls[0]?.[2]).toMatchObject({ path: '/rest/broken?email={value}' });

    await cancel(user);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateEndpoint).toHaveBeenCalledTimes(2);
    expect(updateEndpoint.mock.calls[1]?.[1]).toBe(99);
    expect(updateEndpoint.mock.calls[1]?.[2]).toMatchObject({
      path: '/rest/order?email={value}',
      label: 'Orders',
    });
    expect(removeEndpoint).not.toHaveBeenCalled();
  });

  it('a NEW lookup: the one the first Test created is removed on Cancel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EndpointWizard connection={connection()} onClose={onClose} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalled());
    // A second Test updates it — it is still "created this visit", not an edit to put back.
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(sendTest).toHaveBeenCalledTimes(2));

    await cancel(user);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(removeEndpoint).toHaveBeenCalledWith(1, 99);
  });

  it('CONTROL: Cancel with no Test writes nothing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <EndpointWizard
        connection={connection()}
        endpoint={stored()}
        onClose={onClose}
        onSaved={noop}
      />
    );
    await cancel(user);
    expect(onClose).toHaveBeenCalled();
    expect(updateEndpoint).not.toHaveBeenCalled();
    expect(removeEndpoint).not.toHaveBeenCalled();
  });

  it('CONTROL: Test then SAVE keeps the change — nothing is reverted, not even on leaving', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(
      <EndpointWizard
        connection={connection()}
        endpoint={stored()}
        onClose={onClose}
        onSaved={noop}
      />
    );
    const address = screen.getByLabelText(/Address in your system/i);
    await user.clear(address);
    await user.type(address, '/rest/new?email={{value}');
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const writes = updateEndpoint.mock.calls.length;
    view.unmount();
    await Promise.resolve();
    expect(updateEndpoint.mock.calls.length).toBe(writes);
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({
      path: '/rest/new?email={value}',
    });
  });

  it('leaving by another route (the page back link, browser back) reverts too', async () => {
    const user = userEvent.setup();
    const view = render(
      <EndpointWizard connection={connection()} endpoint={stored()} onClose={noop} onSaved={noop} />
    );
    const address = screen.getByLabelText(/Address in your system/i);
    await user.clear(address);
    await user.type(address, '/rest/other?email={{value}');
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(1));
    view.unmount();
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(2));
    expect(updateEndpoint.mock.calls[1]?.[2]).toMatchObject({ path: '/rest/order?email={value}' });
  });

  it('a FAILED undo stays on the page, says so, and the next Cancel tries again', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<EndpointWizard connection={connection()} onClose={onClose} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalled());
    removeEndpoint.mockRejectedValueOnce(new Error('network down'));
    await cancel(user);
    expect(await screen.findByText(/network down|Could not undo/i)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await cancel(user);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(removeEndpoint).toHaveBeenCalledTimes(2);
  });
});
