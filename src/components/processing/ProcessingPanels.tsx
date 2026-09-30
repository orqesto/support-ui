import { useEffect } from 'react';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import { sessionRunning } from '@/hooks/useImportProgress';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { ProcessingSummaryEntry } from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { ProcessingPanel } from './ProcessingPanel';

/** A socket session with no event for this long is not treated as live. */
const SESSION_SILENT_MS = 20 * 60_000;

/** What the summary says of one source: a change is when a panel off screen asks again. */
const summaryKeyOf = (entry: ProcessingSummaryEntry | undefined): string =>
  entry ? `${entry.inProgress}:${entry.problems}:${entry.countCapped}:${entry.unavailable}` : '';

/**
 * Mounts one processing panel per mail source that may need one. Each panel decides from the
 * DATABASE whether it shows (ProcessingPanel): a recorded run of 20+ still running, a problem the
 * person has not closed, or the person opened it. Mounted here:
 * - sources the person opened (the header indicator, a re-mine);
 * - sources the summary counts problems for;
 * - sources being WATCHED — the summary counts a run in progress, or the socket says a fetch is
 *   live — so a big run is seen within a poll of its record being written. The socket only says
 *   where to look; it never decides what is shown.
 * A small routine run opens nothing: it is a count on the indicator.
 *
 * Panels stack in one column at the bottom right (a sheet at the bottom on a phone), so a panel
 * never lands on a page's controls and none needs its slot computed; a dragged one keeps its place.
 */
export const ProcessingPanels = ({
  organizationId,
  sessions,
  summary,
}: {
  organizationId: number;
  sessions: Map<string, ProcessingSession>;
  summary: ProcessingSummaryEntry[];
}) => {
  const opened = useProcessingPanelStore((state) => state.opened);
  const enterWorkspace = useProcessingPanelStore((state) => state.enterWorkspace);
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    enterWorkspace(organizationId);
  }, [organizationId, enterWorkspace]);

  const sessionBySource = new Map<number, ProcessingSession>();
  for (const session of sessions.values()) sessionBySource.set(session.integrationId, session);
  const summaryBySource = new Map(summary.map((entry) => [entry.sourceId, entry]));
  // Watched at the fast pace: a mail fetch live on the socket right now. A source that only OWES
  // work (the summary's inProgress — often every mailbox of a busy workspace, for hours of KB
  // mining) is mounted at the slow pace: 15-s polls of all of them per tab were real load (FE
  // audit pass 5, M5). A session silent for 20 min is not live (pass 5, L1).
  const now = Date.now();
  const watched = new Set(
    [...sessions.values()]
      .filter(
        (session) =>
          sessionRunning(session) &&
          now - (session.updatedAt ?? session.timestamp ?? 0) < SESSION_SILENT_MS
      )
      .map((session) => session.integrationId)
  );

  const sourceIds = [
    ...new Set([
      ...Object.keys(opened).map(Number),
      ...summary
        .filter((entry) => entry.problems > 0 || entry.inProgress > 0)
        .map((entry) => entry.sourceId),
      ...watched,
    ]),
  ].sort((left, right) => left - right);

  if (sourceIds.length === 0) return null;

  return (
    <div
      className={
        isMobile
          ? 'flex fixed inset-x-0 bottom-0 z-50 flex-col-reverse pointer-events-none'
          : 'flex fixed right-4 bottom-4 z-50 flex-col-reverse gap-3 items-end pointer-events-none'
      }
    >
      {sourceIds.map((sourceId) => {
        const session = sessionBySource.get(sourceId);
        return (
          <ProcessingPanel
            key={`${organizationId}:${sourceId}`}
            organizationId={organizationId}
            sourceId={sourceId}
            name={summaryBySource.get(sourceId)?.name ?? session?.integrationName ?? 'Mailbox'}
            session={session}
            watched={watched.has(sourceId)}
            summaryKey={summaryKeyOf(summaryBySource.get(sourceId))}
          />
        );
      })}
    </div>
  );
};
