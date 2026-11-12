import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { MessageThread } from '@/services/message.service';
import type { AssignableUser } from '@/services/assignment.service';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { getAvatarColor } from './inboxCardHelpers';
import { getInitials } from '@/lib/initials';
import { useListWritingGuard } from '../presence/useWritingGuard';

type Props = {
  thread: MessageThread;
  /** `row`: a list row (both layouts). `card`: a Kanban card — a little smaller. */
  size?: 'row' | 'card';
};

const TRIGGER_CLASSES = {
  row: {
    avatar: 'w-6 h-6 hover:ring-[3px] hover:ring-primary-muted',
    claim: 'h-6 px-[9px] rounded-md text-[11.5px] border-border-strong',
  },
  card: {
    avatar: 'w-[22px] h-[22px] hover:ring-2 hover:ring-primary/40',
    claim: 'h-[22px] px-2 rounded text-[11px] border-border',
  },
} as const;

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

/**
 * The assignee avatar — or "Claim" — on a list row or a Kanban card, with its picker.
 *
 * One component for both (until 2026-11-12 the Kanban card had its own copy, and fixes reached one
 * and not the other). The picker is the design-system Popover: portalled to <body> (rows and cards
 * clip their overflow), placed and flipped on screen, closed by Escape or a press outside, focus
 * back on the trigger. The assignee box takes the focus once its list has loaded (AssignmentSelect
 * `autoFocus`), so a keyboard user can reach a picker that sits at the end of the page.
 */
export const RowAssignee = ({ thread, size = 'row' }: Props) => {
  const msg = thread.latestMessage;
  const currentUser = useAuthStore((state) => state.user);
  // Thread presence (§5.5): an assign asks first while a colleague writes a reply on this thread.
  const writingGuard = useListWritingGuard(msg?.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Optimistic shadow of the server's assignee: the row shows a pick at once, without a list
  // refetch; it gives way as soon as the server's value agrees (the !== msg.assigneeId checks).
  const [optimisticAssignee, setOptimisticAssignee] = useState<{
    id: number | null;
    name: string;
  } | null>(null);

  if (!msg) return null;

  const effectiveAssigneeId =
    optimisticAssignee && optimisticAssignee.id !== msg.assigneeId
      ? optimisticAssignee.id
      : msg.assigneeId;
  const effectiveAssigneeName =
    optimisticAssignee && optimisticAssignee.id !== msg.assigneeId
      ? optimisticAssignee.name
      : (msg.assigneeName ?? null);
  const isAssigned = effectiveAssigneeId !== null;
  const isMine = effectiveAssigneeId === currentUser?.id;
  const classes = TRIGGER_CLASSES[size];

  // The row / card opens its thread on click and the board drags a card on pointer-down: a press
  // on the trigger is the picker's alone.
  const openPicker = (event: React.MouseEvent) => {
    event.stopPropagation();
    setPickerOpen((open) => !open);
  };

  const handleAssigned = (picked: AssignableUser | null) => {
    setPickerOpen(false);
    if (picked === null) {
      setOptimisticAssignee({ id: null, name: '' });
    } else {
      const name = `${picked.firstName} ${picked.lastName ?? ''}`.trim() || picked.email;
      setOptimisticAssignee({ id: picked.id, name });
    }
  };

  return (
    <>
      <Popover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        ariaLabel="Assign to"
        width={220}
        align="end"
        trigger={() =>
          isAssigned && effectiveAssigneeName ? (
            <Tooltip
              content={
                isMine
                  ? 'Assigned to you · click to re-assign'
                  : `Assigned to ${effectiveAssigneeName} · click to re-assign`
              }
              size="sm"
            >
              <button
                type="button"
                onClick={openPicker}
                onPointerDown={stop}
                aria-label="Re-assign"
                className={cn(
                  'inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0',
                  classes.avatar,
                  getAvatarColor(effectiveAssigneeName)
                )}
              >
                {getInitials(effectiveAssigneeName)}
              </button>
            </Tooltip>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openPicker}
              onPointerDown={stop}
              disabled={!currentUser?.id}
              className={cn(
                'inline-flex items-center gap-1 font-semibold text-muted-foreground border border-dashed hover:border-primary hover:text-primary data-[inactive]:opacity-50 data-[inactive]:cursor-not-allowed',
                classes.claim
              )}
            >
              <Plus className="w-3 h-3" />
              Claim
            </Button>
          )
        }
      >
        {/* React bubbles the panel's events to the row / card that renders it (portal or not):
            a click there would open the thread, a pointer-down start a card drag, a key reach the
            list's shortcuts. Escape alone goes on — the Popover closes on it at the document (an
            Escape that only closed the open list never gets there: the Select stops it). */}
        <div
          data-assignee-picker
          role="presentation"
          className="p-1"
          onClick={stop}
          onPointerDown={stop}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') event.stopPropagation();
          }}
        >
          <AssignmentSelect
            type="thread"
            itemId={thread.threadId}
            currentAssigneeId={msg.assigneeId}
            departmentId={msg.departmentId ?? null}
            onAssign={handleAssigned}
            autoFocus
            beforeChange={(run) => writingGuard.confirmIfWriting('assign', run)}
          />
        </div>
      </Popover>
      {writingGuard.dialog}
    </>
  );
};
