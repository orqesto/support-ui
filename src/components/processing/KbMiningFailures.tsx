import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { logger } from '@/lib/logger';
import { importProgressService, type KBMiningFailure } from '@/services/importProgress.service';
import { formatRunTime, plural } from './processingWords';

/**
 * Knowledge-base threads whose mining failed for good (every retry spent, or an error no retry
 * fixes). Each links to its conversation and can be dismissed — it then stops counting as a
 * problem until it fails again.
 */
export const KbMiningFailures = ({
  sourceId,
  failures,
  truncated,
  onDismissed,
}: {
  sourceId: number;
  failures: KBMiningFailure[];
  truncated: boolean;
  onDismissed: () => void;
}) => {
  const [pending, setPending] = useState<number | null>(null);
  /**
   * Dismissed here, until the next answer: keyed by thread AND when it failed, so the same thread
   * failing again later is a new row, not one hidden for good.
   */
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [failedToDismiss, setFailedToDismiss] = useState<number | null>(null);
  const keyOf = (failure: KBMiningFailure) => `${failure.conversationId}:${failure.at}`;
  const shown = failures.filter((failure) => !gone.has(keyOf(failure)));
  if (shown.length === 0) return null;

  const dismiss = async (failure: KBMiningFailure) => {
    const { conversationId } = failure;
    setPending(conversationId);
    setFailedToDismiss(null);
    try {
      await importProgressService.dismissKbFailure(sourceId, conversationId);
      setGone((previous) => new Set(previous).add(keyOf(failure)));
      onDismissed();
    } catch (error) {
      logger.debug('dismiss KB mining failure failed', { sourceId, conversationId, error });
      setFailedToDismiss(conversationId);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="pt-2 space-y-1.5 border-t" data-testid="kb-failures">
      <p className="text-xs font-medium text-warning">
        The knowledge base could not read {plural(shown.length, 'conversation', 'conversations')}
        {truncated ? ' (the newest are shown; older ones were not kept)' : ''}
      </p>
      <ul className="space-y-1">
        {shown.map((failure) => (
          <li key={keyOf(failure)} className="flex gap-2 items-center text-[11px]">
            <Link
              to={`/messages/${failure.conversationId}`}
              className="font-mono underline underline-offset-2 hover:text-foreground"
            >
              #{failure.conversationId}
            </Link>
            <span className="flex-1 truncate text-muted-foreground" title={failure.error}>
              {formatRunTime(failure.at)} · {failure.error}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="px-1.5 h-6 text-[11px]"
              isLoading={pending === failure.conversationId}
              disabled={pending !== null}
              onClick={() => void dismiss(failure)}
            >
              Dismiss
            </Button>
            {failedToDismiss === failure.conversationId && (
              <span className="text-destructive">Not dismissed, try again</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
