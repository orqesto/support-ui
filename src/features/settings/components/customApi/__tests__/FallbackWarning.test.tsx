/**
 * 2026-11-13: the backend's `fallbackWarning` (a saved fallback that cannot run) reaches the admin
 * on BOTH settings surfaces — the lookup's row in the list, and the wizard's fallback step. An
 * older backend sends no such field, and then nothing is shown. Invented data.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { CustomApiSettings } from '../CustomApiSettings';
import { EndpointWizard } from '../EndpointWizard';
import type * as Svc from '@/features/custom-api';

type Connection = Svc.CustomApiConnection;
type Endpoint = Svc.CustomApiEndpoint;

const list = vi.fn<() => Promise<Connection[]>>();
vi.mock('@/features/custom-api/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>(
    '@/features/custom-api/services/customApi.service'
  );
  return { ...actual, customApiService: { ...actual.customApiService, list: () => list() } };
});
vi.mock('@/features/custom-api/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => vi.fn(),
}));

const WARNING =
  'This lookup’s fallback needs a field tagged “Customer’s email” to check each result against, so it did not run.';

const orders = (over: Partial<Endpoint> = {}): Endpoint =>
  ({
    id: 50,
    connectionId: 1,
    label: 'Their orders',
    path: '/orders?user={value}',
    method: 'GET',
    parameterSource: 'endpoint',
    identityField: null,
    sourceEndpointId: 10,
    sourceFieldPath: 'customer_id',
    fallbackPath: '/orders?email={value}',
    fallbackWarning: WARNING,
    ownershipSourceEndpointId: null,
    noMatchHint: null,
    recordFormatPrefix: null,
    recordFormatLength: null,
    recordFormatCharset: null,
    headers: {},
    requestBodyTemplate: null,
    fieldPaths: [{ path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' }],
    resultShape: 'many',
    rowCap: 25,
    surface: 'both',
    category: null,
    statusLabels: {},
    seenStatuses: [],
    enabled: true,
    effectivelyEnabled: true,
    chainBroken: false,
    hasResponseSkeleton: true,
    skeletonSource: null,
    dataPath: null,
    templateKey: null,
    createdAt: '2026-11-13T10:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    ...over,
  }) as Endpoint;
const account = orders({
  id: 10,
  label: 'Customer account',
  parameterSource: 'identity',
  identityField: 'email',
  sourceEndpointId: null,
  sourceFieldPath: null,
  fallbackPath: null,
  fallbackWarning: null,
  resultShape: 'one',
});
const connection = (endpoint: Endpoint): Connection =>
  ({
    id: 1,
    name: 'Example shop',
    baseUrl: 'https://shop.example/api',
    enabled: true,
    hasCredential: false,
    scopeMode: 'all',
    departmentIds: [],
    endpoints: [account, endpoint],
    purpose: null,
    authType: 'none',
    authHeaderName: null,
    headers: {},
    timeoutMs: 10000,
    piiAcknowledgedBy: 7,
    piiAcknowledgedAt: '2026-11-13T10:00:00.000Z',
    createdAt: '2026-11-13T10:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
  }) as Connection;

const noop = () => {};
const wizard = (endpoint: Endpoint) =>
  render(
    <EndpointWizard
      connection={connection(endpoint)}
      endpoint={endpoint}
      onClose={noop}
      onSaved={noop}
    />
  );

beforeEach(() => {
  cleanup();
  list.mockReset();
});

describe('the fallback warning in the settings', () => {
  it('🔴 shows on the lookup’s row in the list', async () => {
    // RED: drop FallbackWarningLine from the row ⇒ a fallback that never runs looks healthy.
    list.mockResolvedValue([connection(orders())]);
    render(<CustomApiSettings canManageVendors />);
    await waitFor(() => expect(screen.getByTestId('fallback-warning')).toHaveTextContent(WARNING));
  });

  it('🔴 shows inside the wizard’s fallback step', () => {
    // RED: drop it from FallbackStep ⇒ the admin edits the fallback without being told why it fails.
    wizard(orders());
    expect(screen.getByTestId('fallback-warning')).toHaveTextContent(WARNING);
  });

  it('CONTROL: an older backend (no field) or null ⇒ nothing, on both surfaces', async () => {
    const { fallbackWarning: _drop, ...older } = orders();
    list.mockResolvedValue([
      connection(older as Endpoint),
      connection(orders({ id: 51, fallbackWarning: null })),
    ]);
    render(<CustomApiSettings canManageVendors />);
    await waitFor(() => expect(screen.getAllByText('Their orders').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('fallback-warning')).not.toBeInTheDocument();
    cleanup();
    wizard(older as Endpoint);
    expect(screen.queryByTestId('fallback-warning')).not.toBeInTheDocument();
  });
});
