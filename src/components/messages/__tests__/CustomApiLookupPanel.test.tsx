import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomApiLookupPanel } from '../CustomApiLookupPanel';
import type * as LookupService from '@/services/customApiLookup.service';

type CustomApiLookupResult = LookupService.CustomApiLookupResult;

/**
 * The agent-facing panel (CA-3 SC1–SC7, D36, D38).
 *
 * What these tests are really guarding is that four outcomes stay DISTINGUISHABLE. If "no match"
 * and "failed" look the same, agents learn to ignore both, and a real outage reads as a customer
 * with no orders — which is the confusion the whole outcome model exists to prevent.
 */

const run = vi.fn<(body: unknown) => Promise<CustomApiLookupResult[]>>();

vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>('@/services/customApiLookup.service');
  return { ...actual, customApiLookupService: { run: (body: unknown) => run(body) } };
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
  await userEvent.click(screen.getAllByRole('button', { name })[0]);
};

beforeEach(() => {
  run.mockReset();
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
    expect(await screen.findByText(/no integrations are set up/i)).toBeTruthy();
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
