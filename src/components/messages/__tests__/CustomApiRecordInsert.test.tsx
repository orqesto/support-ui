/**
 * L2 P4 — the control that puts a record into the agent's note for the AI draft.
 *
 * ⛔ What it must never do: send anything by itself, add a field the agent did not tick, or let a
 * fact go missing quietly. The note reaches the model inside `<agent_instructions>`, which the
 * prompt tells it to treat as fact — so an unticked total appearing there is a number we told a
 * customer on nobody's authority.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomApiRecordInsert } from '../CustomApiRecordInsert';
import type { LookupField } from '@/services/customApiLookup.service';

afterEach(cleanup);

const field = (over: {
  path: string;
  label: string;
  role?: string;
  kind?: 'plain' | 'money';
  currency?: string;
}) => ({ kind: 'plain', ...over }) as LookupField;

const FIELDS = [
  field({ path: 'order_id', label: 'Order', role: 'identifier' }),
  field({ path: 'status', label: 'Status', role: 'status' }),
  field({ path: 'placed', label: 'Placed', role: 'date' }),
  field({ path: 'total', label: 'Total', kind: 'money', currency: 'EUR', role: 'total' }),
];

const ROW = {
  order_id: '137416',
  status: 'in_transit',
  status__label: 'On its way',
  placed: '2026-09-01',
  total: 348.5,
};

const renderInsert = (onUseInReply = vi.fn().mockReturnValue('added')) => {
  render(
    <CustomApiRecordInsert
      row={ROW}
      fields={FIELDS}
      category="order"
      lookupLabel="Their records"
      onUseInReply={onUseInReply}
    />
  );
  return onUseInReply;
};

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /Use in reply/i }));

describe('putting a record into the note', () => {
  it('🔴 adds the default fields as one readable fact', async () => {
    const user = userEvent.setup();
    const onUseInReply = renderInsert();

    await open(user);
    await user.click(screen.getByRole('button', { name: 'Add to my note' }));

    expect(onUseInReply).toHaveBeenCalledWith('Order 137416 — Status: On its way. Placed: 2026-09-01.');
  });

  it('⛔ the TOTAL is not there unless the agent ticks it', async () => {
    // Money in a reply is a commitment. It is offered, never assumed.
    const user = userEvent.setup();
    const onUseInReply = renderInsert();

    await open(user);
    expect(screen.getByLabelText('Total: 348.5 EUR')).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Add to my note' }));
    expect(onUseInReply.mock.calls[0][0]).not.toContain('348.5');
  });

  it('adds it once the agent DOES tick it', async () => {
    const user = userEvent.setup();
    const onUseInReply = renderInsert();

    await open(user);
    await user.click(screen.getByLabelText('Total: 348.5 EUR'));
    await user.click(screen.getByRole('button', { name: 'Add to my note' }));

    expect(onUseInReply.mock.calls[0][0]).toContain('Total: 348.5 EUR');
  });

  it('🔴 shows the exact sentence BEFORE it is added', async () => {
    // The model is told to treat this as fact; an agent has to be able to read what they vouch for.
    const user = userEvent.setup();
    renderInsert();

    await open(user);

    expect(
      screen.getByText('Order 137416 — Status: On its way. Placed: 2026-09-01.')
    ).toBeInTheDocument();
  });

  it('⛔ NOTHING happens until the agent presses Add', async () => {
    const user = userEvent.setup();
    const onUseInReply = renderInsert();

    await open(user);
    await user.click(screen.getByLabelText('Total: 348.5 EUR'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onUseInReply).not.toHaveBeenCalled();
  });

  it('says the note is FULL rather than letting the fact vanish', async () => {
    const user = userEvent.setup();
    renderInsert(vi.fn().mockReturnValue('full'));

    await open(user);
    await user.click(screen.getByRole('button', { name: 'Add to my note' }));

    expect(screen.getByText(/Note is full/i)).toBeInTheDocument();
  });

  it('⛔ distinguishes "already there" from "full" — they ask for different things', async () => {
    const user = userEvent.setup();
    renderInsert(vi.fn().mockReturnValue('duplicate'));

    await open(user);
    await user.click(screen.getByRole('button', { name: 'Add to my note' }));

    expect(screen.getByText(/Already in your note/i)).toBeInTheDocument();
    expect(screen.queryByText(/Note is full/i)).not.toBeInTheDocument();
  });

  it('cannot add an empty fact', async () => {
    const user = userEvent.setup();
    const onUseInReply = renderInsert();

    await open(user);
    for (const label of ['Order: 137416', 'Status: On its way', 'Placed: 2026-09-01']) {
      await user.click(screen.getByLabelText(label));
    }

    expect(screen.getByRole('button', { name: 'Add to my note' })).toBeDisabled();
    expect(onUseInReply).not.toHaveBeenCalled();
  });
});

describe('records that have nothing to give', () => {
  it('⛔ renders NO control when no field carries a role', () => {
    // Every L1 lookup is this. A button that can only ever produce an empty note teaches an
    // agent to stop pressing buttons.
    render(
      <CustomApiRecordInsert
        row={{ note: 'hello' }}
        fields={[field({ path: 'note', label: 'Note' })]}
        category={null}
        lookupLabel="Their records"
        onUseInReply={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Use in reply/i })).not.toBeInTheDocument();
  });

  it('CONTROL: a roled field DOES produce the control, so the absence above means something', () => {
    render(
      <CustomApiRecordInsert
        row={ROW}
        fields={FIELDS}
        category={null}
        lookupLabel="Their records"
        onUseInReply={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Use in reply/i })).toBeInTheDocument();
  });
});

describe('a record we could not confirm belongs to this customer (D38)', () => {
  it('🔴 warns AT THE BUTTON, not only at the top of the card', () => {
    // The note is handed to the model as fact. Seeing the card's warning when the panel loaded is
    // not the same as seeing it with your hand on the control that sends it into a reply.
    render(
      <CustomApiRecordInsert
        row={ROW}
        fields={FIELDS}
        category="order"
        lookupLabel="Their records"
        ownership="mismatch"
        onUseInReply={vi.fn().mockReturnValue('added')}
      />
    );

    return userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Use in reply/i }))
      .then(() => {
        expect(screen.getByText(/not confirmed as this customer/i)).toBeInTheDocument();
      });
  });

  it('⛔ still ALLOWS it — D38 shows these rather than stranding the agent', async () => {
    const user = userEvent.setup();
    const onUseInReply = vi.fn().mockReturnValue('added');
    render(
      <CustomApiRecordInsert
        row={ROW}
        fields={FIELDS}
        category="order"
        lookupLabel="Their records"
        ownership="mismatch"
        onUseInReply={onUseInReply}
      />
    );

    await user.click(screen.getByRole('button', { name: /Use in reply/i }));
    await user.click(screen.getByRole('button', { name: 'Add to my note' }));

    expect(onUseInReply).toHaveBeenCalled();
  });

  it('CONTROL: a confirmed record carries no warning', async () => {
    const user = userEvent.setup();
    render(
      <CustomApiRecordInsert
        row={ROW}
        fields={FIELDS}
        category="order"
        lookupLabel="Their records"
        ownership="owned"
        onUseInReply={vi.fn().mockReturnValue('added')}
      />
    );

    await user.click(screen.getByRole('button', { name: /Use in reply/i }));

    expect(screen.queryByText(/not confirmed as this customer/i)).not.toBeInTheDocument();
  });
});
