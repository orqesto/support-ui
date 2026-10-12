/**
 * Fields read from a list (`products[].name`) — shown item by item, not as "—".
 *
 * 🔴 The setup screen offers `[]` paths for anything inside a list, and the card showed "—" for
 * every one of them beside a populated list. The backend now returns such a field as an array,
 * aligned item for item; this is the card's half: fields of one list share a line per item.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RowFields,
  renderValue,
  listOf,
  projectFields,
  LIST_ITEM_PREVIEW,
} from '../customApiRowFields';
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

describe('a long list is cut, and says so', () => {
  const many = Array.from({ length: 25 }, (_, index) => `Item ${index + 1}`);
  const fields = [field({ path: 'items[].name', label: 'Name' })];

  it(`shows the first ${LIST_ITEM_PREVIEW}, then how many more, then all on request`, async () => {
    render(<RowFields row={{ 'items[].name': many }} fields={fields} />);

    expect(screen.getByText(`Item ${LIST_ITEM_PREVIEW}`)).toBeInTheDocument();
    expect(screen.queryByText(`Item ${LIST_ITEM_PREVIEW + 1}`)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all 25 (15 more)' }));
    expect(screen.getByText('Item 25')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it(`CONTROL: a list of exactly ${LIST_ITEM_PREVIEW} has no button`, () => {
    render(
      <RowFields row={{ 'items[].name': many.slice(0, LIST_ITEM_PREVIEW) }} fields={fields} />
    );
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('the reply note keeps every item — the cut is only the screen', () => {
    expect(renderValue({ 'items[].name': many }, fields[0]).split(', ')).toHaveLength(25);
  });
});

describe('the preview of a lookup with no fields picked', () => {
  const row = {
    order_id: '1001',
    items: [{ name: 'Blue mug' }, { name: 'Red kettle' }],
    tags: ['gift', 'express'],
    coupons: [],
  };
  const preview = (path: string) => renderValue(row, field({ path, label: path }));

  it('🔴 counts a list of records instead of printing its JSON', () => {
    expect(preview('items')).toBe('2 items');
    expect(renderValue({ items: [{ name: 'x' }] }, field({ path: 'items', label: 'items' }))).toBe(
      '1 item'
    );
  });

  it('reads a list of plain values as text, and an empty list as —', () => {
    expect(preview('tags')).toBe('gift, express');
    expect(preview('coupons')).toBe('—');
  });

  it('renders on the card without any JSON', () => {
    // The panel's own fallback: no fields configured ⇒ the row's first keys, as they are.
    const { fields, usingFallback } = projectFields({ rows: [row], fields: [] } as never);
    expect(usingFallback).toBe(true);
    render(<RowFields row={row} fields={fields} />);
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('{"');
  });
});
