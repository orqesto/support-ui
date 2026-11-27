import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import type { HeldRole } from '../../services/teamBuilder.service';
import {
  ROLES_HELD_KEEP_LABEL,
  ROLES_HELD_MOVE_LABEL,
  TEAM_ROLE_LABELS,
  rolesHeldText,
} from './teamLabels';

type Props = {
  open: boolean;
  heldRoles: HeldRole[];
  busy: boolean;
  error?: string | null;
  onMove: () => void;
  onKeep: () => void;
};

/** Asks before a role another team holds moves to this one. Closing the dialog keeps it there. */
export const RolesHeldDialog = ({ open, heldRoles, busy, error, onMove, onKeep }: Props) => (
  <Dialog
    open={open}
    onOpenChange={(next) => {
      if (!next && !busy) onKeep();
    }}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Move a role?</DialogTitle>
      </DialogHeader>
      <ul className="space-y-2 text-sm text-foreground" data-testid="roles-held-list">
        {heldRoles.map((held) => (
          <li key={held.role}>{rolesHeldText(TEAM_ROLE_LABELS[held.role], held.teamName)}</li>
        ))}
      </ul>
      {error && <Alert variant="danger">{error}</Alert>}
      <DialogFooter>
        <Button variant="outline" onClick={onKeep} disabled={busy}>
          {ROLES_HELD_KEEP_LABEL}
        </Button>
        <Button onClick={onMove} disabled={busy}>
          {ROLES_HELD_MOVE_LABEL}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
