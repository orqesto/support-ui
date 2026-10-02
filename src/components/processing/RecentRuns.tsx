import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ResumeWay } from '@/lib/utcClock';
import type { RunView } from '@/services/importProgress.service';
import {
  formatRunTime,
  hasLaterKbRun,
  plural,
  runStatus,
  runStatusLabel,
  runStatusVariant,
  isKbErrorBeforeReading,
  notContinuedReason,
} from './processingWords';

/**
 * The last mail checks that found new mail and knowledge-base mines of this mailbox (the backend
 * keeps 20 of each), newest first, each
 * with how it ended — so "did something go wrong last night?" has an answer after the pop-up of
 * that run is long gone.
 */
export const RecentRuns = ({
  runs,
  kbParked = false,
  resumeWay,
}: {
  runs: RunView[];
  kbParked?: boolean;
  /** The paused mine's way back, from the header summary: a calm KB pause badge is not a warning. */
  resumeWay?: ResumeWay;
}) => {
  const [open, setOpen] = useState(false);
  if (runs.length === 0) return null;
  return (
    <div className="pt-2 border-t">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 px-0 h-6 text-xs text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Recent checks and mining ({runs.length})
      </Button>
      {open && (
        <ul className="mt-1 space-y-1" data-testid="recent-runs">
          {runs.map((run) => {
            const status = runStatus(run, kbParked);
            return (
              <li key={run.id} className="flex gap-2 justify-between items-center text-[11px]">
                <span className="font-mono text-muted-foreground">
                  {formatRunTime(run.startedAt)}
                </span>
                <span className="flex-1 truncate">
                  {run.channel === 'kb' && notContinuedReason(run)
                    ? `KB mining · paused mining not continued: ${notContinuedReason(run)}`
                    : isKbErrorBeforeReading(run)
                      ? 'KB mining · stopped on an error before reading any conversation'
                      : run.channel === 'kb'
                        ? `KB mining · ${(run.kbThreadsDone ?? 0).toLocaleString()} of ${(run.kbThreads ?? 0).toLocaleString()} conversations · ${(run.kbPairsSaved ?? 0).toLocaleString()} Q&A${(run.kbDocumentsSaved ?? 0) > 0 ? ` · ${plural(run.kbDocumentsSaved ?? 0, 'document', 'documents')}` : ''}`
                        : status === 'running'
                          ? `going through ${run.found.toLocaleString()}`
                          : run.outcome === 'running'
                            ? `${run.found.toLocaleString()} to go through, stopped`
                            : `${run.found.toLocaleString()} found · ${run.saved.toLocaleString()} saved${
                                run.failed > 0 ? ` · ${run.failed.toLocaleString()} failed` : ''
                              }`}
                </span>
                <Badge
                  size="sm"
                  variant={runStatusVariant(run, status, hasLaterKbRun(run, runs), resumeWay)}
                >
                  {runStatusLabel(run, kbParked)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
