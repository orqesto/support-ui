import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NewTicketDialog } from '@/components/tickets/NewTicketDialog';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';

/** "New ticket" for a role that may create one (support and above); opens the new ticket. */
export const NewTicketButton = ({ variant = 'primary' }: { variant?: 'primary' | 'outline' }) => {
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!hasPermission(Permission.CREATE_TICKETS)) return null;
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Plus className="mr-2 w-4 h-4" aria-hidden />
        New ticket
      </Button>
      <NewTicketDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(ticketId) => {
          setOpen(false);
          navigate(`/tickets/${ticketId}`);
        }}
      />
    </>
  );
};
