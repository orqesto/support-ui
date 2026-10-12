/**
 * Fields read from a list (`products[].name`) — shown item by item, not as "—".
 *
 * 🔴 The setup screen offers `[]` paths for anything inside a list, and the card showed "—" for
 * every one of them beside a populated list. The backend now returns such a field as an array,
 * aligned item for item; this is the card's half: fields of one list share a line per item.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { RowFields, renderValue, listOf } from '../customApiRowFields';
import type { LookupField } from '@/services/customApiLookup.service';

afterEach(cleanup);

const field = (over: Partial<LookupField> & { path: string; label: string }) =>
  ({ kind: 'plain', ...over }) as LookupField;

const FIELDS = [
  field({ path: 'order_id', label: 'Order id' }),
  field({ path: 'items[].name', label: 'Name' }),
  field({ path: 'tracking[].code', label: 'Code' }),
  field({ path: 'items[].price', label: 'Price', kind: 'money', currency: 'EUR' }),
];

const ROW = {
  order_id: '1001',
  'items[].name': ['Blue mug', 'Red kettle', 'Green teapot'],
  'tracking[].code': ['TRK-1'],
  'items[].price': [12, null, 30],
};

describe('fields read from a list', () => {
  it('🔴 shows every item (RED before: the card printed — for each)', () => {
    render(<RowFields row={ROW} fields={FIELDS} />);

    for (const name of ['Blue mug', 'Red kettle', 'Green teapot', 'TRK-1']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('lines up the fields of one list per item, with a title and column headers', () => {
    render(<RowFields row={ROW} fields={FIELDS} />);

    const items = screen.getAllByTestId('lookup-list')[0];
    expect(within(items).getByText('ITEMS')).toBeInTheDocument();
    expect(within(items).getByText('NAME')).toBeInTheDocument();
    expect(within(items).getByText('PRICE')).toBeInTheDocument();
    // Read in DOM order: name, price — item by item. A missing price keeps its place as —.
    const cells = within(items)
      .getAllByText(/./)
      .map((node) => node.textContent);
    expect(cells).toEqual([
      'ITEMS',
      'NAME',
      'PRICE',
      'Blue mug',
      '12 EUR',
      'Red kettle',
      '—',
      'Green teapot',
      '30 EUR',
    ]);
  });

  it('keeps two different lists apart, and plain fields on their own lines', () => {
    render(<RowFields row={ROW} fields={FIELDS} />);

    const lists = screen.getAllByTestId('lookup-list');
    expect(lists).toHaveLength(2);
    expect(within(lists[1]).getByText('TRACKING')).toBeInTheDocument();
    expect(within(lists[1]).queryByText('Blue mug')).not.toBeInTheDocument();
    expect(screen.getByText('ORDER ID')).toBeInTheDocument();
    expect(screen.getByText('1001')).toBeInTheDocument();
  });

  it('an empty list, or an older backend that sends no array, reads —', () => {
    render(
      <RowFields
        row={{ order_id: '1001', 'items[].name': [] }}
        fields={[field({ path: 'items[].name', label: 'Name' })]}
      />
    );
    expect(within(screen.getByTestId('lookup-list')).getByText('—')).toBeInTheDocument();
  });

  it('as one string (the record header, the reply note): items joined, never raw JSON', () => {
    expect(renderValue(ROW, FIELDS[1])).toBe('Blue mug, Red kettle, Green teapot');
    expect(renderValue(ROW, FIELDS[3])).toBe('12 EUR, —, 30 EUR');
    expect(renderValue({ 'items[].name': [] }, FIELDS[1])).toBe('—');
  });

  it('a per-item currency follows its own item', () => {
    const money = field({ path: 'items[].price', label: 'Price', kind: 'money' });
    expect(
      renderValue({ 'items[].price': [5, 7], 'items[].price__currency': ['EUR', 'PLN'] }, money)
    ).toBe('5 EUR, 7 PLN');
    expect(renderValue({ 'items[].price': [5, 7], 'items[].price__currency': 'USD' }, money)).toBe(
      '5 USD, 7 USD'
    );
  });

  it('CONTROL: a plain field is unchanged', () => {
    expect(listOf('order_id')).toBeNull();
    expect(listOf('items[].option[].value')).toBe('items[].option[]');
    expect(renderValue(ROW, FIELDS[0])).toBe('1001');
  });
});
