import { Progress } from '@/components/ui/Progress';
import { Spinner } from '@/components/ui/Spinner';
import type {
  ImportProgress,
  ImportStage,
  StageEta,
  StageProgress,
} from '@/services/importProgress.service';

const STAGE_LABEL: Record<ImportStage, string> = {
  imported: 'Imported',
  decided: 'Checked',
  analysis: 'AI analysis',
  embedding: 'Search index',
  kb: 'Knowledge base',
};

const STAGE_HINT: Record<ImportStage, string> = {
  imported: 'Messages from the mailbox stored in Odly',
  decided: 'Spam check and routing, done for every incoming message',
  analysis: 'AI analysis of each conversation',
  embedding: 'Indexed for similar-message search',
  kb: 'Mined for knowledge-base answers',
};

/** "45 min", "3 h 20 min", "2 d 4 h". */
export const formatMinutes = (minutes: number): string => {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = Math.round(minutes - hours * 60);
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours - days * 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
};

/** The one line that says when it ends — never a number the rate has not earned. */
export const describeEta = (eta: StageEta): string => {
  switch (eta.state) {
    case 'done':
      return 'Finished';
    case 'estimating':
      return 'Measuring the rate. An estimate needs 5 minutes of progress.';
    case 'stalled':
      return 'No progress in the last 5 minutes';
    case 'running':
      if (eta.maxMinutes === null) return `At least ${formatMinutes(eta.minMinutes)} left`;
      if (eta.maxMinutes <= eta.minMinutes) return `About ${formatMinutes(eta.minMinutes)} left`;
      return `${formatMinutes(eta.minMinutes)} – ${formatMinutes(eta.maxMinutes)} left`;
  }
};

const StageRow = ({ stage, capped }: { stage: StageProgress; capped: boolean }) => {
  // A capped listing's total is a floor: the count past it is real, a percentage of it is not.
  const floor = stage.stage === 'imported' && capped;
  const pct = stage.total > 0 ? Math.min(100, Math.floor((stage.done / stage.total) * 100)) : 0;
  const totalText = `${stage.projected ? '~' : ''}${stage.total.toLocaleString()}${floor ? '+' : ''}`;
  return (
    <div className="space-y-1" title={STAGE_HINT[stage.stage]}>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{STAGE_LABEL[stage.stage]}</span>
        <span className="font-mono">
          {stage.done.toLocaleString()} / {totalText}
          <span className="ml-2 text-muted-foreground">{floor ? '—' : `${pct}%`}</span>
        </span>
      </div>
      <Progress
        value={floor ? 100 : pct}
        size="sm"
        variant={stage.eta.state === 'done' ? 'success' : 'default'}
      />
    </div>
  );
};

/**
 * Where a Gmail import stands, from the database. Replaces the widget's socket-driven numbers
 * for a Gmail source: those came from per-process counters that a restart reset and two trackers
 * overwrote in turn (taco, 2026-09-25: "0 / 2173 · 0%" and "50 / 51 · 98%" a minute apart, then
 * "Complete" with ~2,100 still to import).
 */
export const ImportProgressPanel = ({
  data,
}: {
  data: Extract<ImportProgress, { tracked: true }>;
}) => {
  const { run, progress } = data;
  if (run.state === 'counting') {
    return (
      <p className="flex gap-2 items-center text-xs text-muted-foreground">
        <Spinner size={12} />
        Counting the messages in the mailbox…
      </p>
    );
  }
  if (run.state === 'failed' || !progress) {
    return (
      <p className="text-xs text-warning">
        {run.error ?? 'Could not count the mailbox.'} Progress will show once it has been counted.
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium" data-testid="import-eta">
        {describeEta(progress.eta)}
      </p>
      {progress.stages.map((stage) => (
        <StageRow key={stage.stage} stage={stage} capped={progress.capped} />
      ))}
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {progress.capped && (
          <li>
            Counting stopped at {progress.total.toLocaleString()} messages; the mailbox holds at
            least that many.
          </li>
        )}
        {progress.drained && progress.notStored > 0 && (
          <li>
            {progress.notStored.toLocaleString()} listed message
            {progress.notStored === 1 ? ' was' : 's were'} not stored: usually sent copies kept
            inside their reply, or mail deleted from the mailbox during the import.
          </li>
        )}
        {progress.awaitingRouting > 0 && (
          <li>
            {progress.awaitingRouting.toLocaleString()} waiting for someone to route them to a
            department.
          </li>
        )}
        {progress.stages.some((stage) => stage.projected) && (
          <li>~ totals are estimated from what has been imported so far.</li>
        )}
      </ul>
    </div>
  );
};
