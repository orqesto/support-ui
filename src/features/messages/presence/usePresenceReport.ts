/**
 * Report this tab's state on threads WITHOUT watching them (spec §5.1): the ticket reply composer,
 * whose text lives below the ticket view that watches the ticket's threads (TicketDetail). The
 * server takes `presence:state` only for threads this socket watches, so a thread no watcher holds
 * right now (beyond the ticket's watch cap, a watch that failed, a disconnect) is skipped; the
 * state goes out as soon as one does. Sends no watch and no unwatch, so it can never undo the
 * watcher's. Global admins report nothing (usePresenceReporter).
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { presenceClient } from './presenceClient';
import { usePresenceReporter, type PresenceReporterInput } from './usePresenceReporter';
import { usePresenceSender } from './usePresenceSender';
import {
  allWatchedSurvivors,
  resolveWatched,
  subscribeWatches,
  watchesVersion,
} from './watchRegistry';

export const usePresenceReport = (
  conversationIds: number[],
  reporterInput: PresenceReporterInput
): void => {
  const version = useSyncExternalStore(subscribeWatches, watchesVersion);
  const idsKey = [...new Set(conversationIds)].sort((left, right) => left - right).join(',');
  const watched = useMemo(
    () => resolveWatched(idsKey === '' ? [] : idsKey.split(',').map(Number)),
    // `version` moves whenever a watcher publishes a new set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, version]
  );
  const state = usePresenceReporter(reporterInput, watched.settings);
  const targetsRef = useRef(watched.targets);
  targetsRef.current = watched.targets;
  const targetsKey = watched.targets.join(',');
  const available = watched.targets.length > 0;
  const sender = usePresenceSender({
    state,
    available,
    heartbeatMs: watched.settings?.heartbeatMs,
    targets: () => targetsRef.current,
    targetsKey,
  });

  // A thread left (unticked, or no longer watched): forget it. Left while writing, and still
  // watched, it goes back to viewing at once — a stale "writing" would hold other agents' sends.
  const previous = useRef<number[]>([]);
  useEffect(() => {
    const now = new Set(targetsKey === '' ? [] : targetsKey.split(',').map(Number));
    const gone = previous.current.filter((id) => !now.has(id));
    previous.current = [...now];
    if (gone.length === 0) return;
    const lastStates = sender.forget(gone);
    const stillWatched = allWatchedSurvivors();
    for (const [id, last] of lastStates) {
      if ((last === 'writing_reply' || last === 'writing_note') && stillWatched.has(id)) {
        presenceClient.setState(id, 'viewing');
      }
    }
  }, [targetsKey, sender]);

  // Unmounted while writing (the composer closed, the tab switched): back to viewing, as above.
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(
    () => () => {
      if (stateRef.current !== 'writing_reply' && stateRef.current !== 'writing_note') return;
      const stillWatched = allWatchedSurvivors();
      for (const id of targetsRef.current) {
        if (stillWatched.has(id)) presenceClient.setState(id, 'viewing');
      }
    },
    []
  );

  // Nothing watched (a disconnect): what was sent is gone on the server; it goes again once watched.
  useEffect(() => {
    if (!available) sender.clear();
  }, [available, sender]);

  // A watch acknowledged again (a re-watch after a merge): the server wants the state again. A
  // thread never sent to yet gets it from the sender's own change effect.
  const ackSeq = watched.ackSeq;
  useEffect(() => {
    const resend = targetsRef.current.filter((id) => sender.wasSent(id));
    if (resend.length > 0) sender.reportTo(resend, true);
  }, [ackSeq, sender]);
};
