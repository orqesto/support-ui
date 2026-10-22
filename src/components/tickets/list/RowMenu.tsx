import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import type { Ticket } from '@/types';
import type { TicketRowProps } from './ticketRowShared';

export const RowMenu = ({
  ticket,
  onRowMenu,
}: {
  ticket: Ticket;
  onRowMenu: TicketRowProps['onRowMenu'];
}) => (
  <span
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    role="presentation"
  >
    <Menu
      ariaLabel={`Actions for #${ticket.id}`}
      align="end"
      width={230}
      trigger={({ open, toggle }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Actions for #${ticket.id}`}
          aria-expanded={open}
          onClick={toggle}
          className={`p-0 w-7 h-7 transition-opacity ${open ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus:opacity-100'}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      )}
    >
      {onRowMenu(ticket)}
    </Menu>
  </span>
);
