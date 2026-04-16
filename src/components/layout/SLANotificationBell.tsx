import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSLANotifications, type SLABreachNotification } from '@/hooks/useSLANotifications';

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
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m over` : `${h}h over`;
};

const NotificationItem = ({
  n,
  onDismiss,
}: {
  n: SLABreachNotification;
  onDismiss: (id: number) => void;
}) => {
  const isCritical = n.severity === 'critical';
  const href = n.type === 'message' ? `/messages/${n.entityId}` : `/tickets/${n.entityId}`;
  return (
    <Link
      to={href}
      className={cn(
        'flex gap-3 items-start p-3 text-sm rounded-lg border no-underline hover:opacity-90 transition-opacity',
        isCritical
          ? 'bg-red-50 border-red-200 dark:border-red-900 dark:bg-red-950/30'
          : 'bg-yellow-50 border-yellow-200 dark:border-yellow-900 dark:bg-yellow-950/30'
      )}
    >
      <AlertTriangle
        className={cn('mt-0.5 w-4 h-4 shrink-0', isCritical ? 'text-red-500' : 'text-yellow-500')}
      />
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 justify-between items-center">
          <span className="font-medium text-foreground">{typeLabel(n.type)}</span>
          <div className="flex gap-1 items-center shrink-0">
            <span
              className={cn(
                'text-xs font-semibold shrink-0',
                isCritical
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-yellow-600 dark:text-yellow-400'
              )}
            >
              {formatBreachAmount(n.breachAmount)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(n.id);
              }}
              className="flex justify-center items-center w-4 h-4 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
        <p className="mt-0.5 truncate text-muted-foreground">
          {n.details.title ?? n.details.subject ?? n.details.sender}
        </p>
        <div className="flex gap-2 items-center mt-1 text-xs text-muted-foreground">
          {n.details.channel && <span className="capitalize">{n.details.channel}</span>}
          {n.details.priority && <span className="capitalize">{n.details.priority} priority</span>}
          <span className="flex gap-1 items-center ml-auto">
            <Clock className="w-3 h-3" />
            {n.details.targetMinutes !== null && n.details.targetMinutes !== undefined
              ? `SLA: ${n.details.targetMinutes < 60 ? `${n.details.targetMinutes}m` : `${Math.round(n.details.targetMinutes / 60)}h`}`
              : ''}
          </span>
        </div>
      </div>
    </Link>
  );
};

export const SLANotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
  const { notifications, total, unreadCount, clearAll, dismiss, markAllRead } = useSLANotifications();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      });
    }
    setOpen((prev) => !prev);
    if (!open && unreadCount > 0) markAllRead();
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
          style={{ bottom: panelPos.bottom, left: panelPos.left }}
          className="fixed z-50 w-80 rounded-lg border shadow-lg bg-card border-border"
        >
          <div className="flex justify-between items-center px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">SLA Alerts</span>
            <div className="flex gap-1 items-center">
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
            {notifications.length === 0 ? (
              <p className="py-6 text-sm text-center text-muted-foreground">No SLA alerts</p>
            ) : (
              <>
                {notifications.map((n) => (
                  <NotificationItem
                    key={`${n.type}-${n.id}-${n.receivedAt}`}
                    n={n}
                    onDismiss={() => dismiss(n.id)}
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
