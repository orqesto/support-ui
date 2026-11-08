import { useEffect, useRef } from 'react';
import type React from 'react';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import type { Message } from '@/types';
import type { useHeaderFocusReturn } from '../useHeaderFocusReturn';

/**
 * The "Reanalysing" badge's live state: re-read from the message on a thread switch, then owned by
 * the `conversation:ai_reanalysis` WS event.
 */
export function useAiReanalysisSync({
  message,
  onRefresh,
  setAiReanalysisInFlight,
}: {
  message: Message;
  onRefresh?: () => void;
  setAiReanalysisInFlight: React.Dispatch<React.SetStateAction<boolean>>;
}): void {
  // Sync the in-flight badge from the message prop ONLY on conv change. We used
  // to also depend on `message.metadata` so navigating away+back would re-read
  // the latest value, but that introduced a race: WS 'pending' sets local
  // state=true; parent re-renders (new metadata object reference, same content
  // because the BE flag hadn't surfaced yet); effect overwrites local state
  // back to false. Now we only re-init on actual conv switch — the WS event
  // owns the local state otherwise.
  useEffect(() => {
    setAiReanalysisInFlight(
      !!(message.metadata as Record<string, unknown> | undefined)?.aiReanalysisInFlight
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  // Stash onRefresh in a ref so the WS subscription effect doesn't re-register
  // every time the parent passes a fresh callback identity (common when the
  // parent doesn't useCallback).
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // Subscribe to the org-scoped `conversation:ai_reanalysis` WS event so the
  // badge flips live during the worker's run. Emitted by both the trigger
  // (`state: 'pending'`) and the processor (`state: 'complete' | 'failed'`).
  // On terminal states, refresh the message so the new metadata.analysis lands.
  useEffect(() => {
    const handler = (data: unknown) => {
      const ev = data as {
        conversationId?: number;
        state?: 'pending' | 'complete' | 'failed';
      };
      if (ev.conversationId !== message.id) return;
      if (ev.state === 'pending') {
        setAiReanalysisInFlight(true);
        return;
      }
      if (ev.state === 'complete' || ev.state === 'failed') {
        setAiReanalysisInFlight(false);
        onRefreshRef.current?.();
      }
    };
    subscribeToEvent('conversation:ai_reanalysis', handler);
    return () => unsubscribeFromEvent('conversation:ai_reanalysis', handler);
  }, [message.id, setAiReanalysisInFlight]);
}

/** Focus return after the More menu closes, and Esc for the More menu and the label picker. */
export function useMoreMenuDismissal({
  moreOpen,
  setMoreOpen,
  showLabelPicker,
  setShowLabelPicker,
  setFocusReturn,
}: {
  moreOpen: boolean;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showLabelPicker: boolean;
  setShowLabelPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setFocusReturn: ReturnType<typeof useHeaderFocusReturn>['setFocusReturn'];
}): void {
  // The More menu closing (an item, Esc, its scrim, More itself) hands focus back to More — or
  // to the chip a picker opened from it returns to, once that picker closes (focusReturn).
  const moreWasOpen = useRef(false);
  useEffect(() => {
    if (moreWasOpen.current && !moreOpen) setFocusReturn((current) => current ?? 'more');
    // Opening More supersedes a popover's pending return (a press on More closed it).
    else if (moreOpen) setFocusReturn(null);
    moreWasOpen.current = moreOpen;
  }, [moreOpen, setFocusReturn]);

  // Esc closes the open popover (ACTIONS menu or label picker) and only it — their roles keep
  // the rail's own Esc out (detailShortcuts.ts dialogIsOpen). Listened on the document, so it
  // also works from the label search box, where the rail's shortcuts are off.
  useEffect(() => {
    if (!moreOpen && !showLabelPicker) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      setShowLabelPicker(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen, showLabelPicker, setMoreOpen, setShowLabelPicker]);
}
