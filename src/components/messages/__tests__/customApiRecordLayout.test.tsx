/**
 * L2 P3 — a record laid out AS a record, from the roles the admin tagged.
 *
 * ⛔ The two things this must never do: invent structure from a label or a value's shape (only the
 * admin's `role` decides), and DROP a field it does not put in the header. The acceptance is that
 * an agent sees reference / status / date / total as an order rather than six generic rows — and
 * that everything the plain list showed is still on screen.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RowFields } from '../customApiRowFields';
import type { LookupField } from '@/services/customApiLookup.service';

afterEach(cleanup);

const field = (over: Partial<LookupField> & { path: string; label: string; role?: string }) =>
  ({ kind: 'plain', ...over }) as LookupField;

const ORDER_FIELDS = [
  field({ path: 'order_id', label: 'Order', role: 'identifier' }),
  field({ path: 'status', label: 'Status', role: 'status' }),
  field({ path: 'placed', label: 'Placed', role: 'date' }),
  field({ path: 'total', label: 'Total', kind: 'money', currency: 'EUR', role: 'total' }),
  field({ path: 'note', label: 'Note' }),
];

const ORDER_ROW = {
  order_id: '137416',
  status: 'in_transit',
  status__label: 'On its way',
  placed: '2026-09-01',
  total: 348.5,
  note: 'Leave with the neighbour',
};

describe('a categorised record', () => {
  it('🔴 heads the record with what it IS and the reference the customer quotes', () => {
    render(<RowFields row={ORDER_ROW} fields={ORDER_FIELDS} category="order" />);

    // ⛔ Not "ORDER / 137416" as two more grid cells — one heading an agent reads at a glance.
    const heading = screen.getByText(/Order/).closest('p');
    // ⛔ With a SPACE. `Order137416` is what a screen reader announces and what a copy-paste
    // carries, and a CSS margin is not a word boundary.
    expect(heading?.textContent).toBe('Order 137416');
  });

  it("🔴 shows the status as the admin's word, not the vendor's raw value", () => {
    render(<RowFields row={ORDER_ROW} fields={ORDER_FIELDS} category="order" />);

    expect(screen.getByText('On its way')).toBeInTheDocument();
    expect(screen.queryByText('in_transit')).not.toBeInTheDocument();
    // ⛔ AND IT MOVED. The grid renders the same word under a `STATUS` label, so asserting the
    // word alone passes against the plain list — the layout is only proven by what is NO LONGER
    // a labelled grid row.
    expect(screen.queryByText('STATUS')).not.toBeInTheDocument();
  });

  it('🔴 puts the date and the total on one meta line, with the currency', () => {
    render(<RowFields row={ORDER_ROW} fields={ORDER_FIELDS} category="order" />);

    expect(screen.getByText('2026-09-01')).toBeInTheDocument();
    expect(screen.getByText('348.5 EUR')).toBeInTheDocument();
    // Same trap as the status: both values exist in the plain grid too. What distinguishes the
    // meta line is that they are no longer grid rows with upper-cased labels.
    expect(screen.queryByText('PLACED')).not.toBeInTheDocument();
    expect(screen.queryByText('TOTAL')).not.toBeInTheDocument();
    expect(screen.getByText('Placed:')).toBeInTheDocument();
  });

  it('⛔ DROPS NOTHING: an unroled field still renders in the grid below', () => {
    render(<RowFields row={ORDER_ROW} fields={ORDER_FIELDS} category="order" />);

    expect(screen.getByText('NOTE')).toBeInTheDocument();
    expect(screen.getByText('Leave with the neighbour')).toBeInTheDocument();
  });

  it('⛔ a role field with NO value stays in the grid, so its emptiness is still visible', () => {
    // Otherwise a missing status would vanish: the agent would not know the field exists, and
    // "no chip" reads as "no status field" rather than "this record has no status".
    render(
      <RowFields row={{ ...ORDER_ROW, placed: null }} fields={ORDER_FIELDS} category="order" />
    );

    expect(screen.getByText('PLACED')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('names the category even when the vendor sent no reference', () => {
    render(
      <RowFields
        row={{ status: 'in_transit', status__label: 'On its way' }}
        fields={ORDER_FIELDS}
        category="shipment"
      />
    );

    expect(screen.getByText('Shipment')).toBeInTheDocument();
  });
});

describe('CONTROLS — every lookup that is not a categorised record', () => {
  it('⛔ NO CATEGORY renders exactly the labelled grid it always did', () => {
    // Every L1 lookup is this. P3 must be invisible to them.
    render(<RowFields row={ORDER_ROW} fields={ORDER_FIELDS} />);

    expect(screen.getByText('ORDER')).toBeInTheDocument();
    expect(screen.getByText('STATUS')).toBeInTheDocument();
    expect(screen.getByText('137416')).toBeInTheDocument();
  });

  it('⛔ a category with NO roles on the fields also renders the plain grid', () => {
    // An admin can set a category and tag nothing. There is nothing to lay out, and guessing
    // which column is the reference is exactly what this feature must not do.
    const untagged = [
      field({ path: 'order_id', label: 'Order' }),
      field({ path: 'status', label: 'Status' }),
    ];
    render(<RowFields row={ORDER_ROW} fields={untagged} category="order" />);

    expect(screen.getByText('ORDER')).toBeInTheDocument();
    expect(screen.getByText('STATUS')).toBeInTheDocument();
  });

  it('⛔ an unknown role from a NEWER backend is ignored, not rendered as a heading', () => {
    const future = [field({ path: 'order_id', label: 'Order', role: 'warehouse_bay' })];
    render(<RowFields row={ORDER_ROW} fields={future} category="order" />);

    expect(screen.getByText('ORDER')).toBeInTheDocument();
    expect(screen.queryByText(/^Order137416$/)).not.toBeInTheDocument();
  });

  it('a row whose reference and status are both EMPTY falls back to the grid', () => {
    const blank = { order_id: '', status: null, placed: '2026-09-01' };
    render(<RowFields row={blank} fields={ORDER_FIELDS} category="order" />);

    // The heading would have said "Order" over a record with nothing to identify or judge it by.
    expect(screen.getByText('PLACED')).toBeInTheDocument();
    expect(screen.queryByText('Order', { selector: 'p.font-medium' })).not.toBeInTheDocument();
  });
});

describe('values that look like nothing but are not', () => {
  it('⛔ a total of ZERO is shown, not treated as missing', () => {
    // A zero-value order is a real record — a refund, a fully-discounted line. Dropping it from
    // the meta line would tell an agent the vendor sent no total at all.
    const fields = [
      field({ path: 'order_id', label: 'Order', role: 'identifier' }),
      field({ path: 'total', label: 'Total', kind: 'money', currency: 'EUR', role: 'total' }),
    ];
    render(<RowFields row={{ order_id: 'A1', total: 0 }} fields={fields} category="invoice" />);

    expect(screen.getByText('0 EUR')).toBeInTheDocument();
  });
});

describe('the two surfaces agree', () => {
  it('the same row and fields render the same heading wherever they are used', () => {
    // The records page is opened FROM the panel; both call this one component, which is what
    // stops the page renaming or flattening what the panel said.
    const { container: first } = render(
      <RowFields row={ORDER_ROW} fields={ORDER_FIELDS} category="order" />
    );
    const firstHtml = first.innerHTML;
    cleanup();
    const { container: second } = render(
      <RowFields row={ORDER_ROW} fields={ORDER_FIELDS} category="order" />
    );
    expect(second.innerHTML).toBe(firstHtml);
    expect(within(second).getByText('On its way')).toBeInTheDocument();
  });
});

describe('a second Look up that returns different records', () => {
  it('🔴 does not carry one record’s ticks onto another', async () => {
    // The panel keys rows by INDEX, so this component is reused for whatever record now sits in
    // that position. Ticking the total on order A and re-running must not leave order B's total
    // ticked — an agent would add a number they never chose for this record.
    const fields = [
      field({ path: 'order_id', label: 'Order', role: 'identifier' }),
      field({ path: 'total', label: 'Total', kind: 'money', currency: 'EUR', role: 'total' }),
    ];
    const useInReply = () => 'added' as const;

    const { rerender } = render(
      <RowFields
        row={{ order_id: 'A', total: 1 }}
        fields={fields}
        category="order"
        lookupLabel="Their records"
        onUseInReply={useInReply}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /Use in reply/i }));
    expect(screen.getByLabelText('Total: 1 EUR')).toBeInTheDocument();

    rerender(
      <RowFields
        row={{ order_id: 'B', total: 2 }}
        fields={fields}
        category="order"
        lookupLabel="Their records"
        onUseInReply={useInReply}
      />
    );

    // A fresh control for a fresh record: closed again, nothing carried over.
    expect(screen.queryByLabelText('Total: 1 EUR')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use in reply/i })).toBeInTheDocument();
  });
});
