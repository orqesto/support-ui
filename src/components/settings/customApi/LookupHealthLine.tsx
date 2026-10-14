import { useState } from 'react';
import { Circle } from 'lucide-react';
import { failureSentence } from '@/components/messages/customApiLookupText';
import { relativeTime } from '@/components/messages/messageDetailConstants';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/hooks/usePermissions';
import type { CustomApiEndpoint } from '@/services/customApi.service';
import { Permission } from '@/types/roles';

/** Absent from a backend before 2026-10-14. */
type Health = NonNullable<CustomApiEndpoint['health']>;

/** The host a connection calls — shown wherever an admin could otherwise miss a wrong address. */
export const hostOf = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};

/**
 * A7 (2026-10-14): the last result agents saw from this lookup, in one line. The backend counts
 * one per card an agent saw, and computes `dot` and `streakHint` from the platform's thresholds
 * (`custom_api.health`). Absent (an older backend) or never run ⇒ nothing is said rather than a
 * guess.
 */
export const healthSentence = (
  health: Health | undefined,
  connectionName: string
): string | null => {
  if (!health?.latest) return null;
  if (health.latest === 'ok' && health.lastOkAt) {
    return `Found something ${relativeTime(health.lastOkAt)}`;
  }
  if (health.latest === 'no_match') {
    const count = health.noMatchStreak;
    return `Nothing found ${count} ${count === 1 ? 'time' : 'times'} in a row${
      health.streakHint ? ' — check the address points at the live system' : ''
    }`;
  }
  if (health.latest === 'failed' && health.lastFailedAt) {
    const since = new Date(health.lastFailedAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return `Failing since ${since}: ${failureSentence(health.lastFailureClass, connectionName)}`;
  }
  return null;
};

const DOT_CLASS: Record<string, string> = {
  green: 'text-success',
  grey: 'text-muted-foreground',
  red: 'text-destructive',
};

export const LookupHealthLine = ({
  health,
  connectionName,
}: {
  health: Health | undefined;
  connectionName: string;
}) => {
  const [open, setOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const sentence = healthSentence(health, connectionName);
  if (!health || !sentence) return null;
  // D1: the backend sends the raw text only to callers holding MANAGE_INTEGRATIONS; the same rule
  // here keeps it from a viewer if a backend ever sends it anyway.
  const details =
    health.latest === 'failed' &&
    hasPermission(Permission.MANAGE_INTEGRATIONS) &&
    typeof health.lastFailureReason === 'string' &&
    health.lastFailureReason
      ? health.lastFailureReason
      : null;
  const dot = DOT_CLASS[health.dot] ? health.dot : 'grey';
  return (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" data-dot={dot}>
        <Circle className={`h-2 w-2 shrink-0 fill-current ${DOT_CLASS[dot]}`} aria-hidden />
        <span>{sentence}</span>
        {details && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1 text-[11px]"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            {open ? 'Hide details' : 'Details ▸'}
          </Button>
        )}
      </p>
      {open && details && (
        <p className="text-[10.5px] text-muted-foreground break-words">{details}</p>
      )}
    </div>
  );
};
