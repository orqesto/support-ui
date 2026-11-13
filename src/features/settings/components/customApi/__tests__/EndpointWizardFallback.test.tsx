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
import { applyRole } from '../fieldRoles';
import type * as Svc from '@/features/custom-api';

type Connection = Svc.CustomApiConnection;
type Endpoint = Svc.CustomApiEndpoint;

const updateEndpoint =
  vi.fn<(connectionId: number, endpointId: number, input: unknown) => Promise<Connection>>();

const sendTest = vi.fn<(...args: unknown[]) => Promise<unknown>>();

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
      sendTest: (...args: unknown[]) => sendTest(...args),
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
const TOGGLE = 'Hide email from agents — use it only for checks';
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
  sendTest.mockReset();
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

describe('owner 2026-11-13 — hide a check field from agents', () => {
  it('🔴 the toggle saves `hidden: true` on that field only', async () => {
    // RED: drop the toggle (or its patch) ⇒ the field is always shown on every order card.
    const user = userEvent.setup();
    open(base);
    await user.click(screen.getByLabelText(TOGGLE));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const fields = lastPayload().fieldPaths as { path: string; hidden?: boolean }[];
    expect(fields.find((field) => field.path === 'email')?.hidden).toBe(true);
    expect(fields.find((field) => field.path === 'order_id')).not.toHaveProperty('hidden');
  });

  it('a hidden field opens switched on; switching it off sends it as shown', async () => {
    const user = userEvent.setup();
    open({
      ...base,
      fieldPaths: [base.fieldPaths[0], { ...base.fieldPaths[1], hidden: true }],
    });
    expect(screen.getByRole('switch', { name: TOGGLE })).toBeChecked();
    await user.click(screen.getByLabelText(TOGGLE));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const fields = lastPayload().fieldPaths as { path: string; hidden?: boolean }[];
    expect(fields.find((field) => field.path === 'email')?.hidden).toBeUndefined();
  });
});

describe('2026-11-13 review — the settings form', () => {
  const save = () => screen.getByRole('button', { name: 'Save' });

  it('🔴 an older backend (no `fallbackPath` on its rows) is offered neither control', async () => {
    // RED: offer them anyway ⇒ the older backend strips both on save, without a word.
    const { fallbackPath: _drop, ...older } = base;
    const user = userEvent.setup();
    render(
      <EndpointWizard
        connection={{ ...connection(base), endpoints: [account, older as Endpoint] }}
        endpoint={older as Endpoint}
        onClose={noop}
        onSaved={noop}
      />
    );
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(TOGGLE)).not.toBeInTheDocument();
    await user.click(save());
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(lastPayload()).not.toHaveProperty('fallbackPath');
  });

  it('🔴 a fallback path without {value} disables Save', async () => {
    const user = userEvent.setup();
    open(base);
    await user.type(screen.getByLabelText(FIELD), '/orders?email=x');
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    await user.clear(screen.getByLabelText(FIELD));
    expect(save()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('🔴 a POST lookup whose body carries {value} cannot also have a fallback', async () => {
    // RED: no check ⇒ the save is a 400 the admin meets only after pressing.
    const user = userEvent.setup();
    const posted: Endpoint = {
      ...base,
      method: 'POST',
      requestBodyTemplate: '{"user":"{value}"}',
      bodyFormat: 'json',
    };
    render(
      <EndpointWizard
        connection={{
          ...connection(posted),
          failureStatusPath: '',
          failureStatusValues: [],
          failureMessagePath: '',
        }}
        endpoint={posted}
        onClose={noop}
        onSaved={noop}
      />
    );
    await user.type(screen.getByLabelText(FIELD), '/orders?email={{value}');
    expect(screen.getByText(/sends \{value\} in its request body/)).toBeInTheDocument();
    expect(save()).toHaveAttribute('aria-disabled', 'true');
  });

  it('⛔ the hide toggle is offered on the “Customer’s email” field only', () => {
    open(base);
    expect(screen.getByLabelText(TOGGLE)).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Hide order_id from agents — use it only for checks')
    ).toBeNull();
  });

  it('🔴 "Test fallback" runs the fallback path with the email, and the pre-save sends no fallback', async () => {
    // RED: test the lookup's own path ⇒ the admin never sees what the fallback returns.
    sendTest.mockResolvedValue({
      outcome: { status: 'ok', rows: [{ order_id: 'G-1' }, { order_id: 'G-2' }] },
      paths: [],
    });
    const user = userEvent.setup();
    open(base);
    await user.type(screen.getByLabelText(FIELD), '/orders?email={{value}');
    await user.type(screen.getByLabelText('An email to try the fallback with'), 'g@shop.example');
    await user.click(screen.getByRole('button', { name: 'Test fallback' }));

    await waitFor(() => expect(sendTest).toHaveBeenCalled());
    expect(sendTest.mock.calls[0]).toEqual([1, 50, 'g@shop.example', '/orders?email={value}']);
    expect(lastPayload()).not.toHaveProperty('fallbackPath');
    expect(await screen.findByTestId('fallback-test-outcome')).toHaveTextContent(
      'The fallback answered with 2 results.'
    );
  });
});

describe('applyRole — a field leaving “Customer’s email” is shown again', () => {
  it('🔴 clears `hidden` on a role change, and on the field that loses the role', () => {
    // RED: keep it ⇒ the backend refuses the save (hidden is for customer_email only).
    const hiddenEmail = { ...base.fieldPaths[1], hidden: true };
    const moved = applyRole([hiddenEmail], 'email', 'status');
    expect(moved[0]).not.toHaveProperty('hidden');
    const stolen = applyRole([hiddenEmail, base.fieldPaths[0]], 'order_id', 'customer_email');
    expect(stolen[0]).not.toHaveProperty('hidden');
    // CONTROL: staying customer_email keeps it.
    expect(applyRole([hiddenEmail], 'email', 'customer_email')[0]).toHaveProperty('hidden', true);
  });
});

describe('2026-11-13 final review — Test fallback and Save', () => {
  const save = () => screen.getByRole('button', { name: 'Save' });
  const testFallback = () => screen.getByRole('button', { name: 'Test fallback' });
  const tryEmail = () => screen.getByLabelText('An email to try the fallback with');
  const withFallback = { ...base, fallbackPath: '/orders?email={value}' };

  it('🔴 shows the kept / hidden counts from the backend', async () => {
    sendTest.mockResolvedValue({
      outcome: { status: 'ok', rows: [{}, {}, {}] },
      paths: [],
      fallback: { kept: 2, dropped: 1 },
    });
    const user = userEvent.setup();
    open(withFallback);
    await user.type(tryEmail(), 'g@shop.example');
    await user.click(testFallback());
    expect(await screen.findByTestId('fallback-test-outcome')).toHaveTextContent(
      '2 would show for g@shop.example; 1 hidden'
    );
  });

  it('🔴 a failing Test fallback shows its error like Test does', async () => {
    // RED: no catch ⇒ an unhandled rejection and nothing on screen.
    sendTest.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    open(withFallback);
    await user.type(tryEmail(), 'g@shop.example');
    await user.click(testFallback());
    expect(await screen.findByText(/boom|Could not reach your system/)).toBeInTheDocument();
  });

  it('🔴 the outcome clears when the test email changes', async () => {
    sendTest.mockResolvedValue({ outcome: { status: 'ok', rows: [] }, paths: [] });
    const user = userEvent.setup();
    open(withFallback);
    await user.type(tryEmail(), 'g@shop.example');
    await user.click(testFallback());
    await screen.findByTestId('fallback-test-outcome');
    await user.type(tryEmail(), 'x');
    expect(screen.queryByTestId('fallback-test-outcome')).not.toBeInTheDocument();
  });

  it('🔴 Test fallback needs the chain itself complete', async () => {
    const user = userEvent.setup();
    open({ ...withFallback, sourceFieldPath: '' });
    await user.type(tryEmail(), 'g@shop.example');
    expect(testFallback()).toHaveAttribute('aria-disabled', 'true');
    // CONTROL: with the chain complete the same email enables it.
    cleanup();
    open(withFallback);
    await user.type(tryEmail(), 'g@shop.example');
    expect(testFallback()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('🔴 a fallback problem blocks Save but not the lookup’s own Test', () => {
    // RED: block Test too ⇒ no way to see the fields, so the email can never be tagged.
    open({ ...withFallback, fieldPaths: [base.fieldPaths[0]] });
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Test' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('🔴 a cleared fallback is sent as null by the Test pre-save', async () => {
    // RED: omit it ⇒ the stored fallback survives a Test the admin made with the box empty.
    sendTest.mockResolvedValue({ outcome: { status: 'ok', rows: [] }, paths: [] });
    const user = userEvent.setup();
    open(withFallback);
    await user.clear(screen.getByLabelText(FIELD));
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(lastPayload()).toHaveProperty('fallbackPath', null);
  });
});
