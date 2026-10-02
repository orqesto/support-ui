import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
import {
  MG_BODY,
  MG_DIALOG,
  MG_FOOT,
  MG_HEAD,
  MG_OPTION,
  MG_OPTION_SELECTED,
  MG_TITLE,
} from './relatedStyles';

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
  /** Called with the survivor, and the rows merged into it, once the backend has merged. */
  onMerged: (survivor: MergeRow, mergedIn: MergeRow[]) => void;
  /** Shown instead of the choice when the merge cannot go ahead (loading, unreadable, mixed channels). */
  notice?: string;
  /** The thread the agent is on, marked "this thread" in the choice (v4). Omitted from a bulk merge. */
  currentId?: number;
};

/**
 * "These are the same conversation — make them one ticket."
 *
 * Says exactly what will happen, in the agent's words, before it happens: which ticket stays,
 * which leave the inbox, where later replies go, and that Unmerge undoes it. A merge is
 * undoable, but an agent should never have to discover what it did by looking for a ticket that
 * is gone.
 */
export const MergeConfirmDialog = ({
  open,
  rows,
  onOpenChange,
  onMerged,
  notice,
  currentId,
}: Props) => {
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
  /*
    A real radio group (WAI-ARIA radio pattern): ONE Tab stop — the checked option, or the first
    when none is — and the arrow keys move AND select, wrapping; Home/End go to the ends.
  */
  const radioRefs = useRef(new Map<number, HTMLButtonElement>());
  const tabStopId = survivor?.id ?? rows[0]?.id ?? null;
  const onRadioKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = rows.length;
    if (count === 0) return;
    let next: number;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % count;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;
    event.preventDefault();
    const target = rows[next];
    setSurvivorId(target.id);
    radioRefs.current.get(target.id)?.focus();
  };
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
      onMerged(survivor, others);
    } catch (err) {
      if (err instanceof MergeAssigneeConflictError) {
        // Not an error: people are working these threads and the backend will not choose.
        setConflictIds(err.assigneeIds);
        return;
      }
      logger.error('Failed to merge threads', err);
      setError(
        getApiErrorMessage(err) ?? 'These threads could not be merged. Nothing was changed.'
      );
    } finally {
      setBusy(false);
    }
  };

  // The names we know from the rows themselves. An assignee on no row shown here is named by
  // number rather than guessed at.
  const nameOf = (userId: number) =>
    rows.find((row) => row.assigneeId === userId)?.assigneeName ?? `Agent #${userId}`;

  const opened = (row: MergeRow) =>
    row.createdAt && !Number.isNaN(Date.parse(row.createdAt))
      ? new Date(row.createdAt).toLocaleDateString()
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className={MG_DIALOG} sheetOnPhone>
      <DialogHeader className={MG_HEAD}>
        <DialogTitle className={MG_TITLE}>Merge into one thread</DialogTitle>
        <DialogClose onClose={() => onOpenChange(false)} />
      </DialogHeader>
      <DialogContent className={MG_BODY}>
        {notice ? (
          <p className="m-0 text-muted-foreground">{notice}</p>
        ) : conflictIds ? (
          <div className="grid gap-2.5">
            <p className="m-0">
              Different people are working these threads. Who keeps the merged thread?
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
          <div className="grid gap-2.5">
            <p className="m-0 text-muted-foreground">Keep this thread:</p>
            <ul role="radiogroup" aria-label="Keep this thread" className="grid gap-1.5">
              {rows.map((row, index) => {
                const selected = row.id === survivorId;
                const when = opened(row);
                return (
                  <li key={row.id} role="none">
                    <Button
                      ref={(node) => {
                        if (node) radioRefs.current.set(row.id, node);
                        else radioRefs.current.delete(row.id);
                      }}
                      variant="ghost"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={row.id === tabStopId ? 0 : -1}
                      onKeyDown={(event) => onRadioKey(event, index)}
                      className={`w-full h-auto justify-start font-sans font-normal ${MG_OPTION} ${selected ? MG_OPTION_SELECTED : ''}`}
                      onClick={() => setSurvivorId(row.id)}
                      disabled={busy}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 w-3.5 h-3.5 rounded-full flex-none box-border ${selected ? 'border-4 border-primary bg-card' : 'border-[1.5px] border-border-strong'}`}
                      />
                      <span className="flex flex-col flex-1 min-w-0 leading-[1.35]">
                        <span className="font-mono text-[11.5px] text-muted-foreground">
                          {label(row)}
                          {row.id === currentId && (
                            <span className="ml-1 px-[5px] rounded font-sans text-[10.5px] bg-primary-muted text-primary">
                              this thread
                            </span>
                          )}
                        </span>
                        <span className="text-[13px] font-medium truncate">
                          {row.subject?.trim() ? row.subject : '(no subject)'}
                        </span>
                        {[row.sender, when].some(Boolean) && (
                          <span className="text-[12px] text-muted-foreground truncate">
                            {[row.sender, when && `opened ${when}`].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
            {survivor && others.length > 0 && (
              <p className="m-0 px-3 py-2.5 rounded-[9px] bg-muted">
                The messages of {others.map(label).join(', ')} move into {label(survivor)}, and{' '}
                {others.length === 1 ? 'it leaves' : 'they leave'} the inbox. Replies to{' '}
                {others.length === 1 ? 'its' : 'their'} thread will arrive in {label(survivor)}. You
                can undo this with Unmerge on {label(survivor)}.
              </p>
            )}
          </div>
        )}
        {error && <p className="m-0 text-destructive">{error}</p>}
      </DialogContent>
      <DialogFooter className={MG_FOOT}>
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
