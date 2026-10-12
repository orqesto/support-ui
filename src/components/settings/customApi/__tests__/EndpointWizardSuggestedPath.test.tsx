/**
 * C1 (records path suggested by the Test) and F1 (the records box never shows "null").
 * Same mocks and fixtures as EndpointWizard.test.tsx.
 */
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
      // The Cancel/unmount revert (H7) may remove a lookup a Test created; never over the network.
      removeEndpoint: () => Promise.resolve(),
      createEndpoint: (connectionId: number, input: unknown) => createEndpoint(connectionId, input),
      updateEndpoint: (connectionId: number, endpointId: number, input: unknown) =>
        updateEndpoint(connectionId, endpointId, input),
      sendTest: (connectionId: number, endpointId: number, parameter?: string) =>
        sendTest(connectionId, endpointId, parameter),
      shapeSample: (connectionId: number, endpointId: number, sample: string) =>
        shapeSample(connectionId, endpointId, sample),
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
});

describe('C1 — a single unwrapped record: the Test suggests reading the whole answer', () => {
  const recordsMissing = (suggestedDataPath?: string): Svc.EndpointTestResult => ({
    outcome: {
      status: 'shape_changed',
      missingKind: 'records',
      missing: ['data'],
      ...(suggestedDataPath ? { suggestedDataPath } : {}),
    },
    paths: [],
  });
  const recordsBox = () => screen.getByLabelText<HTMLInputElement>(/Where are the records/i);

  it('fills in the suggested path, tests ONCE more on the SAME lookup, and says why', async () => {
    sendTest
      .mockResolvedValueOnce(recordsMissing('.'))
      .mockResolvedValueOnce({ outcome: { status: 'ok' }, paths: REAL_PATHS });
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() => expect(sendTest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(REAL_PATHS.length));
    expect(recordsBox().value).toBe('.');
    expect(
      screen.getByText(/answers with a single record, so we read the whole answer/i)
    ).toBeTruthy();
    expect(screen.queryByText(/could not find the records/i)).toBeNull();
    // ⛔ The retry saves the suggested path on the lookup the first press created — never a second one.
    expect(createEndpoint).toHaveBeenCalledTimes(1);
    expect(updateEndpoint).toHaveBeenCalledTimes(1);
    expect(updateEndpoint.mock.calls[0]?.[1]).toBe(99);
    expect((updateEndpoint.mock.calls[0]?.[2] as { dataPath: string | null }).dataPath).toBe('.');
    expect(sendTest.mock.calls[1]?.[1]).toBe(99);
  });

  it('never loops: a retry that still misses stops after one automatic attempt', async () => {
    sendTest.mockResolvedValue(recordsMissing('.'));
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));

    expect(await screen.findByText(/could not find the records/i)).toBeTruthy();
    expect(sendTest).toHaveBeenCalledTimes(2);
  });

  it('leaves a path the admin typed alone', async () => {
    sendTest.mockResolvedValueOnce(recordsMissing('.'));
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.type(recordsBox(), 'results');
    await user.click(screen.getByRole('button', { name: 'Test' }));

    expect(await screen.findByText(/could not find the records/i)).toBeTruthy();
    expect(sendTest).toHaveBeenCalledTimes(1);
    expect(recordsBox().value).toBe('results');
  });

  it('an older backend (no suggestion) keeps today’s message and does not retry', async () => {
    sendTest.mockResolvedValueOnce(recordsMissing());
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));

    expect(await screen.findByText(/could not find the records under “data”/i)).toBeTruthy();
    expect(sendTest).toHaveBeenCalledTimes(1);
    expect(recordsBox().value).toBe('');
  });
});

describe('F1 — the records box never shows "null"', () => {
  const recordsBox = () => screen.getByLabelText<HTMLInputElement>(/Where are the records/i);

  it('stays blank with the "data" placeholder after a successful Test', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(REAL_PATHS.length));

    expect(recordsBox().value).toBe('');
    expect(recordsBox().placeholder).toBe('data');
  });

  it('opens a stored lookup whose dataPath is null with a blank box and the "data" placeholder', () => {
    render(
      <EndpointWizard
        connection={connection()}
        endpoint={{ ...withNewEndpoint().endpoints[0], dataPath: null }}
        onClose={noop}
        onSaved={noop}
      />
    );
    expect(recordsBox().value).toBe('');
    expect(recordsBox().placeholder).toBe('data');
  });
});
