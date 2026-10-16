import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { type SLABreachNotification } from '@/hooks/useSLANotifications';
import { formatBreachAmount } from '@/components/layout/notificationFormat';

/**
 * ⚠️ The default arm is load-bearing, not defensive padding. The bell's kind filter is
 * deliberately fail-OPEN (a real breach must never be hidden by a denylist), so any kind
 * without its own surface lands here — `ai_provider_down` and `mailbox_address_undeclared`
 * do today. With no default this returned `undefined` and the row rendered as an amber
 * breach with a blank label: worse than either showing it properly or not showing it,
 * because a blank row tells the reader nothing AND looks like a bug.
 */
export const typeLabel = (type: SLABreachNotification['type']): string => {
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

export const SLABreachItem = ({
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
          ? 'bg-destructive-muted border-destructive-line'
          : 'bg-warning-muted border-warning-line'
      )}
    >
      <AlertTriangle
        className={cn('mt-0.5 w-4 h-4 shrink-0', isCritical ? 'text-destructive' : 'text-warning')}
      />
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 justify-between items-center">
          <span className="font-medium text-foreground">{typeLabel(notification.type)}</span>
          <div className="flex gap-1 items-center shrink-0">
            <span
              className={cn(
                'text-xs font-semibold shrink-0',
                isCritical ? 'text-destructive' : 'text-warning'
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
