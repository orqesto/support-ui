import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X, AlertTriangle, Clock, ShieldAlert, Ban, Wand2, Lightbulb, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type SLABreachNotification,
  type UseSLANotificationsResult,
} from '@/hooks/useSLANotifications';
import { type UseLearningNotificationsResult } from '@/hooks/useLearningNotifications';
import { useNotificationCounts, type ArrivalKind } from '@/hooks/useNotificationCounts';

// Notification Center (P3 + P4): one bell that unifies every notification surface —
// SLA breaches (itemized), the Suspicious/Spam arrival queues + needs-routing depth
// (aggregate drill-in rows), and the learning engine's auto-actions + pending
// suggestions (admin-only). Replaces the separate SLA and learning bells. needs-routing
// is a LIVE queue count from the unified `/counts` surface (P4) — read-only here, not a
// per-user arrival. Pure-SLA users see essentially the same bell — extra sections/labels
// only appear when there's content for them.

const PANEL_PEEK_LIMIT = 5;

const typeLabel = (type: SLABreachNotification['type']): string => {
  switch (type) {
    case 'message':
      return 'Message SLA';
    case 'ticket_first_response':
      return 'Ticket — First Response';
    case 'ticket_resolution':
      return 'Ticket — Resolution';
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
            <button
              type="button"
              onClick={() => onDismiss(notification.id)}
              className="relative z-[2] flex justify-center items-center w-4 h-4 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
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

// Suspicious/Spam arrival queues → aggregate rows that drill into the inbox filter.
const ARRIVAL_QUEUES: {
  kind: ArrivalKind;
  label: string;
  queue: string;
  Icon: typeof ShieldAlert;
  iconClass: string;
}[] = [
  { kind: 'suspicious_arrival', label: 'Suspicious', queue: 'suspicious', Icon: ShieldAlert, iconClass: 'text-purple-500' },
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
  const hasQueues = arrivalRows.length > 0 || needsRoutingCount > 0;

  const showLearning = learning.isOrgAdmin;
  const learningNotes = showLearning ? learning.notifications : [];
  const learningSuggestions = showLearning ? learning.suggestions : [];
  const learningUnread = showLearning ? learning.unreadCount : 0;

  const hasSla = sla.notifications.length > 0;
  const hasLearning = learningNotes.length > 0 || learningSuggestions.length > 0;
  const badgeCount = sla.unreadCount + arrivalTotal + learningUnread;
  // With multiple content types present, label each section; otherwise stay minimal.
  const sectionCount = (hasQueues ? 1 : 0) + (hasSla ? 1 : 0) + (hasLearning ? 1 : 0);
  const showSectionLabels = sectionCount > 1;
  const isEmpty = !hasQueues && !hasSla && !hasLearning;

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
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="flex relative justify-center items-center w-8 h-8 rounded-md transition-colors hover:bg-accent text-foreground/70 hover:text-foreground"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {badgeCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex justify-center items-center w-4 h-4 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ top: panelPos.top, bottom: panelPos.bottom, left: panelPos.left }}
          className="fixed z-50 w-[360px] rounded-lg border shadow-lg bg-card border-border"
        >
          <div className="flex justify-between items-center px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex gap-1 items-center">
              <button
                onClick={() => sla.setOnlyMine(!sla.onlyAssignedToMe)}
                className={cn(
                  'px-2 py-0.5 text-xs rounded transition-colors',
                  sla.onlyAssignedToMe
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
                title={
                  sla.onlyAssignedToMe ? 'Showing only assigned to me' : 'Showing all org alerts'
                }
              >
                Only mine
              </button>
              {hasSla && (
                <button
                  onClick={sla.clearAll}
                  className="px-2 py-0.5 text-xs rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
                  title="Dismiss all SLA breaches"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex justify-center items-center w-6 h-6 rounded transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-2 space-y-2 max-h-96">
            {isEmpty ? (
              <p className="py-6 text-sm text-center text-muted-foreground">No notifications</p>
            ) : (
              <>
                {/* Queues (Suspicious/Spam arrivals + needs-routing depth) */}
                {hasQueues && (
                  <>
                    {showSectionLabels && <SectionLabel>Queues</SectionLabel>}
                    {arrivalRows.map(({ kind, label, queue, Icon, iconClass, count }) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => openQueue(kind, queue)}
                        className="flex gap-3 items-center p-3 w-full text-sm text-left rounded-lg border transition-colors bg-background hover:bg-accent border-border"
                      >
                        <Icon className={cn('w-4 h-4 shrink-0', iconClass)} />
                        <span className="flex-1 font-medium text-foreground">{label}</span>
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                          {count > 99 ? '99+' : count} new
                        </span>
                      </button>
                    ))}
                    {needsRoutingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          navigate('/needs-routing');
                          setOpen(false);
                        }}
                        className="flex gap-3 items-center p-3 w-full text-sm text-left rounded-lg border transition-colors bg-background hover:bg-accent border-border"
                      >
                        <GitBranch className="w-4 h-4 shrink-0 text-amber-500" />
                        <span className="flex-1 font-medium text-foreground">Needs Routing</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                          {needsRoutingCount > 99 ? '99+' : needsRoutingCount}
                        </span>
                      </button>
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
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => goToAiSettings()}
                        className="flex gap-2 items-start p-2 w-full text-sm text-left rounded border transition-colors bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-900 hover:bg-violet-100 dark:hover:bg-violet-950/50"
                      >
                        <Wand2 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-violet-500" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-foreground">{note.summary}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {note.domain} · {note.actionType} · {formatRelativeTime(note.createdAt)}
                          </p>
                        </div>
                      </button>
                    ))}
                    {learningNotes.length > PANEL_PEEK_LIMIT && (
                      <button
                        type="button"
                        onClick={() => goToAiSettings()}
                        className="px-1 text-[11px] text-left transition-colors text-muted-foreground hover:text-foreground"
                      >
                        +{learningNotes.length - PANEL_PEEK_LIMIT} more — View all
                      </button>
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
                        <button
                          key={sug.id}
                          type="button"
                          onClick={() => goToAiSettings(sug.id)}
                          className="flex gap-2 items-start p-2 w-full text-sm text-left rounded border transition-colors bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                        >
                          <Lightbulb className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber-500" />
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-foreground">{summary}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {sug.domain} · {formatRelativeTime(sug.createdAt)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                    {learningSuggestions.length > PANEL_PEEK_LIMIT && (
                      <button
                        type="button"
                        onClick={() => goToAiSettings()}
                        className="px-1 text-[11px] text-left transition-colors text-muted-foreground hover:text-foreground"
                      >
                        +{learningSuggestions.length - PANEL_PEEK_LIMIT} more — View all
                      </button>
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
