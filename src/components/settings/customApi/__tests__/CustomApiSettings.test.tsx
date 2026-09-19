import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CustomApiSettings } from '../CustomApiSettings';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

const list = vi.fn<() => Promise<Connection[]>>();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return { ...actual, customApiService: { ...actual.customApiService, list: () => list() } };
});

const endpoint = (over: Partial<Connection['endpoints'][number]> = {}) =>
  ({
    id: 20,
    connectionId: 1,
    label: "this customer's orders",
    enabled: true,
    effectivelyEnabled: true,
    chainBroken: false,
    hasResponseSkeleton: true,
    fieldPaths: [{ path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' }],
    ...over,
  }) as Connection['endpoints'][number];

const connection = (over: Partial<Connection> = {}) =>
  ({
    id: 1,
    name: 'DeusPower',
    baseUrl: 'https://shop.example/index.php',
    enabled: true,
    hasCredential: true,
    scopeMode: 'all',
    departmentIds: [],
    endpoints: [endpoint()],
    ...over,
  }) as Connection;

beforeEach(() => {
  list.mockReset();
});

describe('the vendor list', () => {
  it('⛔ never renders a credential — not masked, not partially', async () => {
    // The API returns `hasCredential` and no key at all, so this asserts the UI has NO field for
    // one rather than that a value is hidden. RED: render a masked value ⇒ the key is back in the
    // contract, and the next handler that forgets to mask leaks it with no type error.
    list.mockResolvedValue([connection()]);
    const { container } = render(<CustomApiSettings canManageVendors />);

    expect(await screen.findByText('DeusPower')).toBeTruthy();
    expect(screen.getByText(/API key set/i)).toBeTruthy();
    expect(container.textContent).not.toMatch(/•{3,}|\*{3,}/);
  });

  it('⛔ does NOT show a lookup as live under a disabled connection (S4)', async () => {
    // The connection's flag wins. RED: render the endpoint's own `enabled` ⇒ a green badge on a
    // dead lookup, which is worse than showing nothing because it sends nobody to fix it.
    list.mockResolvedValue([
      connection({
        enabled: false,
        endpoints: [endpoint({ enabled: true, effectivelyEnabled: false })],
      }),
    ]);
    render(<CustomApiSettings canManageVendors />);

    await screen.findByText('DeusPower');
    expect(screen.getAllByText('Off').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ready')).toBeNull();
  });

  it('distinguishes never-tested from tested-but-unconfigured', async () => {
    // Two different jobs for the admin, and collapsing them tells them to do the wrong one.
    list.mockResolvedValue([
      connection({
        endpoints: [
          endpoint({ id: 20, label: 'untested', hasResponseSkeleton: false }),
          endpoint({ id: 21, label: 'no fields', fieldPaths: [] }),
          endpoint({ id: 22, label: 'ready' }),
        ],
      }),
    ]);
    render(<CustomApiSettings canManageVendors />);

    expect(await screen.findByText('Not tested yet')).toBeTruthy();
    expect(screen.getByText('No fields chosen')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('D40: only a vendor manager is offered the connect action', async () => {
    // RED: show it to everyone ⇒ a moderator is invited to create a workspace-wide connection
    // holding a secret, and only finds out it is refused after filling the form.
    // ⚠️ The button is a courtesy; the real guard is at the request.
    list.mockResolvedValue([]);
    const { rerender } = render(<CustomApiSettings canManageVendors={false} />);

    expect(await screen.findByText(/an organisation admin can connect one/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /connect a system/i })).toBeNull();

    list.mockResolvedValue([]);
    rerender(<CustomApiSettings canManageVendors />);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /connect a system/i }).length).toBeGreaterThan(0)
    );
  });

  it('the empty state explains the JOB, not our data model', async () => {
    // "No custom APIs configured" describes our schema back at someone who came here to solve a
    // support problem. RED: name the model ⇒ a self-serve admin has no idea what to do next.
    list.mockResolvedValue([]);
    render(<CustomApiSettings canManageVendors />);

    expect(await screen.findByText(/where is my order/i)).toBeTruthy();
  });

  it('shows what the backend said when it said something an admin can act on', async () => {
    // ⚠️ A 4xx, deliberately. `getApiErrorMessage` suppresses 5xx bodies on purpose — a server
    // message could be internal — so testing with a 500 would assert behaviour the helper does
    // not have, and my first attempt did exactly that.
    list.mockRejectedValue(
      Object.assign(new Error('nope'), {
        status: 400,
        data: { error: 'That address is not reachable from our servers' },
      })
    );
    render(<CustomApiSettings canManageVendors />);

    expect(await screen.findByText(/not reachable from our servers/i)).toBeTruthy();
  });
});
