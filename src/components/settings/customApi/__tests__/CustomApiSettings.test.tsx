import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CustomApiSettings } from '../CustomApiSettings';
import type * as Svc from '@/services/customApi.service';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import { noteSessionFromResponse } from '@/lib/api-client';

type Connection = Svc.CustomApiConnection;

const list = vi.fn<() => Promise<Connection[]>>();
const remove = vi.fn<(id: number) => Promise<void>>();
const removeEndpoint = vi.fn<(connectionId: number, endpointId: number) => Promise<void>>();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      list: () => list(),
      remove: (id: number) => remove(id),
      removeEndpoint: (connectionId: number, endpointId: number) =>
        removeEndpoint(connectionId, endpointId),
    },
  };
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
    skeletonSource: null,
    dataPath: null,
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
  remove.mockReset();
  removeEndpoint.mockReset();
  remove.mockResolvedValue(undefined);
  removeEndpoint.mockResolvedValue(undefined);
});

describe('audit pass 3 — D42 is visible, and NULL is never dressed up as consent', () => {
  it('shows when a person accepted the third-party data disclosure', async () => {
    list.mockResolvedValue([
      connection({ piiAcknowledgedAt: '2026-09-19T10:00:00.000Z', piiAcknowledgedBy: 7 }),
    ]);
    render(<CustomApiSettings canManageVendors />);
    await waitFor(() => expect(screen.getByText(/Third-party data accepted/i)).toBeTruthy());
  });

  it('⛔ says plainly that there is no recorded acceptance — a state, not a date', async () => {
    /**
     * Two populations reach this, and only a statement about the PRESENT is true of both:
     * connections created before the column existed, and — because a push to `main` deploys this
     * frontend while the backend ships on a tag — a vendor accepted seconds ago against an older
     * backend, which strips the unknown `piiAcknowledged` key and records nothing.
     */
    list.mockResolvedValue([connection({ piiAcknowledgedAt: null, piiAcknowledgedBy: null })]);
    render(<CustomApiSettings canManageVendors />);
    // ⛔ RED: fall back to the connection's createdAt, or to "accepted", and the screen asserts a
    // consent nobody gave — on exactly the rows where nobody gave one.
    await waitFor(() =>
      expect(screen.getByText(/No recorded acceptance of third-party data/i)).toBeTruthy()
    );
    expect(screen.queryByText(/Third-party data accepted/i)).toBeNull();
  });
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

  it('does not call a PASTE-ONLY lookup plain "Ready"', async () => {
    /**
     * 🔴 CA-5 acceptance A7, 2026-09-19. Both routes fill the skeleton, so the badge read "Ready"
     * on a lookup whose LIVE call returned no_match — the words outran what the data could do.
     * RED before the fix: `skeletonSource` was not consulted at all.
     */
    list.mockResolvedValue([
      connection({
        endpoints: [endpoint({ id: 30, label: 'pasted', skeletonSource: 'sample' })],
      }),
    ]);
    render(<CustomApiSettings canManageVendors />);

    expect(await screen.findByText('Ready — not tested live')).toBeTruthy();
    // ⛔ The INVERTED assertion matters: asserting the warning appears would pass even if a second
    // plain "Ready" were rendered beside it.
    expect(screen.queryByText('Ready')).toBeNull();
  });

  it('calls a live-tested lookup "Ready"', async () => {
    list.mockResolvedValue([
      connection({ endpoints: [endpoint({ id: 31, label: 'tested', skeletonSource: 'test' })] }),
    ]);
    render(<CustomApiSettings canManageVendors />);

    expect(await screen.findByText('Ready')).toBeTruthy();
  });

  it('keeps the plain badge when the skeleton PREDATES the column', async () => {
    // ⚠️ null is "we do not know which route produced this", true of every row written before this
    // shipped. Accusing those of being pastes would put a warning on every existing lookup.
    list.mockResolvedValue([
      connection({ endpoints: [endpoint({ id: 32, label: 'legacy', skeletonSource: null })] }),
    ]);
    render(<CustomApiSettings canManageVendors />);

    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(screen.queryByText('Ready — not tested live')).toBeNull();
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

  it('shows the HTML-response error instead of "Nothing connected yet"', async () => {
    let htmlError: unknown;
    try {
      noteSessionFromResponse({
        data: '<!doctype html>',
        status: 200,
        statusText: '',
        headers: new AxiosHeaders({ 'Content-Type': 'text/html' }),
        config: { url: '/custom-apis', headers: new AxiosHeaders() },
      } as AxiosResponse);
    } catch (err) {
      htmlError = err;
    }
    expect(htmlError).toBeInstanceOf(Error);
    list.mockRejectedValue(htmlError);
    render(<CustomApiSettings canManageVendors />);

    expect(await screen.findByText(/web page instead of data/i)).toBeTruthy();
    expect(screen.queryByText('Nothing connected yet')).toBeNull();
  });
});

/**
 * DISCONNECTING — the gap that made "self-serve" half-true.
 *
 * 🔴 `DELETE /api/custom-apis/:id` and `customApiService.remove()` both existed with ZERO callers,
 * so an admin could connect a system holding a credential and never remove it. Found by pressing
 * the button during the CA-5 acceptance run, not by reading the code: nothing was missing, nothing
 * was broken, and there was simply no way to do it.
 */
describe('removing what you connected', () => {
  const userEvent = () => import('@testing-library/user-event').then((mod) => mod.default.setup());

  it('disconnects a vendor, and NAMES what goes with it', async () => {
    const user = await userEvent();
    list.mockResolvedValue([
      connection({ endpoints: [endpoint({ id: 20 }), endpoint({ id: 21 })] }),
    ]);
    render(<CustomApiSettings canManageVendors />);

    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    // ⛔ The sentence must say what is destroyed. "Are you sure?" leaves an admin to find out
    // afterwards that the lookups and the stored key went too.
    expect(screen.getByText(/Its 2 lookups and its stored key go with it/i)).toBeTruthy();
    expect(screen.getByText(/Nothing is deleted in DeusPower itself/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Disconnect it' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
    // The list is re-read rather than spliced locally: the server decides what survived.
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('does not name a loss that is not there when a vendor has NO lookups', async () => {
    // 🔴 Audit pass 4. "Its lookups (0) … go with it" is the state EVERY vendor is in the moment
    // it is created — the likeliest one this dialog is ever opened for.
    const user = await userEvent();
    list.mockResolvedValue([connection({ endpoints: [] })]);
    render(<CustomApiSettings canManageVendors />);

    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(screen.getByText(/Its stored key goes with it/i)).toBeTruthy();
    expect(screen.queryByText(/lookups \(0\)/i)).toBeNull();
    expect(screen.queryByText(/0 lookups/i)).toBeNull();
  });

  it('does NOT delete anything until the confirm is pressed', async () => {
    // ⛔ The inverted assertion. A dialog that fires on open is the defect this test exists for.
    const user = await userEvent();
    list.mockResolvedValue([connection()]);
    render(<CustomApiSettings canManageVendors />);

    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    // The confirm names the act and differs from the row button, so nothing on screen is ambiguous.
    expect(screen.getByRole('button', { name: 'Disconnect it' })).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes a single lookup without touching the vendor', async () => {
    const user = await userEvent();
    list.mockResolvedValue([connection({ endpoints: [endpoint({ id: 42 })] })]);
    render(<CustomApiSettings canManageVendors onEditLookup={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove lookup' }));
    await waitFor(() => expect(removeEndpoint).toHaveBeenCalledWith(1, 42));
    expect(remove).not.toHaveBeenCalled();
  });

  it('shows the row as busy and REFUSES a second press while a removal is in flight', async () => {
    /**
     * 🔴 Audit pass 1 over #414, proven with a never-resolving delete.
     * `ConfirmDialog.handleConfirm` calls `onConfirm()` then `onOpenChange(false)` SYNCHRONOUSLY,
     * so the dialog is gone before React applies `setRemoving(true)`. The old
     * `confirmText={removing ? 'Removing…' : …}` branch could therefore never render and the
     * `!removing` dismissal guard never fired — both dead code that read as protection. Meanwhile
     * the row still looked idle, so a slow DELETE invited a second press: the first succeeds, the
     * second 404s, and the admin is told "could not remove" about something that was removed.
     */
    const user = await userEvent();
    list.mockResolvedValue([connection()]);
    let settle: (() => void) | undefined;
    remove.mockImplementation(() => new Promise<void>((resolve) => (settle = () => resolve())));
    render(<CustomApiSettings canManageVendors />);

    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect it' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));

    const busy = await screen.findByRole('button', { name: 'Removing…' });
    expect(busy.hasAttribute('disabled')).toBe(true);
    await user.click(busy);
    expect(remove).toHaveBeenCalledTimes(1);

    settle?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy());
  });

  it('labels ONLY the row being removed, and disables the rest', async () => {
    /**
     * 🔴 Audit pass 2 over #414. `removing` was one boolean for the whole page, so deleting one
     * vendor made EVERY Disconnect and EVERY Remove read "Removing…" — rows announcing their own
     * deletion while nothing was happening to them. Same class as the "Ready" badge this feature
     * shipped with: the label outran the data. Disabling stays global on purpose (one removal at a
     * time); only the words are targeted.
     */
    const user = await userEvent();
    list.mockResolvedValue([
      connection({ id: 1, name: 'DeusPower', endpoints: [] }),
      connection({ id: 2, name: 'Other vendor', endpoints: [] }),
    ]);
    remove.mockImplementation(() => new Promise<void>(() => {}));
    render(<CustomApiSettings canManageVendors />);

    const [first, second] = await screen.findAllByRole('button', { name: 'Disconnect' });
    await user.click(first);
    await user.click(screen.getByRole('button', { name: 'Disconnect it' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));

    // The one being removed says so; the other still reads Disconnect — and is disabled anyway.
    expect(await screen.findByRole('button', { name: 'Removing…' })).toBeTruthy();
    const other = screen.getByRole('button', { name: 'Disconnect' });
    expect(other).toBe(second);
    expect(other.hasAttribute('disabled')).toBe(true);
  });

  it('D40: a moderator is offered lookup removal but NOT vendor removal', async () => {
    /**
     * ⛔ The lookups are a moderator's half; the connection holding the credential is not. RED:
     * gate both the same way and either a moderator is invited to destroy a workspace-wide
     * connection (refused at the request, after the dialog), or they lose the half they own.
     */
    list.mockResolvedValue([connection()]);
    render(<CustomApiSettings canManageVendors={false} onEditLookup={() => {}} />);

    expect(await screen.findByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
  });

  it("surfaces the backend's own refusal, not a generic failure", async () => {
    /**
     * A lookup another one checks ownership against is refused with a 409 NAMING the dependants.
     * That sentence is the only thing that tells an admin what to change first.
     */
    const user = await userEvent();
    list.mockResolvedValue([connection({ endpoints: [endpoint({ id: 42 })] })]);
    /**
     * ⛔ THE SHAPE THE API ACTUALLY PRODUCES — and the shape the test 100 lines above this one was
     * already using. Mine mocked `{response:{data:{message}}}`, wrong twice over: the api-client
     * interceptor does NOT rethrow the axios error (it builds a fresh Error carrying
     * `status`/`data`, so `.response` is undefined at every call site), and the backend's envelope
     * key is `error`, not `message`. It passed against a response the server cannot send.
     */
    removeEndpoint.mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        status: 409,
        data: {
          error:
            '"this order" confirms a record belongs to the customer by checking it against "this customer\'s orders", so it cannot be deleted yet.',
        },
      })
    );
    render(<CustomApiSettings canManageVendors onEditLookup={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove lookup' }));
    expect(await screen.findByText(/cannot be deleted yet/i)).toBeTruthy();
  });
});
