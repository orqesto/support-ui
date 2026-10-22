import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import type { Ticket } from '@/types';
import { TicketRowMenuItems } from '../TicketRowMenuItems';

const ticket = { id: 5, externalId: null } as Ticket;

const open = (canDelete: boolean) => {
  render(
    <Menu ariaLabel="Row" trigger={({ toggle }) => <Button onClick={toggle}>More</Button>}>
      <TicketRowMenuItems
        ticket={ticket}
        canManage
        canDelete={canDelete}
        jiraOn={false}
        onOpen={vi.fn()}
        onCopyLink={vi.fn()}
        onPushToJira={vi.fn()}
        onDelete={vi.fn()}
      />
    </Menu>
  );
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
};

describe('TicketRowMenuItems', () => {
  it('offers Delete only to someone the server lets delete tickets', () => {
    open(false);
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).toBeNull();
  });

  it('offers Delete with the delete permission', () => {
    open(true);
    expect(screen.getByRole('menuitem', { name: /Delete ticket/ })).toBeInTheDocument();
  });
});
