import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Toggle } from '@/components/ui/Toggle';
import { logger } from '@/lib/logger';
import { userService } from '@/services/user.service';
import type { ColumnDef } from '@/components/ui/DataTable';
import type { User } from '@/types';
import { useUsersStore } from '../../stores/usersStore';

type Props = {
  user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'isMentor'>;
  /** Who may set other members' routing (`canManageMemberSkills`) — the can-edit-skills gate. */
  canEdit: boolean;
};

/** The stored mark into the Members list, so the row keeps it across re-renders. */
const keepInList = (userId: number, isMentor: boolean) => {
  const store = useUsersStore.getState();
  store.setUsers(store.users.map((row) => (row.id === userId ? { ...row, isMentor } : row)));
};

/**
 * A member's mentor mark in this workspace (1.1.330, owner): a mentor is never routed to by skill
 * but can still be assigned by hand. Marking never unassigns — when the member still owns open
 * tickets the row says how many, so an admin reassigns them by hand (no reassign button).
 */
export const MemberMentorToggle = ({ user, canEdit }: Props) => {
  const userId = user.id;
  const isMentor = user.isMentor === true;
  const name = `${user.firstName} ${user.lastName ?? ''}`.trim() || user.email;
  const [checked, setChecked] = useState(isMentor);
  const [saving, setSaving] = useState(false);
  const [openAssigned, setOpenAssigned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // A re-read list (another admin's change) wins over what this row last showed.
  useEffect(() => setChecked(isMentor), [isMentor]);

  if (!canEdit) {
    return checked ? (
      <Badge variant="secondary">Mentor</Badge>
    ) : (
      <span className="text-sm text-faint-foreground">—</span>
    );
  }

  const change = async (next: boolean) => {
    setSaving(true);
    setError(null);
    setChecked(next);
    try {
      const result = await userService.setMentor(userId, next);
      setChecked(result.isMentor);
      setOpenAssigned(result.isMentor ? result.openAssigned : 0);
      keepInList(userId, result.isMentor);
    } catch (err) {
      logger.error('Failed to set the mentor mark', err);
      setChecked(!next);
      setOpenAssigned(0);
      setError(err instanceof Error && err.message ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <Toggle
        checked={checked}
        onChange={(next) => void change(next)}
        disabled={saving}
        ariaLabel={`Mentor: ${name}`}
        label={checked ? 'Mentor' : undefined}
      />
      {checked && openAssigned > 0 && (
        <p className="text-xs text-warning">
          Has {openAssigned} open {openAssigned === 1 ? 'ticket' : 'tickets'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};

/** The Members list's Mentor column. */
export const mentorColumn = (canEdit: boolean): ColumnDef<User> => ({
  id: 'mentor',
  header: 'Mentor',
  cell: (user) => <MemberMentorToggle user={user} canEdit={canEdit} />,
});
