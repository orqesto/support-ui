import { useEffect, useState } from 'react';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';
import { useSocketReconnected } from '../../hooks/useSocketReconnected';
import { readNoReplyMarker } from '../noReplyMarker';

/** Waits between tries of a marker read that failed; after the last one it stops. */
export const MARKER_READ_BACKOFF_MS = [5_000, 30_000, 120_000] as const;

/**
 * The thread's "No reply needed" note. THE rule is the backend's — the API serves the marker only
 * while its email is still the thread's reply turn — so a served marker is shown as it is, with no
 * copy of that rule here. A finished thread shows no note (as its card shows no chip).
 *
 * The app's copy of the conversation can be older than the loaded events. When an inbound event
 * newer than the marked email is loaded, the marker is read again HERE and only the answer to that
 * read counts (no other refresh of the conversation can stand in for it — one sent earlier would
 * carry the old marker). Until it answers the note is hidden: while it is in flight, and after it
 * failed. A failed read is tried again after each wait in MARKER_READ_BACKOFF_MS, and at once when
 * the window gets focus or the socket comes back.
 */
export function useNoReplyNote(
  message: Message,
  newestInboundId: number,
  eventsLoaded: boolean
): boolean {
  const servedEventId = readNoReplyMarker(message.metadata)?.eventId ?? null;
  const canShow =
    servedEventId !== null && message.status !== 'resolved' && message.status !== 'closed';
  // The question to ask, null when the served marker needs no second look (or no note can show).
  const askKey =
    canShow && eventsLoaded && newestInboundId > servedEventId
      ? `${message.id}:${newestInboundId}`
      : null;
  const [answer, setAnswer] = useState<{ key: string; marked: boolean } | null>(null);
  const answered = askKey !== null && answer?.key === askKey;
  const [retryNow, setRetryNow] = useState(0);
  const waiting = askKey !== null && !answered;

  useEffect(() => {
    if (askKey === null || answered) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const failed = () => {
      if (cancelled) return;
      const wait = MARKER_READ_BACKOFF_MS[failures];
      failures += 1;
      if (wait !== undefined) timer = setTimeout(ask, wait);
    };
    function ask() {
      messageService.getById(message.id).then((response) => {
        if (cancelled) return;
        if (!response.success || !response.data) {
          failed();
          return;
        }
        const metadata = response.data.metadata as Record<string, unknown> | null | undefined;
        setAnswer({ key: askKey as string, marked: readNoReplyMarker(metadata) !== null });
      }, failed);
    }
    ask();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [askKey, answered, message.id, retryNow]);

  // Still waiting: the window coming back, or the socket, is a reason to try again now.
  useEffect(() => {
    if (!waiting) return undefined;
    const retry = () => setRetryNow((count) => count + 1);
    window.addEventListener('focus', retry);
    return () => window.removeEventListener('focus', retry);
  }, [waiting]);
  useSocketReconnected(() => {
    if (waiting) setRetryNow((count) => count + 1);
  });

  if (!canShow) return false;
  return askKey === null || (answered && answer.marked);
}
