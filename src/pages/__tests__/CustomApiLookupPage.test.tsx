/**
 * The custom-API lookup editor as a PAGE (it was a dialog until 2026-09-29).
 *
 * What a page adds that the dialog did not have, and so what these tests pin: it loads its own
 * data from the URL (and must say so when the URL points at nothing), it is reachable by anyone who
 * types the address (so the tab's permission gate is repeated here), and a NEW lookup is created
 * by its first Test — so the URL has to move to the created id, or a reload starts a duplicate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CustomApiLookupPage } from '../CustomApiLookupPage';
import { Button } from '@/components/ui/Button';
import { CUSTOM_API_LOOKUP_ROUTE } from '@/components/settings/customApi/lookupPaths';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;
type Endpoint = Svc.CustomApiEndpoint;

const list = vi.fn<() => Promise<Connection[]>>();
const createEndpoint = vi.fn<(connectionId: number, input: unknown) => Promise<Connection>>();
const sendTest = vi.fn<() => Promise<Svc.EndpointTestResult>>();
let allowed = true;

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      list: () => list(),
      createEndpoint: (connectionId: number, input: unknown) => createEndpoint(connectionId, input),
      sendTest: () => sendTest(),
    },
  };
});
vi.mock('@/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => () => {},
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => allowed }),
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const endpoint = (over: Partial<Endpoint> = {}): Endpoint => ({
  id: 5,
  connectionId: 1,
  label: 'Customer account',
  path: '/customer?email={value}',
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
  fieldPaths: [],
  resultShape: 'one',
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
  dataPath: 'data',
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
  ...over,
});

const connection = (endpoints: Endpoint[] = [endpoint()]): Connection => ({
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
  endpoints,
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
});

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.hash}</output>;
};

/** Moves the router from outside the page, the way back/forward or a link would. */
const GoTo = ({ path }: { path: string }) => {
  const navigate = useNavigate();
  return <Button onClick={() => navigate(path)}>Go elsewhere</Button>;
};

const renderAt = (path: string, goTo = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={CUSTOM_API_LOOKUP_ROUTE} element={<CustomApiLookupPage />} />
        <Route path="/settings" element={<p>Settings list</p>} />
      </Routes>
      <Where />
      <GoTo path={goTo} />
    </MemoryRouter>
  );

beforeEach(() => {
  allowed = true;
  list.mockReset().mockResolvedValue([connection()]);
  createEndpoint.mockReset();
  sendTest.mockReset().mockResolvedValue({ outcome: { status: 'ok' }, paths: ['customer_id'] });
});

describe('the lookup editor page', () => {
  it('opens an EXISTING lookup from its URL, with what is stored filled in', async () => {
    renderAt('/settings/custom-apis/1/lookups/5');

    expect(await screen.findByRole('heading', { name: 'Edit Customer account' })).toBeTruthy();
    expect(screen.getByLabelText(/Address in your system/i)).toHaveProperty(
      'value',
      '/customer?email={value}'
    );
    // Parity with the dialog: the same two halves, now side by side.
    expect(screen.getByText('Where to look')).toBeTruthy();
    expect(screen.getByText('What agents see')).toBeTruthy();
  });

  it('opens an EMPTY editor for `new`', async () => {
    renderAt('/settings/custom-apis/1/lookups/new');

    expect(await screen.findByRole('heading', { name: 'Add a lookup' })).toBeTruthy();
    expect(screen.getByLabelText(/What should agents call this/i)).toHaveProperty('value', '');
  });

  it('SAYS so when the lookup is gone, instead of opening an empty editor that would create one', async () => {
    renderAt('/settings/custom-apis/1/lookups/77');

    expect(await screen.findByText(/That lookup no longer exists under Militech/)).toBeTruthy();
    expect(screen.queryByLabelText(/What should agents call this/i)).toBeNull();
  });

  it('says so when the connected system is gone, or the address is not a number', async () => {
    renderAt('/settings/custom-apis/9/lookups/5');
    expect(
      await screen.findByText(/no longer exists, or it is not in this workspace/)
    ).toBeTruthy();
  });

  it('rejects a malformed connection id without asking the API', async () => {
    renderAt('/settings/custom-apis/abc/lookups/5');
    expect(await screen.findByText(/does not point at a connected system/)).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
  });

  it('shows a load failure instead of spinning forever — the API’s sentence for a 4xx', async () => {
    // Shaped the way the api-client interceptor delivers errors: `status` + `data` on the Error.
    list.mockRejectedValue(
      Object.assign(new Error('Insufficient permissions'), {
        status: 403,
        data: { error: 'Insufficient permissions' },
      })
    );
    renderAt('/settings/custom-apis/1/lookups/5');
    expect(await screen.findByText('Insufficient permissions')).toBeTruthy();
  });

  it('…and a plain sentence for a 5xx or a dropped connection, never a raw server message', async () => {
    list.mockRejectedValue(
      Object.assign(new Error('boom'), { status: 502, data: { error: 'boom' } })
    );
    renderAt('/settings/custom-apis/1/lookups/5');
    expect(await screen.findByText('Could not load this lookup.')).toBeTruthy();
  });

  it('⛔ repeats the tab’s MANAGE_INTEGRATIONS gate: a typed URL is not a way in', async () => {
    allowed = false;
    renderAt('/settings/custom-apis/1/lookups/5');

    expect(await screen.findByText(/permission to manage integrations/)).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/What should agents call this/i)).toBeNull();
  });

  it('moves the URL to the CREATED lookup after the first Test — and keeps the tested fields', async () => {
    // ⛔ RED without it: a reload of `/new` after testing starts a SECOND lookup, because the
    // first one was already created by the Test press.
    list.mockResolvedValue([connection([])]);
    createEndpoint.mockResolvedValue(connection([endpoint({ id: 42, label: 'Customer account' })]));
    const user = userEvent.setup();
    renderAt('/settings/custom-apis/1/lookups/new');

    await user.type(
      await screen.findByLabelText(/What should agents call this/i),
      'Customer account'
    );
    await user.type(screen.getByLabelText(/Address in your system/i), '/customer?email={{value}');
    await user.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe('/settings/custom-apis/1/lookups/42')
    );
    // The editor was NOT remounted by the URL change: the tree from the test is still there.
    expect(screen.getByRole('checkbox', { name: /customer_id/ })).toBeTruthy();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('follows the URL to ANOTHER lookup instead of editing the first one under its address', async () => {
    list.mockResolvedValue([
      connection([endpoint(), endpoint({ id: 6, label: 'Orders', path: '/orders?email={value}' })]),
    ]);
    const user = userEvent.setup();
    renderAt('/settings/custom-apis/1/lookups/5', '/settings/custom-apis/1/lookups/6');
    expect(await screen.findByRole('heading', { name: 'Edit Customer account' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Go elsewhere' }));

    expect(await screen.findByRole('heading', { name: 'Edit Orders' })).toBeTruthy();
    expect(screen.getByLabelText(/Address in your system/i)).toHaveProperty(
      'value',
      '/orders?email={value}'
    );
  });

  it('Cancel and the back link return to Settings › Integrations › Custom APIs', async () => {
    const user = userEvent.setup();
    renderAt('/settings/custom-apis/1/lookups/5');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('where').textContent).toBe('/settings#integrations/custom-apis');
  });
});
