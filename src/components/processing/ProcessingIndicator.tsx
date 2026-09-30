import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { ProcessingSummaryEntry } from '@/services/importProgress.service';
import { plural } from './processingWords';

/**
 * The quiet half of the processing widget: a count by the bell of mail checks still being worked
 * through and problems wanting attention. A small routine run never pops a panel; it shows here.
 * Hidden when there is nothing to say. Clicking opens the panel of every mailbox it counts.
 */
export const ProcessingIndicator = ({
  entries,
  onOpen,
}: {
  entries: ProcessingSummaryEntry[];
  onOpen: (sourceIds: number[]) => void;
}) => {
  const inProgress = entries.reduce((sum, entry) => sum + entry.inProgress, 0);
  const problems = entries.reduce((sum, entry) => sum + entry.problems, 0);
  const unreadable = entries.filter((entry) => entry.unavailable).length;
  if (inProgress === 0 && problems === 0 && unreadable === 0) return null;
  // Older runs were left uncounted: every number here is a floor.
  const floor = entries.some((entry) => entry.countCapped) ? '+' : '';
  const lines = [
    inProgress > 0
      ? `${plural(inProgress, 'mail check or mine', 'mail checks or mines')}${floor} still processing`
      : null,
    problems > 0 ? `${plural(problems, 'problem', 'problems')}${floor} to look at` : null,
    // What failed is Odly's record of the checks, not the mailbox connection.
    unreadable > 0
      ? `${plural(unreadable, "mailbox's", "mailboxes'")} recent checks could not be read`
      : null,
  ].filter((line): line is string => line !== null);
  const label = lines.join('; ');
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={label}
        data-testid="processing-indicator"
        className="gap-1 px-2 h-8"
        onClick={() =>
          onOpen(
            entries
              .filter((entry) => entry.inProgress > 0 || entry.problems > 0 || entry.unavailable)
              .map((entry) => entry.sourceId)
          )
        }
      >
        {problems > 0 ? (
          <AlertTriangle className="w-4 h-4 text-warning" />
        ) : inProgress > 0 ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
        )}
        {(problems > 0 || inProgress > 0) && (
          <span className="font-mono text-xs">
            {problems > 0 ? problems : inProgress}
            {floor}
          </span>
        )}
      </Button>
    </Tooltip>
  );
};
