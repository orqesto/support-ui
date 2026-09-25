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
  decided:
    'Each incoming message sorted: spam check and routing, or set aside for the knowledge base',
  analysis: 'AI analysis of each incoming message',
  embedding: 'Each conversation indexed for similar-message search',
  kb: 'Each conversation mined for knowledge-base answers',
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

/**
 * What each stage counts: analysis and sorting are per message, the index and knowledge-base
 * mining per conversation (one vector per thread; a mine reads the whole thread). The note must
 * name the unit the number is in (audit pass 3).
 */
const STAGE_UNIT: Record<ImportStage, [one: string, many: string]> = {
  imported: ['message', 'messages'],
  decided: ['message', 'messages'],
  analysis: ['message', 'messages'],
  embedding: ['conversation', 'conversations'],
  kb: ['conversation', 'conversations'],
};

/** How a stage's unfinished work is named in the "did not complete" note. */
const STAGE_UNDONE: Record<ImportStage, string> = {
  imported: 'imported',
  decided: 'sorted',
  analysis: 'analysed',
  embedding: 'indexed',
  kb: 'mined for the knowledge base',
};

/** The one line that says when it ends: never a number the rate has not earned. */
export const describeEta = (eta: StageEta): string => {
  switch (eta.state) {
    case 'done':
      return 'Finished';
    case 'estimating':
      return 'Measuring the rate. An estimate needs 5 minutes of progress.';
    case 'stalled':
      // Both windows (5 and 15 minutes) finished nothing: the claim is 15 minutes.
      return eta.stage
        ? `No progress in ${STAGE_LABEL[eta.stage]} for 15 minutes, so the finish time is unknown`
        : 'No progress for 15 minutes, so the finish time is unknown';
    case 'unknown':
      return 'Finish time unknown: the mailbox holds more messages than were counted';
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
  if (progress.total === 0) {
    return <p className="text-xs text-muted-foreground">Nothing to import.</p>;
  }
  const leftovers = progress.stages.filter((stage) => (stage.leftover ?? 0) > 0);
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
        {leftovers.map((stage) => (
          <li key={stage.stage}>
            {(stage.leftover ?? 0).toLocaleString()}{' '}
            {stage.leftover === 1
              ? `${STAGE_UNIT[stage.stage][0]} was`
              : `${STAGE_UNIT[stage.stage][1]} were`}{' '}
            not {STAGE_UNDONE[stage.stage]}: nothing is left in the queue to do it.
          </li>
        ))}
        {progress.unrecorded > 0 && (
          <li>
            {progress.unrecorded.toLocaleString()} message
            {progress.unrecorded === 1 ? ' was' : 's were'} sorted before Odly recorded this work:
            counted as imported and checked, not in the stages after that.
          </li>
        )}
        {progress.stages.some((stage) => stage.projected) && (
          <li>~ totals are estimates until every message has been imported and sorted.</li>
        )}
      </ul>
    </div>
  );
};
