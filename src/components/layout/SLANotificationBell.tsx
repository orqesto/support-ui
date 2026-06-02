import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type SLABreachNotification,
  type UseSLANotificationsResult,
} from '@/hooks/useSLANotifications';

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

const NotificationItem = ({
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

export const SLANotificationBell = ({
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

  // Mark all read after the panel becomes visible, not before it renders.
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
        // open downward
        setPanelPos({ top: rect.bottom + 8, left });
      } else {
        // open upward
        setPanelPos({ bottom: window.innerHeight - rect.top + 8, left });
      }
    }
    setOpen((prev) => !prev);
  };

  return (
    <div>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="flex relative justify-center items-center w-8 h-8 rounded-md transition-colors hover:bg-accent text-foreground/70 hover:text-foreground"
        title="SLA breach alerts"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex justify-center items-center w-4 h-4 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
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
            <span className="text-sm font-semibold">SLA Alerts</span>
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
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="px-2 py-0.5 text-xs rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
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
            {fetchError ? (
              <p className="py-6 text-sm text-center text-destructive">Failed to load alerts</p>
            ) : notifications.length === 0 ? (
              <p className="py-6 text-sm text-center text-muted-foreground">No SLA alerts</p>
            ) : (
              <>
                {notifications.map((notif) => (
                  <NotificationItem
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
