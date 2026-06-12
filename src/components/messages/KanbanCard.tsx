import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MessagesSquare,
  Paperclip,
  Plus,
  Ticket,
} from 'lucide-react';
import type { MessageThread } from '@/services/message.service';
import type { AssignableUser } from '@/services/assignment.service';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuthStore } from '@/stores/authStore';
import { getChannelIcon, formatConvId } from '@/lib/messageHelpers';
import { formatAge, safeCssColor } from '@/lib/utils';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { DepartmentBadge } from './DepartmentBadge';
import { MessageSignalBadges } from './MessageSignalBadges';
import {
  SPINE_BG,
  getAiState,
  getAvatarColor,
  getDirectionText,
  getInitials,
  getSpine,
  hasAttachments,
} from './inboxCardHelpers';

type KanbanCardProps = {
  thread: MessageThread;
  onOpen: (thread: MessageThread) => void;
  /**
   * Legacy prop kept for call-site compatibility. SLA suppression is handled
   * by lastReplyFromClient inside the shared helpers.
   */
  weRepliedLast?: boolean;
};

export const KanbanCard = ({ thread, onOpen }: KanbanCardProps) => {
  const msg = thread.latestMessage;
  const { data: allDepts = [] } = useDepartments();
  const currentUser = useAuthStore((state) => state.user);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Optimistic shadow of server assignee state — updated synchronously after
  // a successful AssignmentSelect pick so the card reflects the new assignee
  // without re-fetching the whole list. Cleared next time props update from a
  // real refetch (the !== msg.assigneeId check below handles that).
  const [optimisticAssignee, setOptimisticAssignee] = useState<{
    id: number | null;
    name: string;
  } | null>(null);
  const pickerWrapRef = useRef<HTMLDivElement | null>(null);
  const pickerBtnRef = useRef<HTMLButtonElement | null>(null);
  // The Kanban card has overflow-hidden (for the spine + rounded corners);
  // an in-flow popover gets clipped. Portal the picker to body with
  // viewport-relative coords from the trigger button.
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

  // Click-outside to close the assign picker.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (pickerWrapRef.current?.contains(target)) return;
      if (document.querySelector('[data-assignee-picker]')?.contains(target)) return;
      setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  if (!msg) return null;

  const receivedAt = (msg.metadata as { receivedAt?: string })?.receivedAt ?? msg.createdAt;

  const primaryDept = msg.departmentId
    ? allDepts.find((dept) => dept.id === msg.departmentId)
    : undefined;
  const needsRouting = msg.status === 'needs_routing';

  const customer = thread.sender || msg.sender;
  const signalMessage = thread.latestIncomingMessage ?? msg;
  const spine = getSpine(signalMessage, thread);
  const aiState = getAiState(signalMessage, thread);
  const direction = getDirectionText(thread);

  // Optimistic state wins when it diverges from server state; clears when
  // they converge (i.e. a fresh fetch confirmed the assignment).
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

  const openPicker = (event: React.MouseEvent | React.PointerEvent) => {
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

  const labels =
    (msg.labels as
      | { id: number; name: string; color: string; source?: 'conversation' | 'ticket' | 'contact' }[]
      | undefined) ?? [];
  const visibleLabels = labels.slice(0, 2);
  const overflowLabels = labels.slice(2);

  const isFromKBSource = (msg.metadata as { isFromKBSource?: boolean })?.isFromKBSource;
  const linkedTicketKey =
    (msg.metadata as { linkedTicketExternalId?: string })?.linkedTicketExternalId ?? null;

  // Don't open the conversation if the click was the end of a text selection
  // — agents need to be able to copy IDs, sender emails, subject text.
  const handleCardClick = () => {
    const sel = window.getSelection?.();
    if (sel && sel.toString().length > 0) return;
    onOpen(thread);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(thread);
        }
      }}
      aria-label={`Open message from ${customer}${msg.subject ? `: ${msg.subject}` : ''}`}
      className="relative w-full text-left rounded-md border bg-card pl-3.5 pr-3 py-2.5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all space-y-1.5 overflow-hidden cursor-pointer"
    >
      {/* Status spine — 3px left border ranking urgency. */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${SPINE_BG[spine]}`}
      />

      {/* Top metadata row: dept + id + grow + direction arrow + age.
          pr-6 reserves space for the absolute-positioned grip handle in the
          top-right corner so the time text doesn't collide with it. */}
      <div className="flex items-center gap-2 pr-6 text-[11px] text-muted-foreground">
        {(primaryDept ?? needsRouting) && (
          <div className="flex items-center gap-1 shrink-0">
            {needsRouting ? (
              <DepartmentBadge variant="needs" />
            ) : (
              primaryDept && <DepartmentBadge variant="primary" dept={primaryDept} />
            )}
          </div>
        )}
        <span className="font-mono shrink-0">{formatConvId(msg)}</span>
        <span className="flex-1" />
        {direction && (
          <Tooltip
            content={
              direction.tone === 'pending'
                ? 'Customer replied — awaiting our response'
                : direction.tone === 'waiting'
                  ? 'We replied — awaiting customer'
                  : 'New conversation'
            }
            size="sm"
          >
            <span
              className={`shrink-0 ${
                direction.tone === 'pending' ? 'text-amber-500' : 'text-muted-foreground'
              }`}
            >
              {direction.tone === 'pending' ? (
                <ArrowLeft className="w-3 h-3" />
              ) : (
                <ArrowRight className="w-3 h-3" />
              )}
            </span>
          </Tooltip>
        )}
        <span className="whitespace-nowrap shrink-0">{formatAge(receivedAt)}</span>
      </div>

      {/* Sender row — channel icon + bold name */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs shrink-0 text-muted-foreground">
          {getChannelIcon(msg.channel)}
        </span>
        <span className="flex-1 min-w-0 text-sm font-semibold truncate">{customer}</span>
      </div>

      {/* Subject row — muted, separate from sender for breathing room */}
      {msg.subject && (
        <p className="text-xs truncate text-muted-foreground">{msg.subject}</p>
      )}

      {/* Metadata row — one line under the separator. Loud chips first (risk, AI,
          labels, overflow), then muted reference icons (KB, ticket, thread, paperclip),
          then spacer pushes assign (Claim or avatar) to the right. flex-wrap so a
          flood of labels can spill to a second visual line without breaking the
          right-pinned assign. */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-1 border-t border-border/60">
        <MessageSignalBadges message={signalMessage} size="sm" mode="card" />

        {aiState && (
          <Tooltip content={aiState.tooltip} size="sm">
            <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold bg-violet-500/15 text-violet-700 dark:text-violet-300">
              {aiState.label}
            </span>
          </Tooltip>
        )}

        {visibleLabels.map((label) => (
          <Tooltip
            key={label.id}
            content={
              label.source === 'contact'
                ? `${label.name} — inherited from contact`
                : label.source === 'ticket'
                  ? `${label.name} — via linked ticket`
                  : label.name
            }
            size="sm"
          >
            <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: safeCssColor(label.color) }}
              />
              {label.name}
            </span>
          </Tooltip>
        ))}
        {overflowLabels.length > 0 && (
          <Tooltip
            content={
              <ul className="space-y-0.5 text-left">
                {overflowLabels.map((label) => (
                  <li key={label.id}>{label.name}</li>
                ))}
              </ul>
            }
            size="sm"
          >
            <span className="inline-flex items-center h-5 px-1.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground">
              +{overflowLabels.length}
            </span>
          </Tooltip>
        )}

        {isFromKBSource && (
          <Tooltip content="From Knowledge Base source" size="sm">
            <span className="inline-flex items-center text-muted-foreground/70">
              <BookOpen className="w-3 h-3" />
            </span>
          </Tooltip>
        )}
        {thread.hasTicket && (
          <Tooltip
            content={
              thread.linkedTicketStatus
                ? `Ticket · ${thread.linkedTicketStatus.replace('_', ' ')}`
                : 'Linked ticket'
            }
            size="sm"
          >
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70">
              <Ticket className="w-3 h-3" />
              {linkedTicketKey ?? 'Ticket'}
            </span>
          </Tooltip>
        )}
        {thread.messageCount > 1 && (
          <Tooltip content={`${thread.messageCount} messages in thread`} size="sm">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70">
              <MessagesSquare className="w-3 h-3" />
              {thread.messageCount}
            </span>
          </Tooltip>
        )}
        {hasAttachments(signalMessage) && (
          <Tooltip content={`${msg.attachmentCount ?? signalMessage.attachmentCount ?? 0} attachment(s)`} size="sm">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70">
              <Paperclip className="w-3 h-3" />
              {msg.attachmentCount ?? signalMessage.attachmentCount ?? 0}
            </span>
          </Tooltip>
        )}

        <span className="flex-1" />

        {/* Trigger stays in flow so card layout never reflows when the picker opens.
            Picker overlays as an absolute-positioned popover anchored to the trigger. */}
        <div ref={pickerWrapRef} className="relative">
          {isAssigned && effectiveAssigneeName ? (
            <Tooltip content={isMine ? 'Assigned to you · click to re-assign' : `Assigned to ${effectiveAssigneeName} · click to re-assign`} size="sm">
              <button
                ref={pickerBtnRef}
                type="button"
                onClick={openPicker}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="Re-assign"
                className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[10px] font-bold text-white shrink-0 hover:ring-2 hover:ring-primary/40 ${getAvatarColor(effectiveAssigneeName)}`}
              >
                {getInitials(effectiveAssigneeName)}
              </button>
            </Tooltip>
          ) : (
            <button
              ref={pickerBtnRef}
              type="button"
              onClick={openPicker}
              onPointerDown={(event) => event.stopPropagation()}
              disabled={!currentUser?.id}
              className="inline-flex items-center gap-1 h-[22px] px-2 rounded text-[11px] font-semibold text-muted-foreground border border-dashed border-border hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3 h-3" />
              Claim
            </button>
          )}
          {pickerOpen && pickerPos && createPortal(
            <div
              data-assignee-picker
              role="dialog"
              aria-label="Assign to"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
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
      </div>
    </div>
  );
};
