import { useOpenThread } from './useOpenThread';
import { useThreadDeleteAndSync } from './useThreadDeleteAndSync';
import { useThreadDetailActions } from './useThreadDetailActions';

type MessagesPageThreadActionsDeps = Parameters<typeof useOpenThread>[0] &
  Omit<Parameters<typeof useThreadDetailActions>[0], 'handleOpenThread' | 'openSeqRef'> &
  Omit<Parameters<typeof useThreadDeleteAndSync>[0], 'closeWhenDone'>;

/**
 * Opening a thread, what its detail asks the page to do, and delete / "Check mailboxes now" —
 * the three hooks in the order MessagesPage called them inline.
 */
export const useMessagesPageThreadActions = (deps: MessagesPageThreadActionsDeps) => {
  const { handleOpenThread, pendingThreadId, openSeqRef } = useOpenThread(deps);
  const detailActions = useThreadDetailActions({ ...deps, handleOpenThread, openSeqRef });
  const deleteAndSync = useThreadDeleteAndSync({
    ...deps,
    closeWhenDone: detailActions.closeWhenDone,
  });
  return { handleOpenThread, pendingThreadId, ...detailActions, ...deleteAndSync };
};
