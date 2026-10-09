/** Template starting values for a NEW lookup. Own file: EndpointWizard.test.tsx is at the lint ceiling. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointWizard } from '../EndpointWizard';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

const createEndpoint = vi.fn<(connectionId: number, input: unknown) => Promise<Connection>>();
const updateEndpoint =
  vi.fn<(connectionId: number, endpointId: number, input: unknown) => Promise<Connection>>();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      createEndpoint: (id: number, input: unknown) => createEndpoint(id, input),
      updateEndpoint: (connectionId: number, endpointId: number, input: unknown) =>
        updateEndpoint(connectionId, endpointId, input),
    },
  };
});

vi.mock('@/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => vi.fn(),
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

const noop = () => {};

const existing = () => ({ ...withNewEndpoint().endpoints[0], label: 'Saved one' });

describe('EndpointWizard — initial values from a template', () => {
  beforeEach(() => {
    cleanup();
    createEndpoint.mockReset().mockResolvedValue(withNewEndpoint());
    updateEndpoint.mockReset().mockResolvedValue(withNewEndpoint());
  });

  const initial = {
    label: 'Look up an order number',
    category: 'order' as const,
    parameterSource: 'manual' as const,
    resultShape: 'one' as const,
    statusLabels: { shipped: 'On its way' },
    ownershipSourceEndpointId: null,
    createExtras: { surface: 'thread' as const, templateKey: 'order_tracking' },
  };

  it('pre-fills the form and sends surface + templateKey on CREATE only', async () => {
    const user = userEvent.setup();
    render(
      <EndpointWizard connection={connection()} initial={initial} onClose={noop} onSaved={noop} />
    );
    expect(screen.getByDisplayValue('Look up an order number')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Address in your system/), '/orders/{value}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalled());
    expect(createEndpoint.mock.calls[0][1]).toMatchObject({
      label: 'Look up an order number',
      category: 'order',
      parameterSource: 'manual',
      statusLabels: { shipped: 'On its way' },
      surface: 'thread',
      templateKey: 'order_tracking',
    });
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).not.toHaveProperty('templateKey');
  });

  it('reports picked fields to the host as they change', () => {
    const onPickedChange = vi.fn();
    render(
      <EndpointWizard
        connection={connection()}
        initial={initial}
        onClose={noop}
        onSaved={noop}
        onPickedChange={onPickedChange}
      />
    );
    expect(onPickedChange).toHaveBeenLastCalledWith([]);
  });

  it('CONTROL: an existing lookup ignores `initial` (edit, never overwrite)', async () => {
    const user = userEvent.setup();
    // category null is the field that would fall through to `initial` if it leaked.
    render(
      <EndpointWizard
        connection={connection()}
        endpoint={{ ...existing(), category: null }}
        initial={initial}
        onClose={noop}
        onSaved={noop}
      />
    );
    expect(screen.queryByDisplayValue('Look up an order number')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({ category: null });
  });
});
