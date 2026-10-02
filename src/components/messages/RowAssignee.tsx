import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import type { MessageThread } from '@/services/message.service';
import type { AssignableUser } from '@/services/assignment.service';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuthStore } from '@/stores/authStore';
import { getAvatarColor, getInitials } from './inboxCardHelpers';

type Props = {
  thread: MessageThread;
};

/**
 * The assignee avatar — or "Claim" — at the end of a list row, with its picker.
 *
 * Moved out of MessageListItem when the row grew a second (compact) layout in Messages list
 * v2: both layouts draw the same control, and two copies of the optimistic shadow below would
 * drift. Behaviour is unchanged.
 */
export const RowAssignee = ({ thread }: Props) => {
  const msg = thread.latestMessage;
  const currentUser = useAuthStore((state) => state.user);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Optimistic shadow of server assignee state — keeps the card responsive
  // without a list refetch. See KanbanCard for the same pattern + rationale.
  const [optimisticAssignee, setOptimisticAssignee] = useState<{
    id: number | null;
    name: string;
  } | null>(null);
  const pickerWrapRef = useRef<HTMLDivElement | null>(null);
  const pickerBtnRef = useRef<HTMLButtonElement | null>(null);
  // Portal coords for the assignee picker. The Card has overflow-hidden so an
  // in-flow absolute popover gets clipped; portaling to document.body escapes
  // that, but then we need viewport-relative fixed coords keyed off the trigger
  // button's bounding rect.
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (pickerOpen && pickerBtnRef.current) {
      const rect = pickerBtnRef.current.getBoundingClientRect();
      const pickerWidth = 220;
      const left = Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8);
      const top = rect.bottom + 6;
      setPickerPos({ top, left: Math.max(left, 8) });
    }
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      // Picker DOM lives in a body-level portal now, so check both the trigger
      // wrapper AND the portal element. Either contains-click keeps the picker open.
      if (pickerWrapRef.current?.contains(target)) return;
      if (document.querySelector('[data-assignee-picker]')?.contains(target)) return;
      setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

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

  const openPicker = (event: React.MouseEvent) => {
    event.stopPropagation();
    setPickerOpen(true);
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
    // Trigger stays in flow so row layout never reflows when the picker opens.
    // Picker overlays as an absolute-positioned popover anchored to the trigger.
    <div ref={pickerWrapRef} className="relative">
      {isAssigned && effectiveAssigneeName ? (
        <Tooltip
          content={
            isMine
              ? 'Assigned to you · click to re-assign'
              : `Assigned to ${effectiveAssigneeName} · click to re-assign`
          }
          size="sm"
        >
          <button
            ref={pickerBtnRef}
            type="button"
            onClick={openPicker}
            aria-label="Re-assign"
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white shrink-0 hover:ring-[3px] hover:ring-primary-muted ${getAvatarColor(effectiveAssigneeName)}`}
          >
            {getInitials(effectiveAssigneeName)}
          </button>
        </Tooltip>
      ) : (
        <Button
          ref={pickerBtnRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={openPicker}
          disabled={!currentUser?.id}
          className="inline-flex items-center gap-1 h-6 px-[9px] rounded-md text-[11.5px] font-semibold text-muted-foreground border border-dashed border-border-strong hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" />
          Claim
        </Button>
      )}
      {pickerOpen &&
        pickerPos &&
        createPortal(
          <div
            data-assignee-picker
            role="dialog"
            aria-label="Assign to"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            style={{ top: pickerPos.top, left: pickerPos.left, width: 220 }}
            className="fixed z-[9999] rounded-md border border-border bg-popover shadow-lg p-1"
          >
            <AssignmentSelect
              type="thread"
              itemId={thread.threadId}
              currentAssigneeId={msg.assigneeId}
              departmentId={msg.departmentId ?? null}
              onAssign={handleAssigned}
            />
          </div>,
          document.body
        )}
    </div>
  );
};
