import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { CustomApiLookupPanel } from '../CustomApiLookupPanel';
import type * as LookupService from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

type CustomApiLookupResult = LookupService.CustomApiLookupResult;

/**
 * The agent-facing panel (CA-3 SC1–SC7, D36, D38).
 *
 * What these tests are really guarding is that four outcomes stay DISTINGUISHABLE. If "no match"
 * and "failed" look the same, agents learn to ignore both, and a real outage reads as a customer
 * with no orders — which is the confusion the whole outcome model exists to prevent.
 */

const run = vi.fn<(body: unknown) => Promise<CustomApiLookupResult[]>>();
const availability = vi.fn<(surface: string) => Promise<boolean>>();

vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>('@/services/customApiLookup.service');
  return {
    ...actual,
    customApiLookupService: {
      run: (body: unknown) => run(body),
      availability: (surface: string) => availability(surface),
    },
  };
});

const card = (over: Partial<CustomApiLookupResult> = {}): CustomApiLookupResult =>
  ({
    endpointId: 20,
    label: 'this order',
    connectionName: 'DeusPower',
    resultShape: 'one',
    status: 'ok',
    rows: [{ order_id: '137416', total: '348.50', total__currency: 'EUR' }],
    fields: [
      { path: 'order_id', label: 'Order', kind: 'plain' },
      { path: 'total', label: 'Total', kind: 'money' },
    ],
    ...over,
  }) as CustomApiLookupResult;

const press = async (name = /look up/i) => {
  // `find`, not `get`: the panel renders only once availability has answered.
  await userEvent.click((await screen.findAllByRole('button', { name }))[0]);
};

/** A fresh cache per render, so one test's availability answer never leaks into the next. */
const render = (ui: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return rtlRender(ui, { wrapper });
};

beforeEach(() => {
  run.mockReset();
  availability.mockReset();
  availability.mockResolvedValue(true);
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

describe('SC1 — the lookup is a PRESS, never automatic', () => {
  it('⛔ calls nothing on mount', () => {
    // RED: fetch in an effect ⇒ N enabled endpoints become N outbound calls to a client's vendor
    // every time any agent opens any thread. The backend is innocent and the cost is real.
    render(<CustomApiLookupPanel conversationId={1} />);
    expect(run).not.toHaveBeenCalled();
  });

  it('calls once per press', async () => {
    run.mockResolvedValue([card()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenCalledWith({ conversationId: 1 });
  });
});

describe('the outcomes stay distinguishable', () => {
  it('SC2 — "no match" is ORDINARY, and not styled as a failure', async () => {
    // RED: render it through the error component ⇒ a shipping API not knowing a customer who never
    // ordered looks like an outage, which is the commonest case there is.
    run.mockResolvedValue([card({ status: 'no_match', rows: [], fields: [] })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    const text = await screen.findByText(/no matching records/i);
    expect(text.className).toContain('text-muted-foreground');
    expect(text.className).not.toContain('destructive');
  });

  it('SC3 — a failed card shows its reason AND the other card still shows rows', async () => {
    // RED: let one failure blank the panel ⇒ one vendor being down hides every other integration.
    run.mockResolvedValue([
      card({ endpointId: 30, status: 'failed', reason: 'The vendor rejected our credentials.' }),
      card({ endpointId: 31 }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/rejected our credentials/i)).toBeTruthy();
    expect(screen.getByText('137416')).toBeTruthy();
  });

  it('SC4b — shape_changed NAMES the missing fields', async () => {
    // RED: render it as empty ⇒ a dead integration is indistinguishable from a customer we have no
    // data for, which is the sibling of SC2 and the reason both states exist.
    run.mockResolvedValue([
      card({ status: 'shape_changed', missing: ['order_id', 'total'], rows: [], fields: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/no longer matches what was configured/i)).toBeTruthy();
    expect(screen.getByText(/order_id, total/)).toBeTruthy();
  });
});

describe('D38 — a record that is not this customer’s', () => {
  it('⛔ is SHOWN, under an unmissable flag', async () => {
    // The owner chose showing it over stranding an agent whose customer wrote from a second
    // address, knowing a guessed number then exposes someone else's data. The flag IS the
    // mitigation. RED: render a mismatch identically to an owned record ⇒ the agent reads a
    // stranger's order as the asker's and answers from it.
    run.mockResolvedValue([card({ ownership: 'mismatch' })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    const flag = await screen.findByText(/does NOT belong to this customer/i);
    expect(flag).toBeTruthy();
    expect(screen.getByText('137416')).toBeTruthy(); // still shown
  });

  it('says plainly when ownership could not be verified', async () => {
    // A carrier knows a parcel number, not who emailed us. Saying nothing would let an unverified
    // record read as confirmed.
    run.mockResolvedValue([card({ ownership: 'unverified' })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/not confirmed as this customer/i)).toBeTruthy();
  });

  it('POSITIVE CONTROL: an owned record carries no warning at all', async () => {
    // Without this, a panel that flagged EVERY record would pass both tests above.
    run.mockResolvedValue([card({ ownership: 'owned' })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    await screen.findByText('137416');
    expect(screen.queryByText(/does NOT belong/i)).toBeNull();
    expect(screen.queryByText(/not confirmed/i)).toBeNull();
  });
});

describe('D36 — the number from the customer’s message', () => {
  it('is PRE-FILLED into a field the agent can correct, and not sent by itself', async () => {
    // RED: send the suggestion automatically ⇒ a suggestion became an action, which D36 forbids in
    // as many words. It is pre-filled; the agent still presses.
    run.mockResolvedValue([
      card({ status: 'needs_input', rows: [], fields: [], suggestions: ['137416'] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    const field = await screen.findByLabelText(/record number for this order/i);
    expect((field as HTMLInputElement).value).toBe('137416');
    expect(run).toHaveBeenCalledTimes(1); // the panel press only — nothing auto-sent
  });

  it('sends the agent’s CORRECTION, not the suggestion', async () => {
    // RED: send `suggestions[0]` ⇒ the agent's edit is silently discarded and the vendor is asked
    // about a record nobody chose.
    run.mockResolvedValue([
      card({ status: 'needs_input', rows: [], fields: [], suggestions: ['137416'] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    const field = await screen.findByLabelText(/record number for this order/i);
    await userEvent.clear(field);
    await userEvent.type(field, '999999');
    await userEvent.click(screen.getAllByRole('button', { name: /look up/i })[1]);

    await waitFor(() =>
      expect(run).toHaveBeenLastCalledWith({
        conversationId: 1,
        endpointId: 20,
        parameter: '999999',
      })
    );
  });
});

describe('SC7 — money and caps', () => {
  it('⛔ renders a money field WITH its currency (D23)', async () => {
    // RED: render the bare number ⇒ on this vendor the same figure means different currencies
    // depending on which endpoint produced it, and the agent quotes the customer wrongly.
    run.mockResolvedValue([card()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText('348.50 EUR')).toBeTruthy();
  });

  it('states the TRUE total when more rows exist than are shown', async () => {
    // RED: omit it ⇒ the row cap is decorative and the agent believes they are seeing everything.
    run.mockResolvedValue([
      card({
        rows: [{ order_id: '1' }, { order_id: '2' }],
        fields: [{ path: 'order_id', label: 'Order', kind: 'plain' }],
        total: 57,
      }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/showing 2 of 57/i)).toBeTruthy();
  });

  it('never renders a nested value as [object Object]', async () => {
    // A configured path can resolve to an object. RED: String(value) ⇒ "[object Object]" is shown
    // to an agent as if it were data.
    run.mockResolvedValue([
      card({
        rows: [{ order_id: { id: 7 } }],
        fields: [{ path: 'order_id', label: 'Order', kind: 'plain' }],
      }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    await screen.findByText(/"id":7/);
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
  });
});

describe('an empty panel never reads as a failure', () => {
  it('shows nothing at all before the first press', () => {
    render(<CustomApiLookupPanel conversationId={1} />);
    expect(screen.queryByText(/no integrations/i)).toBeNull();
  });

  it('says so only AFTER a press returned nothing', async () => {
    run.mockResolvedValue([]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    expect(await screen.findByText(/no lookups are available to you/i)).toBeTruthy();
  });
});

describe('SC5 — the same panel outside a thread', () => {
  it('keys on the CONTACT when given one, not a conversation', async () => {
    // RED: leave it thread-only ⇒ an agent working from the contact list has to open an arbitrary
    // thread to see what we know about that customer.
    run.mockResolvedValue([card()]);
    render(<CustomApiLookupPanel contactId={5} />);
    await press();

    await waitFor(() => expect(run).toHaveBeenCalledWith({ contactId: 5 }));
  });

  it('renders the identical states from ONE component', async () => {
    // The parity guard. RED: build a second panel for the drawer ⇒ two vocabularies for the same
    // outcome, and two places to fix every future state. This asserts the contact surface shows
    // the same mismatch wording the thread surface does, because it is the same component.
    run.mockResolvedValue([card({ ownership: 'mismatch' })]);
    render(<CustomApiLookupPanel contactId={5} />);
    await press();

    expect(await screen.findByText(/does NOT belong to this customer/i)).toBeTruthy();
  });
});

describe('FE/BE skew — this frontend can reach production first', () => {
  it('⛔ stands DOWN when the deployment has no lookup endpoint', async () => {
    // A push to main deploys this frontend; the backend ships on a tag. RED: treat a 404 like any
    // other failure ⇒ every agent gets a Look up button answering "could not be completed", which
    // reads as a broken integration rather than a feature that has not shipped yet.
    // ⛔ THE SHAPE THE APP ACTUALLY PRODUCES. The api-client interceptor drops `.response` and
    // copies `status` onto a fresh Error, so a fixture shaped like a raw axios error would pass
    // this test against a hook that could never work in production.
    run.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('POSITIVE CONTROL: a real failure still shows a reason', async () => {
    // Without this, a panel that hid itself on ANY error would pass the test above while silently
    // swallowing a genuine outage.
    run.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 500 }));
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/could not be completed/i)).toBeTruthy();
  });

  it('tolerates a response with no fields, rows or suggestions', async () => {
    // An older backend sends a narrower shape. A component reading a field the deployed backend
    // does not send yet white-screens the whole thread view, so the service normalises first.
    run.mockResolvedValue([
      {
        endpointId: 20,
        label: 'this order',
        connectionName: 'DeusPower',
        resultShape: 'one',
        status: 'ok',
      },
    ] as CustomApiLookupResult[]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText('this order')).toBeTruthy();
  });
});

describe('a card is never blank while it holds data', () => {
  it('renders the row’s own keys when no fields are configured', async () => {
    // `fieldPaths` DEFAULTS to empty and the backend then returns rows unprojected, so this is the
    // commonest configuration state, not an edge case. RED: map over `fields` alone ⇒ the agent
    // sees an empty card and concludes there is no data, while the data is right there.
    run.mockResolvedValue([
      card({ rows: [{ order_id: '137416', status: 'Shipped' }], fields: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText('137416')).toBeTruthy();
    expect(screen.getByText('Shipped')).toBeTruthy();
  });

  it('does not show the projection’s currency bookkeeping as a field', async () => {
    // `<path>__currency` is how the backend carries a per-row currency; it is not a vendor field
    // and must not appear as its own labelled row.
    run.mockResolvedValue([
      card({ rows: [{ total: '348.50', total__currency: 'EUR' }], fields: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    await screen.findByText('348.50');
    expect(screen.queryByText(/TOTAL__CURRENCY/i)).toBeNull();
  });
});

describe('an unconfigured lookup does not become a dossier', () => {
  const vendorRow = {
    order_id: '137416',
    status: 'Shipped',
    total: '348.50',
    date_added: '2026-09-08',
    currency_code: 'EUR',
    name: 'Sergio',
    email: 'sergio@deuspower.org',
    telephone: '0000',
    ip: '193.138.7.145',
    user_agent: 'Mozilla/5.0 (iPhone)',
    postcode: 'LV-1010',
  };

  it('⛔ caps the preview when no fields are chosen, rather than rendering everything', async () => {
    // The DEFAULT state returns rows unprojected — 77 fields on the measured vendor, including the
    // customer's email, telephone, IP and user-agent. RED: render every key ⇒ audit pass 2's fix
    // for a blank card turns the thread view into a dossier on someone else's customer.
    run.mockResolvedValue([card({ rows: [vendorRow], fields: [] })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    await screen.findByText('137416');
    expect(screen.queryByText('193.138.7.145')).toBeNull();
    expect(screen.queryByText(/Mozilla/)).toBeNull();
  });

  it('says it is a preview, and how much it is not showing', async () => {
    // Silently truncating is its own lie: the agent would believe that is all the vendor holds.
    run.mockResolvedValue([card({ rows: [vendorRow], fields: [] })]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/preview of 6 of 11 fields/i)).toBeTruthy();
  });

  it('POSITIVE CONTROL: a CONFIGURED lookup still shows exactly what was chosen', async () => {
    // Without this, a panel that capped everything would pass both tests above while hiding fields
    // an admin deliberately picked.
    run.mockResolvedValue([card()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText('348.50 EUR')).toBeTruthy();
    expect(screen.queryByText(/preview of/i)).toBeNull();
  });
});

describe('results are announced, not just rendered', () => {
  it('puts the outcome region in a polite live region', async () => {
    // RED: render results outside a live region ⇒ a screen-reader user presses Look up and is
    // given no reason to look at what arrived, on a panel whose whole job is delivering
    // information an agent then quotes to a customer.
    run.mockResolvedValue([card()]);
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    await screen.findByText('137416');
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toContain('137416');
  });

  it('announces a failure too, not only a success', async () => {
    run.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    await screen.findByText(/could not be completed/i);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toMatch(/could not be/i);
  });
});

describe('one customer’s records never appear under another', () => {
  it('⛔ clears results when the panel moves to a different conversation', async () => {
    // RED: keep the results in state ⇒ an agent moving to the next thread sees the PREVIOUS
    // customer's order numbers, statuses and totals presented as this customer's. That is the
    // D35 failure — a record shown as someone's when it is not — arriving through the UI.
    run.mockResolvedValue([card()]);
    const { rerender } = render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    await screen.findByText('137416');

    rerender(<CustomApiLookupPanel conversationId={2} />);

    await waitFor(() => expect(screen.queryByText('137416')).toBeNull());
  });

  it('does NOT fetch for the new conversation by itself', async () => {
    // The clear must not become a fetch: SC1 says N endpoints must not become N outbound calls
    // every time an agent opens a thread.
    run.mockResolvedValue([card()]);
    const { rerender } = render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    await screen.findByText('137416');
    run.mockClear();

    rerender(<CustomApiLookupPanel conversationId={2} />);

    await waitFor(() => expect(screen.queryByText('137416')).toBeNull());
    expect(run).not.toHaveBeenCalled();
  });
});

describe('the panel renders ONLY when this caller has a lookup to run', () => {
  // Release blocker 2026-09-19: the panel showed on every thread and contact in every workspace,
  // and a press in a workspace with nothing configured said "No integrations are set up" — a dead
  // control in front of every client, with no screen yet to set one up.
  const settle = async () => {
    await waitFor(() => expect(availability).toHaveBeenCalled());
    // Let the rejected/resolved query commit before asserting on the DOM.
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('⛔ renders NOTHING when the backend says no lookup is available', async () => {
    availability.mockResolvedValue(false);
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await settle();
    expect(container.firstChild).toBeNull();
  });

  it('⛔ renders nothing on a 404 — an OLDER backend without the availability route', async () => {
    availability.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await settle();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on any other error — it fails CLOSED', async () => {
    availability.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 500 }));
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await settle();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while the answer is still loading', () => {
    availability.mockReturnValue(new Promise<boolean>(() => {}));
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    expect(container.firstChild).toBeNull();
  });

  it("the host's spacing sits on the panel's OWN root, so a hidden panel leaves no gap", async () => {
    // The hosts used to wrap the panel in a spaced <div>, which stayed behind as a blank gap on
    // every thread and contact once the panel started rendering nothing by default.
    const { container } = render(<CustomApiLookupPanel conversationId={1} className="mb-4" />);
    await screen.findByRole('button', { name: /look up/i });
    expect(container.firstElementChild?.className).toContain('mb-4');
  });

  it('a press that finds nothing says so without claiming the WORKSPACE has none', async () => {
    // Availability and the press share one selection, so [] means the config changed inside the
    // cache window — and for a department-scoped agent the workspace may still have lookups.
    run.mockResolvedValue([]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    expect(await screen.findByText('No lookups are available to you right now.')).toBeTruthy();
    expect(screen.queryByText(/set up for this workspace/)).toBeNull();
  });

  it('POSITIVE CONTROL: renders the panel when a lookup IS available', async () => {
    render(<CustomApiLookupPanel conversationId={1} />);
    expect(await screen.findByText('CONNECTED SYSTEMS')).toBeTruthy();
  });

  it('⛔ asking is NOT a lookup — no lookup request fires on mount (SC1)', async () => {
    render(<CustomApiLookupPanel conversationId={1} />);
    await screen.findByText('CONNECTED SYSTEMS');
    expect(run).not.toHaveBeenCalled();
  });

  it('asks about the SURFACE it is on: thread for a conversation, contact otherwise', async () => {
    const thread = render(<CustomApiLookupPanel conversationId={1} />);
    await waitFor(() => expect(availability).toHaveBeenCalledWith('thread'));
    thread.unmount();
    availability.mockClear();
    render(<CustomApiLookupPanel contactId={7} />);
    await waitFor(() => expect(availability).toHaveBeenCalledWith('contact'));
    expect(availability).not.toHaveBeenCalledWith('thread');
  });

  it('a press that finds nothing to run re-asks, and the panel stands down', async () => {
    run.mockResolvedValue([]);
    const { container } = render(<CustomApiLookupPanel conversationId={1} />);
    await screen.findByText('CONNECTED SYSTEMS');
    // An admin disabled the last lookup after the panel asked.
    availability.mockResolvedValue(false);
    await press();
    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(availability).toHaveBeenCalledTimes(2);
  });
});
