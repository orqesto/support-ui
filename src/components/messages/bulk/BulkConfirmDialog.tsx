/**
 * The step between picking an action and running it.
 *
 * Its job is the promise the whole feature rests on: the agent sees what WILL happen and what
 * will NOT, with a reason per skipped thread, before anything is written. "12 of 15" with the
 * other three explained — never "12 threads updated" after the fact.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';
import {
  ACTION_LABEL,
  ACTION_PHRASE,
  describeScope,
  groupRefusals,
  NEEDS_INPUT,
  type BulkAction,
  type BulkPreview,
} from './bulkActions';

export type BulkConfirmValues = {
  title?: string;
  trainFilter?: boolean;
  assigneeId?: number | null;
};

type Props = {
  open: boolean;
  action: BulkAction | null;
  preview: BulkPreview | null;
  selectedCount: number;
  running: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: BulkConfirmValues) => void;
};

export const BulkConfirmDialog = ({
  open,
  action,
  preview,
  selectedCount,
  running,
  onOpenChange,
  onConfirm,
}: Props) => {
  const [title, setTitle] = useState('');
  const [trainFilter, setTrainFilter] = useState(false);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [assignable, setAssignable] = useState<AssignableUser[]>([]);

  // Fresh every time it opens: a title typed for one ticket must not survive into the next one,
  // and "teach the filter" is a decision per run, never a sticky preference.
  useEffect(() => {
    if (open) {
      setTitle('');
      setTrainFilter(false);
      setAssigneeId(null);
    }
  }, [open]);

  // Only when the run needs one. Loading the org's agents for every confirm would be a request
  // per dialog open, for a list most actions never show.
  useEffect(() => {
    if (!open || action === null || NEEDS_INPUT[action] !== 'assignee') return;
    let cancelled = false;
    void assignmentService
      .getAssignableUsers()
      .then((users) => {
        if (!cancelled) setAssignable(users);
      })
      .catch(() => {
        // Leave the list empty: the confirm button stays disabled, which is the honest state —
        // better than an enabled button that would silently clear every assignee.
        if (!cancelled) setAssignable([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, action]);

  if (!action) return null;

  const eligible = preview?.eligible.length ?? 0;
  const refusals = groupRefusals(preview?.refused ?? []);
  const needsTitle = NEEDS_INPUT[action] === 'title';
  const needsAssignee = NEEDS_INPUT[action] === 'assignee';
  // ⛔ An assign run with nobody chosen would CLEAR the assignee on every selected thread.
  // Nothing in the flow says that is what the agent meant, so it cannot be the default.
  const canRun =
    eligible > 0 &&
    (!needsTitle || title.trim().length > 0) &&
    (!needsAssignee || assigneeId !== null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ACTION_LABEL[action]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-foreground">
            {eligible === 0
              ? 'None of the selected threads can take this action.'
              : `This will ${ACTION_PHRASE[action]} ${describeScope(eligible, selectedCount)}.`}
          </p>

          {refusals.length > 0 && (
            <div className="p-3 rounded-md border border-border bg-muted/40">
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                {/* Named, never a silent skip — that is the whole contract (plan A2). */}
                Not included:
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {refusals.map((entry) => (
                  <li key={entry.reason}>
                    <span className="font-mono">{entry.count}</span> {entry.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {needsTitle && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="bulk-ticket-title">
                Ticket name
              </label>
              <Input
                id="bulk-ticket-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What these threads are about"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                One ticket will cover {eligible === 1 ? 'this thread' : `these ${eligible} threads`}.
              </p>
            </div>
          )}

          {needsAssignee && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground" htmlFor="bulk-assignee">
                Assign to
              </label>
              <select
                id="bulk-assignee"
                className="px-2 py-1.5 w-full text-sm rounded-md border border-border bg-background"
                value={assigneeId ?? ''}
                onChange={(event) =>
                  setAssigneeId(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">Choose a person…</option>
                {assignable.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {action === 'spam' && (
            <label className="flex gap-2 items-start text-sm cursor-pointer">
              <Checkbox
                checked={trainFilter}
                onChange={(event) => setTrainFilter(event.target.checked)}
              />
              <span>
                Teach the spam filter from these senders
                <span className="block text-xs text-muted-foreground">
                  Leave this off when the selection mixes different senders — one mislabel would
                  teach a rule.
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm({ title: title.trim() || undefined, trainFilter, assigneeId })
            }
            disabled={!canRun || running}
          >
            {running ? 'Working…' : `${ACTION_LABEL[action]}${eligible > 0 ? ` ${eligible}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
