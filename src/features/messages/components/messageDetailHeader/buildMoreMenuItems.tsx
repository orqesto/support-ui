import type React from 'react';
import type { NavigateFunction } from 'react-router-dom';
import {
  RefreshCw,
  X,
  Trash2,
  LinkIcon,
  AlertTriangle,
  Target,
  ShieldAlert,
  MessageSquare,
  Mail,
  MailOpen,
  History as HistoryIcon,
  Ticket as TicketIcon,
  GitMerge,
  BellOff,
  Bell,
} from 'lucide-react';
import type { Message } from '@/types';
import { messageService } from '@/services/message.service';
import type { useConversationMute } from '@/features/messages/hooks/useConversationMute';
import { createTicketLabel } from '../messageDetailConstants';
import type { HeaderTickets } from '../RelatedPopover';
import type { useThreadTicketsState } from '../useThreadTicketsState';
import type { MessageDetailHeaderProps } from './types';
import { runAtOnce, type ConfirmIfWriting } from '../../presence/useWritingGuard';

export type MoreMenuItem = {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  tooltip?: string;
};

/** Everything the More menu's items read from the header (same names as there). */
export type MoreMenuContext = {
  message: Message;
  canCreateTickets: boolean;
  canManageTickets: boolean;
  createTicket: () => void;
  setMoreOpen: (open: boolean) => void;
  tickets: HeaderTickets;
  merges: ReturnType<typeof useThreadTicketsState>['merges'];
  setRelatedOpen: (open: 'tickets' | 'merges' | null) => void;
  setAddToTicketOpen: (open: boolean) => void;
  setMergePickerOpen: (open: boolean) => void;
  threadMute: ReturnType<typeof useConversationMute>;
  muteBlocked: boolean;
  isPhone: boolean;
  onRefresh?: () => void;
  showReadToggle?: boolean;
  onToggleRead?: () => void;
  isRead?: boolean;
  handleCopyLink: (announce?: boolean) => void;
  navigate: NavigateFunction;
  reanalyzing: boolean;
  handleReanalyze: () => Promise<void>;
  aiConfigured: boolean;
  isWorkspaceAdmin: boolean;
  checkingContradiction: boolean;
  handleCheckContradiction: () => Promise<void>;
  leadsHidden: boolean;
  togglingLead: boolean;
  handleToggleLead: () => Promise<void>;
  isActive: boolean;
  onClassify?: MessageDetailHeaderProps['onClassify'];
  onDelete?: () => void;
  /** Thread presence (§5.5): "Not a lead — close" asks first while a colleague writes a reply. */
  guard?: ConfirmIfWriting;
};
/** The More menu's items, in order, only those that apply (moved out of MessageDetailHeader). */
export function buildMoreMenuItems({
  message,
  canCreateTickets,
  canManageTickets,
  createTicket,
  setMoreOpen,
  tickets,
  merges,
  setRelatedOpen,
  setAddToTicketOpen,
  setMergePickerOpen,
  threadMute,
  muteBlocked,
  isPhone,
  onRefresh,
  showReadToggle,
  onToggleRead,
  isRead,
  handleCopyLink,
  navigate,
  reanalyzing,
  handleReanalyze,
  aiConfigured,
  isWorkspaceAdmin,
  checkingContradiction,
  handleCheckContradiction,
  leadsHidden,
  togglingLead,
  handleToggleLead,
  isActive,
  onClassify,
  onDelete,
  guard = runAtOnce,
}: MoreMenuContext): MoreMenuItem[] {
  return [
    /*
    In every state — resolved, filtered, an older backend, a viewer who may create but not
    manage tickets — as the Customer tab's "New ticket" was before v4 moved tickets into the
    header. It used to show only on an ACTIVE thread, and with that button gone a resolved
    thread on no ticket had no way left to start one.
  */
    canCreateTickets && {
      label: createTicketLabel(message.isLead),
      icon: <MessageSquare className="w-3 h-3" />,
      action: () => {
        createTicket();
        setMoreOpen(false);
      },
    },
    // v4: the Related pickers, also reachable with no ticket and no merge (no chip to open).
    /*
    Only once the backend is KNOWN to have the ticket links (`ready`). While the first read is
    in flight (or failed) it may be an older backend, where the picker would post to a route
    that does not exist.
  */
    canManageTickets &&
      tickets.state === 'ready' && {
        label: 'Add to ticket…',
        icon: <TicketIcon className="w-3 h-3" />,
        action: () => {
          setMoreOpen(false);
          setRelatedOpen(null);
          setAddToTicketOpen(true);
        },
      },
    canManageTickets &&
      merges !== null && {
        label: 'Merge with another thread…',
        icon: <GitMerge className="w-3 h-3" />,
        action: () => {
          setMoreOpen(false);
          setRelatedOpen(null);
          setMergePickerOpen(true);
        },
      },
    threadMute.available && {
      label: threadMute.muted ? 'Unmute this thread' : 'Mute this thread',
      icon: threadMute.muted ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />,
      disabled: muteBlocked && !threadMute.muted,
      tooltip:
        muteBlocked && !threadMute.muted
          ? "Finished threads can't be muted."
          : threadMute.muted
            ? undefined
            : "Mutes this thread's alerts for you until it's resolved or closed. It stays in your bell.",
      action: () => {
        void threadMute.toggle();
        setMoreOpen(false);
      },
    },
    // Phones only: the header's icon actions move here (v4 mobile hides the icons).
    isPhone &&
      onRefresh && {
        label: 'Refresh thread',
        icon: <RefreshCw className="w-3 h-3" />,
        action: () => {
          onRefresh();
          setMoreOpen(false);
        },
      },
    isPhone &&
      showReadToggle &&
      onToggleRead && {
        label: isRead ? 'Mark as unread' : 'Mark as read',
        icon: isRead ? <MailOpen className="w-3 h-3" /> : <Mail className="w-3 h-3" />,
        action: () => {
          onToggleRead();
          setMoreOpen(false);
        },
      },
    // Phones only: Copy link joins them (v4 `#morePop`) — its header icon is hidden there too.
    isPhone && {
      label: 'Copy link',
      icon: <LinkIcon className="w-3 h-3" />,
      action: () => {
        handleCopyLink(true);
        setMoreOpen(false);
      },
    },
    // Was the "History" link beside the sender; v3 has no room for it there, and dropping it
    // would remove the only path from a message to the customer's other conversations.
    {
      label: 'Thread history',
      icon: <HistoryIcon className="w-3 h-3" />,
      action: () => {
        navigate(`/threads?mode=contacts&sender=${encodeURIComponent(message.sender)}`);
        setMoreOpen(false);
      },
    },
    {
      label: reanalyzing ? 'Reanalysing…' : 'Reanalyse',
      icon: <RefreshCw className={`w-3 h-3 ${reanalyzing ? 'animate-spin' : ''}`} />,
      action: () => {
        void handleReanalyze();
        setMoreOpen(false);
      },
    },
    message.externalThreadId &&
      (aiConfigured || isWorkspaceAdmin) && {
        label: checkingContradiction ? 'Checking…' : 'Check contradiction',
        icon: <AlertTriangle className="w-3 h-3" />,
        disabled: !aiConfigured,
        tooltip: aiConfigured
          ? undefined
          : 'Contradiction check needs an AI provider — configure one in Settings.',
        action: () => {
          void handleCheckContradiction();
          setMoreOpen(false);
        },
      },
    !leadsHidden && {
      label: togglingLead ? 'Updating…' : message.isLead ? 'Unmark as lead' : 'Mark as lead',
      icon: <Target className="w-3 h-3" />,
      action: () => {
        void handleToggleLead();
        setMoreOpen(false);
      },
    },
    isActive &&
      message.isLead && {
        label: 'Not a lead — close',
        icon: <X className="w-3 h-3" />,
        action: () => {
          setMoreOpen(false);
          // Thread presence (§5.5): closing asks first while a colleague writes a reply.
          guard('close', () => {
            void messageService
              .markAsLead(message.id, false)
              .then(() => messageService.close(message.id))
              .then(() => {
                onRefresh?.();
              });
          });
        },
      },
    isActive &&
      onClassify && {
        label: 'Mark as suspicious',
        icon: <ShieldAlert className="w-3 h-3" />,
        action: () => {
          void onClassify('mark_suspicious');
          setMoreOpen(false);
        },
        danger: true,
      },
    // No "Move to Spam" here (owner, 2026-09-22): the caret's "Resolve & move to spam" is the
    // one agent path, and it records CONFIRMED spam.
    onDelete && {
      label: 'Delete thread',
      icon: <Trash2 className="w-3 h-3" />,
      action: () => {
        onDelete();
        setMoreOpen(false);
      },
      danger: true,
    },
  ].filter(Boolean) as MoreMenuItem[];
}
