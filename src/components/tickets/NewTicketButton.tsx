import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/roles';

/**
 * "New ticket" for a role that may create one (support and above): the Create ticket page, empty
 * — the same page a thread's Create ticket opens (owner 2026-10-21; it was a dialog of its own).
 */
export const NewTicketButton = ({ variant = 'primary' }: { variant?: 'primary' | 'outline' }) => {
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  if (!hasPermission(Permission.CREATE_TICKETS)) return null;
  return (
    <Button size="sm" variant={variant} onClick={() => navigate('/tickets/create')}>
      <Plus className="mr-2 w-4 h-4" aria-hidden />
      New ticket
    </Button>
  );
};
