import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomApiVendorForm } from '../CustomApiVendorForm';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

const create = vi.fn<(input: unknown) => Promise<Connection>>();
const update = vi.fn<(id: number, input: unknown) => Promise<Connection>>();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      create: (input: unknown) => create(input),
      update: (id: number, input: unknown) => update(id, input),
    },
  };
});

/**
 * The availability cache the thread panel reads (F2, 2026-09-19). A spy rather than a real
 * QueryClient: what matters here is WHEN the form drops it — after a successful write, never
 * after a failed one. The hook itself is tested against a real client in its own file.
 */
const invalidate = vi.fn<() => void>();
vi.mock('@/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => invalidate,
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

const noop = () => {};

beforeEach(() => {
  create.mockReset().mockResolvedValue(connection());
  update.mockReset().mockResolvedValue(connection());
  invalidate.mockReset();
});

describe('D42 — the client acknowledges what connecting a vendor sends out', () => {
  it('cannot connect until the acknowledgement is ticked', async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open onClose={noop} onSaved={noop} />);

    await user.type(screen.getByLabelText('Name'), 'Our shop');
    await user.type(screen.getByLabelText('Address'), 'https://shop.example/api');

    // ⛔ RED: drop `!acknowledged` from the disabled condition and this button is live — the
    // client's data controller connects a vendor that receives a customer's address, phone and
    // IP without ever being told that is what happens.
    const connect = screen.getByRole('button', { name: 'Connect' });
    expect(connect).toBeDisabled();

    await user.click(screen.getByRole('checkbox'));
    expect(connect).toBeEnabled();
  });

  it('says what actually leaves the workspace — not that "data may be shared"', () => {
    render(<CustomApiVendorForm open onClose={noop} onSaved={noop} />);
    const statement = screen.getByRole('checkbox').closest('label')?.textContent ?? '';
    // ⛔ RED: soften this to "may share data with third parties" and the tick stops being a
    // decision — nobody can act on a sentence that does not name what is sent.
    expect(statement).toMatch(/email address/i);
    expect(statement).toMatch(/phone/i);
    expect(statement).toMatch(/IP address/i);
  });

  it('sends the acknowledgement with the create', async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open onClose={noop} onSaved={noop} />);

    await user.type(screen.getByLabelText('Name'), 'Our shop');
    await user.type(screen.getByLabelText('Address'), 'https://shop.example/api');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({
      name: 'Our shop',
      baseUrl: 'https://shop.example/api',
      piiAcknowledged: true,
    });
  });

  it('never re-asks on an edit, and never re-sends the acknowledgement', async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open connection={connection()} onClose={noop} onSaved={noop} />);
    // ⛔ RED: show the tick when editing and an admin is re-prompted on every rename, which
    // trains them to tick without reading.
    expect(screen.queryByRole('checkbox')).toBeNull();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1]).not.toHaveProperty('piiAcknowledged');
  });
});

describe('the credential is write-only in the form too', () => {
  it('renders no key for a vendor that has one — not even a masked stand-in', () => {
    render(<CustomApiVendorForm open connection={connection()} onClose={noop} onSaved={noop} />);
    const key: HTMLInputElement = screen.getByLabelText(/API key/i);
    // ⛔ RED: pre-fill this with `'••••'` to show "a key is set" and the masked value is now a
    // value in the DOM — and the next save posts it as the new credential.
    expect(key.value).toBe('');
    expect(screen.getByText(/A key is saved for this connection/i)).toBeTruthy();
  });

  it('OMITS the credential when the admin typed nothing — renaming must not delete the key', async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open connection={connection()} onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText('Name'), ' renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    // ⛔ RED: send `credential: ''` unconditionally and every lookup under this vendor starts
    // failing authentication the next time somebody fixes a typo in its name. Absent is KEEP;
    // '' is CLEAR; the two are different intents and this asserts the field is truly absent.
    expect(update.mock.calls[0][1]).not.toHaveProperty('credential');
  });

  it('POSITIVE CONTROL: a typed key IS sent — the absence above is not the form being inert', async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open connection={connection()} onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText(/API key/i), 'sk_live_rotated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1]).toMatchObject({ credential: 'sk_live_rotated' });
  });
});

describe('audit pass 2 — the blank header name', () => {
  /**
   * 🪤 THE FIRST VERSION OF THIS TEST ASSERTED NOTHING. It typed a real header name, so
   * `trim()` and `trim() || null` behave identically and the mutation that reintroduces the bug
   * left it green. Caught because the negative control PASSED — a control that passes means the
   * test does not cover the thing, not that the code is safe
   * ([[feedback_a_negative_control_that_passes_may_never_have_applied]]).
   *
   * What is actually true now: the '' spelling is unreachable through this form, because the
   * save button is blocked while a header auth has a blank name (the test below). The `|| null`
   * remains as the correct spelling for any other route into this code. So this test pins the
   * reachable half — switching AWAY from header auth must clear the name, not blank it.
   */
  it('⛔ clears the header name to null when the auth no longer uses one', async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open connection={connection()} onClose={noop} onSaved={noop} />);
    await user.selectOptions(screen.getByLabelText(/How does it check who we are/i), 'bearer');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    // RED: send `''` here and a PATCH that only changed the auth kind is refused by the schema
    // (min(1)), with a validation error about a field the admin never typed in.
    expect(update.mock.calls[0][1]).toMatchObject({ authType: 'bearer', authHeaderName: null });
  });

  it('⛔ will not create a header auth with no header name — the API would accept it', async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText('Name'), 'Our shop');
    await user.type(screen.getByLabelText('Address'), 'https://shop.example/api');
    await user.selectOptions(screen.getByLabelText(/How does it check who we are/i), 'header');
    await user.click(screen.getByRole('checkbox'));

    // ⛔ RED: leave the header name out of the blocked condition and this form creates a
    // connection that cannot authenticate — and whose next RENAME is then refused with a
    // validation error about a field the admin never filled in.
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    await user.type(screen.getByLabelText('Header name'), 'X-Oc-Restadmin-Id');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });
});

describe('audit pass 15 — a secret that will be discarded is never sent', () => {
  it('⛔ omits the key when the admin chose an auth that has none', async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText('Name'), 'Our shop');
    await user.type(screen.getByLabelText('Address'), 'https://shop.example/api');
    // They type a key first...
    await user.selectOptions(screen.getByLabelText(/How does it check who we are/i), 'bearer');
    await user.type(screen.getByLabelText(/API key/i), 'sk_live_typed_then_abandoned');
    // ...then decide the system does not need one.
    await user.selectOptions(screen.getByLabelText(/How does it check who we are/i), 'none');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    // ⛔ RED: send `credential` unconditionally and a secret the backend will immediately throw
    // away (`authType !== 'none' && credential`) still crosses the network and sits in whatever
    // logs or proxies saw the request.
    expect(create.mock.calls[0][0]).not.toHaveProperty('credential');

    // POSITIVE CONTROL: with an auth type that HAS a key, it is still sent.
    create.mockClear();
    cleanup();
    render(<CustomApiVendorForm open onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText('Name'), 'Our shop');
    await user.type(screen.getByLabelText('Address'), 'https://shop.example/api');
    await user.selectOptions(screen.getByLabelText(/How does it check who we are/i), 'bearer');
    await user.type(screen.getByLabelText(/API key/i), 'sk_live_kept');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({ credential: 'sk_live_kept' });
  });
});

describe('a refusal says which end is wrong', () => {
  it("shows the backend's words, which name the address", async () => {
    const user = userEvent.setup();
    create.mockRejectedValue({
      response: {
        data: {
          error:
            '192.168.1.10 is not reachable from our servers — it resolves to a private or ' +
            'reserved address, which usually means it is inside your own network.',
        },
      },
    });
    render(<CustomApiVendorForm open onClose={noop} onSaved={noop} />);

    await user.type(screen.getByLabelText('Name'), 'Internal');
    await user.type(screen.getByLabelText('Address'), 'https://192.168.1.10/api');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    // ⛔ RED: replace the surfaced message with a hardcoded "Could not save this connection"
    // and the admin loses the only sentence that tells them what to do next — so they open a
    // ticket with us, which is the thing self-serve exists to stop.
    await waitFor(() =>
      expect(screen.getByText(/192\.168\.1\.10 is not reachable from our servers/)).toBeTruthy()
    );
  });
});

describe('⛔ a saved connection reaches the thread panel now, not in five minutes', () => {
  const connectOne = async () => {
    const user = userEvent.setup();
    render(<CustomApiVendorForm open onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText('Name'), 'Our shop');
    await user.type(screen.getByLabelText('Address'), 'https://shop.example/api');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  };

  it('a successful create drops the cached availability', async () => {
    await connectOne();
    // ⛔ RED: drop the call after the save and the panel keeps its cached "no" for five minutes.
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
  });

  it('a failed create does not', async () => {
    create.mockRejectedValue(new Error('refused'));
    await connectOne();
    // ⛔ RED: invalidate before the write (or in `finally`) and a refused save still refetches.
    await screen.findByText(/Could not save this connection/);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
