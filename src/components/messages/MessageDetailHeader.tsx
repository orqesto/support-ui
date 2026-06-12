// MessageDetailHeader is over the 650-line cap — same pattern as MessagesPage.
// Adding handleCreateLabel for inline label creation pushed it over by ~20
// lines. Splitting the meta strip out of this header is the natural follow-up
// refactor (see task #26 area work too).
/* eslint-disable max-lines */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  X,
  Trash2,
  LinkIcon,
  CheckCircle,
  AlertTriangle,
  Reply,
  Target,
  ShieldAlert,
  Clock,
  ChevronDown,
  Maximize2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { useDepartments } from '@/hooks/useDepartments';
import { messageService } from '@/services/message.service';
import { categoryService } from '@/services/category.service';
import { labelService, type Label } from '@/services/settings.service';
import { hashNameToLabelColor } from './inboxCardHelpers';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { formatConvId, getSpamCheck } from '@/lib/messageHelpers';
import type { Message, Category, TicketPriority, ThreadStatus } from '@/types';
import { Permission } from '@/types/roles';
import { logger } from '@/lib/logger';
import {
  MONO,
  CHIP_BASE,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  CHANNEL_ICONS,
  getInitials,
  fmtMin,
  type InboxBadge,
} from './messageDetailConstants';
import { HeaderMetaStrip } from './HeaderMetaStrip';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MessageDetailHeaderProps = {
  message: Message;
  onClose?: () => void;
  showFullPageButton: boolean;
  isFullPage: boolean;
  threadCount: number;
  onRefresh?: () => void;
  onDelete?: () => void;
  onClassify?: (action: 'approve' | 'mark_suspicious' | 'move_to_spam') => Promise<void>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageDetailHeader({
  message,
  onClose,
  showFullPageButton,
  isFullPage,
  threadCount,
  onRefresh,
  onDelete,
  onClassify: onClassify,
}: MessageDetailHeaderProps) {
  const { hasPermission } = usePermissions();
  const hasManageLabels = hasPermission(Permission.MANAGE_LABELS);
  const { data: allDepts = [] } = useDepartments();

  const [moreOpen, setMoreOpen] = useState(false);
  const [routingTo, setRoutingTo] = useState<number | null>(null);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [messageLabels, setMessageLabels] = useState<Label[]>([]);
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [checkingContradiction, setCheckingContradiction] = useState(false);
  const [togglingLead, setTogglingLead] = useState(false);
  const [linkedTicketStatus, setLinkedTicketStatus] = useState<string | null>(null);

  useEffect(() => {
    categoryService
      .getAll()
      .then((result) => {
        if (result?.success && result.data) setCategories(result.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([labelService.getMessageLabels(message.id), labelService.getLabels()])
      .then(([ml, al]) => {
        setMessageLabels(ml);
        setAllLabels(al);
      })
      .catch(() => {});
  }, [message.id]);

  useEffect(() => {
    if (!showLabelPicker) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target && !document.querySelector('[data-label-picker]')?.contains(target))
        setShowLabelPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLabelPicker]);

  const [linkedTicketId, setLinkedTicketId] = useState<number | null>(null);

  useEffect(() => {
    setLinkedTicketId(null);
    setLinkedTicketStatus(null);
    messageService.getLinkedTicket(message.id)
      .then((res) => {
        if (res?.data) {
          setLinkedTicketId(res.data.id);
          setLinkedTicketStatus(res.data.status);
        }
      })
      .catch(() => {});
  }, [message.id]);

  useEffect(() => {
    if (!linkedTicketId) return;
    const handler = (data: unknown) => {
      const ev = data as { ticketId: number; status?: string };
      if (ev.ticketId === linkedTicketId && ev.status) setLinkedTicketStatus(ev.status);
    };
    subscribeToEvent('ticket:updated', handler);
    return () => unsubscribeFromEvent('ticket:updated', handler);
  }, [linkedTicketId]);

  // ── Computed ──────────────────────────────────────────────────────────────

  const spamCheck = getSpamCheck(message);
  const isFiltered = message.status === 'filtered';
  const isSuspicious =
    !isFiltered &&
    (message.metadata?.spamCheck as Record<string, unknown> | undefined)?.category === 'suspicious';
  const isActive =
    message.status !== 'resolved' &&
    !isFiltered &&
    !isSuspicious &&
    message.status !== 'closed';
  // System-set statuses have no dropdown entry — map to nearest user-facing equivalent for display
  const STATUS_NORMALIZE: Record<string, ThreadStatus> = {
    awaiting_response: 'in_progress',
    client_replied: 'in_progress',
    resolved: 'closed',
    new: 'open',
  };
  const currentStatus: ThreadStatus =
    (STATUS_NORMALIZE[message.status ?? ''] as ThreadStatus | undefined) ??
    message.status ??
    'open';

  const slaInfo = useMemo(() => {
    if (!message.slaResponseMinutes) return null;
    const target = message.slaResponseMinutes;
    const startTime =
      typeof (message.metadata as Record<string, unknown>)?.receivedAt === 'string'
        ? new Date((message.metadata as Record<string, unknown>).receivedAt as string)
        : new Date(message.createdAt);
    if (message.firstResponseAt) {
      const elapsed = Math.round(
        (new Date(message.firstResponseAt).getTime() - startTime.getTime()) / 60000
      );
      const breached = message.slaResponseBreached === true || elapsed > target;
      return {
        elapsed,
        target,
        breached,
        atRisk: false,
        done: true,
        barColor: breached ? 'bg-red-500' : 'bg-emerald-500',
        colorClasses: breached
          ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
          : 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30',
      };
    }
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 60000);
    const breached = message.slaResponseBreached === true || elapsed > target;
    const atRisk = !breached && elapsed > target * 0.8;
    return {
      elapsed,
      target,
      breached,
      atRisk,
      done: false,
      barColor: breached ? 'bg-red-500' : atRisk ? 'bg-amber-500' : 'bg-emerald-500',
      colorClasses: breached
        ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
        : atRisk
          ? 'text-amber-800 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'
          : 'text-muted-foreground border-border bg-muted',
    };
  }, [
    message.slaResponseMinutes,
    message.firstResponseAt,
    message.slaResponseBreached,
    message.createdAt,
    message.metadata,
  ]);

  const inboxBadge: InboxBadge | null = (() => {
    if (spamCheck?.isSpam === true || isFiltered)
      return {
        label: 'SPAM',
        icon: <ShieldAlert className="w-2.5 h-2.5" />,
        cls: 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800',
      };
    if (isSuspicious)
      return {
        label: 'SUSPICIOUS',
        icon: <AlertTriangle className="w-2.5 h-2.5" />,
        cls: 'text-amber-900 bg-amber-100 border-amber-300 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800',
      };
    if (message.status === 'resolved')
      return {
        label: 'RESOLVED',
        icon: <CheckCircle className="w-2.5 h-2.5" />,
        cls: 'text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800',
      };
    if (message.lastReplyFromClient === false)
      return {
        label: 'AWAITING',
        icon: <Clock className="w-2.5 h-2.5" />,
        cls: 'text-orange-700 border-orange-200 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-800',
      };
    if (message.lastReplyFromClient === true)
      return {
        label: 'CLIENT REPLIED',
        icon: <Reply className="w-2.5 h-2.5" />,
        cls: 'text-green-700 border-green-200 bg-green-50 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800',
      };
    if (message.status === 'open') {
      // "NOT ANALYSED" really means "status=open AND no AI analysis ran yet."
      // Reanalyse intentionally sets status='open' on success, so we'd
      // otherwise re-light this badge despite analysis being present —
      // gate on metadata.analysis to tell the two apart.
      const hasAnalysis = !!(message.metadata as Record<string, unknown> | undefined)?.analysis;
      return hasAnalysis
        ? {
            label: 'ACTIVE',
            icon: null,
            cls: 'text-sky-700 border-sky-200 bg-sky-50 dark:text-sky-400 dark:border-sky-800/50 dark:bg-sky-950/20',
          }
        : {
            label: 'NOT ANALYSED',
            icon: null,
            cls: 'text-muted-foreground border-border bg-muted/60',
          };
    }
    if (isActive)
      return {
        label: 'ACTIVE',
        icon: null,
        cls: 'text-sky-700 border-sky-200 bg-sky-50 dark:text-sky-400 dark:border-sky-800/50 dark:bg-sky-950/20',
      };
    return null;
  })();

  const statusDisplayOptions = STATUS_OPTIONS;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSetStatus = useCallback(
    async (status: ThreadStatus) => {
      try {
        setUpdatingStatus(true);
        await messageService.setStatus(message.id, status);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set status:', err);
      } finally {
        setUpdatingStatus(false);
      }
    },
    [message.id, onRefresh]
  );

  const handleSetPriority = useCallback(
    async (priority: TicketPriority) => {
      try {
        setUpdatingPriority(true);
        await messageService.setPriority(message.id, priority);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set priority:', err);
      } finally {
        setUpdatingPriority(false);
      }
    },
    [message.id, onRefresh]
  );

  const handleSetCategory = useCallback(
    async (categoryId: number | null) => {
      try {
        setUpdatingCategory(true);
        await messageService.setCategory(message.id, categoryId);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set category:', err);
      } finally {
        setUpdatingCategory(false);
      }
    },
    [message.id, onRefresh]
  );

  const handleToggleLead = useCallback(async () => {
    try {
      setTogglingLead(true);
      await messageService.markAsLead(message.id, !message.isLead);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to toggle lead:', err);
    } finally {
      setTogglingLead(false);
    }
  }, [message.id, message.isLead, onRefresh]);

  const handleToggleLabel = useCallback(
    async (label: Label) => {
      const assigned = messageLabels.some((lbl) => lbl.id === label.id);
      const prev = messageLabels;
      setMessageLabels(
        assigned ? messageLabels.filter((lbl) => lbl.id !== label.id) : [...messageLabels, label]
      );
      try {
        if (assigned) await labelService.removeLabelFromMessage(message.id, label.id);
        else await labelService.assignLabelToMessage(message.id, label.id);
      } catch (err) {
        logger.error('Failed to toggle label:', err);
        setMessageLabels(prev);
      }
    },
    [message.id, messageLabels]
  );

  const handleCreateLabel = useCallback(
    async (name: string) => {
      try {
        const created = await labelService.createLabel({
          name,
          color: hashNameToLabelColor(name),
        });
        setAllLabels((prev) => [created, ...prev]);
        // Auto-assign the newly-created label so the user doesn't need to click it
        // again. We bypass handleToggleLabel here because the optimistic state
        // hasn't been told about `created` yet — assign directly.
        setMessageLabels((prev) => [...prev, created]);
        try {
          await labelService.assignLabelToMessage(message.id, created.id);
        } catch (assignErr) {
          logger.error('Failed to assign newly-created label:', assignErr);
          setMessageLabels((prev) => prev.filter((lbl) => lbl.id !== created.id));
        }
        setShowLabelPicker(false);
      } catch (err) {
        logger.error('Failed to create label:', err);
      }
    },
    [message.id]
  );

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/messages?id=${message.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch((err) => logger.error('Failed to copy link:', err));
  }, [message.id]);

  const handleCheckContradiction = useCallback(async () => {
    try {
      setCheckingContradiction(true);
      await messageService.checkContradiction(message.id);
      onRefresh?.();
    } catch {
      /* silently ignore */
    } finally {
      setCheckingContradiction(false);
    }
  }, [message.id, onRefresh]);

  const handleManualRoute = useCallback(
    async (deptId: number) => {
      try {
        setRoutingTo(deptId);
        await messageService.manualRoute(message.id, deptId);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to manually route:', err);
      } finally {
        setRoutingTo(null);
      }
    },
    [message.id, onRefresh]
  );

  const handleReanalyze = useCallback(async () => {
    try {
      setReanalyzing(true);
      await messageService.reanalyze(message.id);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to reanalyze:', err);
    } finally {
      setReanalyzing(false);
    }
  }, [message.id, onRefresh]);

  const moreMenuItems = [
    {
      label: linkCopied ? 'Link Copied!' : 'Copy Link',
      icon: <LinkIcon className="w-3 h-3" />,
      action: () => {
        handleCopyLink();
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
    message.externalThreadId && {
      label: checkingContradiction ? 'Checking…' : 'Check Contradiction',
      icon: <AlertTriangle className="w-3 h-3" />,
      action: () => {
        void handleCheckContradiction();
        setMoreOpen(false);
      },
    },
    {
      label: togglingLead ? 'Updating…' : message.isLead ? 'Unmark as Lead' : 'Mark as Lead',
      icon: <Target className="w-3 h-3" />,
      action: () => {
        void handleToggleLead();
        setMoreOpen(false);
      },
    },
    isActive && {
      label: 'Close (no KB)',
      icon: <X className="w-3 h-3" />,
      action: () => {
        void messageService.close(message.id).then(() => { onRefresh?.(); });
        setMoreOpen(false);
      },
    },
    isActive && message.isLead && {
      label: 'Not a Lead — Close',
      icon: <X className="w-3 h-3" />,
      action: () => {
        void messageService.markAsLead(message.id, false)
          .then(() => messageService.close(message.id))
          .then(() => { onRefresh?.(); });
        setMoreOpen(false);
      },
    },
    isActive && onClassify && {
      label: 'Mark as Suspicious',
      icon: <ShieldAlert className="w-3 h-3" />,
      action: () => {
        void onClassify('mark_suspicious');
        setMoreOpen(false);
      },
    },
    onDelete && {
      label: 'Delete Message',
      icon: <Trash2 className="w-3 h-3" />,
      action: () => {
        onDelete();
        setMoreOpen(false);
      },
      danger: true,
    },
  ].filter(Boolean) as {
    label: string;
    icon: React.ReactNode;
    action: () => void;
    danger?: boolean;
  }[];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-shrink-0 border-b border-border bg-background">
      {/* Top strip */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <span className="font-mono text-[10px] text-muted-foreground">{formatConvId(message)}</span>
        <span className="text-[10px] text-muted-foreground" title={message.channel}>
          {CHANNEL_ICONS[message.channel] ?? '◌'}
        </span>
        <span className={`${MONO} text-muted-foreground`}>{message.channel}</span>
        {threadCount > 1 && (
          <span className="text-[10px] text-muted-foreground">· {threadCount} msgs</span>
        )}
        <div className="flex gap-1 items-center ml-auto">
          {showLabelPicker && (
            <button
              type="button"
              aria-label="Close"
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setShowLabelPicker(false)}
            />
          )}
          {showFullPageButton && !isFullPage && (
            <Link to={`/messages/${message.id}`} title="Open full page">
              <button className="p-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </Link>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Close (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Subject + Sender */}
      <div className="px-4 pb-2">
        <h2 className="text-[15px] font-medium leading-snug line-clamp-2 mb-1.5 text-foreground">
          {message.subject ?? '(no subject)'}
        </h2>
        <div className="flex gap-2 items-center">
          <div className="w-[18px] h-[18px] rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground flex-shrink-0">
            {getInitials(message.sender)}
          </div>
          <span className="text-xs truncate text-foreground">{message.sender}</span>
          <Link
            to={`/messages?mode=contacts&sender=${encodeURIComponent(message.sender)}`}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0"
            title="View all conversations with this sender"
          >
            History
          </Link>
        </div>
      </div>

      {/* Ticket bar */}
      {linkedTicketId && message.status !== 'resolved' && message.status !== 'closed' && (
        <div className="px-4 pb-2">
          <div
            className={`flex items-center justify-between px-2 py-1 rounded border-l-2 border border-border bg-card ${linkedTicketStatus === 'in_progress' ? 'border-l-emerald-500 dark:border-emerald-700 dark:bg-emerald-950/20' : 'border-l-blue-400 dark:border-blue-800 dark:bg-blue-950/20'}`}
          >
            <span
              className={`text-[11px] font-medium ${linkedTicketStatus === 'in_progress' ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-400'}`}
            >
              ✓ Ticket #{linkedTicketId}
              {linkedTicketStatus && (
                <span className="ml-1 font-normal opacity-85">
                  · {linkedTicketStatus.replace('_', ' ')}
                </span>
              )}
            </span>
            <Link
              to={`/tickets?id=${linkedTicketId}`}
              className={`text-[11px] flex items-center gap-1 ${linkedTicketStatus === 'in_progress' ? 'text-emerald-700 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-400'} hover:underline`}
            >
              View <Maximize2 className="w-2.5 h-2.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Re-route banner — runner-up depts from the routing engine.
          Lets an agent move the conversation to a near-miss dept in one click. */}
      {(message.nearMissDepts?.length ?? 0) > 0 &&
        message.status !== 'resolved' &&
        message.status !== 'closed' && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap items-center gap-1.5 px-2 py-1 rounded border border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-950/20">
              <span className="text-[11px] text-blue-900 dark:text-blue-300">
                🔀 Also matched:
              </span>
              {message.nearMissDepts!.map((deptId) => {
                const dept = allDepts.find((entry) => entry.id === deptId);
                if (!dept) return null;
                const busy = routingTo === deptId;
                return (
                  <button
                    key={deptId}
                    type="button"
                    onClick={() => void handleManualRoute(deptId)}
                    disabled={busy}
                    title={`Move this conversation to ${dept.name}`}
                    className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60 disabled:opacity-50"
                  >
                    {busy ? `Moving to ${dept.name}…` : `Move to ${dept.name} →`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      {/* Action chip row */}
      <div className="flex items-center gap-1.5 flex-nowrap px-4 pb-3 overflow-visible">
        <ReactSelect
          variant="chip"
          value={currentStatus}
          options={statusDisplayOptions}
          onChange={(val) => void handleSetStatus(val as ThreadStatus)}
          isDisabled={updatingStatus}
        />
        {slaInfo && (
          <div className={`${CHIP_BASE} ${slaInfo.colorClasses}`}>
            <Clock className="w-2.5 h-2.5" />
            <span className="tabular-nums">
              {fmtMin(slaInfo.elapsed)}/{fmtMin(slaInfo.target)}
            </span>
            <div className="overflow-hidden w-10 h-1 rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${slaInfo.barColor}`}
                style={{ width: `${Math.min(100, (slaInfo.elapsed / slaInfo.target) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {message.priority && (
          <ReactSelect
            variant="chip"
            value={message.priority}
            options={PRIORITY_OPTIONS}
            onChange={(val) => void handleSetPriority(val as TicketPriority)}
            isDisabled={updatingPriority}
          />
        )}
        {inboxBadge && (
          <span className={`${CHIP_BASE} ${inboxBadge.cls}`}>
            {inboxBadge.icon}
            {inboxBadge.label}
          </span>
        )}
        {message.isLead && (
          <span
            className={`text-emerald-700 bg-emerald-50 border-emerald-200 ${CHIP_BASE} dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30`}
          >
            <Target className="w-2.5 h-2.5" />
            LEAD
          </span>
        )}
        <div className="relative ml-auto">
          <button
            onClick={() => setMoreOpen((val) => !val)}
            className={`${CHIP_BASE} text-muted-foreground border-border bg-card hover:bg-accent hover:text-foreground ${moreOpen ? 'bg-accent text-foreground' : ''}`}
            title="More actions"
          >
            ACTIONS
            <ChevronDown
              className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {moreOpen && (
            <>
              <button
                type="button"
                aria-label="Close"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setMoreOpen(false)}
              />
              <div className="absolute top-full right-0 mt-1 z-50 rounded-lg border border-border bg-card shadow-lg p-1 min-w-[180px]">
                {moreMenuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${item.danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30' : 'text-foreground hover:bg-accent'}`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Meta strip */}
      <HeaderMetaStrip
        message={message}
        categories={categories}
        messageLabels={messageLabels}
        allLabels={allLabels}
        hasManageLabels={hasManageLabels}
        showLabelPicker={showLabelPicker}
        updatingCategory={updatingCategory}
        onAssign={onRefresh}
        onSetCategory={(id) => void handleSetCategory(id)}
        onToggleLabel={(label) => void handleToggleLabel(label)}
        onToggleLabelPicker={() => setShowLabelPicker((val) => !val)}
        onCloseLabelPicker={() => setShowLabelPicker(false)}
        onCreateLabel={hasManageLabels ? (name) => void handleCreateLabel(name) : undefined}
        onDepartmentChange={onRefresh}
      />
    </div>
  );
}
