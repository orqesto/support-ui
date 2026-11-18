import { useEffect, useRef, useState } from 'react';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';
import { useSocketReconnected } from '../../hooks/useSocketReconnected';
import { readNoReplyMarker } from '../noReplyMarker';

/** Waits between tries of a marker read that failed; after the last one it stops. */
export const MARKER_READ_BACKOFF_MS = [5_000, 30_000, 120_000] as const;

/**
 * The thread's "No reply needed" note. THE rule is the backend's — the API serves the marker only
 * while its email is still the thread's reply turn — so a served marker is shown as it is, with no
 * copy of that rule here. A finished thread, one needing review, or a lead shows no note (as its card
 * shows no No-reply chip there).
 *
 * The app's copy of the conversation can be older than the loaded events. When an inbound event
 * newer than the marked email is loaded, the marker is read again HERE and only the answer to that
 * read counts (no other refresh of the conversation can stand in for it — one sent earlier would
 * carry the old marker). Until it answers the note is hidden: while it is in flight, and after it
 * failed. One read is out at a time. A failed read is tried again after each wait in
 * MARKER_READ_BACKOFF_MS; after a failure, the window getting focus or the socket coming back
 * tries again at once (never beside a read still out, and the count of failures is kept).
 */
export function useNoReplyNote(
  message: Message,
  newestInboundId: number,
  eventsLoaded: boolean
): boolean {
  const servedEventId = readNoReplyMarker(message.metadata)?.eventId ?? null;
  // The note shows only where the card would show the chip (getAiState): a review reason or a
  // lead outranks it there, and the backend serves such a row's marker as stored, unchecked.
  const canShow =
    servedEventId !== null &&
    message.status !== 'resolved' &&
    message.status !== 'closed' &&
    !message.needsHumanReview &&
    message.isLead !== true;
  // The question to ask, null when the served marker needs no second look (or no note can show).
  const askKey =
    canShow && eventsLoaded && newestInboundId > servedEventId
      ? `${message.id}:${newestInboundId}`
      : null;
  const [answer, setAnswer] = useState<{ key: string; marked: boolean } | null>(null);
  const answered = askKey !== null && answer?.key === askKey;
  /** Try the failed read again now; null when nothing is being asked. */
  const retryFailedRead = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (askKey === null || answered) return undefined;
    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const failed = () => {
      inFlight = false;
      if (cancelled) return;
      const wait = MARKER_READ_BACKOFF_MS[failures];
      failures += 1;
      if (wait !== undefined) timer = setTimeout(ask, wait);
    };
    function ask() {
      timer = undefined;
      inFlight = true;
      // Anything that goes wrong — the request refused, a throw from the call itself, an answer of
      // another shape — is a failed read: the read is never left "out" for good.
      let read: ReturnType<typeof messageService.getById>;
      try {
        read = messageService.getById(message.id);
      } catch {
        failed();
        return;
      }
      read
        .then((response) => {
          if (!response.success || !response.data) {
            failed();
            return;
          }
          const metadata = response.data.metadata as Record<string, unknown> | null | undefined;
          const marked = readNoReplyMarker(metadata) !== null;
          inFlight = false;
          if (!cancelled) setAnswer({ key: askKey as string, marked });
        })
        .catch(failed);
    }
    const retryNow = () => {
      // Only after a failure, and never beside a read that is still out.
      if (cancelled || inFlight || failures === 0) return;
      clearTimeout(timer);
      ask();
    };
    retryFailedRead.current = retryNow;
    window.addEventListener('focus', retryNow);
    ask();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('focus', retryNow);
      retryFailedRead.current = null;
    };
  }, [askKey, answered, message.id]);
  // Subscribed for the whole mount (the hook's own rule); it acts only on a failed read.
  useSocketReconnected(() => retryFailedRead.current?.());

  if (!canShow) return false;
  return askKey === null || (answered && answer.marked);
}
