import { useState, useCallback } from 'react';
import { messageService, type MessageNote } from '@/services/message.service';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import type { Message, User } from '@/types';
import { dismissContradictionWithFeedback } from '../dismissContradiction';
import type { MessageDetailProps, Setter } from './types';

type NoteActivity = { label: string; who: string; time: string };

/** Triage, reopen, classify, refresh, note edits and the contradiction check. */

export function useThreadActions({
  message,
  user,
  setResolving,
  setThreadRefreshKey,
  setNotes,
  setNoteActivityLog,
  onReject,
  onReopen,
  onClassify,
  onDelete,
  onRefresh,
}: {
  message: Message;
  user: User | null;
  setResolving: Setter<boolean>;
  setThreadRefreshKey: Setter<number>;
  setNotes: Setter<MessageNote[]>;
  setNoteActivityLog: Setter<NoteActivity[]>;
} & Pick<MessageDetailProps, 'onReject' | 'onReopen' | 'onClassify' | 'onDelete' | 'onRefresh'>) {
  // `resolving` is set here too (not only on close/resolve): the header button and the
  // shortcuts read it, and this request is just as much in flight after its dialog has closed.
  const handleReject = useCallback(async () => {
    setResolving(true);
    try {
      await messageService.markAsProcessed(message.id);
      onReject?.();
    } catch (err) {
      logger.error('Failed to mark as processed:', err);
    } finally {
      setResolving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
  }, [message.id, onReject]);

  /**
   * Bin the thread as not customer work.
   *
   * ⚠️ Failure is SURFACED, unlike the neighbouring `handleReject`, which logs and moves on. The
   * backend refuses this with a 400 in one real case — combining it with a KB save — and a silent
   * failure here would leave the thread in the queue while the agent believes it is gone.
   */
  const handleNotCustomerWork = useCallback(
    async (reason: string) => {
      setResolving(true);
      try {
        await messageService.markAsNotCustomerWork(message.id, reason);
        onReject?.();
      } catch (err) {
        logger.error('Failed to mark as not customer work:', err);
        toast.failure('mark as not customer work', err);
      } finally {
        setResolving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
    [message.id, onReject]
  );

  const handleReopen = useCallback(async () => {
    try {
      await messageService.reopen(message.id);
      onReopen?.();
    } catch (err) {
      logger.error('Failed to reopen:', err);
      // Surface the server reason (e.g. a 409 from a non-reopenable state) instead of
      // failing silently — formatError pulls the BE `error` string out of the response.
      toast.failure('reopen thread', err);
    }
  }, [message.id, onReopen]);

  const handleClassify = useCallback(
    async (
      action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
      createDetectionRule?: boolean,
      trainSpamFilter?: boolean,
      confirm?: boolean
    ) => {
      if (onClassify) await onClassify(action, createDetectionRule, trainSpamFilter, confirm);
    },
    [onClassify]
  );

  // The host asks before deleting; its success path forgets the thread's similar-results cache
  // (clearing it here, on the press, left Cancel with a cold cache for nothing).
  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  const handleRefresh = useCallback(() => {
    setThreadRefreshKey((key) => key + 1);
    onRefresh?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
  }, [onRefresh]);

  // Contact label edits (from the CUSTOMER tab or the header's contact drawer)
  // change the message's inherited labels but not message.id, so the header's
  // label list won't refetch on its own. Bump a key it depends on, and run the
  // normal refresh so the list/kanban cards pick up the change too.
  const [labelsRefreshKey, setLabelsRefreshKey] = useState(0);
  const handleContactChanged = useCallback(() => {
    setLabelsRefreshKey((key) => key + 1);
    handleRefresh();
  }, [handleRefresh]);

  const handleNoteUpdated = useCallback(
    (noteId: number, content: string) => {
      setNotes((prev) => prev.map((note) => (note.id === noteId ? { ...note, content } : note)));
      setNoteActivityLog((prev) => [
        ...prev,
        {
          label: 'Note edited',
          who: user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Agent',
          time: new Date().toISOString(),
        },
      ]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
    [user]
  );

  const handleNoteDeleted = useCallback(
    (noteId: number) => {
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      setNoteActivityLog((prev) => [
        ...prev,
        {
          label: 'Note deleted',
          who: user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Agent',
          time: new Date().toISOString(),
        },
      ]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
    [user]
  );

  const handleCheckContradiction = useCallback(async () => {
    await messageService.checkContradiction(message.id);
    setThreadRefreshKey((key) => key + 1);
    onRefresh?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
  }, [message.id, onRefresh]);

  // "Not a contradiction" (dismissContradiction.ts). True on success — the tab hides the alert at
  // once, before the refetch lands; failures (incl. a 404 from an older backend) are toasted there.
  const handleDismissContradiction = useCallback(async (): Promise<boolean> => {
    const dismissed = await dismissContradictionWithFeedback(message.id);
    if (dismissed) {
      setThreadRefreshKey((key) => key + 1);
      onRefresh?.();
    }
    return dismissed;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps as before the split; the setters/refs passed in are stable
  }, [message.id, onRefresh]);
  return {
    handleReject,
    handleNotCustomerWork,
    handleReopen,
    handleClassify,
    handleDelete,
    handleRefresh,
    labelsRefreshKey,
    handleContactChanged,
    handleNoteUpdated,
    handleNoteDeleted,
    handleCheckContradiction,
    handleDismissContradiction,
  };
}
