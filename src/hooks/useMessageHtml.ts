import { useQuery } from '@tanstack/react-query';
import { getMessageHtml } from '@/services/message-html.service';

/**
 * The original markup for one message, fetched only when it is actually on screen.
 *
 * ⚠️ `enabled` matters: a thread can hold hundreds of messages and each body is large. Callers
 * pass false for anything they are not rendering.
 *
 * A failure here is not an error state anyone should see — the console simply keeps showing
 * the plain-text body it already has, which is what it showed before this existed.
 */
export const useMessageHtml = (eventId: number | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['message-html', eventId],
    queryFn: () => getMessageHtml(eventId as number),
    enabled: enabled && eventId !== undefined,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
