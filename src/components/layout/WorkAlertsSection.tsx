import type React from 'react';
import { UserCheck, Inbox, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  CONVERSATION_ASSIGNED_KIND,
  type UseWorkAlertsResult,
  workAlertHref,
  workAlertText,
} from '@/hooks/useWorkAlerts';

const PEEK = 5;

/**
 * #957 — "Assigned to you by …" and "New unassigned message in …". Each row opens its conversation (or
 * ticket); dismissing clears it for YOU only (the backend keeps it for colleagues).
 */
export const WorkAlertsSection = ({
  work,
  showLabel,
  SectionLabel,
  setOpen,
}: {
  work: UseWorkAlertsResult;
  showLabel: boolean;
  SectionLabel: React.ComponentType<{ children: React.ReactNode }>;
  setOpen: (open: boolean) => void;
}) => {
  const navigate = useNavigate();
  if (work.alerts.length === 0) return null;
  const visible = work.alerts.slice(0, PEEK);
  return (
    <>
      {showLabel && <SectionLabel>For you</SectionLabel>}
      {visible.map((alert) => {
        const Icon = alert.kind === CONVERSATION_ASSIGNED_KIND ? UserCheck : Inbox;
        return (
          <div
            key={alert.id}
            className="flex gap-3 items-start p-3 text-sm rounded-lg border bg-background border-border"
          >
            <Icon className="mt-0.5 w-4 h-4 shrink-0 text-primary" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                work.open(alert);
                setOpen(false);
                navigate(workAlertHref(alert));
              }}
              className="flex-1 p-0 h-auto text-left whitespace-normal hover:bg-transparent"
            >
              <span
                className={alert.isRead ? 'text-muted-foreground' : 'font-medium text-foreground'}
              >
                {workAlertText(alert)}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => work.dismiss(alert.id)}
              aria-label={`Dismiss: ${workAlertText(alert)}`}
              title="Dismiss — only for you; colleagues keep theirs"
              className="p-1 h-auto text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      })}
      {work.total > visible.length && (
        <p className="py-1 text-xs text-center text-muted-foreground">
          +{work.total - visible.length} more not listed here
        </p>
      )}
    </>
  );
};
