import { AlertTriangle, HelpCircle, Loader2, PauseCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatUtcAndLocal, formatUtcDateAndLocal, pausePhase, resumePhase } from '@/lib/utcClock';
import type { ProcessingSummaryEntry } from '@/services/importProgress.service';
import { kbFullHeldLine } from '@/components/settings/integrations/kbRangeCopy';
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
  // BE round 21: mail runs whose only owed KB work may be held by the daily KB limit and that cannot
  // be told (`kbStateUnknown`) — in none of inProgress / pausedByLimit / problems. Said calmly.
  const kbUnknown = entries.reduce((sum, entry) => sum + (entry.kbStateUnknown ?? 0), 0);
  // BE-6: mail runs whose only owed work a full knowledge base holds — in neither inProgress nor
  // problems. Said calmly, with the way out in the panel.
  const kbFullHeld = entries.reduce((sum, entry) => sum + (entry.kbFullHeld ?? 0), 0);
  // KB-limit pauses are counted apart from `problems` (`pausedByLimit`): the source's paused MINE and
  // the mail runs whose only owed work the KB limit holds. Each resume time is ahead, RESUMING
  // (passed, inside the backend's wake window `resumeWindowEnd` — the backend spreads resumes up to
  // 30 min after the reset, FE audit pass 17, MED) or late — only late warns like a problem (the
  // panel agrees). A mine waiting for a re-mine slot is waiting its turn, never late; one a limit
  // release queued is "queued to continue".
  const now = Date.now();
  // `stuck` (pausePhase): past the reset, a counted mine has no resume queued (`resumeQueued:
  // false`) — it will not come back by itself. That is the MINE only: the entry's other pauses
  // (held mail runs) keep the phase of their own time (FE audit pass 18, LOW).
  type Bucket = NonNullable<ReturnType<typeof pausePhase>>;
  const counts = new Map<Bucket, number>();
  const bucketEntries = new Map<Bucket, ProcessingSummaryEntry[]>();
  const add = (bucket: Bucket, amount: number, entry: ProcessingSummaryEntry) => {
    if (amount <= 0) return;
    counts.set(bucket, (counts.get(bucket) ?? 0) + amount);
    bucketEntries.set(bucket, [...(bucketEntries.get(bucket) ?? []), entry]);
  };
  for (const entry of entries) {
    const amount = entry.pausedByLimit ?? 0;
    if (amount <= 0) continue;
    // Held mail runs: their parked KB jobs wake by themselves over the spread, and the backend
    // drops a held run from the count at its window end — until the next poll one may still be
    // counted past it. That is resuming, never a late "knowledge-base mine" with a warning (pass
    // 22, LOW): only a mine is ever late.
    const timePhase = resumePhase(entry.pausedUntil, now, entry.resumeWindowEnd) ?? 'ahead';
    const byTime = timePhase === 'late' ? 'resuming' : timePhase;
    // The mine is judged by its OWN pause, not the latest of all — a stuck mine hid behind a held
    // mail run whose pause is still ahead (FE audit pass 18 leftover). The way back (queued / slot
    // / resume queued / admitted) is the mine's only; the other pauses keep their time. Its line
    // names the mine's own time. No paused mine: every count is a held mail run.
    const mineUntil = entry.minePausedUntil;
    if (!mineUntil) {
      add(byTime, amount, entry);
      continue;
    }
    const mine = { ...entry, pausedUntil: mineUntil, resumeWindowEnd: entry.mineResumeWindowEnd };
    add(pausePhase(mineUntil, now, mine) ?? 'ahead', 1, mine);
    add(byTime, amount - 1, entry);
  }
  const pausedDue = bucketEntries.get('ahead') ?? [];
  const pausedResuming = bucketEntries.get('resuming') ?? [];
  const pausedLate = bucketEntries.get('late') ?? [];
  const paused = counts.get('ahead') ?? 0;
  const resuming = counts.get('resuming') ?? 0;
  const late = counts.get('late') ?? 0;
  const stuck = counts.get('stuck') ?? 0;
  // The way-back buckets (waiting for a slot, admitted, release-queued, stuck) and `late` hold only
  // the source's MINE (one per mailbox): held mail runs keep the phase of their time, mapped to
  // ahead or resuming above. So those lines are worded as mines, never as every count (pass 18,
  // NIT + LOW; pass 22, NIT).
  const waiting = counts.get('waiting') ?? 0;
  // BE R20: a resume admitted the mine — it is starting now, whatever its time (pass 20, LOW).
  const admitted = counts.get('admitted') ?? 0;
  const queued = counts.get('queued') ?? 0;
  if (
    inProgress === 0 &&
    problems === 0 &&
    unreadable === 0 &&
    paused === 0 &&
    resuming === 0 &&
    late === 0 &&
    stuck === 0 &&
    waiting === 0 &&
    admitted === 0 &&
    queued === 0 &&
    kbUnknown === 0 &&
    kbFullHeld === 0
  ) {
    return null;
  }
  // Older runs were left uncounted: every number here is a floor.
  const floor = entries.some((entry) => entry.countCapped) ? '+' : '';
  // "1+ mail checks", never "1 mail check+": the floor belongs to the number, and a floor is plural.
  const count = (amount: number, one: string, many: string) =>
    floor ? `${amount.toLocaleString()}${floor} ${many}` : plural(amount, one, many);
  const lines = [
    inProgress > 0
      ? `${count(inProgress, 'mail check or mine', 'mail checks or mines')} still processing`
      : null,
    problems > 0 ? `${count(problems, 'problem', 'problems')} to look at` : null,
    // `pausedByLimit` counts mail runs whose only owed work the KB limit holds too, not only mines.
    paused > 0 ? describeLimitPause(paused, pausedDue, count, !!floor) : null,
    resuming > 0
      ? `${count(resuming, 'mail check or mine', 'mail checks or mines')} paused at the daily AI limit; resuming after ${
          latestOf(pausedResuming, formatUtcAndLocal) ?? 'the daily reset'
        }`
      : null,
    // Past the grace: said with its DATE — a stale record's time may be days old (pass 17, NIT).
    // Only a mine is ever late: a held mail run past its window end is counted as resuming above.
    late > 0
      ? `${count(late, 'knowledge-base mine', 'knowledge-base mines')} paused at the daily AI limit; ${
          late === 1 && !floor ? 'it was due to resume at' : 'they were due to resume at'
        } ${latestOf(pausedLate, formatUtcDateAndLocal) ?? 'the daily reset'} and ${
          late === 1 && !floor ? 'has' : 'have'
        } not resumed yet`
      : null,
    // One mine per mailbox is counted, so many stuck mines are many mailboxes. The way out is said
    // with it, as the panel says it (pass 19, NIT).
    stuck > 0
      ? `${plural(stuck, 'knowledge-base mine', 'knowledge-base mines')} paused at the daily AI limit ${
          stuck === 1 ? 'has' : 'have'
        } no resume queued and will not continue by ${stuck === 1 ? 'itself' : 'themselves'}; ${
          stuck === 1 ? 're-mine the mailbox' : 're-mine those mailboxes'
        } to continue`
      : null,
    waiting > 0
      ? `${plural(waiting, 'knowledge-base mine', 'knowledge-base mines')} paused at the daily AI limit ${
          waiting === 1 ? 'is' : 'are'
        } due to continue and ${waiting === 1 ? 'waits' : 'wait'} for a free slot`
      : null,
    // One mine per mailbox, as the stuck line.
    admitted > 0
      ? `${plural(admitted, 'knowledge-base mine', 'knowledge-base mines')} paused at the daily AI limit ${
          admitted === 1 ? 'is' : 'are'
        } resuming now`
      : null,
    // A release follows any limit save that leaves nothing pausing (raised, cleared, own-key
    // enforcement off): no cause is claimed, as the bell does (FE audit pass 18, LOW).
    queued > 0
      ? `${plural(queued, 'knowledge-base mine', 'knowledge-base mines')} paused at the daily AI limit; a limit setting changed and ${
          queued === 1 ? 'it is' : 'they are'
        } queued to continue`
      : null,
    kbUnknown > 0
      ? `${count(kbUnknown, 'mail check', 'mail checks')} with knowledge-base processing not moving; whether the daily KB limit is holding it is not known`
      : null,
    kbFullHeld > 0 ? kbFullHeldLine(kbFullHeld) : null,
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
              .filter(
                (entry) =>
                  entry.inProgress > 0 ||
                  entry.problems > 0 ||
                  entry.unavailable ||
                  (entry.pausedByLimit ?? 0) > 0 ||
                  (entry.kbStateUnknown ?? 0) > 0 ||
                  (entry.kbFullHeld ?? 0) > 0
              )
              .map((entry) => entry.sourceId)
          )
        }
      >
        {problems > 0 || late > 0 || stuck > 0 ? (
          <AlertTriangle className="w-4 h-4 text-warning" />
        ) : inProgress > 0 ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : paused + resuming + waiting + admitted + queued > 0 && unreadable === 0 ? (
          <PauseCircle
            className="w-4 h-4 text-muted-foreground"
            data-testid="processing-indicator-paused"
          />
        ) : kbFullHeld > 0 && unreadable === 0 ? (
          <PauseCircle
            className="w-4 h-4 text-muted-foreground"
            data-testid="processing-indicator-kb-full"
          />
        ) : kbUnknown > 0 && unreadable === 0 ? (
          <HelpCircle
            className="w-4 h-4 text-muted-foreground"
            data-testid="processing-indicator-kb-unknown"
          />
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

/** The latest resume time of these entries, in `format`; null when none. */
const latestOf = (
  list: ProcessingSummaryEntry[],
  format: (iso: string | undefined) => string | null
): string | null =>
  format(
    list
      .map((entry) => entry.pausedUntil ?? null)
      .filter((at): at is string => at !== null)
      .sort()
      .at(-1)
  );

/**
 * "1 knowledge-base mine paused at today’s AI limit; it resumes by itself after 00:00 UTC (…), or
 * sooner once the limit is raised". Not "from": raising the limit queues the resume at once (the
 * bell then says so), and the run record stays paused until that mine starts (pass 17, LOW). The
 * verb agrees with the count, as the late line does (pass 17, NIT).
 */
const describeLimitPause = (
  amount: number,
  list: ProcessingSummaryEntry[],
  count: (amount: number, one: string, many: string) => string,
  floor: boolean
): string => {
  const at = latestOf(list, formatUtcAndLocal);
  const they = amount === 1 && !floor ? 'it resumes by itself' : 'they resume by themselves';
  return `${count(amount, 'mail check or mine', 'mail checks or mines')} paused at today’s AI limit; ${they} after ${
    at ?? 'the daily reset'
  }, or sooner once the limit is raised`;
};
