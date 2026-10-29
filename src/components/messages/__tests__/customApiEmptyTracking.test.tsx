/**
 * A tracking-tagged field shows only when the record HAS a parcel (owner, 2026-10-29).
 *
 * An unshipped order has no tracking, and that is its normal state — a "TRACKING —" line on every
 * one of them is noise. This is the one exception to "nothing is ever dropped", so the controls
 * matter as much as the cases: an empty UNTAGGED field and an empty status still read `—`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RowFields } from '../customApiRowFields';
import type { LookupField } from '@/services/customApiLookup.service';

afterEach(cleanup);

const field = (over: Partial<LookupField> & { path: string; label: string; role?: string }) =>
  ({ kind: 'plain', ...over }) as LookupField;

/** An order list: one parcel at most, as plain fields. */
const LIST_FIELDS = [
  field({ path: 'order_id', label: 'Order id', role: 'identifier' }),
  field({ path: 'status', label: 'Status', role: 'status' }),
  field({ path: 'note', label: 'Note' }),
  field({ path: 'tracking_number', label: 'Tracking no', role: 'tracking_number' }),
  field({ path: 'tracking_url', label: 'Tracking link', role: 'tracking_link' }),
];

/** One order in full: its parcels as a list, the carrier untagged beside them. */
const DETAIL_FIELDS = [
  field({ path: 'order_id', label: 'Order id', role: 'identifier' }),
  field({ path: 'trackings[].carrier', label: 'Carrier' }),
  field({ path: 'trackings[].tracking_no', label: 'Parcel no', role: 'tracking_number' }),
  field({ path: 'trackings[].url', label: 'Parcel link', role: 'tracking_link' }),
];

const SHIPPED = {
  order_id: '1001',
  status: 'Completed',
  note: '',
  tracking_number: 'TRK0001EX',
  tracking_url: 'https://track.example/TRK0001EX',
};
const UNSHIPPED = {
  order_id: '1002',
  status: 'New',
  note: '',
  tracking_number: '',
  tracking_url: null,
};

describe('tracking shows only when the record has a parcel', () => {
  it('🔴 an unshipped order has no tracking lines at all, in a categorised card', () => {
    render(<RowFields row={UNSHIPPED} fields={LIST_FIELDS} category="order" />);

    expect(screen.queryByText('TRACKING NO')).not.toBeInTheDocument();
    expect(screen.queryByText('TRACKING LINK')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-tracking')).not.toBeInTheDocument();
  });

  it('🔴 …and in the plain grid, when the lookup has no category', () => {
    render(<RowFields row={UNSHIPPED} fields={LIST_FIELDS} />);

    expect(screen.queryByText('TRACKING NO')).not.toBeInTheDocument();
    expect(screen.queryByText('TRACKING LINK')).not.toBeInTheDocument();
    // Control: the grid itself rendered.
    expect(screen.getByText('ORDER ID')).toBeInTheDocument();
  });

  it('a shipped order still shows its parcel, as a link to the carrier page', () => {
    render(<RowFields row={SHIPPED} fields={LIST_FIELDS} category="order" />);

    expect(screen.getByRole('link', { name: 'TRK0001EX' })).toHaveAttribute(
      'href',
      'https://track.example/TRK0001EX'
    );
  });

  it('a shipped order in the plain grid keeps both tracking lines', () => {
    render(<RowFields row={SHIPPED} fields={LIST_FIELDS} />);

    expect(screen.getByText('TRACKING NO')).toBeInTheDocument();
    expect(screen.getByText('TRK0001EX')).toBeInTheDocument();
  });

  it('🔴 an empty parcel list hides the whole list, its untagged carrier included', () => {
    render(
      <RowFields
        row={{
          order_id: '1003',
          'trackings[].carrier': [],
          'trackings[].tracking_no': [],
          'trackings[].url': [],
        }}
        fields={DETAIL_FIELDS}
      />
    );

    expect(screen.queryByText('PARCEL NO')).not.toBeInTheDocument();
    expect(screen.queryByText('CARRIER')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lookup-list')).not.toBeInTheDocument();
  });

  it('a parcel list with a parcel still shows, carrier and all', () => {
    const row = {
      order_id: '1004',
      'trackings[].carrier': ['Example Post'],
      'trackings[].tracking_no': ['TRK0004EX'],
      'trackings[].url': ['https://track.example/TRK0004EX'],
    };
    render(<RowFields row={row} fields={DETAIL_FIELDS} />);

    expect(screen.getByTestId('lookup-list')).toBeInTheDocument();
    expect(screen.getByText('Example Post')).toBeInTheDocument();
  });

  it('⛔ CONTROL: an empty UNTAGGED field and an empty status still read —', () => {
    render(<RowFields row={{ ...UNSHIPPED, status: '' }} fields={LIST_FIELDS} />);

    expect(screen.getByText('NOTE')).toBeInTheDocument();
    expect(screen.getByText('STATUS')).toBeInTheDocument();
  });
});
