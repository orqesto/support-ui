/**
 * L2 — what the SAVE button actually sends when an admin EDITS an existing lookup.
 *
 * 🔴 Measured on staging 2026-09-23, against MERGED code: pick a record kind, write a word for a
 * vendor status, press Save → 200, the dialog closes, and the row still has `category` NULL and
 * `status_labels` `{}`. `ensureSaved` carried both, but it runs only when there is no endpoint yet
 * (`endpointId ?? (await ensureSaved())`), so on every edit the `save()` payload was the only
 * write — and it carried neither. Every earlier test drove the API or the step component; none
 * drove this button, which is exactly where both L2 phases died.
 *
 * Its own file because `EndpointWizard.test.tsx` is at the 650-line lint ceiling.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointWizard } from '../EndpointWizard';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

const updateEndpoint =
  vi.fn<(connectionId: number, endpointId: number, input: unknown) => Promise<Connection>>();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
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

const noop = () => {};

beforeEach(() => {
  cleanup();
  updateEndpoint.mockReset().mockResolvedValue(withNewEndpoint());
});

describe('the Save payload of an EDIT', () => {
  const existing = () => ({
    ...withNewEndpoint().endpoints[0],
    fieldPaths: [{ path: 'status', label: 'Status', kind: 'plain' as const, role: 'status' as const }],
    category: 'order' as const,
    statusLabels: { in_transit: 'On its way' },
  });

  it('🔴 carries the CATEGORY, so a record kind can be changed on an existing lookup', async () => {
    const user = userEvent.setup();
    render(
      <EndpointWizard
        connection={connection()}
        endpoint={existing()}
        onClose={noop}
        onSaved={noop}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const [, , payload] = updateEndpoint.mock.calls.at(-1) as [number, number, Record<string, unknown>];
    expect(payload.category).toBe('order');
  });

  it("🔴 carries the admin's STATUS WORDS, which are otherwise silently discarded", async () => {
    const user = userEvent.setup();
    render(
      <EndpointWizard
        connection={connection()}
        endpoint={existing()}
        onClose={noop}
        onSaved={noop}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const [, , payload] = updateEndpoint.mock.calls.at(-1) as [number, number, Record<string, unknown>];
    expect(payload.statusLabels).toEqual({ in_transit: 'On its way' });
  });

  it('CONTROL: a lookup with NO category still sends null, so one can be taken off', async () => {
    const user = userEvent.setup();
    render(
      <EndpointWizard
        connection={connection()}
        endpoint={{ ...existing(), category: null, statusLabels: {} }}
        onClose={noop}
        onSaved={noop}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const [, , payload] = updateEndpoint.mock.calls.at(-1) as [number, number, Record<string, unknown>];
    expect(payload.category).toBeNull();
    expect(payload.statusLabels).toEqual({});
  });
});
