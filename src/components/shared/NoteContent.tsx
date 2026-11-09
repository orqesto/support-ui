import DOMPurify from 'dompurify';
import { holdNoteText, isHoldNote, type HoldNoteFields } from '@/lib/holdNote';
import { noteIsHtml, type NoteBody } from '@/lib/noteText';

const ALLOWED_TAGS = [
  'p',
  'br',
  'b',
  'i',
  'u',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  // The server keeps h1–h3 in a ticket comment's HTML (rich-editor headings).
  'h1',
  'h2',
  'h3',
];

/**
 * A note's or comment's body, as the Notes tab and the ticket page show it.
 *
 * - A hold note: its text built from metadata (`holdNoteText`, the date in the viewer's zone),
 *   as plain text.
 * - HTML (`contentFormat: 'html'`, or the fallback test in `noteIsHtml` on an older backend):
 *   sanitised HTML, as before.
 * - Anything else is PLAIN TEXT (a note written in a thread, a Jira or Zendesk comment): read as
 *   HTML, "waiting for <supplier> quote" lost its `<supplier>` and line breaks collapsed.
 */
export const NoteContent = ({
  note,
  className,
}: {
  note: HoldNoteFields & NoteBody;
  className: string;
}) => {
  if (isHoldNote(note) || !noteIsHtml(note)) {
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
