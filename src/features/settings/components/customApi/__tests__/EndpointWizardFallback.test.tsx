/**
 * 2026-11-13: a CHAINED lookup's optional fallback on the settings form — the path called with the
 * customer's email when the source finds no account. It must get IN (the Save payload), come back
 * (an existing one is shown and re-sent), and the form says when it cannot work (no `{value}`, or
 * no field tagged “Customer’s email” for the ownership check). Invented data.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointWizard } from '../EndpointWizard';
import type * as Svc from '@/features/custom-api';

type Connection = Svc.CustomApiConnection;
type Endpoint = Svc.CustomApiEndpoint;

const updateEndpoint =
  vi.fn<(connectionId: number, endpointId: number, input: unknown) => Promise<Connection>>();

vi.mock('@/features/custom-api/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>(
    '@/features/custom-api/services/customApi.service'
  );
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      updateEndpoint: (connectionId: number, endpointId: number, input: unknown) =>
        updateEndpoint(connectionId, endpointId, input),
    },
  };
});
vi.mock('@/features/custom-api/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => vi.fn(),
}));

const base: Endpoint = {
  id: 50,
  connectionId: 1,
  label: 'Their orders',
  path: '/orders?user={value}',
  method: 'GET',
  parameterSource: 'endpoint',
  identityField: null,
  sourceEndpointId: 10,
  sourceFieldPath: 'customer_id',
  fallbackPath: null,
  ownershipSourceEndpointId: null,
  noMatchHint: null,
  recordFormatPrefix: null,
  recordFormatLength: null,
  recordFormatCharset: null,
  headers: {},
  requestBodyTemplate: null,
  fieldPaths: [
    { path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' },
    { path: 'email', label: 'Email', kind: 'plain', role: 'customer_email' },
  ],
  resultShape: 'many',
  rowCap: 25,
  surface: 'both',
  category: null,
  statusLabels: {},
  seenStatuses: [],
  enabled: true,
  effectivelyEnabled: true,
  chainBroken: false,
  hasResponseSkeleton: false,
  skeletonSource: null,
  dataPath: null,
  templateKey: null,
  createdAt: '2026-11-13T10:00:00.000Z',
  updatedAt: '2026-11-13T10:00:00.000Z',
};
const account: Endpoint = {
  ...base,
  id: 10,
  label: 'Customer account',
  path: '/customers?email={value}',
  parameterSource: 'identity',
  identityField: 'email',
  sourceEndpointId: null,
  sourceFieldPath: null,
  resultShape: 'one',
  rowCap: null,
};
const connection = (orders: Endpoint): Connection => ({
  id: 1,
  name: 'Example shop',
  purpose: null,
  baseUrl: 'https://shop.example/api',
  enabled: true,
  authType: 'none',
  authHeaderName: null,
  hasCredential: false,
  headers: {},
  timeoutMs: 10000,
  scopeMode: 'all',
  piiAcknowledgedBy: 7,
  piiAcknowledgedAt: '2026-11-13T10:00:00.000Z',
  departmentIds: [],
  endpoints: [account, orders],
  createdAt: '2026-11-13T10:00:00.000Z',
  updatedAt: '2026-11-13T10:00:00.000Z',
});
const noop = () => {};
const FIELD = 'If it finds no account, search by email instead (optional)';
const lastPayload = () =>
  (updateEndpoint.mock.calls.at(-1) as [number, number, Record<string, unknown>])[2];
const open = (orders: Endpoint) =>
  render(
    <EndpointWizard
      connection={connection(orders)}
      endpoint={orders}
      onClose={noop}
      onSaved={noop}
    />
  );

beforeEach(() => {
  cleanup();
  updateEndpoint.mockReset().mockResolvedValue(connection(base));
});

describe('the fallback on the settings form', () => {
  it('🔴 a fallback typed in is SAVED', async () => {
    // RED: leave `fallbackPath` out of buildParameterFields ⇒ Save answers 200 and stores nothing.
    const user = userEvent.setup();
    open(base);

    await user.type(screen.getByLabelText(FIELD), '/orders?email={{value}');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(lastPayload()).toMatchObject({
      parameterSource: 'endpoint',
      fallbackPath: '/orders?email={value}',
    });
  });

  it('an existing fallback is shown and re-sent; a cleared one is sent as null', async () => {
    const user = userEvent.setup();
    open({ ...base, fallbackPath: '/orders?email={value}' });

    const field = screen.getByLabelText(FIELD);
    expect(field).toHaveValue('/orders?email={value}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(1));
    expect(lastPayload().fallbackPath).toBe('/orders?email={value}');

    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(2));
    expect(lastPayload().fallbackPath).toBeNull();
  });

  it('says when the path has no {value}, or no field is tagged “Customer’s email”', async () => {
    const user = userEvent.setup();
    open({ ...base, fieldPaths: [base.fieldPaths[0]] });

    await user.type(screen.getByLabelText(FIELD), '/orders?email=x');

    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent);
    expect(alerts.some((text) => text?.includes('Put {value} in the fallback path'))).toBe(true);
    expect(alerts.some((text) => text?.includes('Customer’s email'))).toBe(true);
  });

  it('CONTROL: no warning without a fallback, or with a tagged field and {value}', async () => {
    const user = userEvent.setup();
    open(base);
    expect(screen.queryByText(/Put \{value\} in the fallback path/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(FIELD), '/orders?email={{value}');
    expect(screen.queryByText(/Put \{value\} in the fallback path/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Without it the fallback cannot check/)).not.toBeInTheDocument();
  });

  it('CONTROL: a lookup that is not chained is not asked, and sends no fallback', async () => {
    const user = userEvent.setup();
    render(
      <EndpointWizard
        connection={connection(base)}
        endpoint={account}
        onClose={noop}
        onSaved={noop}
      />
    );
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(lastPayload()).not.toHaveProperty('fallbackPath');
  });
});
