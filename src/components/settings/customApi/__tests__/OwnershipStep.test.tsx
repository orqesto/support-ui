/**
 * CA-5 Task 5 — D35, the ownership question, asked in the client's words.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointWizard } from '../EndpointWizard';
import { OwnershipStep, hasIdentifier } from '../OwnershipStep';
import type * as Svc from '@/services/customApi.service';

const updateEndpoint =
  vi.fn<
    (connectionId: number, endpointId: number, input: unknown) => Promise<Svc.CustomApiConnection>
  >();

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

type Endpoint = Svc.CustomApiEndpoint;

const endpoint = (over: Partial<Endpoint> = {}): Endpoint => ({
  id: 10,
  connectionId: 1,
  label: "This customer's orders",
  path: '/rest/userorders?email={value}',
  method: 'GET',
  parameterSource: 'identity',
  identityField: 'email',
  sourceEndpointId: null,
  sourceFieldPath: null,
  ownershipSourceEndpointId: null,
  recordFormatPrefix: null,
  recordFormatLength: null,
  recordFormatCharset: null,
  headers: {},
  requestBodyTemplate: null,
  fieldPaths: [{ path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' }],
  resultShape: 'many',
  rowCap: 25,
  surface: 'both',
  enabled: true,
  effectivelyEnabled: true,
  chainBroken: false,
  hasResponseSkeleton: true,
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
  ...over,
});

describe('the question an admin actually reads', () => {
  it('⛔ asks it in English, never as ownershipSourceEndpointId', () => {
    render(<OwnershipStep siblings={[endpoint()]} value={null} onChange={vi.fn()} />);
    // ⛔ RED: label it with the contract's field name and the most important privacy control in
    // the product gets configured by accident or not at all.
    expect(screen.getByLabelText(/Which lookup lists this customer’s own records\?/i)).toBeTruthy();
    expect(screen.queryByText(/ownershipSourceEndpointId/i)).toBeNull();
  });

  it('⛔ choosing NOTHING is allowed and says what it costs', () => {
    render(<OwnershipStep siblings={[endpoint()]} value={null} onChange={vi.fn()} />);
    // The carrier case: a parcel number is not a person. The owner chose showing over blocking.
    expect(screen.getByText(/cannot confirm a record belongs to the customer/i)).toBeTruthy();
    /*
     * `getAllBy`, deliberately: "unverified" appears TWICE and both are load-bearing — once in
     * the option the admin picks and once in the consequence spelled out underneath it. A
     * `getByText` here fails as ambiguous, which is the DOM telling the truth about the copy.
     */
    expect(screen.getAllByText(/unverified/i).length).toBeGreaterThanOrEqual(2);
    // And the consequence is stated as a consequence, not only as an option label.
    expect(screen.getByText(/parcel number/i)).toBeTruthy();
  });

  it('says what choosing a source BUYS, once one is chosen', () => {
    render(<OwnershipStep siblings={[endpoint()]} value={10} onChange={vi.fn()} />);
    expect(screen.getByText(/check it appears in this customer’s own list/i)).toBeTruthy();
    expect(screen.queryByText(/cannot confirm a record belongs/i)).toBeNull();
  });

  it('reports the chosen id as a number, and the "no" option as null', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OwnershipStep siblings={[endpoint()]} value={null} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText(/Which lookup lists/i), '10');
    expect(onChange).toHaveBeenLastCalledWith(10);

    cleanup();
    render(<OwnershipStep siblings={[endpoint()]} value={10} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText(/Which lookup lists/i), '');
    // RED: report '' and the API receives a string where it expects an id or null.
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('⛔ a source that cannot actually confirm anything', () => {
  it('warns at CONFIGURE time when the chosen lookup has no identifier tagged', () => {
    const untagged = endpoint({
      id: 11,
      label: 'All orders',
      fieldPaths: [{ path: 'status', label: 'Status', kind: 'plain', role: 'none' }],
    });
    render(<OwnershipStep siblings={[untagged]} value={11} onChange={vi.fn()} />);

    // ⛔ RED: stay silent and the check has nothing to match on, so it resolves to `unverified`
    // for every record — on a lookup that looks fully configured. The admin is two clicks from
    // fixing it here and would never know to look later.
    expect(
      screen.getByText(/does not have a field tagged as the number the customer quotes/i)
    ).toBeTruthy();
  });

  it('POSITIVE CONTROL: a source WITH an identifier is not warned about', () => {
    render(<OwnershipStep siblings={[endpoint()]} value={10} onChange={vi.fn()} />);
    expect(screen.queryByText(/does not have a field tagged/i)).toBeNull();
  });

  it('hasIdentifier reads the tag, not the field name', () => {
    // A field CALLED order_id but tagged `none` cannot confirm anything — the tag is the contract.
    expect(
      hasIdentifier(
        endpoint({
          fieldPaths: [{ path: 'order_id', label: 'Order', kind: 'plain', role: 'none' }],
        })
      )
    ).toBe(false);
    expect(hasIdentifier(endpoint())).toBe(true);
    // An older backend can omit fieldPaths entirely; that is "cannot confirm", not a crash.
    expect(hasIdentifier(endpoint({ fieldPaths: undefined as never }))).toBe(false);
  });
});

const connectionWith = (endpoints: Endpoint[]): Svc.CustomApiConnection => ({
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
  endpoints,
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
});

describe('in the wizard', () => {
  beforeEach(() => {
    updateEndpoint.mockReset().mockResolvedValue(connectionWith([]));
  });

  const manual = (over: Partial<Endpoint> = {}) =>
    endpoint({ id: 20, label: 'Look up an order by number', parameterSource: 'manual', ...over });

  it('⛔ a lookup is never offered as its OWN ownership source', () => {
    const self = manual();
    const sibling = endpoint({ id: 10, label: "This customer's orders" });
    render(
      <EndpointWizard
        connection={connectionWith([self, sibling])}
        endpoint={self}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    const options = Array.from(
      screen.getByLabelText(/Which lookup lists/i).querySelectorAll('option')
    ).map((option) => option.textContent);
    /*
     * ⛔ RED: offer it and a check that fetches the named record, then verifies it against a list
     * containing exactly that record, passes UNCONDITIONALLY while looking fully configured. It
     * is the worst kind of broken: a privacy control that reports success.
     */
    expect(options).not.toContain('Look up an order by number');
    // POSITIVE CONTROL: the real sibling IS offered, so this is not an empty list.
    expect(options).toContain("This customer's orders");
  });

  it('⛔ the question is not asked at all for an IDENTITY lookup', () => {
    const identity = endpoint({ id: 21, parameterSource: 'identity' });
    render(
      <EndpointWizard
        connection={connectionWith([identity])}
        endpoint={identity}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    // Its parameter comes from the contact, so the record is that customer's by construction —
    // asking would be a question with one possible answer.
    expect(screen.queryByLabelText(/Which lookup lists/i)).toBeNull();
  });

  it('saves the chosen source, and null when the admin chose "we can’t check"', async () => {
    const user = userEvent.setup();
    const self = manual({ ownershipSourceEndpointId: 10 });
    const sibling = endpoint({ id: 10, label: "This customer's orders" });
    render(
      <EndpointWizard
        connection={connectionWith([self, sibling])}
        endpoint={self}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({
      ownershipSourceEndpointId: 10,
    });

    await user.selectOptions(screen.getByLabelText(/Which lookup lists/i), '');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(updateEndpoint).toHaveBeenCalledTimes(2));
    // ⛔ null, not absent: "we can't check" is a DECISION, and absent would read as "leave it".
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({
      ownershipSourceEndpointId: null,
    });
  });
});
