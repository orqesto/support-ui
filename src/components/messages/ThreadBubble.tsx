import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/Button';
import { API_BASE_URL } from '@/lib/config';
import { sanitizeEmailHtml } from '@/lib/emailHtml';
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

  /**
   * The ground an EMAIL renders on, as opposed to the bubble it sits in.
   *
   * ⛔ This is a dependency of allowing sender CSS at all, not a cosmetic choice. Until now
   * `style` was stripped, so forcing `text-primary-foreground` on the bubble was at least
   * self-consistent: nothing the sender said about colour survived. The moment inline `style`
   * is honoured, a sender who sets `color:#333` on part of their mail — which is most business
   * mail — lands dark text on our blue bubble and becomes unreadable. Allowing the CSS without
   * settling the ground makes some mail render WORSE than before the change.
   *
   * So an HTML body gets a light ground with a dark default colour, in BOTH themes. That is
   * Gmail's behaviour and for the same reason: senders write for a light background and simply
   * omit `background-color`, so any other ground is a guess that fails for a large slice of
   * real mail. Plain-text bodies are NOT affected — they keep following the app theme, because
   * there is no sender styling to respect.
   *
   * `overflow-x-auto` + `min-w-[min(600px,100%)]`: 600px is the de-facto width email is designed
   * for, and this signature's `<table width="100%">` with a 150px logo cell had nowhere to go in
   * a 524px bubble — which is why contact lines were breaking mid-token. Where the bubble is
   * wide enough the mail simply uses it; where it is not, the mail keeps its intended width and
   * scrolls INSIDE its own container. Containing the scroll here is what lets `[&_table]:block`
   * go: that rule existed only to stop a wide table propagating overflow up to the thread panel
   * (ORB-SUP-1358), and it did so by destroying table layout. The container now holds that line
   * without flattening anything.
   */
  const emailGround =
    'rounded bg-white text-[#202124] px-3 py-2 overflow-x-auto ' +
    // `<pre>` never wraps by default and a contact-form relay wraps the ENTIRE body in one, so
    // without this a single such mail is one unbroken line. The container would scroll rather
    // than break the panel, but scrolling to read a message is not reading it.
    /**
     * ⛔ `!h-auto`, not `h-auto`, and the `!` is the whole point.
     *
     * `max-w-full` caps a wide image at the container. Aspect ratio then depends on the height
     * being free to follow. That used to be automatic: the sender's height arrived as a
     * presentational ATTRIBUTE, and any CSS beats an attribute, so `h-auto` won.
     *
     * Now that inline `style` survives, a sender writing `style="height:40px"` beats a plain
     * class — so a capped image would keep its full height and render squashed. The `!` puts
     * the rule back above inline style and restores exactly the behaviour that was correct
     * before this change. Found by auditing the diff against `liftImageDimensions`, which
     * leaves the dimensions in `style` as well as lifting them to attributes.
     */
    '[&_pre]:whitespace-pre-wrap [&_img]:max-w-full [&_img]:!h-auto ' +
    '[&_a]:text-[#1a0dab] [&_a]:underline';

  /**
   * Sanitizing is now materially more expensive than it was: it parses and filters the inline
   * CSS of every styled element, where before it deleted the attribute outright. This runs for
   * the body AND the quoted history of every message, and a thread panel re-renders on things
   * as ordinary as typing in the composer — 22 bubbles on SOM-INF-1579, each with a signature.
   * Memoised on the inputs that can actually change the output.
   */
  /**
   * `null` when there is no `eventId`, which is the single source of truth for "can this
   * message be rendered as email at all". Without an id there is no proxy URL, so the sender's
   * image hosts were never rewritten and we must not render their CSS around images we refuse
   * to load — the spam preview on MessagesPage reaches exactly that path.
   *
   * Returning `null` rather than a function that returns `''` is deliberate: an earlier version
   * had the `eventId === undefined` test in BOTH this memo and `renderHtml`, so the branch in
   * here could never run. A guard that cannot fire reads like one that can.
   */
  const sanitizeChunk = useMemo(() => {
    if (eventId === undefined) return null;
    const cache = new Map<string, string>();
    return (chunk: string): string => {
      const hit = cache.get(chunk);
      if (hit !== undefined) return hit;
      const clean = sanitizeEmailHtml(chunk, {
        eventId,
        apiBaseUrl: API_BASE_URL,
        organizationId: selectedOrganizationId,
      });
      cache.set(chunk, clean);
      return clean;
    };
  }, [eventId, selectedOrganizationId]);

  const renderHtml = (html: string) => {
    if (sanitizeChunk === null) {
      return (
        <div
          className={prose}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, THREAD_SANITIZE) }}
        />
      );
    }
    const clean = sanitizeChunk(html);
    // A body can sanitize down to nothing — a message whose whole content was one image we
    // refuse to load, or markup made entirely of tags outside the allowlist. Rendering the
    // ground anyway leaves an empty white card in the thread, which reads as "this message is
    // blank" rather than "nothing here could be shown". Render nothing instead.
    if (clean.trim().length === 0) return null;
    return (
      <div className={emailGround}>
        <div
          className="[overflow-wrap:anywhere] min-w-[min(600px,100%)] text-[13px] leading-normal"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      </div>
    );
  };
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
