import { isBlankRichText } from '@/lib/stripHtml';
import type { Attachment } from '../MessageAttachments';

/**
 * Events per page of the thread. A thread is read latest page first; "Show earlier messages"
 * fetches the page before it. 300 is a working day of a busy ticket; the thread that made this
 * necessary held 1,887 (a mailer-daemon Gmail thread), and rendering every one on open fetched
 * every markup and spent the API limiter.
 */
export const THREAD_PAGE = 300;
/*
  ⛔ The composer holds ONE text for both modes: turning words WRITTEN AS A TEAM NOTE into Reply
  would put them one Send from the customer. Every path that would (rail tabs, "Reply to this
  message", R, the lookup insert, a KB / suggested answer) asks this ONE rule. Keyed on the mode
  the text was last EDITED in, not the mode on screen: a reply carried into note mode by N is
  still a reply and may go back; a blank composer always may.
*/
export const holdsUnsentNote = (html: string, lastEditMode: 'reply' | 'note' | null) =>
  lastEditMode === 'note' && !isBlankRichText(html);
export const NOTE_IN_PROGRESS = 'Post or clear your internal note first';
/** One empty list for every message without files, so the memoised item sees no change. */
export const NO_ATTACHMENTS: Attachment[] = [];
