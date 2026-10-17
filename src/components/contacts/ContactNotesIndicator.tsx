import { StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatDate } from '@/lib/utils';

/** The newest note as a list row or a loaded profile carries it. */
export type LatestNotePreview = {
  content: string;
  /** The server cut the note for the preview. */
  truncated?: boolean;
  createdAt: string;
  authorFirstName: string | null;
  authorLastName: string | null;
};

/** Longest preview shown on hover, whatever the source sends (a loaded profile sends whole notes). */
export const NOTE_PREVIEW_CHARS = 280;

/** Marks the contact-notes section, so the contact drawer can scroll it into view. */
export const CONTACT_NOTES_ATTR = 'data-contact-notes';

/** Fired after a contact note is added or deleted, so every view showing note counts refreshes. */
export const CONTACT_NOTES_CHANGED = 'odly:contact-notes-changed';
export const notifyContactNotesChanged = (): void => {
  window.dispatchEvent(new Event(CONTACT_NOTES_CHANGED));
};

const authorName = (note: LatestNotePreview): string =>
  [note.authorFirstName, note.authorLastName].filter(Boolean).join(' ') || 'Unknown';

/**
 * "This customer has notes": a note icon with the count and the newest note on hover. Renders
 * nothing when there are none. With `onOpen` it is its own button (a click opens the notes);
 * without it, a plain mark for use inside another control, such as a tab label.
 */
export function ContactNotesIndicator({
  count,
  latest,
  onOpen,
}: {
  count: number;
  latest: LatestNotePreview | null | undefined;
  onOpen?: () => void;
}) {
  if (count <= 0) return null;
  const cut = latest
    ? latest.truncated === true || latest.content.length > NOTE_PREVIEW_CHARS
    : false;
  const label = `${count} ${count === 1 ? 'note' : 'notes'} about this customer`;
  return (
    <Tooltip
      side="bottom"
      className="inline-flex shrink-0"
      content={
        latest ? (
          <span className="block w-64 whitespace-normal" data-testid="contact-notes-preview">
            <span className="block mb-1 text-[10.5px] opacity-75">
              {authorName(latest)} · {formatDate(latest.createdAt)}
            </span>
            <span className="whitespace-pre-wrap break-words line-clamp-6">
              {latest.content.slice(0, NOTE_PREVIEW_CHARS)}
              {cut ? '…' : ''}
            </span>
            {count > 1 && (
              <span className="block mt-1 text-[10.5px] opacity-75">+{count - 1} more</span>
            )}
          </span>
        ) : (
          label
        )
      }
    >
      {onOpen ? (
        <Button
          type="button"
          variant="ghost"
          aria-label={label}
          data-testid="contact-notes-indicator"
          onClick={(event) => {
            // Inside a clickable row: open the notes, not whatever the row opens.
            event.stopPropagation();
            // Drop focus so the hover preview does not stay over what the click opens.
            event.currentTarget.blur();
            onOpen();
          }}
          onKeyDown={(event) => {
            // Only the keys that press the button: a row's own Enter/Space handler must not take
            // them; every other key (Escape, shortcuts) still bubbles.
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
          }}
          className="gap-0.5 px-1.5 py-0 h-[19px] rounded-md text-[10.5px] font-bold tabular-nums bg-note-muted text-foreground border border-note-line hover:bg-note-muted/70"
        >
          <StickyNote className="w-3 h-3" aria-hidden="true" />
          {count}
        </Button>
      ) : (
        <span
          aria-label={label}
          data-testid="contact-notes-indicator"
          className="inline-flex gap-0.5 items-center px-1 h-[15px] rounded-[5px] font-sans text-[9.5px] font-bold tabular-nums tracking-normal bg-note-muted text-foreground border border-note-line"
        >
          <StickyNote className="w-2.5 h-2.5" aria-hidden="true" />
          {count}
        </span>
      )}
    </Tooltip>
  );
}
