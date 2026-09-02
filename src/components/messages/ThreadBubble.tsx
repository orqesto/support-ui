import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/Button';
import { API_BASE_URL } from '@/lib/config';
import {
  THREAD_SANITIZE,
  addNoopenerHook,
  addProxiedImagesOnlyHook,
  proxyRemoteImages,
  renderMarkdown,
  splitAtQuote,
} from './messageDetailConstants';

addNoopenerHook(DOMPurify);
addProxiedImagesOnlyHook(DOMPurify, API_BASE_URL);

export function ThreadBubble({
  content,
  isAgent,
  html,
  eventId,
}: {
  content: string | null | undefined;
  isAgent: boolean;
  /**
   * The sender's ORIGINAL markup, when the console has fetched it. Preferred over `content`,
   * which for a templated order mail is the sender's own `text/plain` alternative — the one
   * that writes a table as `| Discount: | -16.50 |` and cannot carry a clickable link.
   */
  html?: string | null;
  /** Required alongside `html`: images are proxied per message, so the id is part of the URL. */
  eventId?: number;
}) {
  const [showQuote, setShowQuote] = useState(false);
  // Content can be null (e.g. an attachment-only message or a body that failed to
  // extract) — coerce to '' so the regex/split helpers below don't throw.
  // Prefer the original markup when we have it AND an id to proxy its images through.
  // Without the id there is no safe way to render remote images, so fall back to text
  // rather than render the mail with the sender's own URLs in it.
  const original = html && eventId !== undefined ? proxyRemoteImages(html, eventId, API_BASE_URL) : null;
  const safeContent = original ?? content ?? '';
  // Require a *real* HTML tag — a closing tag (</p>) or a known structural/void
  // tag (<br>, <div ...>). The old /<[a-z][\s\S]*>/ matched any angle-bracket
  // token, so a plaintext email containing a bare <https://…> link or a
  // <name@domain> address was misrouted into the HTML renderer, where newlines
  // collapse into one wall of text and the >-quoted reply history never splits.
  const isHtml = /<\/[a-z][a-z0-9]*\s*>|<(?:br|hr|img|p|div|table|span|a|ul|ol|li|blockquote|h[1-6])[\s/>]/i.test(safeContent);
  const { main, quote } = useMemo(() => splitAtQuote(safeContent, isHtml), [safeContent, isHtml]);

  // `[overflow-wrap:anywhere]` so a long unbroken token (e.g. a 200-char tracking
  // URL) wraps instead of overflowing the bubble — overflow-wrap isn't inherited,
  // so the wrapper's break-words doesn't reach this nested prose div. Without it
  // the narrow side-panel preview clips the real content off-screen.
  const base = 'prose prose-sm max-w-none break-words [overflow-wrap:anywhere] [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0';
  const prose = isAgent ? `${base} prose-invert dark:prose-invert` : base;

  const renderHtml = (html: string) => (
    <div
      className={prose}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, THREAD_SANITIZE) }}
    />
  );
  const renderText = (text: string) => (
    <div
      className={prose}
      dangerouslySetInnerHTML={{
        // `a` is allowed here ONLY because `renderMarkdown` escapes `<` and `>` before it
        // autolinks, so the sole anchors in this string are the ones it built itself, with
        // an href it matched as http(s). Nothing of the sender's own markup survives to
        // this point. `ALLOWED_URI_REGEXP` re-states that at the sanitizer, so a future
        // change to the linkifier cannot quietly admit `javascript:`.
        __html: DOMPurify.sanitize(renderMarkdown(text), {
          ALLOWED_TAGS: ['strong', 'em', 'code', 'br', 'a'],
          // `target`/`rel` are listed but the sanitizer strips them anyway — see
          // `addNoopenerHook`, which re-adds both afterwards precisely because
          // ALLOWED_URI_REGEXP takes them out. Kept here so the intent is visible.
          ALLOWED_ATTR: ['href', 'target', 'rel'],
          ALLOWED_URI_REGEXP: /^https?:/i,
        }),
      }}
    />
  );
  const render = (chunk: string) => (isHtml ? renderHtml(chunk) : renderText(chunk));

  return (
    <>
      {render(main)}
      {quote && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setShowQuote((val) => !val);
          }}
          className={`text-[10px] mt-1.5 flex items-center gap-0.5 p-0 h-auto transition-opacity ${
            isAgent
              ? 'text-primary-foreground/55 hover:text-primary-foreground/90'
              : 'text-muted-foreground/55 hover:text-muted-foreground'
          }`}
        >
          <ChevronDown
            className={`w-2.5 h-2.5 transition-transform duration-150 ${showQuote ? 'rotate-180' : ''}`}
          />
          {showQuote ? 'hide quoted' : 'show quoted'}
        </Button>
      )}
      {quote && showQuote && (
        <div
          className={`mt-1 border-l-2 pl-2 opacity-60 ${isAgent ? 'border-primary-foreground/25' : 'border-border'}`}
        >
          {render(quote)}
        </div>
      )}
    </>
  );
}
