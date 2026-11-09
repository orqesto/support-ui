/**
 * The live banner under the thread header (spec §5.3): "Anna just replied — view", "Anna closed
 * this thread", "Anna assigned it to Ben", "Anna moved it to Billing", "Anna merged it into
 * SUP-12", "Anna marked it spam". "view" re-reads the thread; the draft is left as it is.
 */
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useDepartments } from '@/hooks/useDepartments';
import { LABEL } from '../components/messageDetailConstants';
import type { ThreadActivity } from './useThreadActivity';
import { useOrgMemberNames } from './useOrgMemberNames';

export const activityText = (
  activity: ThreadActivity,
  nameOf: (userId: number) => string,
  departmentName: (id: number) => string | undefined
): string => {
  const who = nameOf(activity.actorId);
  switch (activity.kind) {
    case 'replied':
      return `${who} just replied`;
    case 'closed':
      return `${who} closed this thread`;
    case 'resolved':
      return `${who} resolved this thread`;
    case 'assigned':
      return activity.assigneeId === null
        ? `${who} unassigned it`
        : `${who} assigned it to ${nameOf(activity.assigneeId)}`;
    case 'moved': {
      const team =
        activity.departmentId !== null ? departmentName(activity.departmentId) : undefined;
      return `${who} moved it to ${team ?? 'another team'}`;
    }
    case 'merged':
      return activity.intoPublicId
        ? `${who} merged it into ${activity.intoPublicId}`
        : `${who} merged this thread`;
    case 'spam':
      return `${who} marked it spam`;
  }
};

export function ThreadActivityBanner({
  activity,
  onView,
  onDismiss,
}: {
  activity: ThreadActivity | null;
  /** Re-read the thread (the composer and its draft are untouched). */
  onView: () => void;
  onDismiss: () => void;
}) {
  if (!activity) return null;
  return <Banner activity={activity} onView={onView} onDismiss={onDismiss} />;
}

// Split so the member and team lists load only once there is a banner to show.
function Banner({
  activity,
  onView,
  onDismiss,
}: {
  activity: ThreadActivity;
  onView: () => void;
  onDismiss: () => void;
}) {
  const agentOf = useOrgMemberNames();
  const { data: departments } = useDepartments();
  const text = activityText(
    activity,
    (userId) => agentOf(userId).name,
    (id) => departments?.find((dept) => dept.id === id)?.name
  );
  return (
    <div
      role="status"
      data-testid="thread-activity-banner"
      className="flex-shrink-0 flex flex-wrap items-center gap-[9px] px-3.5 py-2 bg-primary-muted border-b border-primary-line text-primary"
    >
      <span className={LABEL}>Live</span>
      <span className="flex-1 min-w-[170px] text-[12.5px] text-foreground">
        <span>{text}</span>
        {activity.kind === 'replied' && (
          <>
            {' — '}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onView();
                onDismiss();
              }}
              className="h-auto p-0 text-[12.5px] font-medium text-primary hover:bg-transparent hover:underline"
            >
              view
            </Button>
          </>
        )}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="w-[30px] h-[30px] rounded-[7px] text-primary/70 hover:text-primary hover:bg-transparent"
      >
        <X className="w-[15px] h-[15px]" />
      </Button>
    </div>
  );
}
