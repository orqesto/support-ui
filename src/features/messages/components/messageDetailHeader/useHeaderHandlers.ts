import { useCallback } from 'react';
import type React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { messageService } from '@/services/message.service';
import { getConvUrlId } from '@/lib/messageHelpers';
import type { Message, TicketPriority, ThreadStatus } from '@/types';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { showRouteLearningNote } from '@/lib/routingCopy';
import { NOTIFICATION_COUNTS_KEY } from '@/hooks/useNotificationCounts';
import { BE_STATUS_TO_COLUMN } from './headerStyles';
import { useGuardAction } from '../../presence/writingGuardContext';
import type { GuardLabel } from '../../presence/useWritingGuard';

/** The status changes that ask first while a colleague writes a reply (reopen and hold do not). */
const STATUS_GUARD_LABEL: Partial<Record<ThreadStatus, GuardLabel>> = {
  resolved: 'resolve',
  closed: 'close',
  filtered: 'mark as spam',
};

type SetFlag = React.Dispatch<React.SetStateAction<boolean>>;

/** Status, priority, category and lead: the header's field writes. */
export function useHeaderFieldHandlers({
  message,
  onRefresh,
  onOptimisticMove,
  setUpdatingStatus,
  setHoldOpen,
  setUpdatingPriority,
  setUpdatingCategory,
  setTogglingLead,
}: {
  message: Message;
  onRefresh?: () => void;
  onOptimisticMove?: (columnId: string) => void;
  setUpdatingStatus: SetFlag;
  setHoldOpen: SetFlag;
  setUpdatingPriority: SetFlag;
  setUpdatingCategory: SetFlag;
  setTogglingLead: SetFlag;
}) {
  const guard = useGuardAction();
  const applyStatus = useCallback(
    async (status: ThreadStatus, hold?: { reason: string; until: Date }) => {
      try {
        setUpdatingStatus(true);
        await messageService.setStatus(message.id, status, hold);
        setHoldOpen(false);
        // Move the board card optimistically before the heavier onRefresh reconcile.
        const column = BE_STATUS_TO_COLUMN[status];
        if (column) onOptimisticMove?.(column);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set status:', err);
      } finally {
        setUpdatingStatus(false);
      }
    },
    [message.id, onRefresh, onOptimisticMove, setHoldOpen, setUpdatingStatus]
  );
  // Resolve, close and spam ask first while a colleague writes a reply (thread presence, §5.5).
  const handleSetStatus = useCallback(
    (status: ThreadStatus, hold?: { reason: string; until: Date }) =>
      new Promise<void>((resolve) => {
        const label = STATUS_GUARD_LABEL[status];
        const run = () => void applyStatus(status, hold).then(resolve);
        if (label) guard(label, run, resolve);
        else run();
      }),
    [applyStatus, guard]
  );

  const handleSetPriority = useCallback(
    async (priority: TicketPriority) => {
      try {
        setUpdatingPriority(true);
        await messageService.setPriority(message.id, priority);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set priority:', err);
      } finally {
        setUpdatingPriority(false);
      }
    },
    [message.id, onRefresh, setUpdatingPriority]
  );

  const handleSetCategory = useCallback(
    async (categoryId: number | null) => {
      try {
        setUpdatingCategory(true);
        await messageService.setCategory(message.id, categoryId);
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to set category:', err);
      } finally {
        setUpdatingCategory(false);
      }
    },
    [message.id, onRefresh, setUpdatingCategory]
  );

  const handleToggleLead = useCallback(async () => {
    try {
      setTogglingLead(true);
      await messageService.markAsLead(message.id, !message.isLead);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to toggle lead:', err);
    } finally {
      setTogglingLead(false);
    }
  }, [message.id, message.isLead, onRefresh, setTogglingLead]);

  return { handleSetStatus, handleSetPriority, handleSetCategory, handleToggleLead };
}

/** Copy link, contradiction check, manual route and re-analysis. */
export function useHeaderActionHandlers({
  message,
  orgCode,
  onRefresh,
  refusalText,
  queryClient,
  setLinkCopied,
  linkCopiedTimer,
  setCheckingContradiction,
  setRoutingTo,
  setReanalyzing,
}: {
  message: Message;
  orgCode: string | undefined;
  onRefresh?: () => void;
  refusalText: (err: unknown) => string | null | undefined;
  queryClient: QueryClient;
  setLinkCopied: SetFlag;
  linkCopiedTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setCheckingContradiction: SetFlag;
  setRoutingTo: React.Dispatch<React.SetStateAction<number | null>>;
  setReanalyzing: SetFlag;
}) {
  /*
    `announce` (the phone More menu): the menu closes on the press, so the "Link copied" label it
    would have shown is never seen — say it in a toast instead. A FAILURE is toasted everywhere:
    on desktop the tooltip just stayed "Copy link", so a refused copy looked like nothing happened.
    ⛔ Inside the promise chain: `navigator.clipboard` is undefined outside a secure context, and
    the bare call threw past the catch.
  */
  const handleCopyLink = useCallback(
    (announce = false) => {
      const url = `${window.location.origin}/threads?id=${getConvUrlId(message, orgCode)}`;
      Promise.resolve()
        .then(() => {
          // Absent outside a secure context (plain http); say that, not "undefined".
          if (!navigator.clipboard) throw new Error('the clipboard is not available here');
          return navigator.clipboard.writeText(url);
        })
        .then(() => {
          setLinkCopied(true);
          if (linkCopiedTimer.current !== null) clearTimeout(linkCopiedTimer.current);
          linkCopiedTimer.current = setTimeout(() => {
            linkCopiedTimer.current = null;
            setLinkCopied(false);
          }, 2000);
          if (announce) toast.success('Link copied');
        })
        .catch((err: unknown) => {
          logger.error('Failed to copy link:', err);
          // The browser's reason (permission refused, page not focused) — there is no backend.
          const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
          toast.error(`Could not copy the link${reason} — copy it from the address bar.`);
        });
    },
    [message, orgCode, linkCopiedTimer, setLinkCopied]
  );

  const handleCheckContradiction = useCallback(async () => {
    try {
      setCheckingContradiction(true);
      await messageService.checkContradiction(message.id);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to check contradiction:', err);
      toast.error(
        refusalText(err) ??
          (err instanceof Error ? err.message : 'Failed to check for contradictions.')
      );
    } finally {
      setCheckingContradiction(false);
    }
  }, [message.id, onRefresh, refusalText, setCheckingContradiction]);

  const guard = useGuardAction();
  const routeTo = useCallback(
    // Every route is learning evidence on the backend (spec 2026-10-14, D3) — no "+ rule" variant.
    async (deptId: number) => {
      try {
        setRoutingTo(deptId);
        showRouteLearningNote(await messageService.manualRoute(message.id, deptId));
        // Left the needs_routing queue — refresh the sidebar badge immediately.
        void queryClient.invalidateQueries({ queryKey: NOTIFICATION_COUNTS_KEY });
        onRefresh?.();
      } catch (err) {
        logger.error('Failed to manually route:', err);
      } finally {
        setRoutingTo(null);
      }
    },
    [message.id, onRefresh, queryClient, setRoutingTo]
  );
  // A move asks first while a colleague writes a reply (thread presence, §5.5).
  const handleManualRoute = useCallback(
    (deptId: number) =>
      new Promise<void>((resolve) => {
        guard('move', () => void routeTo(deptId).then(resolve), resolve);
      }),
    [guard, routeTo]
  );

  const handleReanalyze = useCallback(async () => {
    try {
      setReanalyzing(true);
      await messageService.reanalyze(message.id);
      onRefresh?.();
    } catch (err) {
      logger.error('Failed to reanalyze:', err);
    } finally {
      setReanalyzing(false);
    }
  }, [message.id, onRefresh, setReanalyzing]);

  return { handleCopyLink, handleCheckContradiction, handleManualRoute, handleReanalyze };
}
