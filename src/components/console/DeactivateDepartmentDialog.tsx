import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { WorkspaceDepartmentRow } from '@/services/platform.service';

interface DeactivateDepartmentDialogProps {
  open: boolean;
  /** The department being deactivated (null while closed). */
  department: WorkspaceDepartmentRow | null;
  /** Active departments this one's data could move into (already excludes itself). */
  targets: WorkspaceDepartmentRow[];
  busy: boolean;
  onConfirm: (targetDepartmentId?: number) => void;
  onClose: () => void;
}

const isEmpty = (dept: WorkspaceDepartmentRow): boolean =>
  dept.counts.messageSources === 0 &&
  dept.counts.users === 0 &&
  dept.counts.totalConversations === 0;

/**
 * Confirms deactivating a workspace department (SPEC §6.4). An EMPTY department can be
 * turned off directly; a NON-EMPTY one must pick a target department to absorb its
 * conversations / message sources / members before it is tombstoned — nothing is
 * orphaned. The target picker is required (and the confirm disabled) only in that case.
 */
export const DeactivateDepartmentDialog = ({
  open,
  department,
  targets,
  busy,
  onConfirm,
  onClose,
}: DeactivateDepartmentDialogProps) => {
  const [targetId, setTargetId] = useState<string>('');

  // Reset the picker whenever a different department opens the dialog.
  useEffect(() => {
    setTargetId('');
  }, [department?.id]);

  if (!department) return null;

  const empty = isEmpty(department);
  const needsTarget = !empty;
  const canConfirm = !busy && (empty || targetId !== '');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate “{department.name}”</DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {empty ? (
            <p className="text-sm text-foreground">
              This department has no message sources, members, or conversations. It will be
              turned off and can be re-activated later.
            </p>
          ) : (
            <>
              <p className="text-sm text-foreground">
                This department owns{' '}
                <span className="font-medium">{department.counts.messageSources}</span> source
                {department.counts.messageSources === 1 ? '' : 's'},{' '}
                <span className="font-medium">{department.counts.users}</span> member
                {department.counts.users === 1 ? '' : 's'} and{' '}
                <span className="font-medium">{department.counts.totalConversations}</span>{' '}
                conversation{department.counts.totalConversations === 1 ? '' : 's'}. Choose a
                department to move them into before it is turned off — nothing is deleted.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="merge-target" className="text-sm font-medium text-foreground">
                  Move everything to
                </label>
                <Select
                  id="merge-target"
                  value={targetId}
                  disabled={busy}
                  onChange={(event) => setTargetId(event.target.value)}
                >
                  <option value="" disabled>
                    Select a department…
                  </option>
                  {targets.map((target) => (
                    <option key={target.id} value={String(target.id)}>
                      {target.name}
                      {target.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </Select>
                {targets.length === 0 && (
                  <p className="text-xs text-destructive">
                    No other active department to move this data into. Activate another
                    department first.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => onConfirm(needsTarget ? Number(targetId) : undefined)}
          >
            {busy ? 'Working…' : needsTarget ? 'Merge & deactivate' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
