import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, MessagesSquare, Paperclip, Plus, Ticket } from 'lucide-react';
import type { MessageThread } from '@/services/message.service';
import type { AssignableUser } from '@/services/assignment.service';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDepartments } from '@/hooks/useDepartments';
import { useAuthStore } from '@/stores/authStore';
import { AssignmentSelect } from '@/components/admin/AssignmentSelect';
import { getChannelIcon, formatConvId } from '@/lib/messageHelpers';
import { stripHtml } from '@/lib/stripHtml';
import { formatAge, safeCssColor } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/Card';
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

type MessageListItemProps = {
  thread: MessageThread;
  onOpen: (thread: MessageThread) => void;
};

export const MessageListItem = ({ thread, onOpen }: MessageListItemProps) => {
  const msg = thread.latestMessage;
  const { data: allDepts = [] } = useDepartments();
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

  const primaryDept = msg.departmentId
    ? allDepts.find((dept) => dept.id === msg.departmentId)
    : undefined;
  const needsRouting = msg.status === 'needs_routing';
  const receivedAt = (msg.metadata as { receivedAt?: string })?.receivedAt ?? msg.createdAt;

  const signalMessage = thread.latestIncomingMessage ?? msg;
  const spine = getSpine(signalMessage, thread);
  const aiState = getAiState(signalMessage, thread);
  const direction = getDirectionText(thread);

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

  const labels =
    (msg.labels as
      | {
          id: number;
          name: string;
          color: string;
          source?: 'conversation' | 'ticket' | 'contact';
        }[]
      | undefined) ?? [];
  const visibleLabels = labels.slice(0, 2);
  const overflowLabels = labels.slice(2);

  const isFromKBSource = (msg.metadata as { isFromKBSource?: boolean })?.isFromKBSource;
  const linkedTicketKey =
    (msg.metadata as { linkedTicketExternalId?: string })?.linkedTicketExternalId ?? null;
  const isResolved = msg.status === 'resolved';

  // Don't open the conversation if the click was the end of a text selection
  // — agents need to be able to copy IDs, sender emails, subject text.
  const handleCardClick = () => {
    const sel = window.getSelection?.();
    if (sel && sel.toString().length > 0) return;
    onOpen(thread);
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(thread);
        }
      }}
      className="relative p-0 overflow-hidden transition-shadow hover:shadow-sm cursor-pointer"
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${SPINE_BG[spine]}`}
      />
      <CardContent className="p-3 pl-4 space-y-1.5">
        {/* Top row: dept + channel + ID + grow + direction text + age */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {(primaryDept ?? needsRouting) && (
            <div className="flex items-center gap-1 shrink-0">
              {needsRouting ? (
                <DepartmentBadge variant="needs" />
              ) : (
                primaryDept && <DepartmentBadge variant="primary" dept={primaryDept} />
              )}
            </div>
          )}
          <span className="text-muted-foreground shrink-0">{getChannelIcon(msg.channel)}</span>
          <span className="font-mono shrink-0">{formatConvId(msg)}</span>
          <span className="flex-1" />
          {direction && (
            <span
              className={`text-[11px] font-semibold whitespace-nowrap ${
                direction.tone === 'pending'
                  ? 'text-amber-600 dark:text-amber-400'
                  : direction.tone === 'new'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-muted-foreground'
              }`}
            >
              {direction.tone === 'pending' ? '←' : direction.tone === 'waiting' ? '→' : '←'}{' '}
              {direction.text}
            </span>
          )}
          <span className="whitespace-nowrap shrink-0">{formatAge(receivedAt)}</span>
        </div>

        {/* Sender (bold) */}
        <p className="text-sm font-semibold truncate">{thread.sender}</p>

        {/* Subject (muted) */}
        {msg.subject && <p className="text-xs text-muted-foreground truncate">{msg.subject}</p>}

        {/* Preview — 1 line of the latest incoming message content */}
        <p className="text-sm text-muted-foreground line-clamp-1">
          {stripHtml(thread.latestIncomingMessage?.content ?? msg.content ?? '')}
        </p>

        {/* Sig row — at-most-one risk + AI state + labels (2 + N).
            Separator above marks the boundary between content (title/subject/preview)
            and the metadata block (chips + reference footer). */}
        <div className="flex flex-wrap gap-1.5 items-center pt-2 mt-1 border-t border-border/60">
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

          {isResolved && (
            <Tooltip content="Resolved" size="sm">
              <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <Check className="w-2.5 h-2.5" />
                Resolved
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
            <Tooltip
              content={`${msg.attachmentCount ?? signalMessage.attachmentCount ?? 0} attachment(s)`}
              size="sm"
            >
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70">
                <Paperclip className="w-3 h-3" />
                {msg.attachmentCount ?? signalMessage.attachmentCount ?? 0}
              </span>
            </Tooltip>
          )}

          <span className="flex-1" />

          {/* Trigger stays in flow so row layout never reflows when the picker opens.
              Picker overlays as an absolute-positioned popover anchored to the trigger. */}
          <div ref={pickerWrapRef} className="relative">
            {isAssigned && effectiveAssigneeName ? (
              <Tooltip content={isMine ? 'Assigned to you · click to re-assign' : `Assigned to ${effectiveAssigneeName} · click to re-assign`} size="sm">
                <button
                  ref={pickerBtnRef}
                  type="button"
                  onClick={openPicker}
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
      </CardContent>
    </Card>
  );
};
