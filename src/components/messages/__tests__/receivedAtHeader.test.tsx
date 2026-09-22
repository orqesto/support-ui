/**
 * The header's compact "received at" line (message detail v3). The full To/Cc/Bcc exists only
 * in the tooltip, so keyboard, touch and screen-reader users must be able to reach it — and
 * mail ingested before recipients were recorded must show NOTHING rather than "sent to nobody".
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReceivedAtAddresses } from '../ReceivedAtAddresses';

afterEach(cleanup);

const header = (recipients: unknown) =>
  render(
    <ReceivedAtAddresses recipients={recipients} variant="card" prefix="received at" focusable />
  );

describe('ReceivedAtAddresses — header form', () => {
  it('renders nothing when recipients were never recorded', () => {
    const { container } = header(undefined);
    expect(container.textContent).toBe('');
  });

  it('renders nothing for an empty or malformed value', () => {
    expect(header({ to: [], cc: [], bcc: [] }).container.textContent).toBe('');
    cleanup();
    expect(header('support@x.example').container.textContent).toBe('');
  });

  it('shows the single address with no "+N"', () => {
    header({ to: ['support@northwind.example'] });
    expect(screen.getByText('support@northwind.example')).toBeTruthy();
    expect(screen.queryByText(/\+\d/)).toBeNull();
  });

  it('shows the first address and "+N" for the rest', () => {
    header({
      to: ['support@northwind.example'],
      cc: ['billing@northwind.example', 'ops@x.example'],
    });
    expect(screen.getByText('support@northwind.example +2')).toBeTruthy();
    expect(screen.getByText('received at')).toBeTruthy();
  });

  it('is a tab stop whose accessible name carries the full To/Cc/Bcc', () => {
    header({ to: ['support@northwind.example'], cc: ['billing@northwind.example'] });
    const stop = screen.getByLabelText(
      'received at To support@northwind.example. Cc billing@northwind.example.'
    );
    expect(stop.getAttribute('tabindex')).toBe('0');
  });

  it('CONTROL: the card form in a list row stays out of the tab order', () => {
    render(<ReceivedAtAddresses recipients={{ to: ['a@x.example'] }} />);
    expect(screen.getByText('to').parentElement?.getAttribute('tabindex')).toBeNull();
  });
});
