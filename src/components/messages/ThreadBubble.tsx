import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/Button';
import { API_BASE_URL } from '@/lib/config';
import { useAuthStore } from '@/stores/authStore';
import {
  THREAD_SANITIZE,
  addNoopenerHook,
  addProxiedImagesOnlyHook,
  liftImageDimensions,
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
  // The workspace the images belong to. It has to ride IN the proxy url: the browser loads
  // these `<img>` urls itself, so the `X-Organization-Context` header the api-client attaches
  // to every other request never reaches the backend — which answered 400 to every remote
  // image in every HTML mail because of it. Same source the interceptor reads.
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const [showQuote, setShowQuote] = useState(false);
  // Content can be null (e.g. an attachment-only message or a body that failed to
  // extract) — coerce to '' so the regex/split helpers below don't throw.
  // Prefer the original markup when we have it AND an id to proxy its images through.
  // Without the id there is no safe way to render remote images, so fall back to text
  // rather than render the mail with the sender's own URLs in it.
  // ⚠️ Dimensions are lifted out of `style` BEFORE the sources are rewritten and before the
  // sanitizer runs: `style` is forbidden, so by the time DOMPurify has finished there is nothing
  // left to read the geometry from. Order matters, and only in this direction.
  const original =
    html && eventId !== undefined
      ? proxyRemoteImages(liftImageDimensions(html), eventId, API_BASE_URL, selectedOrganizationId)
      : null;
  const safeContent = original ?? content ?? '';
  // Require a *real* HTML tag — a closing tag (</p>) or a known structural/void
  // tag (<br>, <div ...>). The old /<[a-z][\s\S]*>/ matched any angle-bracket
  // token, so a plaintext email containing a bare <https://…> link or a
  // <name@domain> address was misrouted into the HTML renderer, where newlines
  // collapse into one wall of text and the >-quoted reply history never splits.
  const isHtml =
    /<\/[a-z][a-z0-9]*\s*>|<(?:br|hr|img|p|div|table|span|a|ul|ol|li|blockquote|h[1-6])[\s/>]/i.test(
      safeContent
    );
  const { main, quote } = useMemo(() => splitAtQuote(safeContent, isHtml), [safeContent, isHtml]);

  // `[overflow-wrap:anywhere]` so a long unbroken token (e.g. a 200-char tracking
  // URL) wraps instead of overflowing the bubble — overflow-wrap isn't inherited,
  // so the wrapper's break-words doesn't reach this nested prose div. Without it
  // the narrow side-panel preview clips the real content off-screen.
  //
  // ⛔ The `[&_pre]`/`[&_img]`/`[&_table]` rules are load-bearing, not cosmetic. The
  // typography plugin is NOT installed — `prose` classes are inert — so a sender's
  // original markup renders with browser defaults: `<pre>` never wraps (a Shopify
  // contact-form relay wraps the whole body in one), an `<img>`/`<table>` lays out at
  // its natural size. Any of those wider than the bubble used to propagate up to the
  // thread panel, whose `overflow-y-auto` implicitly makes overflow-x scrollable —
  // the entire thread then scrolled sideways, clipping every message (ORB-SUP-1358).
  // Wide tables instead scroll inside their own bubble.
  const base =
    'prose prose-sm max-w-none break-words [overflow-wrap:anywhere] [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 ' +
    '[&_pre]:whitespace-pre-wrap [&_img]:max-w-full [&_img]:h-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto';
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
