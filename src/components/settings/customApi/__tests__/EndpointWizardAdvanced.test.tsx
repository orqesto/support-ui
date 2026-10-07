import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseOption } from '@/test/chooseOption';
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
  name: 'DeusPower',
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

describe('advanced request settings (2026-09-29)', () => {
  /** A connection as the CURRENT backend returns it — it carries the vendor's failure words. */
  const modern = (over: Partial<Connection> = {}): Connection => ({
    ...connection(),
    failureStatusPath: 'success',
    failureStatusValues: ['0', 'false'],
    failureMessagePath: 'error',
    ...over,
  });
  const openAdvanced = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /Advanced request settings/i }));

  it('⛔ hidden against an OLDER backend, and nothing new is sent — it would be dropped silently', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    expect(screen.queryByRole('button', { name: /Advanced request settings/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalled());
    const created = createEndpoint.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect('paginationMode' in created).toBe(false);
    expect('method' in created).toBe(false);
  });

  it('collapsed, and says "nothing changed" for a lookup on the defaults', () => {
    render(<EndpointWizard connection={modern()} onClose={noop} onSaved={noop} />);
    const toggle = screen.getByRole('button', { name: /Advanced request settings/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent(/nothing changed/i);
    expect(screen.queryByLabelText(/How we ask/i)).toBeNull();
  });

  it('a POST body is saved BEFORE Test runs it — Test calls the saved lookup', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={modern()} onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText(/What should agents call this/i), 'Search');
    await user.type(screen.getByLabelText(/Address in your system/i), '/search');
    // No {value} in the path: the warning says so…
    expect(screen.getByText(/This address has no/i)).toBeInTheDocument();
    await openAdvanced(user);
    await chooseOption(
      screen.getByLabelText(/How we ask/i),
      'POST — the value goes in a request body'
    );
    await user.click(screen.getByLabelText(/Request body/i));
    await user.paste('{"email":"{value}"}');
    // …and goes once the body carries it.
    expect(screen.queryByText(/This address has no/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Advanced request settings/i })).toHaveTextContent(
      /POST with a JSON body/
    );
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalled());
    expect(createEndpoint.mock.calls.at(-1)?.[1]).toMatchObject({
      method: 'POST',
      bodyFormat: 'json',
      requestBodyTemplate: '{"email":"{value}"}',
      paginationMode: 'none',
    });
  });

  it('a body that is not JSON is stopped before Test and Save, in words', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={modern()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await openAdvanced(user);
    await chooseOption(
      screen.getByLabelText(/How we ask/i),
      'POST — the value goes in a request body'
    );
    await user.click(screen.getByLabelText(/Request body/i));
    await user.paste('{"id": {value}}');
    expect(screen.getByText(/not valid JSON/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
  });

  it('EDIT → Save carries the settings too (the second write payload), keeping what was stored', async () => {
    const user = userEvent.setup();
    const stored = {
      ...withNewEndpoint().endpoints[0],
      paginationMode: 'page' as const,
      paginationParam: 'page',
      paginationStart: 1,
      paginationMaxPages: 5,
      limitParam: 'per_page',
      notFoundMeans: 'failed' as const,
      bodyFormat: 'json' as const,
      paginationNextPath: null,
      fieldPaths: [
        { path: 'order_id', label: 'Order', kind: 'plain' as const, role: 'identifier' as const },
      ],
    };
    const conn = modern({ endpoints: [stored] });
    render(<EndpointWizard connection={conn} endpoint={stored} onClose={noop} onSaved={noop} />);
    // The closed header already says what differs.
    expect(screen.getByRole('button', { name: /Advanced request settings/i })).toHaveTextContent(
      /404 is an error.*per_page.*page numbers/
    );
    await user.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({
      notFoundMeans: 'failed',
      limitParam: 'per_page',
      paginationMode: 'page',
      paginationParam: 'page',
    });
  });

  it('EDIT → Test saves the settings first too (the update behind Test, a third write)', async () => {
    const user = userEvent.setup();
    const stored = {
      ...withNewEndpoint().endpoints[0],
      notFoundMeans: 'failed' as const,
      limitParam: 'per_page',
    };
    render(
      <EndpointWizard
        connection={modern({ endpoints: [stored] })}
        endpoint={stored}
        onClose={noop}
        onSaved={noop}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls[0]?.[2]).toMatchObject({
      notFoundMeans: 'failed',
      limitParam: 'per_page',
    });
  });

  it('a single-record lookup sends pagination as none, whatever the form last held', async () => {
    const stored = {
      ...withNewEndpoint().endpoints[0],
      resultShape: 'one' as const,
      paginationMode: 'page' as const,
      paginationParam: 'page',
      fieldPaths: [
        { path: 'order_id', label: 'Order', kind: 'plain' as const, role: 'identifier' as const },
      ],
    };
    const user = userEvent.setup();
    render(
      <EndpointWizard
        connection={modern({ endpoints: [stored] })}
        endpoint={stored}
        onClose={noop}
        onSaved={noop}
      />
    );
    await user.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({ paginationMode: 'none' });
  });
});

describe('a category this build does not know is KEPT (FE audit M16)', () => {
  const withUnknown = () => ({
    ...withNewEndpoint().endpoints[0],
    category: 'subscription' as never,
    fieldPaths: [
      { path: 'order_id', label: 'Order', kind: 'plain' as const, role: 'identifier' as const },
    ],
  });

  it('is offered as "keep", selected, and left out of the save', async () => {
    const user = userEvent.setup();
    const ep = withUnknown();
    render(
      <EndpointWizard connection={connection()} endpoint={ep} onClose={noop} onSaved={noop} />
    );
    // Selected: the closed control shows it as its value.
    expect(screen.getByText(/Keep “subscription”/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect('category' in (updateEndpoint.mock.calls.at(-1)?.[2] as object)).toBe(false);
  });

  it('CONTROL: choosing "Not set" still clears it', async () => {
    const user = userEvent.setup();
    render(
      <EndpointWizard
        connection={connection()}
        endpoint={withUnknown()}
        onClose={noop}
        onSaved={noop}
      />
    );
    await chooseOption(
      screen.getByLabelText(/What kind of record/i),
      'Not set — just show the fields'
    );
    await user.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({ category: null });
  });
});
