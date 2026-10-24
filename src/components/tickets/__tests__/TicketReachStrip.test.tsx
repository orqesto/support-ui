import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TicketThread } from '@/services/ticketThreads.service';
import { InsertFieldMenu } from '@/components/shared/InsertFieldMenu';
import { TicketReachStrip } from '../TicketReachStrip';

const thread = (id: number, over: Partial<TicketThread>): TicketThread =>
  ({
    conversationId: id,
    publicId: null,
    subject: null,
    requesterEmail: `c${id}@example.com`,
    status: 'open',
    channel: 'email',
    createdAt: '2026-10-20T10:00:00Z',
    isPrimary: id === 1,
    addedAt: '2026-10-20T10:00:00Z',
    owesReply: false,
    parkedAt: null,
    parkedReason: null,
    parkedUntil: null,
    receivedUpdate: false,
    ...over,
  }) as TicketThread;

const four = [
  thread(1, { receivedUpdate: true, status: 'resolved' }),
  thread(2, { receivedUpdate: true, status: 'resolved' }),
  thread(3, { owesReply: true, status: 'open' }),
  thread(4, { owesReply: false, status: 'open' }),
];

describe('TicketReachStrip', () => {
  it('is not shown for a ticket with one thread', () => {
    const { container } = render(<TicketReachStrip threads={[four[0]]} ticketDone={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('on a resolved ticket: threads, updated, still owed, resolved', () => {
    render(<TicketReachStrip threads={four} ticketDone />);
    expect(screen.getByText('threads on this ticket').previousSibling).toHaveTextContent('4');
    expect(screen.getByText('customers updated').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('still owed the fix').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('threads resolved').previousSibling).toHaveTextContent('2');
  });

  it('on an open ticket: how many have not been updated yet', () => {
    render(<TicketReachStrip threads={four} ticketDone={false} />);
    expect(screen.getByText('not updated yet').previousSibling).toHaveTextContent('2');
    expect(screen.queryByText('still owed the fix')).toBeNull();
  });

  it('draws the updated and owed shares as bars', () => {
    render(<TicketReachStrip threads={four} ticketDone />);
    expect(screen.getByTestId('reach-updated')).toHaveStyle({ width: '50%' });
    expect(screen.getByTestId('reach-owed')).toHaveStyle({ width: '25%' });
  });
});

describe('InsertFieldMenu', () => {
  it('offers the five fields the server fills, with what each becomes', () => {
    render(<InsertFieldMenu onInsert={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Insert field/ }));
    for (const field of [
      '{first_name}',
      '{customer_name}',
      '{ticket_id}',
      '{thread_id}',
      '{agent_name}',
    ]) {
      expect(
        screen.getByRole('menuitem', { name: (name) => name.includes(field) })
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText('Add a fallback for unknown names: {customer_name|there}')
    ).toBeInTheDocument();
  });

  it('inserts the picked field', () => {
    const onInsert = vi.fn();
    render(<InsertFieldMenu onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: /Insert field/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /\{ticket_id\}/ }));
    expect(onInsert).toHaveBeenCalledWith('{ticket_id}');
  });

  it('can be disabled', () => {
    render(<InsertFieldMenu onInsert={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: /Insert field/ })).toBeDisabled();
  });
});
