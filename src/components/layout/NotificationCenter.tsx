import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X, AlertTriangle, Clock, ShieldAlert, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type SLABreachNotification,
  type UseSLANotificationsResult,
} from '@/hooks/useSLANotifications';
import { useNotificationCounts, type ArrivalKind } from '@/hooks/useNotificationCounts';

// Notification Center (P3): one bell that unifies SLA breaches (itemized) with the
// Suspicious/Spam arrival queues (aggregate count rows that drill into the inbox). The
// learning bell + needs-routing badge stay separate until P4. Pure-SLA users see the same
// bell they had — the Queues section only appears when there are arrivals.

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
      {/* Link overlay last in DOM — stacks above non-positioned content, below the dismiss button */}
      <Link
        to={href}
        className="absolute inset-0 z-[1] rounded-lg"
        aria-label={typeLabel(notification.type)}
      />
    </div>
  );
};

// Suspicious/Spam arrival queues surfaced as aggregate rows. `queue` is the inbox URL
// filter value (`/messages?queue=…`); `kind` is the notification kind whose unread count
// drives the badge and gets cleared on click.
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

export const NotificationCenter = ({
  notifications,
  total,
  unreadCount,
  fetchError,
  onlyAssignedToMe,
  setOnlyMine,
  clearAll,
  dismiss,
  markAllRead,
}: UseSLANotificationsResult) => {
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
  const badgeCount = unreadCount + arrivalTotal;
  const hasSla = notifications.length > 0;
  // Section labels only when both kinds of content are present, so a pure-SLA (or
  // pure-arrival) bell stays as uncluttered as before.
  const showSectionLabels = arrivalRows.length > 0 && hasSla;

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

  // Mark SLA breaches read once the panel is visible (existing behaviour). Arrival queues
  // are NOT auto-cleared — the agent clears a queue by clicking its row (= "reviewed").
  useEffect(() => {
    if (open && unreadCount > 0) markAllRead();
  }, [open]);

  const handleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const panelWidth = 320; // w-80
      const panelHeight = 360; // approx max-h-80 + header
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
          className="fixed z-50 w-80 rounded-lg border shadow-lg bg-card border-border"
        >
          <div className="flex justify-between items-center px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex gap-1 items-center">
              <button
                onClick={() => setOnlyMine(!onlyAssignedToMe)}
                className={cn(
                  'px-2 py-0.5 text-xs rounded transition-colors',
                  onlyAssignedToMe
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
                title={onlyAssignedToMe ? 'Showing only assigned to me' : 'Showing all org alerts'}
              >
                Only mine
              </button>
              {hasSla && (
                <button
                  onClick={clearAll}
                  className="px-2 py-0.5 text-xs rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
                  title="Dismiss all SLA breaches"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex justify-center items-center w-6 h-6 rounded transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-2 space-y-2 max-h-80">
            {/* Queues (Suspicious/Spam arrivals) — aggregate rows that drill into the inbox. */}
            {arrivalRows.length > 0 && (
              <>
                {showSectionLabels && (
                  <p className="px-1 pt-1 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                    Queues
                  </p>
                )}
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
              </>
            )}

            {/* SLA breaches — itemized. */}
            {showSectionLabels && (
              <p className="px-1 pt-2 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
                SLA breaches
              </p>
            )}
            {fetchError ? (
              <p className="py-6 text-sm text-center text-destructive">Failed to load alerts</p>
            ) : !hasSla ? (
              arrivalRows.length === 0 && (
                <p className="py-6 text-sm text-center text-muted-foreground">No notifications</p>
              )
            ) : (
              <>
                {notifications.map((notif) => (
                  <SLABreachItem
                    key={`${notif.type}-${notif.id}-${notif.receivedAt}`}
                    notification={notif}
                    onDismiss={dismiss}
                  />
                ))}
                {total > notifications.length && (
                  <p className="py-2 text-xs text-center text-muted-foreground">
                    +{total - notifications.length} more — use Clear all to dismiss all alerts
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
