import { useMemo } from 'react';
import type { MessageNote } from '@/services/message.service';
import type { MessageEvent } from '@/types';
import type { Attachment } from '../MessageAttachments';
import { dayStarts, threadTimeOf } from '../threadDays';

/** The thread's messages and notes as one time-ordered list, its day breaks and every file. */

export function useThreadTimeline(
  sortedThread: MessageEvent[],
  notes: MessageNote[],
  attachmentsByMessageId: Map<number, Attachment[]>
) {
  // v3: internal notes sit in the thread at the moment they were written, between the messages
  // they comment on. A stable sort keeps the messages in their own order (a note tied to the
  // millisecond with a message goes after it). Day separators group this merged list, so a
  // separator can only ever sit between days, in order.
  const timeline = useMemo(() => {
    const rows: (
      | { kind: 'message'; time: number; msg: MessageEvent }
      | { kind: 'note'; time: number; note: MessageNote }
    )[] = [
      ...sortedThread.map((msg) => ({ kind: 'message' as const, time: threadTimeOf(msg), msg })),
      ...notes.map((note) => ({ kind: 'note' as const, time: Date.parse(note.createdAt), note })),
    ];
    return rows.sort((left, right) => (left.time || 0) - (right.time || 0));
  }, [sortedThread, notes]);
  const threadDayStarts = useMemo(() => dayStarts(timeline.map((row) => row.time)), [timeline]);

  const flatAttachments = useMemo(
    () => Array.from(attachmentsByMessageId.values()).flat(),
    [attachmentsByMessageId]
  );
  return {
    timeline,
    threadDayStarts,
    flatAttachments,
  };
}
