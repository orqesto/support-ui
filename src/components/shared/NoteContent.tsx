import DOMPurify from 'dompurify';
import { holdNoteText, isHoldNote, type HoldNoteFields } from '@/lib/holdNote';
import { isEditorHtml } from '@/lib/noteText';

const ALLOWED_TAGS = ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre'];

/**
 * A note's or comment's body, as the Notes tab and the ticket page show it.
 *
 * - A hold note: its text built from metadata (`holdNoteText`, the date in the viewer's zone),
 *   as plain text.
 * - The rich editor's HTML: sanitised HTML, as before.
 * - Anything else is PLAIN TEXT (a note written in a thread, a Jira or Zendesk comment): read as
 *   HTML, "waiting for <supplier> quote" lost its `<supplier>` and line breaks collapsed.
 */
export const NoteContent = ({
  note,
  className,
}: {
  note: HoldNoteFields & { content: string };
  className: string;
}) => {
  if (isHoldNote(note) || !isEditorHtml(note.content)) {
    return (
      <div className={`${className} whitespace-pre-wrap break-words`}>
        {isHoldNote(note) ? holdNoteText(note) : note.content}
      </div>
    );
  }
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(note.content, { ALLOWED_TAGS, ALLOWED_ATTR: [] }),
      }}
    />
  );
};
