/**
 * Action confirm (spec §5.5, decision 5): before close, resolve, assign, move team, merge or
 * mark spam, ask first while another agent (not away) is writing a reply on the thread — "Anna is
 * writing a reply — close anyway?". Viewers alone never ask. FE-only, from live presence: with
 * presence unavailable the viewer list is empty and the action runs at once.
 *
 * `viewers` are OTHER agents (usePresenceWatch filters me out; filtered here again). Global admins
 * never report a state, so they are never the writer — but their own actions still ask.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuthStore } from '@/stores/authStore';
import type { PresenceViewer } from './presence.types';
import { useOrgMemberNames } from './useOrgMemberNames';

export type GuardLabel = 'close' | 'resolve' | 'assign' | 'move' | 'merge' | 'mark as spam';

/** Run `run` now, or after the agent confirms; `onCancel` when they back out. */
export type ConfirmIfWriting = (label: GuardLabel, run: () => void, onCancel?: () => void) => void;

/** The pass-through used where no presence is wired (and as the context default). */
export const runAtOnce: ConfirmIfWriting = (_label, run) => run();

interface Pending {
  label: GuardLabel;
  writerId: number;
  run: () => void;
  onCancel?: () => void;
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const useWritingGuard = (
  viewers: PresenceViewer[]
): { confirmIfWriting: ConfirmIfWriting; dialog: ReactNode } => {
  const myId = useAuthStore((store) => store.user?.id);
  const [pending, setPending] = useState<Pending | null>(null);

  const writer = viewers.find(
    (viewer) => viewer.userId !== myId && viewer.state === 'writing_reply'
  );
  const writerId = writer?.userId;

  const confirmIfWriting = useCallback<ConfirmIfWriting>(
    (label, run, onCancel) => {
      if (writerId === undefined) {
        run();
        return;
      }
      setPending({ label, writerId, run, onCancel });
    },
    [writerId]
  );

  const dialog = pending ? (
    <GuardDialog
      pending={pending}
      onCancel={() => {
        setPending(null);
        pending.onCancel?.();
      }}
      onConfirm={() => {
        setPending(null);
        pending.run();
      }}
    />
  ) : null;
  return { confirmIfWriting, dialog };
};

/**
 * Mounted only while asking, so a thread or ticket view that never asks reads no member list
 * (and needs no query client). The writer is in the viewer list, so the eye has already loaded
 * the names: the cache is read, never fetched.
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
  // ConfirmDialog calls onConfirm and then onOpenChange(false): only the first one may act.
  const [settled, setSettled] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (open || settled) return;
        setSettled(true);
        onCancel();
      }}
      onConfirm={() => {
        setSettled(true);
        onConfirm();
      }}
      title={`${agentOf(pending.writerId).name} is writing a reply — ${pending.label} anyway?`}
      description=""
      confirmText={`${capitalise(pending.label)} anyway`}
      variant="warning"
    />
  );
}
