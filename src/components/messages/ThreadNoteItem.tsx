import { formatDate, formatWhen } from '@/lib/utils';
import type { MessageNote } from '@/services/message.service';

/**
 * An internal note, in the thread where it was written (v3): amber — the internal-only role —
 * with a thick left edge, so it can never be read as something the customer saw.
 *
 * Rendered as plain text exactly as the Notes tab renders it (MessageNotes), so the two views
 * of one note never disagree.
 */
export function ThreadNoteItem({ note }: { note: MessageNote }) {
  return (
    <div className="flex items-start gap-[9px]">
      <div
        className="w-[21px] h-[21px] mt-px rounded-full bg-sunken border border-border grid place-items-center text-[9px] text-warning flex-none"
        aria-hidden
      >
        ◆
      </div>
      <div className="flex flex-col gap-1 min-w-0 max-w-[90%]">
        <div className="font-mono text-[10.5px] text-warning flex flex-wrap items-center gap-x-1.5">
          <span className="font-display text-[10px] uppercase tracking-[0.1em] font-semibold">
            Internal note
          </span>
          <b className="font-display font-semibold">{note.authorName}</b>
          <span title={formatDate(note.createdAt)}>· {formatWhen(note.createdAt)}</span>
        </div>
        <div className="rounded-xl px-[13px] py-[11px] bg-warning-muted border border-warning-line border-l-[3px] text-foreground text-[13.5px] leading-[1.62] whitespace-pre-wrap break-words">
          {note.content}
        </div>
      </div>
    </div>
  );
}
