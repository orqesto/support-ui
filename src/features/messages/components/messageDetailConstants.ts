import type React from 'react';

// The pieces live in ./messageDetailConstants/; this module stays the one import path every
// consumer uses, so each is re-exported here.
export {
  LABEL,
  COMPOSER_TOOL,
  COMPOSER_AI_TOOL,
  COMPOSER_SEND,
  SEND_SHORTCUT,
  CHIP_BASE,
  CHIP_SENTENCE,
  sentenceCase,
  statusLabel,
  priorityLabel,
  channelName,
  channelInSentence,
  createTicketLabel,
} from './messageDetailConstants/labels';
export {
  STATUS_DISPLAY,
  SETTABLE_STATUSES,
  STATUS_MENU_LABELS,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  HEADER_PRIORITY_OPTIONS,
  CHANNEL_ICONS,
} from './messageDetailConstants/statusDisplay';
export {
  THREAD_SANITIZE,
  addNoopenerHook,
  isProxiedImageUrl,
  addProxiedImagesOnlyHook,
  decodeHtmlEntities,
  liftImageDimensions,
  proxyRemoteImages,
} from './messageDetailConstants/sanitize';
export {
  renderMarkdown,
  suggestedAnswerToHtml,
  toGhostOption,
  ghostCaption,
  answerToEditorHtml,
} from './messageDetailConstants/answerHtml';
export type { GhostOption, SuggestedAnswerMeta } from './messageDetailConstants/answerHtml';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboxBadge = { label: string; icon: React.ReactNode; cls: string };

// ─── Pure helper functions ────────────────────────────────────────────────────

export function minAgo(dateStr: string): number {
  return Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
}

export function relativeTime(dateStr: string): string {
  const mins = minAgo(dateStr);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function fmtMin(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export function splitAtQuote(
  content: string | null | undefined,
  isHtml: boolean
): { main: string; quote: string | null } {
  if (!content) return { main: '', quote: null };
  if (isHtml) {
    // Split at the EARLIEST marker in the document, never at whichever pattern happens to
    // be first in this list. Returning on the first matching PATTERN is what broke
    // TRA-SUP-251: every message there carries a `gmail_quote` div in the first ~2 KB and
    // two `<hr>`s belonging to the shop's footer template ~20 KB down. `<hr>` was tested
    // first, so the split landed PAST the whole quoted history and collapsed only the
    // footer. Each reply then re-rendered the entire chain — visible text grew
    // 675 → 5,122 characters across the thread's 11 messages, which is what an agent sees
    // as a wall repeating the conversation. Taking the minimum index gives 213 → 879
    // instead: each message shows its own text and nothing else.
    //
    // The per-marker thresholds are deliberate and differ: a structural `<hr>`/quote div in
    // the first 80 characters is part of the template rather than a divider, and a
    // `<blockquote>` needs more room (150) because a short mail can legitimately open by
    // quoting a line before saying anything.
    const candidates: number[] = [];
    for (const pattern of [
      /<hr\s*[^>]*\/?>/i,
      /<div[^>]*(?:gmail_quote|yahoo_quoted|quoted-text)[^>]*>/i,
    ]) {
      const match = content.match(pattern);
      if (match?.index !== undefined && match.index > 80) candidates.push(match.index);
    }
    const bq = content.indexOf('<blockquote');
    if (bq > 150) candidates.push(bq);
    if (candidates.length > 0) {
      const cut = Math.min(...candidates);
      return { main: content.slice(0, cut).trimEnd(), quote: content.slice(cut) };
    }
    return { main: content, quote: null };
  }
  // Plain-text reply history: an attribution line ("On … wrote:"), a signature
  // divider (--- / ___), a forwarded-header block, or the first `>`-quoted line.
  const idx = content.search(
    /\n-{3,}|\n_{3,}|\nOn .{5,}wrote:|\n-{2,} ?Forwarded|\nFrom: .{2,}\n|\n\s*>[ >]/
  );
  if (idx > 50) return { main: content.slice(0, idx).trimEnd(), quote: content.slice(idx) };

  // Every marker above is anchored to a newline, so a body that HAS no newline can
  // never split — and one class of message arrives exactly that way. Mail with no
  // usable text/plain part is stored as its HTML run through the ingestion
  // tag-stripper, which turns each tag into a space and then collapses `\s+` to a
  // single space (imapEmailProcessor.ts / gmailMessageParser.ts). The line structure
  // is gone before the FE ever sees it, so the reply, our previous answer and the
  // customer's own first mail render as one wall of text with no `show quoted` at all
  // (TRA-SUP-2108). Re-run the same markers unanchored — but ONLY for that case: in a
  // body that still has line structure a mid-line "wrote:" is prose, not a quote.
  if (!content.includes('\n')) {
    // Bounded and lazy (`{5,300}?`, no nested quantifier) so a long body cannot
    // backtrack. The lookahead requires a four-digit year inside the attribution —
    // Gmail, Apple Mail, Outlook, Yahoo and our own quote header all carry one, and
    // prose like "the returns policy you wrote: refunds within 30 days" does not. A
    // bare `\d` there is not enough: that sentence would split on its own "30".
    const inline = content.match(
      /\bOn (?=[^\n]{0,300}\d{4})[^\n]{5,300}?wrote:|-{2,} ?Forwarded message|-{2,} ?Original Message|\bFrom: *\S+@\S+/i
    );
    if (inline?.index !== undefined && inline.index > 50)
      return { main: content.slice(0, inline.index).trimEnd(), quote: content.slice(inline.index) };
  }
  return { main: content, quote: null };
}

/*
  v4 mobile thread (M5, <640px): no avatars — the name is already on the meta line — so every row
  runs the full width; a reply WE sent is indented 28px; bubbles read at 14px; preformatted text
  wraps instead of widening the page. CSS only (`max-sm:`): nothing changes from 640px up.
*/
export const PHONE_THREAD_ROW = 'max-sm:block';
export const PHONE_THREAD_AVATAR = 'max-sm:hidden';
export const PHONE_THREAD_COL_IN = 'max-sm:max-w-none max-sm:w-full';
export const PHONE_THREAD_COL_OUT = 'max-sm:max-w-none max-sm:ml-7';
export const PHONE_THREAD_BUBBLE =
  'max-sm:text-[14px] max-sm:px-3 max-sm:py-2.5 max-sm:rounded-[14px] max-sm:[&_pre]:whitespace-pre-wrap max-sm:[&_pre]:[overflow-wrap:anywhere] max-sm:[&_code]:whitespace-pre-wrap max-sm:[&_code]:[overflow-wrap:anywhere]';

/** The message panel's tabs. ONE union for MessageDetail and MessagePanelTabs. */
export type PanelTab =
  | 'ai'
  | 'customer'
  | 'lookups'
  | 'attachments'
  | 'kb'
  | 'activity'
  | 'notes'
  | 'lead'
  | 'contradiction';

/**
 * Contact and lookup controls on a phone: 40px touch targets and 16px inputs (M9). Tick boxes and
 * radios are left out: a 40px-tall 14px box only drops the tick below its label (the label row is
 * the touch target for those).
 */
export const PHONE_CONTACT =
  'max-sm:[&_button]:min-h-10 max-sm:[&_button]:min-w-10 max-sm:[&_input:not([type=checkbox]):not([type=radio])]:min-h-10 max-sm:[&_select]:min-h-10';
