/**
 * Action confirm (spec §5.5, decision 5): before close, resolve, assign, move team, merge or
 * mark spam, ask first while another agent (not away) is writing a reply on the thread — "Anna is
 * writing a reply — close anyway?". Viewers alone never ask. FE-only, from live presence: with
 * presence unavailable there is no writer and the action runs at once.
 *
 * Two sources of "who writes": an open thread or ticket passes its watched viewers
 * (`useWritingGuard`); a list row, a kanban card or a list page reads the list's presence summary
 * for the conversation (`useListWritingGuard`). Both ask with the same dialog.
 *
 * Global admins never report a state, so they are never the writer — but their own actions still
 * ask.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuthStore } from '@/stores/authStore';
import type { PresenceViewer } from './presence.types';
import { usePresenceSummaryStore } from './presenceSummaryStore';
import { useOrgMemberNames } from './useOrgMemberNames';

export type GuardLabel = 'close' | 'resolve' | 'assign' | 'move' | 'merge' | 'mark as spam';

/**
 * Run `run` now, or after the agent confirms. `onCancel` is called exactly once when it does not
 * run: the agent backed out, or another question was already open (that ask is refused rather
 * than queued, so a caller awaiting a promise never hangs).
 */
export type ConfirmIfWriting = (label: GuardLabel, run: () => void, onCancel?: () => void) => void;

/** The pass-through used where no presence is wired (and as the context default). */
export const runAtOnce: ConfirmIfWriting = (_label, run) => run();

interface Pending {
  label: GuardLabel;
  writerId: number;
  run: () => void;
  onCancel?: () => void;
}

/** The first OTHER agent writing a reply (not away) among `users`, or undefined. */
const firstWriter = (
  users: ReadonlyArray<{ userId: number; state: string }>,
  myId: number | undefined
): number | undefined =>
  users.find((user) => user.userId !== myId && user.state === 'writing_reply')?.userId;

/** The dialog and its one-question-at-a-time rule; `writerOf` is read when the agent acts. */
const useWriterConfirm = (writerOf: (conversationId?: number) => number | undefined) => {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const ask = useCallback(
    (
      label: GuardLabel,
      run: () => void,
      onCancel: (() => void) | undefined,
      conversationId?: number
    ) => {
      const writerId = writerOf(conversationId);
      if (writerId === undefined) {
        run();
        return;
      }
      if (pendingRef.current !== null) {
        // One question at a time: a second ask while one is open does not run.
        onCancel?.();
        return;
      }
      const next = { label, writerId, run, onCancel };
      pendingRef.current = next;
      setPending(next);
    },
    [writerOf]
  );

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    if (current === null) return; // already settled (ConfirmDialog closes after confirming)
    pendingRef.current = null;
    setPending(null);
    if (confirmed) current.run();
    else current.onCancel?.();
  }, []);

  const dialog: ReactNode = pending ? (
    <GuardDialog pending={pending} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null;
  return { ask, dialog };
};

/** An open thread or ticket: `viewers` are the watched OTHER agents (usePresenceWatch). */
export const useWritingGuard = (
  viewers: PresenceViewer[]
): { confirmIfWriting: ConfirmIfWriting; dialog: ReactNode } => {
  const myId = useAuthStore((store) => store.user?.id);
  const writerId = firstWriter(viewers, myId);
  const writerOf = useCallback(() => writerId, [writerId]);
  const { ask, dialog } = useWriterConfirm(writerOf);
  const confirmIfWriting = useCallback<ConfirmIfWriting>(
    (label, run, onCancel) => ask(label, run, onCancel),
    [ask]
  );
  return { confirmIfWriting, dialog };
};

/** Ask for one conversation of a list (its id at ask time, or the hook's own). */
export type ConfirmIfWritingOn = (
  label: GuardLabel,
  run: () => void,
  onCancel?: () => void,
  conversationId?: number
) => void;

/**
 * A list row, kanban card or list page: who writes is read from the list's presence summary
 * (`presenceSummaryStore`) when the agent acts — no subscription, so no re-render per change. A
 * store that is down (no snapshot) has no writer: the action runs at once. A board or page that
 * acts on many threads passes the conversation id with each ask.
 */
export const useListWritingGuard = (
  conversationId?: number
): { confirmIfWriting: ConfirmIfWritingOn; dialog: ReactNode } => {
  const myId = useAuthStore((store) => store.user?.id);
  const writerOf = useCallback(
    (askedId?: number) => {
      const id = askedId ?? conversationId;
      const store = usePresenceSummaryStore.getState();
      if (id === undefined || !store.available) return undefined;
      return firstWriter(store.byConversation[id] ?? [], myId);
    },
    [conversationId, myId]
  );
  const { ask, dialog } = useWriterConfirm(writerOf);
  return { confirmIfWriting: ask, dialog };
};

/**
 * Mounted only while asking, so a view that never asks reads no member list (and needs no query
 * client). The names are read from the cache, never fetched; unknown ⇒ "Another agent".
 */
function GuardDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: Pending;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const agentOf = useOrgMemberNames({ fetch: false });
  const capitalised = pending.label.charAt(0).toUpperCase() + pending.label.slice(1);
  return (
    <ConfirmDialog
      open
      // ConfirmDialog calls onConfirm and THEN onOpenChange(false); `settle` acts only once.
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      onConfirm={onConfirm}
      title={`${agentOf(pending.writerId).name} is writing a reply — ${pending.label} anyway?`}
      description=""
      confirmText={`${capitalised} anyway`}
      variant="warning"
    />
  );
}
