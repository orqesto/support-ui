import { Progress } from '@/components/ui/Progress';
import { Spinner } from '@/components/ui/Spinner';
import { formatUtcAndLocal, formatUtcDateAndLocal, resumePhase } from '@/lib/utcClock';
import type {
  ImportStage,
  StageEta,
  StageProgress,
  TrackedImport,
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
    'Each incoming message checked: spam check and routing, or set aside for the knowledge base',
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
  decided: 'checked',
  analysis: 'analysed',
  embedding: 'indexed',
  kb: 'mined for the knowledge base',
};

/** "for KB processing" — what a daily-limit pause holds back. */
const PAUSED_FOR: Record<ImportStage, string> = {
  imported: ' for importing',
  decided: ' for checking',
  analysis: ' for AI analysis',
  embedding: ' for search indexing',
  kb: ' for KB processing',
};

/**
 * The one line that says when it ends: never a number the rate has not earned. `now` decides
 * whether a pause's resume time is still to come (it is said as past once it has passed).
 */
export const describeEta = (eta: StageEta, now: number = Date.now()): string => {
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
      // BE round 20: an unreadable limit is not a capped listing. No reason (an older backend,
      // whose only unknown was the capped listing) keeps the capped words.
      if (eta.reason === 'limit_unreadable') {
        // The whole daily KB limit check failed (the setting, today's spend or whether it is
        // enforced) — not just the setting (pass 21, NIT).
        return `Finish time unknown: the daily KB limit could not be checked, so whether it holds the work${eta.stage ? PAUSED_FOR[eta.stage] : ''} is not known`;
      }
      // BE round 21: the KB work is not moving and whether the daily KB limit holds it could not be
      // told (the queue's parked jobs were not read in full) — never finished, stalled or paused.
      if (eta.reason === 'pause_unknown') {
        return `Finish time unknown: the work${eta.stage ? PAUSED_FOR[eta.stage] : ''} is not moving, and whether the daily KB limit is holding it is not known`;
      }
      return 'Finish time unknown: the mailbox holds more messages than were counted';
    case 'paused': {
      // BE R16: parked by a daily AI token limit until the reset — not stalled, not finished.
      // Passed but within RESUME_GRACE_MS: parked jobs wake over a 30-min spread after the reset —
      // continuing, not late (FE audit pass 17, P17-F1). Late is said with its date (pass 17, NIT).
      const what = eta.stage ? PAUSED_FOR[eta.stage] : '';
      const at = formatUtcAndLocal(eta.until);
      // BE R17: `resumeWindowEnd` ends the wake spread exactly (an older backend: the grace).
      const phase = resumePhase(eta.until, now, eta.resumeWindowEnd);
      if (!at || phase === null) {
        return `Paused at today’s AI limit${what} — continues after the daily reset`;
      }
      if (phase === 'late') {
        return `Paused at the daily AI limit${what}; it was due to continue at ${formatUtcDateAndLocal(eta.until)}`;
      }
      if (phase === 'resuming')
        return `Paused at the daily AI limit${what}; continuing after ${at}`;
      return `Paused at today’s AI limit${what} — continues from ${at}`;
    }
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
      {/* No bar against a floor: a full one read as finished at "36 / 500+" (staging,
          2026-09-25), and a share of the floor overstates how far the import has got. */}
      {!floor && (
        <Progress
          value={pct}
          size="sm"
          variant={stage.eta.state === 'done' ? 'success' : 'default'}
        />
      )}
    </div>
  );
};

/**
 * Where a Gmail import stands, from the database. Replaces the widget's socket-driven numbers
 * for a Gmail source: those came from per-process counters that a restart reset and two trackers
 * overwrote in turn (petro, 2026-09-25: "0 / 2173 · 0%" and "50 / 51 · 98%" a minute apart, then
 * "Complete" with ~2,100 still to import).
 */
export const ImportProgressPanel = ({ data }: { data: TrackedImport }) => {
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
  // A capped 0 is a floor (the first page came back empty and the next was refused), not an empty
  // mailbox (independent audit, pass 7).
  if (progress.total === 0 && !progress.capped) {
    return <p className="text-xs text-muted-foreground">Nothing to import.</p>;
  }
  const leftovers = progress.stages.filter((stage) => (stage.leftover ?? 0) > 0);
  // The one eta line names ONE stage. A stage paused at a limit while the overall line says
  // something else (BE R17: stalled > unknown > estimating > running > paused) was said nowhere;
  // and an overall pause
  // hid how the stages still moving are doing (FE audit pass 17, queued + BE LOW 3).
  const overall = progress.eta;
  // A stage whose hold by the limit is not known (BE round 20 `limit_unreadable`, round 21
  // `pause_unknown`) under an overall line that says something else (a capped listing outranks it)
  // was said nowhere — it is said on its own, naming the stage.
  const kbReasonOf = (eta: StageEta) =>
    eta.state === 'unknown' && (eta.reason === 'limit_unreadable' || eta.reason === 'pause_unknown')
      ? eta.reason
      : null;
  const unreadable = (eta: StageEta) => kbReasonOf(eta) !== null;
  const ownLine = (eta: StageEta) => eta.state === 'paused' || unreadable(eta);
  const stageLines = progress.stages
    .filter((stage) =>
      overall.state === 'paused'
        ? stage.stage !== overall.stage && stage.eta.state !== 'done'
        : stage.eta.state === 'paused' ||
          (unreadable(stage.eta) && kbReasonOf(stage.eta) !== kbReasonOf(overall))
    )
    .map((stage) =>
      ownLine(stage.eta)
        ? `${describeEta({ ...stage.eta, stage: stage.stage } as StageEta)}.`
        : `${STAGE_LABEL[stage.stage]}: ${describeEta(stage.eta)}.`
    );
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium" data-testid="import-eta">
        {describeEta(progress.eta)}
      </p>
      {progress.stages.map((stage) => (
        <StageRow key={stage.stage} stage={stage} capped={progress.capped} />
      ))}
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {stageLines.map((line) => (
          <li key={line} data-testid="import-stage-eta">
            {line}
          </li>
        ))}
        {progress.capped &&
          (run.countingOn ? (
            <li>
              {progress.total.toLocaleString()} messages counted so far; counting carries on in the
              background.
            </li>
          ) : (
            <li>
              Counting stopped at {progress.total.toLocaleString()} messages; the mailbox holds at
              least that many.
            </li>
          ))}
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
            {progress.unrecorded === 1 ? ' was' : 's were'} checked before Odly recorded this work:
            counted as imported and checked, not in the stages after that.
          </li>
        )}
        {progress.stages.some((stage) => stage.projected) && (
          <li>~ totals are estimates until every message has been imported and checked.</li>
        )}
      </ul>
    </div>
  );
};
