/**
 * D21 — a lookup that takes its value from ANOTHER lookup's answer, as the settings form saves it.
 *
 * 🔴 Found configuring DeusPower on 2026-09-28: its orders list takes `user` = customer_id, which
 * only the customer-by-email lookup returns. The form offered "email" or "typed", and held the
 * choice as a boolean — so a chained lookup opened here showed "typed" and Save rewrote it.
 *
 * (Header below is the save-payload file's; its fixtures are reused verbatim.)
 *
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
import { chooseOption, listOptions } from '@/test/chooseOption';
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

const base = withNewEndpoint().endpoints[0];
/** The customer-by-email lookup: the only kind that can feed a chain. */
const customer = {
  ...base,
  id: 10,
  label: 'Customer account',
  parameterSource: 'identity' as const,
  identityField: 'email' as const,
  resultShape: 'one' as const,
  rowCap: null,
  fieldPaths: [
    { path: 'customer_id', label: 'Customer id', kind: 'plain' as const, role: 'none' as const },
  ],
};
/** A typed lookup — must NOT be offered as a source. */
const typed = {
  ...base,
  id: 11,
  label: 'Order details',
  parameterSource: 'manual' as const,
  resultShape: 'one' as const,
};
const orders = {
  ...base,
  id: 50,
  label: 'Their orders',
  parameterSource: 'endpoint' as const,
  sourceEndpointId: 10,
  sourceFieldPath: 'customer_id',
};
const withSiblings = (): Connection => ({ ...connection(), endpoints: [customer, typed, orders] });
const lastPayload = () =>
  (updateEndpoint.mock.calls.at(-1) as [number, number, Record<string, unknown>])[2];

describe('D21 — the chain on the settings form', () => {
  it('🔴 an existing CHAINED lookup stays chained when saved', async () => {
    // RED (before): the boolean read "endpoint" as "not identity" ⇒ Save sent `manual` and cut it.
    const user = userEvent.setup();
    render(
      <EndpointWizard connection={withSiblings()} endpoint={orders} onClose={noop} onSaved={noop} />
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(lastPayload()).toMatchObject({
      parameterSource: 'endpoint',
      sourceEndpointId: 10,
      sourceFieldPath: 'customer_id',
      identityField: null,
    });
    // The typed-lookup questions are not asked of a chain, so they are not sent either.
    expect(lastPayload()).not.toHaveProperty('ownershipSourceEndpointId');
  });

  it('offers only a lookup that finds the customer by email as the source', async () => {
    render(
      <EndpointWizard connection={withSiblings()} endpoint={orders} onClose={noop} onSaved={noop} />
    );

    const source = screen.getByLabelText('Which lookup gives the value?');
    const offered = await listOptions(source);
    expect(offered).toContain('Customer account');
    // The backend refuses a typed source; offering it would be offering a failing save.
    expect(offered).not.toContain('Order details');
  });

  it('🔴 turning a typed lookup into a chain sends the source and the field', async () => {
    const user = userEvent.setup();
    const existing = { ...base, id: 60, label: 'Orders by id', parameterSource: 'manual' as const };
    render(
      <EndpointWizard
        connection={{ ...connection(), endpoints: [customer, existing] }}
        endpoint={existing}
        onClose={noop}
        onSaved={noop}
      />
    );

    await chooseOption(
      screen.getByLabelText('What do we look up by?'),
      'A value from another lookup’s answer, like the customer’s id'
    );
    // ⛔ Incomplete ⇒ Save is refused on screen rather than sent to be a 400.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await chooseOption(screen.getByLabelText('Which lookup gives the value?'), 'Customer account');
    // The source's picked field is offered as a one-press answer.
    await user.click(screen.getByRole('button', { name: 'customer_id' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(lastPayload()).toMatchObject({
      parameterSource: 'endpoint',
      sourceEndpointId: 10,
      sourceFieldPath: 'customer_id',
    });
  });

  it('asks for the value its SOURCE would give when testing a chain', () => {
    render(
      <EndpointWizard connection={withSiblings()} endpoint={orders} onClose={noop} onSaved={noop} />
    );

    expect(screen.getByLabelText(/one its source would give it/)).toBeInTheDocument();
  });

  it('says what is missing when no lookup can be a source', async () => {
    const existing = { ...base, id: 60, label: 'Orders by id', parameterSource: 'manual' as const };
    render(
      <EndpointWizard
        connection={{ ...connection(), endpoints: [typed, existing] }}
        endpoint={existing}
        onClose={noop}
        onSaved={noop}
      />
    );

    await chooseOption(
      screen.getByLabelText('What do we look up by?'),
      'A value from another lookup’s answer, like the customer’s id'
    );

    expect(screen.getByText(/finds the customer by their email/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('CONTROL: an identity lookup is still saved as identity, with no chain fields', async () => {
    const user = userEvent.setup();
    render(
      <EndpointWizard
        connection={withSiblings()}
        endpoint={customer}
        onClose={noop}
        onSaved={noop}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(lastPayload()).toMatchObject({ parameterSource: 'identity', identityField: 'email' });
    expect(lastPayload()).not.toHaveProperty('sourceEndpointId');
  });
});
