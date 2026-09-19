import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointWizard, labelFromPath } from '../EndpointWizard';
import { ResponseTree } from '../ResponseTree';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

/**
 * ⛔ TYPED MOCKS, not `vi.fn()` with a spread of `unknown[]`. An untyped mock returns `any`, and
 * the spread hands `any` straight back to the caller — four `no-unsafe-return` errors, which is a
 * CI failure and not a style note. Typing them also means a test that calls one of these with the
 * wrong argument count fails at compile time rather than passing vacuously.
 */
const createEndpoint = vi.fn<(connectionId: number, input: unknown) => Promise<Connection>>();
const updateEndpoint =
  vi.fn<(connectionId: number, endpointId: number, input: unknown) => Promise<Connection>>();
const sendTest =
  vi.fn<
    (
      connectionId: number,
      endpointId: number,
      parameter?: string
    ) => Promise<Svc.EndpointTestResult>
  >();
const shapeSample =
  vi.fn<
    (connectionId: number, endpointId: number, sample: string) => Promise<Svc.EndpointTestResult>
  >();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      createEndpoint: (connectionId: number, input: unknown) => createEndpoint(connectionId, input),
      updateEndpoint: (connectionId: number, endpointId: number, input: unknown) =>
        updateEndpoint(connectionId, endpointId, input),
      sendTest: (connectionId: number, endpointId: number, parameter?: string) =>
        sendTest(connectionId, endpointId, parameter),
      shapeSample: (connectionId: number, endpointId: number, sample: string) =>
        shapeSample(connectionId, endpointId, sample),
    },
  };
});

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
      enabled: true,
      effectivelyEnabled: true,
      chainBroken: false,
      hasResponseSkeleton: false,
      createdAt: '2026-09-19T10:00:00.000Z',
      updatedAt: '2026-09-19T10:00:00.000Z',
    },
  ],
});

const REAL_PATHS = [
  'order_id',
  'name',
  'status',
  'date_added',
  'products[].name',
  'total',
  'currency_code',
];

const noop = () => {};

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/What should agents call this/i), "Customer's orders");
  await user.type(screen.getByLabelText(/Address in your system/i), '/rest/order');
};

beforeEach(() => {
  createEndpoint.mockReset().mockResolvedValue(withNewEndpoint());
  updateEndpoint.mockReset().mockResolvedValue(withNewEndpoint());
  sendTest.mockReset().mockResolvedValue({ outcome: { status: 'ok' }, paths: REAL_PATHS });
  shapeSample.mockReset().mockResolvedValue({ outcome: { status: 'ok' }, paths: REAL_PATHS });
});

describe('the field picker — the thing that makes this self-serve', () => {
  it('shows the response as a TREE of tickable fields, not raw JSON', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));

    // ⛔ RED: render the raw JSON and we have shipped a developer tool with a form around it.
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(REAL_PATHS.length));
    expect(screen.getByText('order_id')).toBeTruthy();
    // A nested path shows its container as structure and its leaf as the pickable thing.
    expect(screen.getByText('products[]')).toBeTruthy();
  });

  it('a ticked field gets a readable label, not the raw path', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('checkbox', { name: /date_added/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const saved = updateEndpoint.mock.calls.at(-1)?.[2] as { fieldPaths: Svc.FieldPick[] };
    // ⛔ RED: default the label to the path and an agent's column header reads `date_added`.
    expect(saved.fieldPaths).toEqual([
      { path: 'date_added', label: 'Date added', kind: 'plain', role: 'none' },
    ]);
  });

  it('⛔ paste-a-sample reaches the SAME tree — the route for a system we cannot reach', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);

    // ⛔ RED: make the live call the only route and an admin behind a VPN, an IP allowlist, or a
    // dead ngrok tunnel is blocked with nothing to do but call us.
    await user.click(screen.getByRole('button', { name: /paste a response instead/i }));
    // `user.type` reads `{` as a key descriptor, so paste it the way an admin actually would.
    await user.click(screen.getByLabelText(/Paste what your system returns/i));
    await user.paste('{"data":[]}');
    await user.click(screen.getByRole('button', { name: 'Use this' }));

    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(REAL_PATHS.length));
    expect(shapeSample).toHaveBeenCalled();
    expect(sendTest).not.toHaveBeenCalled();
  });

  it('says the pasted values are not kept — and that is true of the backend', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await user.click(screen.getByRole('button', { name: /paste a response instead/i }));
    expect(screen.getByText(/only keep the shape/i)).toBeTruthy();
  });
});

describe('⛔ a failed test is not an empty tree', () => {
  /**
   * ⛔ The status is typed as the CONTRACT's union, not `string` (audit pass 20). Typing the mock
   * surfaced this: a bare string is not assignable, and a table that can hold a status the API
   * cannot return is a test asserting behaviour for a state that does not exist.
   */
  const cases: Array<[Svc.EndpointTestResult['outcome']['status'], RegExp]> = [
    ['no_match', /nothing for that value/i],
    ['shape_changed', /not with the fields this lookup expects/i],
    ['failed', /did not answer|Connection refused/i],
  ];
  it.each(cases)('%s says its own thing', async (status, expected) => {
    sendTest.mockResolvedValue({
      outcome: { status, reason: 'Connection refused' },
      paths: [],
    });
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));

    // ⛔ RED: collapse the three into "nothing came back" and an admin retunes a working
    // integration because it looked empty.
    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
  });
});

describe('⛔ a failed test does not wipe the tree the admin is working in', () => {
  it('keeps the fields and the tree when a later test finds nothing', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(REAL_PATHS.length));

    // Testing a value this customer simply does not have is an ORDINARY thing to do.
    sendTest.mockResolvedValue({ outcome: { status: 'no_match' }, paths: [] });
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getByText(/nothing for that value/i)).toBeTruthy());

    // ⛔ RED: replace the tree with the empty result and the admin loses the shape they were
    // picking from, for a perfectly healthy vendor.
    expect(screen.getAllByRole('checkbox').length).toBe(REAL_PATHS.length);
  });
});

describe('D23 — money without a currency is refused', () => {
  it('will not save an amount whose currency nobody said', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('checkbox', { name: /^total/ }));
    await user.selectOptions(screen.getByLabelText(/^How to show/), 'money');

    // ⛔ RED: allow it and the agent panel renders a bare number — and on this vendor the same
    // figure means different currencies depending on which lookup produced it.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText(/where the currency comes from/i)).toBeTruthy();

    // POSITIVE CONTROL: naming the currency field unblocks it.
    await user.selectOptions(screen.getByLabelText(/^Currency for/), 'currency_code');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('audit pass 10 — a blank field label is a 400 nobody can read', () => {
  it('⛔ blocks the save and names the field, instead of letting the API refuse it', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('checkbox', { name: /date_added/ }));

    // The admin clears the label to retype it, then saves.
    await user.clear(screen.getByLabelText(/What agents see for date_added/i));

    /**
     * ⛔ RED: let it through and `fieldPathSchema`'s `label` min(1) refuses the PATCH with
     * `{"error":"Validation error","fields":[...]}` — the zod message never reaches the admin
     * (pass 4), so they are told nothing about which field or why.
     */
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText(/a name agents will read/i)).toBeTruthy();

    // POSITIVE CONTROL: typing one clears the block.
    await user.type(screen.getByLabelText(/What agents see for date_added/i), 'Ordered on');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('audit pass 8 — what we look up BY, and where the value goes', () => {
  it('⛔ defaults to the customer’s email, so an agent does not retype what is on screen', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalled());

    /**
     * ⛔ RED: leave `parameterSource` unset and it defaults to `manual` — so every lookup this
     * wizard makes asks the agent to TYPE the customer's email on every thread, when the lookup
     * service resolves it from the contact for free. That is the difference between the phase's
     * acceptance and an agent retyping an address already in front of them.
     */
    expect(createEndpoint.mock.calls[0][1]).toMatchObject({
      parameterSource: 'identity',
      // The schema refines that an identity parameter needs one of these; without it, 400.
      identityField: 'email',
    });
  });

  it('POSITIVE CONTROL: a parcel number is still the agent’s to type', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.selectOptions(screen.getByLabelText(/What do we look up by/i), 'manual');
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalled());
    expect(createEndpoint.mock.calls[0][1]).toMatchObject({
      parameterSource: 'manual',
      identityField: null,
    });
  });

  it('⛔ warns about the missing {value} BEFORE the call, not as a refusal after it', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText(/What should agents call this/i), 'Orders');
    await user.type(screen.getByLabelText(/Address in your system/i), '/rest/order');

    // ⛔ RED: say nothing and the executor refuses with "a configured value with nowhere to go" —
    // a sentence about a token this UI had never shown them, arriving only after they press Test.
    expect(screen.getByText(/nowhere to put the value/i)).toBeTruthy();
  });

  it('POSITIVE CONTROL: a path that HAS the placeholder is not nagged', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText(/Address in your system/i), '/rest/order?email=');
    await user.paste('{value}');
    expect(screen.queryByText(/nowhere to put the value/i)).toBeNull();
  });
});

describe('audit pass 7 — D19: a list lookup must be marked as one', () => {
  it('⛔ infers "many" from the rows the vendor actually returned', async () => {
    sendTest.mockResolvedValue({
      outcome: { status: 'ok', rows: [{}, {}, {}] },
      paths: REAL_PATHS,
    });
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    /**
     * ⛔ RED: leave resultShape unset and every lookup made here is 'one', so the executor sends
     * NO limit to the vendor (D19) — and that vendor's default page size is 20 / 100000 /
     * config_limit_admin / 1 depending on the route. A list lookup then drags the whole list
     * over the wire on every agent lookup until the 2 MB cap truncates it.
     */
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({ resultShape: 'many' });
  });

  it("uses the vendor's own total when it returned a single page of one", async () => {
    sendTest.mockResolvedValue({
      outcome: { status: 'ok', rows: [{}], total: 23 },
      paths: REAL_PATHS,
    });
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({ resultShape: 'many' });
  });

  it('POSITIVE CONTROL: a genuine single record stays "one"', async () => {
    sendTest.mockResolvedValue({ outcome: { status: 'ok', rows: [{}] }, paths: REAL_PATHS });
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Without this, marking everything 'many' would pass the two tests above.
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    expect(updateEndpoint.mock.calls.at(-1)?.[2]).toMatchObject({ resultShape: 'one' });
  });
});

describe('audit pass 6 — FE/BE skew, which this repo ships by design', () => {
  it("⛔ a 404 on the PASTE route blames our deploy order, not the admin's system", async () => {
    // A push to `main` deploys this frontend; the backend goes out on a tag. So this code will
    // meet a backend with no /shape route, which answers 404.
    shapeSample.mockRejectedValue({ response: { status: 404, data: { error: 'Not found' } } });
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /paste a response instead/i }));
    await user.click(screen.getByLabelText(/Paste what your system returns/i));
    await user.paste('{"data":[]}');
    await user.click(screen.getByRole('button', { name: 'Use this' }));

    // ⛔ RED: fall through to "Could not reach your system" and an admin goes hunting a tunnel
    // that is working perfectly, because we deployed the halves in the wrong order.
    await waitFor(() =>
      expect(screen.getByText(/not available on this workspace yet/i)).toBeTruthy()
    );
  });

  it('POSITIVE CONTROL: a 404 from TEST still reports the vendor, not our version', async () => {
    sendTest.mockRejectedValue({
      response: { status: 404, data: { error: 'Lookup not found' } },
    });
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getByText(/Lookup not found/i)).toBeTruthy());
    expect(screen.queryByText(/not available on this workspace yet/i)).toBeNull();
  });
});

describe('audit pass 5 — a value already set, and a field priced in itself', () => {
  const pickTotalAsMoney = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('checkbox', { name: /^total/ }));
    await user.selectOptions(screen.getByLabelText(/^How to show/), 'money');
    await user.selectOptions(screen.getByLabelText(/^Currency for/), 'currency_code');
  };

  it('⛔ drops the currency when the field stops being money', async () => {
    const user = userEvent.setup();
    await pickTotalAsMoney(user);
    await user.selectOptions(screen.getByLabelText(/^How to show/), 'plain');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const saved = updateEndpoint.mock.calls.at(-1)?.[2] as { fieldPaths: Svc.FieldPick[] };
    // ⛔ RED: leave the currency behind and a plain field carries one — the backend's refine only
    // looks at money, so it saves cleanly, and switching back later silently reinstates a
    // currency the admin never re-chose.
    expect(saved.fieldPaths[0]).toEqual({
      path: 'total',
      label: 'Total',
      kind: 'plain',
      role: 'none',
    });
  });

  it('⛔ does not offer a field as its OWN currency', async () => {
    const user = userEvent.setup();
    await pickTotalAsMoney(user);
    const options = Array.from(
      screen.getByLabelText(/^Currency for/).querySelectorAll('option')
    ).map((option) => option.getAttribute('value'));
    // RED: list every path and "From total" sits one keystroke away in the list — an amount
    // priced in its own value renders "348.50 348.50" to an agent.
    expect(options).not.toContain('total');
    // POSITIVE CONTROL: the other paths are still offered, so this is not an empty list.
    expect(options).toContain('currency_code');
  });
});

describe('re-testing keeps what the admin already chose', () => {
  it('keeps picks that still exist and NAMES the ones that vanished', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('checkbox', { name: /^status/ }));
    await user.click(screen.getByRole('checkbox', { name: /date_added/ }));

    // The vendor stops returning one of them.
    sendTest.mockResolvedValue({
      outcome: { status: 'ok' },
      paths: REAL_PATHS.filter((path) => path !== 'date_added'),
    });
    await user.click(screen.getByRole('button', { name: 'Test' }));

    // ⛔ RED: discard picks on re-test and an admin who pressed Test just to check the lookup was
    // alive loses their configuration without being told.
    await waitFor(() => expect(screen.getByText(/did not return date_added/i)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const saved = updateEndpoint.mock.calls.at(-1)?.[2] as { fieldPaths: Svc.FieldPick[] };
    expect(saved.fieldPaths.map((field) => field.path).sort()).toEqual(['date_added', 'status']);
  });
});

describe('audit pass 2 — a vanished field can still be removed', () => {
  it('offers Remove for a pick that is no longer in the tree', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('checkbox', { name: /date_added/ }));

    // The vendor stops returning it: the tick box is gone with it.
    sendTest.mockResolvedValue({
      outcome: { status: 'ok' },
      paths: REAL_PATHS.filter((one) => one !== 'date_added'),
    });
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getByText(/did not return date_added/i)).toBeTruthy());

    // ⛔ RED: without a Remove control the admin is stuck with a pick they cannot untick,
    // because the only way to untick one was its box in the tree.
    await user.click(screen.getByRole('button', { name: /Remove Date added/i }));

    // ⛔ AUDIT PASS 4, on the pass-2 fix itself: removing a vanished pick must also clear the
    // warning that named it. `missing` was stored at test time and the Remove control did not
    // prune it, so the screen went on reporting a field the admin had just deleted — and the
    // "that is every field this lookup shows" sentence could fire off a stale count.
    // RED: store `missing` in state again and this text is still on screen.
    expect(screen.queryByText(/did not return date_added/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const saved = updateEndpoint.mock.calls.at(-1)?.[2] as { fieldPaths: Svc.FieldPick[] };
    expect(saved.fieldPaths.map((one) => one.path)).not.toContain('date_added');
  });

  it('⛔ saves in ONE write, so a failure cannot leave the name saved and the fields not', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('checkbox', { name: /^status/ }));

    updateEndpoint.mockClear();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    // RED: call ensureSaved() and then PATCH again and this is 2 — a failure between them
    // renames the lookup while its fields are silently lost.
    expect(updateEndpoint).toHaveBeenCalledTimes(1);
    expect(updateEndpoint.mock.calls[0][2]).toMatchObject({ label: "Customer's orders" });
  });
});

describe('the tree itself', () => {
  it('offers a leaf for picking and a branch as structure', () => {
    const toggle = vi.fn();
    render(<ResponseTree paths={['order_id', 'products[].name']} picked={[]} onToggle={toggle} />);
    // `products[]` is a container: ticking it would store a path whose value is an object the
    // agent's panel cannot render.
    expect(screen.getByText('products[]')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('says what to do when there is nothing yet, rather than showing an empty box', () => {
    render(<ResponseTree paths={[]} picked={[]} onToggle={vi.fn()} />);
    expect(screen.getByText(/run a test, or paste a response/i)).toBeTruthy();
  });
});

describe('audit pass 3 — the warning matches what the backend will actually do', () => {
  it('says the lookup itself is broken when EVERY picked field vanished', () => {
    render(
      <ResponseTree
        paths={['order_id']}
        picked={[{ path: 'total', label: 'Total', kind: 'plain', role: 'none' }]}
        onToggle={vi.fn()}
        missing={['total']}
      />
    );
    // ⛔ RED: use the mild wording in both states. `shape_changed` fires only when ALL configured
    // paths are missing, so this is the state where an agent sees nothing at all — and the
    // sentence that describes losing one field of five would quietly understate it.
    expect(screen.getByText(/fields have changed/i)).toBeTruthy();
  });

  it('keeps the mild wording when only SOME vanished — the backend keeps working', () => {
    render(
      <ResponseTree
        paths={['order_id']}
        picked={[
          { path: 'order_id', label: 'Order', kind: 'plain', role: 'none' },
          { path: 'total', label: 'Total', kind: 'plain', role: 'none' },
        ]}
        onToggle={vi.fn()}
        missing={['total']}
      />
    );
    expect(screen.queryByText(/fields have changed/i)).toBeNull();
    expect(screen.getByText(/did not return total/i)).toBeTruthy();
  });
});

describe('labelFromPath', () => {
  it.each([
    ['order_id', 'Order id'],
    ['currency_code', 'Currency code'],
    ['products[].name', 'Name'],
    ['date-added', 'Date added'],
  ])('%s → %s', (path, expected) => {
    expect(labelFromPath(path)).toBe(expected);
  });
});

describe('the lookup is created before it can be tested', () => {
  it('creates it once and reuses its id on the second test', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(createEndpoint).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Test' }));

    // ⛔ RED: create on every test and one admin pressing Test three times leaves three identical
    // lookups on the connection, all of them offered to agents.
    await waitFor(() => expect(sendTest).toHaveBeenCalledTimes(2));
    expect(createEndpoint).toHaveBeenCalledTimes(1);
    expect(sendTest.mock.calls.at(-1)?.[1]).toBe(99);
  });
});

describe('⛔ the lookup it tests is the one it just created', () => {
  it('picks the NEW endpoint, not whichever row the API returned last', async () => {
    // The connection already has a lookup, and the API returns the new one FIRST — which is what
    // an unordered query does after an earlier row was rewritten (Send test rewrites one every
    // run, saving the response skeleton).
    const existing = withNewEndpoint().endpoints[0];
    const withTwo = {
      ...connection(),
      endpoints: [existing],
    } as Connection;
    createEndpoint.mockResolvedValue({
      ...withTwo,
      endpoints: [{ ...existing, id: 123, label: 'brand new' }, existing],
    } as Connection);

    const user = userEvent.setup();
    render(<EndpointWizard connection={withTwo} onClose={noop} onSaved={noop} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test' }));

    // ⛔ RED: take `endpoints[length - 1]` and the wizard tests, and then overwrites, a lookup
    // the admin configured earlier — silently, because both are valid lookups on this vendor.
    await waitFor(() => expect(sendTest).toHaveBeenCalled());
    expect(sendTest.mock.calls.at(-1)?.[1]).toBe(123);
  });
});

describe('the wizard reaches a working lookup without meeting 24 fields', () => {
  it('asks for a name, an address, and what to show — and nothing else to get started', async () => {
    const user = userEvent.setup();
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    const inputs = screen.getAllByRole('textbox');
    // ⛔ RED: expose the whole endpoint schema and an admin meets eight path fields before they
    // have seen a single thing their own system returned. Roles, chaining, formats and the
    // ownership question are later steps that unlock more; this is the working floor.
    expect(inputs.length).toBeLessThanOrEqual(4);
    await fill(user);
    expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
  });
});
