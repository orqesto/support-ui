/**
 * 390 px (staging acceptance, 2026-10-14): a long value must wrap or truncate INSIDE the card,
 * never push the row past it. On staging a long status pill (`shrink-0 whitespace-nowrap`) made
 * a records card wider than the screen, and the page does not scroll sideways, so the header,
 * the banner and the values were simply cut off.
 *
 * ⚠️ jsdom computes NO layout, so overflow itself cannot be measured here. These tests pin the
 * CSS contract that prevents it instead: nothing in the card's rows is `whitespace-nowrap` +
 * `shrink-0`, flex/grid children may shrink (`min-w-0` / `minmax(0,1fr)`), and long text may
 * break. Seeing it at real width is the staging check at 390 px.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RowFields } from '../customApiRowFields';
import { CustomApiResultCard } from '../CustomApiResultCard';
import type { CustomApiLookupResult, LookupField } from '@/services/customApiLookup.service';

afterEach(cleanup);

const LONG = 'Awaiting-carrier-handover-at-the-regional-sorting-centre-north-east';
const field = (over: Partial<LookupField> & { path: string; label: string; role?: string }) =>
  ({ kind: 'plain', ...over }) as LookupField;
const FIELDS = [
  field({ path: 'id', label: 'Id', role: 'identifier' }),
  field({ path: 'status', label: 'Status', role: 'status' }),
  field({ path: 'note', label: 'Note' }),
];
const ROW = { id: '42', status: LONG, note: LONG };

const classOf = (element: Element | null) => element?.getAttribute('class') ?? '';

describe('the status pill', () => {
  it('may wrap and shrink inside the row — no shrink-0 + whitespace-nowrap', () => {
    render(<RowFields row={ROW} fields={FIELDS} category="order" />);
    const pill = classOf(screen.getByText(LONG, { selector: 'span' }));
    expect(pill).not.toContain('whitespace-nowrap');
    expect(pill).not.toContain('shrink-0');
    expect(pill).toContain('min-w-0');
    expect(pill).toContain('break-words');
    // A cap, so a long status cannot squeeze the heading out of the row.
    expect(pill).toMatch(/max-w-/);
  });

  it('the heading beside it may shrink too', () => {
    render(<RowFields row={ROW} fields={FIELDS} category="order" />);
    expect(classOf(screen.getByText(/42/).closest('p'))).toContain('min-w-0');
  });
});

describe('the labelled grid', () => {
  it('the value column is minmax(0,1fr), so a long value wraps instead of widening the grid', () => {
    render(<RowFields row={ROW} fields={FIELDS} category="order" />);
    const value = screen.getByText(LONG, { selector: 'p' });
    expect(classOf(value.parentElement?.parentElement ?? null)).toContain(
      'grid-cols-[88px_minmax(0,1fr)]'
    );
    expect(classOf(value)).toContain('break-words');
  });
});

describe('the card', () => {
  const result = {
    endpointId: 1,
    label: 'Their records',
    connectionName: `A connected system with a very long name ${LONG}`,
    resultShape: 'many',
    category: null,
    status: 'ok',
    rows: [ROW],
    fields: FIELDS,
  } as CustomApiLookupResult;

  it('its one column may shrink, and a long connection name truncates in the header', () => {
    render(
      <MemoryRouter>
        <CustomApiResultCard result={result} busy={false} referenceInput="page" />
      </MemoryRouter>
    );
    expect(classOf(screen.getByTestId('lookup-card'))).toContain('grid-cols-[minmax(0,1fr)]');
    const connection = classOf(screen.getByText(/A connected system with a very long name/));
    expect(connection).toContain('truncate');
    expect(connection).toContain('min-w-0');
  });
});
