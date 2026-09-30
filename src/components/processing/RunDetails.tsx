import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import type { RunStageCount, RunView } from '@/services/importProgress.service';
import {
  describePause,
  formatDuration,
  formatRunTime,
  plural,
  runStatusLabel,
  RUN_STATUS_VARIANT,
  runStatus,
} from './processingWords';

type StageKey = 'decided' | 'analysis' | 'embedding' | 'kb';

/**
 * The same names and units as the import panel (ImportProgressPanel): analysis and checking count
 * messages, the search index and knowledge-base mining count conversations.
 */
const STAGES: { key: StageKey; label: string; unit: [string, string]; hint: string }[] = [
  {
    key: 'decided',
    label: 'Checked',
    unit: ['message', 'messages'],
    hint: 'Each incoming message checked: spam check and routing, or set aside for the knowledge base',
  },
  {
    key: 'analysis',
    label: 'AI analysis',
    unit: ['message', 'messages'],
    hint: 'AI analysis of each incoming message',
  },
  {
    key: 'embedding',
    label: 'Search index',
    unit: ['conversation', 'conversations'],
    hint: 'Each conversation indexed for similar-message search',
  },
  {
    key: 'kb',
    label: 'Knowledge base',
    unit: ['conversation', 'conversations'],
    hint: 'Each conversation mined for knowledge-base answers',
  },
];

const StageRow = ({
  label,
  hint,
  count,
}: {
  label: string;
  hint: string;
  count: RunStageCount;
}) => {
  const pct = count.queued > 0 ? Math.min(100, Math.floor((count.done / count.queued) * 100)) : 0;
  return (
    <div className="space-y-1" title={hint} data-testid="run-stage">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {count.done.toLocaleString()} / {count.queued.toLocaleString()}
        </span>
      </div>
      <Progress
        value={pct}
        size="sm"
        variant={count.done >= count.queued ? 'success' : 'default'}
      />
    </div>
  );
};

/**
 * One recorded run: its stages over exactly the messages it saved, then the facts the old tiles
 * carried (found, failed, paused, skipped as duplicates, linked replies, timing) as sentences that
 * stay true in every state the run can be in.
 */
/**
 * A knowledge-base mine (KB switched on, the history sweep, a re-mine): it reads conversations
 * already in Odly and saves Q&A pairs — it finds and saves no mail, so none of a mail check's
 * sentences are true of it. Its numbers are its own record's (support-service kbRunLedger).
 */
const KbRunDetails = ({ run }: { run: RunView }) => {
  const status = runStatus(run);
  const threads = run.kbThreads ?? 0;
  const threadsDone = run.kbThreadsDone ?? 0;
  const pairs = run.kbPairsSaved ?? 0;
  const documents = run.kbDocumentsSaved ?? 0;
  const count = run.stages?.kb;
  return (
    <div className="space-y-2.5" data-testid="run-details">
      <div className="flex gap-2 justify-between items-center">
        <span className="text-xs font-medium">
          Knowledge-base mining {status === 'running' ? 'since' : 'at'}{' '}
          {formatRunTime(run.startedAt)}
        </span>
        <Badge size="sm" variant={RUN_STATUS_VARIANT[status]}>
          {runStatusLabel(run)}
        </Badge>
      </div>
      {count && count.queued > 0 && (
        <StageRow label="Conversations read" hint={STAGES[3].hint} count={count} />
      )}
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {status === 'running' ? (
          <li>
            Reading {plural(threads, 'conversation', 'conversations')} (
            {plural(run.found, 'message', 'messages')}) for Q&A pairs.
            {pairs > 0 ? ` ${plural(pairs, 'new Q&A pair', 'new Q&A pairs')} saved so far.` : ''}
            {documents > 0 ? ` ${plural(documents, 'document', 'documents')} saved so far.` : ''}
          </li>
        ) : (
          <li>
            {run.failed > 0 ? 'Went through' : 'Read'} {threadsDone.toLocaleString()} of{' '}
            {plural(threads, 'conversation', 'conversations')} (
            {plural(run.found, 'message', 'messages')});{' '}
            {plural(pairs, 'new Q&A pair', 'new Q&A pairs')}
            {documents > 0 ? ` and ${plural(documents, 'document', 'documents')}` : ''} saved.
          </li>
        )}
        {run.failed > 0 && (
          // Automatic only while the history sweep is still owed — so the words name the way that
          // always works (FE audit pass 6, L5).
          <li className="text-destructive">
            {plural(run.failed, 'conversation', 'conversations')} could not be mined. Re-mine the
            mailbox to read {run.failed === 1 ? 'it' : 'them'} again.
          </li>
        )}
        {status === 'error' && (
          <li className="text-destructive">
            The mine stopped on an error. Re-mine the mailbox to try again.
          </li>
        )}
        {status === 'interrupted' && (
          <li className="text-warning">
            This mine stopped before it finished (for example on a restart).
          </li>
        )}
        {run.processMs !== null && status !== 'running' && (
          <li>Took {formatDuration(run.processMs)}.</li>
        )}
      </ul>
    </div>
  );
};

export const RunDetails = ({ run }: { run: RunView }) => {
  if (run.channel === 'kb') return <KbRunDetails run={run} />;
  return <MailRunDetails run={run} />;
};

const MailRunDetails = ({ run }: { run: RunView }) => {
  const status = runStatus(run);
  // A stage nothing was queued for (AI off, no KB mining) is not shown as a finished 0 / 0.
  const stages = run.stages
    ? STAGES.filter((stage) => (run.stages?.[stage.key].queued ?? 0) > 0)
    : [];
  const pause = describePause(run);
  const timingParts = [
    run.fetchMs !== null ? `fetched in ${formatDuration(run.fetchMs)}` : null,
    run.processMs !== null ? `processed in ${formatDuration(run.processMs)}` : null,
  ].filter((part): part is string => part !== null);
  const timing = timingParts.length
    ? `${timingParts.join(', ').charAt(0).toUpperCase()}${timingParts.join(', ').slice(1)}`
    : null;
  const kbTotal = run.kbEntries ? run.kbEntries.qaPairs + run.kbEntries.documents : 0;
  return (
    <div className="space-y-2.5" data-testid="run-details">
      <div className="flex gap-2 justify-between items-center">
        <span className="text-xs font-medium">
          {status === 'running' ? 'Checking since' : 'Last check'} {formatRunTime(run.startedAt)}
        </span>
        <Badge size="sm" variant={RUN_STATUS_VARIANT[status]}>
          {runStatusLabel(run)}
        </Badge>
      </div>
      {stages.map((stage) => (
        <StageRow
          key={stage.key}
          label={stage.label}
          hint={stage.hint}
          count={(run.stages as NonNullable<RunView['stages']>)[stage.key]}
        />
      ))}
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {run.outcome === 'running' && status !== 'running' ? (
          // Left `running`: its saved count was never written (FE audit pass 3, H-B).
          <li>
            Set out to go through {plural(run.found, 'message', 'messages')}; what it saved was not
            recorded.
          </li>
        ) : status === 'running' ? (
          // The record's saved/duplicates are written only when the run ends (support-service
          // runLedger.beginRun writes 0s) and its stages have no ids until then: "0 saved" would
          // be read as a count (FE audit pass 2, H2). IMAP's number is its search hits, before
          // duplicates are known — "going through", not "new".
          <li>
            Going through {plural(run.found, 'message', 'messages')}. What was saved, and the
            stages, show when this check ends.
          </li>
        ) : (
          <li>
            {plural(run.found, 'new message', 'new messages')} found, {run.saved.toLocaleString()}{' '}
            saved
            {run.duplicates !== null && run.duplicates > 0
              ? `, ${run.duplicates.toLocaleString()} already in Odly`
              : ''}
            .
          </li>
        )}
        {run.failed > 0 && (
          <li className="text-destructive">
            {plural(run.failed, 'message', 'messages')} could not be saved; the next check fetches{' '}
            {run.failed === 1 ? 'it' : 'them'} again.
          </li>
        )}
        {pause && <li className="text-warning">{pause}</li>}
        {status === 'error' && (
          <li className="text-destructive">
            The check stopped on an error. The next check tries again.
          </li>
        )}
        {status === 'interrupted' && (
          <li className="text-warning">
            This check stopped before it finished (for example on a restart).
          </li>
        )}
        {run.problems.includes('stalled') && (
          <li className="text-warning">Work is left, and this check ended over 30 minutes ago.</li>
        )}
        {run.stages && run.stages.awaitingRouting > 0 && (
          <li>
            {plural(run.stages.awaitingRouting, 'message is', 'messages are')} waiting for someone
            to route {run.stages.awaitingRouting === 1 ? 'it' : 'them'} to a department.
          </li>
        )}
        {run.linked > 0 && (
          <li>{plural(run.linked, 'reply', 'replies')} linked to existing tickets.</li>
        )}
        {run.kbEntries && kbTotal > 0 && (
          <li>
            Knowledge base: {plural(kbTotal, 'entry', 'entries')} from these messages (
            {run.kbEntries.qaPairs.toLocaleString()} Q&A, {run.kbEntries.documents.toLocaleString()}{' '}
            docs).
          </li>
        )}
        {timing && <li>{timing}.</li>}
      </ul>
    </div>
  );
};
