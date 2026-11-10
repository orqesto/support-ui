/**
 * Report this tab's state on threads WITHOUT watching them (spec §5.1): the ticket reply composer,
 * whose text lives below the ticket view that watches the ticket's threads (TicketDetail). The
 * server takes `presence:state` only for threads this socket watches, so a thread no watcher holds
 * right now (beyond the ticket's watch cap, a watch that failed, a disconnect) is skipped; the
 * state goes out as soon as one does. Sends no watch and no unwatch, so it can never undo the
 * watcher's. Global admins report nothing (usePresenceReporter).
 *
 * The ticket view reports "viewing" on the same threads; the presenceArbiter sends the stronger
 * of the two per thread, so a thread unticked (or a composer closed) while writing falls back to
 * the ticket view's "viewing" without the two ever overwriting each other.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { presenceArbiter } from './presenceArbiter';
import type { PresenceState } from './presence.types';
import { usePresenceReporter, type PresenceReporterInput } from './usePresenceReporter';
import { resolveWatched, subscribeWatches, watchesVersion } from './watchRegistry';

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
  const targetsKey = watched.targets.join(',');
  const heartbeatMs = watched.settings?.heartbeatMs;

  const [owner] = useState(() => ({}));
  useEffect(() => {
    const wants = new Map<number, PresenceState>();
    if (state !== null && targetsKey !== '') {
      for (const id of targetsKey.split(',').map(Number)) wants.set(id, state);
    }
    presenceArbiter.setWants(owner, wants, heartbeatMs);
  }, [owner, state, targetsKey, heartbeatMs]);
  useEffect(() => () => presenceArbiter.setWants(owner, null), [owner]);
};
