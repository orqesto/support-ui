import DOMPurify from 'dompurify';
import { holdNoteText, isHoldNote, type HoldNoteFields } from '@/lib/holdNote';
import { noteDisplay, type NoteBody, type NoteOrigin } from '@/lib/noteText';

/**
 * What these views draw of a ticket comment's HTML: what the server keeps (the rich editor's
 * paragraphs, marks, lists, code, quotes and links), plus headings h1–h3 — the backend's
 * ticket-comment sanitiser is being changed to keep them (follow-up to the review of #902);
 * until then, and in every older row, a heading was stripped to its bare text ("Title<p>…").
 */
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
  'blockquote',
  'a',
  'h1',
  'h2',
  'h3',
];
/** A link keeps where it goes, and nothing else (no `style`, no handlers). */
const ALLOWED_ATTR = ['href'];

/**
 * A DEDICATED sanitizer: the shared DOMPurify instance carries the thread's mail hooks. This one
 * opens every link in a new tab without handing it this window (`rel="noopener noreferrer"`).
 * DOMPurify's own URI policy already drops `javascript:` and the like.
 */
let notePurifier: ReturnType<typeof DOMPurify> | null = null;
const purifier = () => {
  if (!notePurifier) {
    notePurifier = DOMPurify(window);
    notePurifier.addHook('afterSanitizeAttributes', (node: Element) => {
      if (node.tagName !== 'A') return;
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    });
  }
  return notePurifier;
};

/**
 * A note's or comment's body, as the Notes tab and the ticket page show it.
 *
 * - A hold note: its text built from metadata (`holdNoteText`, the date in the viewer's zone),
 *   as plain text.
 * - Otherwise `noteDisplay` decides — the same decision the thread view prints by
 *   (`noteBodyText`): HTML is sanitised and drawn; text is printed as is, line breaks kept.
 */
export const NoteContent = ({
  note,
  origin,
  className,
}: {
  note: HoldNoteFields & NoteBody;
  origin: NoteOrigin;
  className: string;
}) => {
  if (isHoldNote(note)) {
    return (
      <div className={`${className} whitespace-pre-wrap break-words`}>{holdNoteText(note)}</div>
    );
  }
  const display = noteDisplay(note, origin);
  if (display.kind === 'text') {
    return <div className={`${className} whitespace-pre-wrap break-words`}>{display.text}</div>;
  }
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{
        __html: purifier().sanitize(display.html, { ALLOWED_TAGS, ALLOWED_ATTR }),
      }}
    />
  );
};
