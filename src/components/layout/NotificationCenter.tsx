import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  X,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Ban,
  Wand2,
  Lightbulb,
  GitBranch,
  BrainCircuit,
  FileClock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  type SLABreachNotification,
  type UseSLANotificationsResult,
} from '@/hooks/useSLANotifications';
import { type UseLearningNotificationsResult } from '@/hooks/useLearningNotifications';
import { useNotificationCounts, type ArrivalKind } from '@/hooks/useNotificationCounts';
import { useAiProviderAlerts } from '@/hooks/useAiProviderAlerts';
import { useStaleKbAlerts } from '@/hooks/useStaleKbAlerts';
import { formatStaleAge } from '@/lib/kbStaleness';

// Notification Center (P3 + P4): one bell that unifies every notification surface —
// SLA breaches (itemized), the Suspicious/Spam arrival queues + needs-routing depth
// (aggregate drill-in rows), and the learning engine's auto-actions + pending
// suggestions (admin-only). Replaces the separate SLA and learning bells. needs-routing
// is a LIVE queue count from the unified `/counts` surface (P4) — read-only here, not a
// per-user arrival. Pure-SLA users see essentially the same bell — extra sections/labels
// only appear when there's content for them.

const PANEL_PEEK_LIMIT = 5;

/**
 * ⚠️ The default arm is load-bearing, not defensive padding. The bell's kind filter is
 * deliberately fail-OPEN (a real breach must never be hidden by a denylist), so any kind
 * without its own surface lands here — `ai_provider_down` and `mailbox_address_undeclared`
 * do today. With no default this returned `undefined` and the row rendered as an amber
 * breach with a blank label: worse than either showing it properly or not showing it,
 * because a blank row tells the reader nothing AND looks like a bug.
 */
const typeLabel = (type: SLABreachNotification['type']): string => {
  switch (type) {
    case 'message':
      return 'Message SLA';
    case 'ticket_first_response':
      return 'Ticket — First Response';
    case 'ticket_resolution':
      return 'Ticket — Resolution';
    default:
      return 'Notification';
  }
};

const formatBreachAmount = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m over`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m over` : `${hours}h over`;
};

const formatRelativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  const deltaSec = Math.max(0, (Date.now() - then) / 1000);
  if (deltaSec < 60) return 'just now';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="px-1 pt-1 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
    {children}
  </p>
);

const SLABreachItem = ({
  notification,
  onDismiss,
}: {
  notification: SLABreachNotification;
  onDismiss: (id: number) => void;
}) => {
  const isCritical = notification.severity === 'critical';
  const href =
    notification.type === 'message'
      ? `/messages/${notification.entityId}`
      : `/tickets/${notification.entityId}`;
  return (
    <div
      className={cn(
        'relative flex gap-3 items-start p-3 text-sm rounded-lg border transition-opacity hover:opacity-90',
        isCritical
          ? 'bg-red-50 border-red-200 dark:border-red-900 dark:bg-red-950/30'
          : 'bg-amber-50 border-amber-200 dark:border-amber-900 dark:bg-amber-950/30'
      )}
    >
      <AlertTriangle
        className={cn('mt-0.5 w-4 h-4 shrink-0', isCritical ? 'text-red-500' : 'text-amber-500')}
      />
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 justify-between items-center">
          <span className="font-medium text-foreground">{typeLabel(notification.type)}</span>
          <div className="flex gap-1 items-center shrink-0">
            <span
              className={cn(
                'text-xs font-semibold shrink-0',
                isCritical ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
              )}
            >
              {formatBreachAmount(notification.breachAmount)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDismiss(notification.id)}
              className="relative z-[2] flex justify-center items-center w-4 h-4 p-0 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground"
              title="Dismiss"
              aria-label="Dismiss"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <p className="mt-0.5 truncate text-muted-foreground">
          {notification.details.title ??
            notification.details.subject ??
            notification.details.sender}
        </p>
        <div className="flex gap-2 items-center mt-1 text-xs text-muted-foreground">
          {notification.details.channel && (
            <span className="capitalize">{notification.details.channel}</span>
          )}
          {notification.details.priority && (
            <span className="capitalize">{notification.details.priority} priority</span>
          )}
          <span className="flex gap-1 items-center ml-auto">
            <Clock className="w-3 h-3" />
            {notification.details.targetMinutes !== null &&
            notification.details.targetMinutes !== undefined
              ? `SLA: ${notification.details.targetMinutes < 60 ? `${notification.details.targetMinutes}m` : `${Math.round(notification.details.targetMinutes / 60)}h`}`
              : ''}
          </span>
        </div>
      </div>
      <Link
        to={href}
        className="absolute inset-0 z-[1] rounded-lg"
        aria-label={typeLabel(notification.type)}
      />
    </div>
  );
};

// Spam arrival queue → aggregate row that drills into the inbox filter.
// NOTE: Suspicious is intentionally NOT here — it is rendered below as a LIVE
// queue-depth row (like Needs Routing), sourced from the `suspicious_queue`
// count, so it only clears when the queue empties rather than on a per-user
// "reviewed" click. The `suspicious_arrival` kind still drives the Kanban
// header "N new" badge, which is separate from this panel.
const ARRIVAL_QUEUES: {
  kind: ArrivalKind;
  label: string;
  queue: string;
  Icon: typeof ShieldAlert;
  iconClass: string;
}[] = [
  { kind: 'spam_arrival', label: 'Spam', queue: 'spam', Icon: Ban, iconClass: 'text-red-500' },
];

type Props = {
  sla: UseSLANotificationsResult;
  learning: UseLearningNotificationsResult;
};

export const NotificationCenter = ({ sla, learning }: Props) => {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top?: number; bottom?: number; left: number }>({
    left: 0,
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { counts: arrivalCounts, clearKind } = useNotificationCounts();
  const { alerts: aiAlerts, dismiss: dismissAiAlert } = useAiProviderAlerts();
  const { alerts: staleKbAlerts, dismiss: dismissStaleKbAlert } = useStaleKbAlerts();

  const arrivalRows = ARRIVAL_QUEUES.map((entry) => ({
    ...entry,
    count: arrivalCounts[entry.kind] ?? 0,
  })).filter((entry) => entry.count > 0);
  const arrivalTotal = arrivalRows.reduce((sum, entry) => sum + entry.count, 0);

  // needs_routing (P4): a LIVE queue count, not a per-user arrival — so it is
  // NOT clearable and is deliberately kept OUT of the bell's numeric badge
  // (otherwise the bell would stay perpetually "unread" while any conv awaits
  // routing). It surfaces as a read-only drill-in row instead.
  const needsRoutingCount = arrivalCounts['needs_routing'] ?? 0;
  // Suspicious: a LIVE queue-depth count (like needs_routing), NOT clearable and
  // kept OUT of the bell badge — the queue row disappears only when it empties.
  const suspiciousQueueCount = arrivalCounts['suspicious_queue'] ?? 0;
  const hasQueues = arrivalRows.length > 0 || needsRoutingCount > 0 || suspiciousQueueCount > 0;

  const showLearning = learning.isOrgAdmin;
  const learningNotes = showLearning ? learning.notifications : [];
  const learningSuggestions = showLearning ? learning.suggestions : [];
  const learningUnread = showLearning ? learning.unreadCount : 0;

  const hasSla = sla.notifications.length > 0;
  const hasLearning = learningNotes.length > 0 || learningSuggestions.length > 0;
  const hasAiAlerts = aiAlerts.length > 0;
  const hasStaleKb = staleKbAlerts.length > 0;
  // Counted in the badge: unlike a queue depth, this is a fault, and it must not be
  // possible to have a silently degraded AI and an unbadged bell.
  // ⛔ Stale KB documents are deliberately NOT in the badge. Nothing is broken and nothing
  // is urgent: the documents are still serving, and a workspace that bulk-imported a
  // Confluence space can legitimately carry dozens for months. Badging them would leave the
  // bell permanently lit, which costs the badge its meaning for the faults above that are
  // urgent. Same reasoning as needs_routing and the queue depths.
  const badgeCount = sla.unreadCount + arrivalTotal + learningUnread + aiAlerts.length;
  // With multiple content types present, label each section; otherwise stay minimal.
  const sectionCount =
    (hasQueues ? 1 : 0) +
    (hasSla ? 1 : 0) +
    (hasLearning ? 1 : 0) +
    (hasAiAlerts ? 1 : 0) +
    (hasStaleKb ? 1 : 0);
  const showSectionLabels = sectionCount > 1;
  const isEmpty = !hasQueues && !hasSla && !hasLearning && !hasAiAlerts && !hasStaleKb;

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Mark SLA breaches + learning items read once the panel is visible. Arrival queues are
  // NOT auto-cleared — the agent clears a queue by clicking its row (= "reviewed").
  useEffect(() => {
    if (!open) return;
    if (sla.unreadCount > 0) sla.markAllRead();
    if (showLearning && learning.unreadCount > 0) learning.markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const panelWidth = 360;
      const panelHeight = 400;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow >= panelHeight || spaceBelow >= spaceAbove) {
        setPanelPos({ top: rect.bottom + 8, left });
      } else {
        setPanelPos({ bottom: window.innerHeight - rect.top + 8, left });
      }
    }
    setOpen((prev) => !prev);
  };

  const openQueue = (kind: ArrivalKind, queue: string) => {
    clearKind(kind).catch(() => {}); // per-user "reviewed" clear (fire-and-forget)
    navigate(`/messages?queue=${queue}`);
    setOpen(false);
  };

  const goToAiSettings = (focusSuggestionId?: number) => {
    navigate(`/settings${focusSuggestionId ? `?focus=${focusSuggestionId}` : ''}#ai/learning`);
    setOpen(false);
  };

  return (
    <div>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        className="flex relative justify-center items-center w-8 h-8 p-0 rounded-md hover:bg-accent text-foreground/70 hover:text-foreground"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {badgeCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex justify-center items-center w-4 h-4 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          ref={panelRef}
          style={{ top: panelPos.top, bottom: panelPos.bottom, left: panelPos.left }}
          className="fixed z-50 w-[360px] rounded-lg border shadow-lg bg-card border-border"
        >
          <div className="flex justify-between items-center px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex gap-1 items-center">
              <Button
                variant={sla.onlyAssignedToMe ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => sla.setOnlyMine(!sla.onlyAssignedToMe)}
                className={cn(
                  'px-2 py-0.5 h-auto text-xs',
                  sla.onlyAssignedToMe
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
                title={
                  sla.onlyAssignedToMe ? 'Showing only assigned to me' : 'Showing all org alerts'
                }
              >
                Only mine
              </Button>
              {hasSla && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={sla.clearAll}
                  className="px-2 py-0.5 h-auto text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                  title="Dismiss all SLA breaches"
                >
                  Clear all
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="flex justify-center items-center w-6 h-6 p-0 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto p-2 space-y-2 max-h-96">
            {isEmpty ? (
              <p className="py-6 text-sm text-center text-muted-foreground">No notifications</p>
            ) : (
              <>
                {/* AI provider down — first, because it changes how everything below was
                    produced. While it stands, analysis is still running but on the local
                    embedding fallback, so answers keep arriving and keep getting worse. */}
                {hasAiAlerts && (
                  <>
                    {showSectionLabels && <SectionLabel>AI</SectionLabel>}
                    {aiAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex gap-3 items-start p-3 text-sm rounded-lg border border-destructive/40 bg-destructive/10"
                      >
                        <BrainCircuit className="mt-0.5 w-4 h-4 shrink-0 text-destructive" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">
                            {alert.provider} is not answering
                          </p>
                          <p className="mt-0.5 break-words text-muted-foreground">{alert.reason}</p>
                          {alert.degradedTo === 'local_embeddings' && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Messages are still being analysed, but on the weaker built-in
                              model until this is fixed.
                            </p>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setOpen(false);
                              navigate('/settings#integrations');
                            }}
                            className="px-0 mt-1 h-auto text-xs text-primary hover:bg-transparent hover:underline"
                          >
                            Check AI settings
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dismissAiAlert(alert.id)}
                          aria-label="Dismiss this alert"
                          title="Dismiss — it returns if the provider is still failing"
                          className="p-1 h-auto text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </>
                )}

                {/* Knowledge base — last, because it is the only section here that is not a
                    fault. The documents are still serving; this is a nudge to look, and it
                    disables nothing. */}
                {hasStaleKb && (
                  <>
                    {showSectionLabels && <SectionLabel>Knowledge base</SectionLabel>}
                    {staleKbAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border"
                      >
                        <FileClock className="mt-0.5 w-4 h-4 shrink-0 text-amber-500" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium break-words text-foreground">{alert.title}</p>
                          <p className="mt-0.5 text-muted-foreground">
                            Not updated in {formatStaleAge(alert.staleForDays)}
                            {alert.source === 'confluence' ? ' · from Confluence' : ''}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setOpen(false);
                              // `docId`, NOT `id`. `?id=` is read by KnowledgeBasePage and passed to
                              // kbService.getById — the knowledge_base ENTRY id space, which a
                              // documentation id collides with: the link popped "Entry Not Found",
                              // or opened an unrelated entry that happened to share the number.
                              // `?docId=` is the documentation tab's own param and already
                              // scrolls the row into view and rings it.
                              navigate(`/knowledge-base?docId=${alert.documentId}#documentation`);
                            }}
                            className="px-0 mt-1 h-auto text-xs text-primary hover:bg-transparent hover:underline"
                          >
                            Review document
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dismissStaleKbAlert(alert.id)}
                          aria-label="Dismiss this alert"
                          title="Dismiss — it returns while the document is still unchanged"
                          className="p-1 h-auto text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </>
                )}

                {/* Queues (Suspicious/Spam arrivals + needs-routing depth) */}
                {hasQueues && (
                  <>
                    {showSectionLabels && <SectionLabel>Queues</SectionLabel>}
                    {arrivalRows.map(({ kind, label, queue, Icon, iconClass, count }) => (
                      <Button
                        key={kind}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openQueue(kind, queue)}
                        className="flex gap-3 items-center p-3 w-full h-auto text-sm text-left rounded-lg border bg-background hover:bg-accent border-border"
                      >
                        <Icon className={cn('w-4 h-4 shrink-0', iconClass)} />
                        <span className="flex-1 font-medium text-foreground">{label}</span>
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                          {count > 99 ? '99+' : count} new
                        </span>
                      </Button>
                    ))}
                    {suspiciousQueueCount > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigate('/messages?queue=suspicious');
                          setOpen(false);
                        }}
                        className="flex gap-3 items-center p-3 w-full h-auto text-sm text-left rounded-lg border bg-background hover:bg-accent border-border"
                      >
                        <ShieldAlert className="w-4 h-4 shrink-0 text-purple-500" />
                        <span className="flex-1 font-medium text-foreground">Suspicious</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                          {suspiciousQueueCount > 99 ? '99+' : suspiciousQueueCount}
                        </span>
                      </Button>
                    )}
                    {needsRoutingCount > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigate('/needs-routing');
                          setOpen(false);
                        }}
                        className="flex gap-3 items-center p-3 w-full h-auto text-sm text-left rounded-lg border bg-background hover:bg-accent border-border"
                      >
                        <GitBranch className="w-4 h-4 shrink-0 text-amber-500" />
                        <span className="flex-1 font-medium text-foreground">Needs Routing</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                          {needsRoutingCount > 99 ? '99+' : needsRoutingCount}
                        </span>
                      </Button>
                    )}
                  </>
                )}

                {/* SLA breaches */}
                {sla.fetchError ? (
                  <p className="py-6 text-sm text-center text-destructive">Failed to load alerts</p>
                ) : hasSla ? (
                  <>
                    {showSectionLabels && <SectionLabel>SLA breaches</SectionLabel>}
                    {sla.notifications.map((notif) => (
                      <SLABreachItem
                        key={`${notif.type}-${notif.id}-${notif.receivedAt}`}
                        notification={notif}
                        onDismiss={sla.dismiss}
                      />
                    ))}
                    {sla.total > sla.notifications.length && (
                      <p className="py-2 text-xs text-center text-muted-foreground">
                        +{sla.total - sla.notifications.length} more — use Clear all to dismiss all
                      </p>
                    )}
                  </>
                ) : null}

                {/* Learning — auto-actions (admin only) */}
                {learningNotes.length > 0 && (
                  <>
                    <SectionLabel>Auto-actions ({learningNotes.length})</SectionLabel>
                    {learningNotes.slice(0, PANEL_PEEK_LIMIT).map((note) => (
                      <Button
                        key={note.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => goToAiSettings()}
                        className="flex gap-2 items-start p-2 w-full h-auto text-sm text-left rounded border bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-900 hover:bg-violet-100 dark:hover:bg-violet-950/50"
                      >
                        <Wand2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-violet-500" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-foreground">{note.summary}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {note.domain} · {note.actionType} · {formatRelativeTime(note.createdAt)}
                          </p>
                        </div>
                      </Button>
                    ))}
                    {learningNotes.length > PANEL_PEEK_LIMIT && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => goToAiSettings()}
                        className="justify-start px-1 h-auto text-[11px] text-left text-muted-foreground hover:text-foreground"
                      >
                        +{learningNotes.length - PANEL_PEEK_LIMIT} more — View all
                      </Button>
                    )}
                  </>
                )}

                {/* Learning — pending suggestions (admin only) */}
                {learningSuggestions.length > 0 && (
                  <>
                    <SectionLabel>Pending suggestions ({learningSuggestions.length})</SectionLabel>
                    {learningSuggestions.slice(0, PANEL_PEEK_LIMIT).map((sug) => {
                      const summary =
                        typeof sug.payload.title === 'string'
                          ? sug.payload.title
                          : typeof sug.payload.summary === 'string'
                            ? sug.payload.summary
                            : `${sug.suggestionType} (${sug.evidenceCount} signals)`;
                      return (
                        <Button
                          key={sug.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => goToAiSettings(sug.id)}
                          className="flex gap-2 items-start p-2 w-full h-auto text-sm text-left rounded border bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                        >
                          <Lightbulb className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber-500" />
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-foreground">{summary}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {sug.domain} · {formatRelativeTime(sug.createdAt)}
                            </p>
                          </div>
                        </Button>
                      );
                    })}
                    {learningSuggestions.length > PANEL_PEEK_LIMIT && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => goToAiSettings()}
                        className="justify-start px-1 h-auto text-[11px] text-left text-muted-foreground hover:text-foreground"
                      >
                        +{learningSuggestions.length - PANEL_PEEK_LIMIT} more — View all
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
