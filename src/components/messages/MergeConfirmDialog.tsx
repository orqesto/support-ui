import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { getConvUrlId } from '@/lib/messageHelpers';
import {
  conversationMergeService,
  MergeAssigneeConflictError,
} from '@/services/conversationMerge.service';

/** What the dialog needs to know about each ticket. A `Message` row satisfies it. */
export type MergeRow = {
  id: number;
  publicId?: string | null;
  subject?: string | null;
  createdAt?: string | null;
  sender?: string | null;
  assigneeId?: number | null;
  assigneeName?: string | null;
};

/**
 * The older ticket keeps its number (owner decision D1, 2026-09-23): that is the one the
 * customer and the team have already quoted. Unknown dates sort last, never first.
 */
export const defaultSurvivor = (rows: MergeRow[]): MergeRow | undefined =>
  [...rows].sort((left, right) => {
    const at = (row: MergeRow) =>
      row.createdAt ? Date.parse(row.createdAt) : Number.POSITIVE_INFINITY;
    return at(left) - at(right) || left.id - right.id;
  })[0];

type Props = {
  open: boolean;
  rows: MergeRow[];
  onOpenChange: (open: boolean) => void;
  /** Called with the survivor once the backend has merged. */
  onMerged: (survivor: MergeRow) => void;
  /** Shown instead of the choice when the merge cannot go ahead (loading, unreadable, mixed channels). */
  notice?: string;
};

/**
 * "These are the same conversation — make them one ticket."
 *
 * Says exactly what will happen, in the agent's words, before it happens: which ticket stays,
 * which leave the inbox, where later replies go, and that Unmerge undoes it. A merge is
 * undoable, but an agent should never have to discover what it did by looking for a ticket that
 * is gone.
 */
export const MergeConfirmDialog = ({ open, rows, onOpenChange, onMerged, notice }: Props) => {
  const orgCode = useCurrentOrgCode();
  const [survivorId, setSurvivorId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the backend hands the owner decision back (409). */
  const [conflictIds, setConflictIds] = useState<number[] | null>(null);

  const rowKey = rows.map((row) => row.id).join(',');
  useEffect(() => {
    // A new selection starts from the default, not from whatever the last one was set to.
    setSurvivorId(defaultSurvivor(rows)?.id ?? null);
    setError(null);
    setConflictIds(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey, open]);

  const survivor = rows.find((row) => row.id === survivorId);
  const others = useMemo(() => rows.filter((row) => row.id !== survivorId), [rows, survivorId]);
  const label = (row: MergeRow) => getConvUrlId({ id: row.id, publicId: row.publicId }, orgCode);

  const run = async (assigneeId?: number | null) => {
    if (!survivor || others.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await conversationMergeService.merge(
        survivor.id,
        others.map((row) => row.id),
        assigneeId
      );
      setConflictIds(null);
      onMerged(survivor);
    } catch (err) {
      if (err instanceof MergeAssigneeConflictError) {
        // Not an error: people are working these tickets and the backend will not choose.
        setConflictIds(err.assigneeIds);
        return;
      }
      logger.error('Failed to merge tickets', err);
      setError(
        getApiErrorMessage(err) ?? 'These tickets could not be merged. Nothing was changed.'
      );
    } finally {
      setBusy(false);
    }
  };

  // The names we know from the rows themselves. An assignee on no row shown here is named by
  // number rather than guessed at.
  const nameOf = (userId: number) =>
    rows.find((row) => row.assigneeId === userId)?.assigneeName ?? `Agent #${userId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Merge into one ticket</DialogTitle>
        <DialogClose onClose={() => onOpenChange(false)} />
      </DialogHeader>
      <DialogContent>
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : conflictIds ? (
          <div className="space-y-3">
            <p className="text-sm">
              Different people are working these tickets. Who keeps the merged ticket?
            </p>
            <div className="flex flex-wrap gap-2">
              {conflictIds.map((userId) => (
                <Button
                  key={userId}
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(userId)}
                >
                  {nameOf(userId)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Keep this ticket:</p>
            <ul className="space-y-1">
              {rows.map((row) => (
                <li key={row.id}>
                  <Button
                    variant={row.id === survivorId ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start text-left"
                    aria-pressed={row.id === survivorId}
                    onClick={() => setSurvivorId(row.id)}
                    disabled={busy}
                  >
                    <span className="font-mono text-xs mr-2">{label(row)}</span>
                    <span className="truncate">{row.subject?.trim() ? row.subject : '(no subject)'}</span>
                    {row.sender && (
                      <span className="ml-2 truncate text-muted-foreground">· {row.sender}</span>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
            {survivor && others.length > 0 && (
              <p>
                The messages of {others.map(label).join(', ')} move into {label(survivor)}, and{' '}
                {others.length === 1 ? 'it leaves' : 'they leave'} the inbox. Replies to{' '}
                {others.length === 1 ? 'its' : 'their'} thread will arrive in{' '}
                {label(survivor)}. You can undo this with Unmerge on {label(survivor)}.
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        {!conflictIds && (
          <Button
            onClick={() => void run()}
            isLoading={busy}
            disabled={busy || !!notice || !survivor || others.length === 0}
          >
            Merge
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
};
