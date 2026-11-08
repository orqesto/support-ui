import type { default as DOMPurifyType } from 'dompurify';
import { imageProxyBase } from '@/lib/emailHtml';

// ─── Sanitizer config and hooks ───────────────────────────────────────────────

export const THREAD_SANITIZE = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'b',
    'i',
    'u',
    'strong',
    'em',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'hr',
    'span',
    'table',
    'tr',
    'td',
    'th',
    // Only ever reaches the DOM already rewritten to our proxy by `proxyRemoteImages`;
    // `width`/`height` come along so an order banner keeps its proportions.
    'img',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'width', 'height'],
  FORBID_ATTR: ['style', 'class', 'id'],
  ALLOWED_URI_REGEXP: /^https?:/i,
  /**
   * ⛔ Without this, `ALLOWED_URI_REGEXP` ABOVE DELETES `width` and `height`.
   *
   * DOMPurify URI-checks every attribute EXCEPT those it holds as URI-safe, and its defaults
   * cover `alt` but not `width`/`height` — which is why `alt` survives the same sanitizer and the
   * dimensions do not. `40` does not match `^https?:`, so every dimension an email carries was
   * stripped (measured, not reasoned: sanitizing the same tag with and without the pattern) and every
   * remote image rendered at its intrinsic size, scaled to the container by `[&_img]:max-w-full`.
   * A 40px logo became a full-width banner; an 88px product thumbnail became a block. The comment
   * on `img` above asserted the opposite and had done since the config was written, which is why
   * nobody checked: the words said the sizes came along, and the config removed them.
   *
   * It is the SAME trap `addNoopenerHook` documents below for `target`/`rel`. That one was found
   * because the anchors misbehaved visibly; this one hid until remote images began rendering at
   * all (support-service#773 — before it, they were broken placeholders for any global admin).
   *
   * Proven with a control: sanitizing the same `<img>` with and only with `ALLOWED_URI_REGEXP`
   * loses `width`/`height`; adding them here restores them, and a `javascript:` href or src is
   * still refused — these two are marked safe, the URI guard itself is untouched.
   */
  ADD_URI_SAFE_ATTR: ['width', 'height'],
};

/**
 * Force every surviving link to open in a new tab, with `rel="noopener noreferrer"`.
 *
 * 🪤 This used to read `if (target === '_blank') setAttribute('rel', …)` — a condition that
 * could NEVER be true. `ALLOWED_URI_REGEXP: /^https?:/i` below is applied by DOMPurify to
 * attribute values generally, not just to href, so `target="_blank"` and
 * `rel="noopener noreferrer"` are BOTH stripped before any hook runs: `_blank` does not
 * match `^https?:`. The hook then looked for an attribute the sanitizer had just removed.
 * Proven by sanitizing the same anchor with and only with that one config key.
 *
 * So the attributes are SET here rather than checked. By this point the node has already
 * survived the sanitizer, meaning its href passed the http(s) restriction — which is
 * exactly the anchor we want opening in a new tab and unable to reach `window.opener`.
 */
let noopenerHookRegistered = false;
export function addNoopenerHook(DOMPurify: typeof DOMPurifyType): void {
  if (noopenerHookRegistered) return;
  noopenerHookRegistered = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.tagName !== 'A' || !node.hasAttribute('href')) return;
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  });
}

/**
 * Last line of defence: strip any `<img>` whose src is not OUR proxy.
 *
 * ⛔ `proxyRemoteImages` rewrites sources with a regex over sender-controlled markup, and a
 * regex over hostile HTML is a thing that can be wrong. If one slips past it, the sanitizer
 * would happily keep it — `ALLOWED_URI_REGEXP` admits any https URL — and the browser would
 * fetch it straight from the sender, which is the read-receipt leak the proxy exists to
 * prevent. This checks the DOM node AFTER parsing, where there is no quoting or entity
 * trickery left to hide behind, so a rewrite miss degrades to a missing image rather than to
 * a silent beacon.
 *
 * (The docblock above belongs to `addProxiedImagesOnlyHook`, further down; `isProxiedImageUrl`
 * and `PROXY_PATH` are the test it applies.)
 */

/**
 * Is this src one of OUR proxy urls?
 *
 * Two shapes reach the sanitizer and both are ours: the workspace-scoped one the console now
 * writes, and the bare one, which still answers for any caller that can set an
 * `X-Organization-Context` header. A prefix test alone was enough while there was one shape;
 * with two it would have to be loose enough to admit `/api/`, and `/api/anything` is not a
 * proxy url. So the PATH is matched, not merely the start of the string.
 */
const PROXY_PATH = /^\/api\/(?:organizations\/\d+\/)?messages\/events\/\d+\/image(?:\?|$)/;

/**
 * ⚠️ Takes the API BASE URL, not a prefix. An earlier version took `${base}/api/` and recovered
 * the path by subtracting the length of `/api/` — which silently misaligns the moment the
 * caller's prefix is anything else, and a misaligned path test strips every image on the page.
 * The base is the one value the component actually has.
 */
export function isProxiedImageUrl(src: string, apiBaseUrl: string): boolean {
  if (!src.startsWith(apiBaseUrl)) return false;
  return PROXY_PATH.test(src.slice(apiBaseUrl.length));
}

let proxiedImageHookPrefix: string | null = null;
export function addProxiedImagesOnlyHook(
  DOMPurify: typeof DOMPurifyType,
  apiBaseUrl: string
): void {
  const prefix = apiBaseUrl;
  // The prefix can change between environments; re-registering with a new one must replace
  // the closure rather than stack a second hook.
  if (proxiedImageHookPrefix === prefix) return;
  const first = proxiedImageHookPrefix === null;
  proxiedImageHookPrefix = prefix;
  if (!first) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.tagName !== 'IMG') return;
    const src = node.getAttribute('src') ?? '';
    if (!proxiedImageHookPrefix || !isProxiedImageUrl(src, proxiedImageHookPrefix)) {
      node.remove();
    }
  });
}

// ─── Remote images: proxy rewrite ─────────────────────────────────────────────

/**
 * Point every remote `<img>` at our own proxy, so opening a thread never touches the
 * sender's server.
 *
 * ⛔ This is a PRIVACY control, not plumbing. A remote image in an email is a read receipt:
 * loading it directly tells whoever mailed us the exact moment an agent opened the message,
 * from the agent's IP. Routed through the backend, the sender sees one request from our
 * server and learns nothing about who read it or when. It is the reason `img` can be allowed
 * at all — see `messageHtmlController` for the guards on the other end.
 *
 * `cid:` parts are rewritten too — those are images the mail carried with it, served from the
 * attachment row rather than fetched from anywhere. Sources that are neither (`data:` URIs,
 * relative paths) are left alone; the sanitizer drops them, which is the right outcome for
 * markup we cannot serve on the reader's behalf.
 *
 * (That docblock describes `proxyRemoteImages`, below the two decoding helpers.)
 */

/**
 * One code point, or '' when the reference does not name one.
 *
 * ⚠️ It DROPS an unresolvable reference rather than keeping the raw text, because what it
 * returns has to equal what the backend's twin returns — the backend builds the allowlist and
 * this builds the url checked against it.
 */
const safeFromCodePoint = (code: number): string => {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
};

/**
 * An attribute value as the BROWSER would read it — character references resolved.
 *
 * ⛔ Must stay equivalent to `decodeHtmlEntities` in the backend's `messageHtmlBody.ts`. That
 * one builds the proxy's ALLOWLIST from the same markup and this one produces the url checked
 * against it, so a decoder that handled one more entity than its twin would turn a legitimate
 * image into a 403.
 *
 * An email writes `?auto=format&amp;fit=crop` because a raw `&` is not legal in an attribute.
 * The browser resolves that before requesting anything; a regex over the source does not, so
 * without this the proxy was asked to fetch a url with a literal `&amp;` in its query.
 */
export const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_m, code: string) => safeFromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => safeFromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    // LAST, so `&amp;#39;` decodes to the text `&#39;` rather than to an apostrophe.
    .replace(/&amp;/gi, '&');

/**
 * A CSS length an HTML `width`/`height` attribute can carry, or null.
 *
 * The attribute understands two things only: a pixel count as a bare number, and a percentage.
 * Everything else an email might write — `auto`, `inherit`, `calc(100% - 20px)`, `12em`, or the
 * old IE `expression(...)` — has no attribute equivalent, so it is dropped rather than guessed
 * at. The ceiling is a sanity bound, not a security one: nothing here reaches the DOM as CSS.
 */
const cssLengthAsAttribute = (value: string): string | null => {
  // `!important` is everywhere in email CSS, because templates fight the client's own stylesheet.
  // It says nothing about the length, so it is stripped before the value is read rather than
  // causing the declaration to be dropped as unparseable.
  const length = value
    .trim()
    .toLowerCase()
    .replace(/\s*!\s*important\s*$/, '')
    .trim();
  const px = length.match(/^(\d{1,5})(?:\.\d+)?px$/);
  if (px) return Number(px[1]) > 0 && Number(px[1]) <= 10000 ? px[1] : null;
  const pct = length.match(/^(\d{1,3})(?:\.\d+)?%$/);
  if (pct) return Number(pct[1]) > 0 && Number(pct[1]) <= 100 ? `${pct[1]}%` : null;
  const bare = length.match(/^(\d{1,5})$/);
  if (bare) return Number(bare[1]) > 0 && Number(bare[1]) <= 10000 ? bare[1] : null;
  return null;
};

/**
 * Copy an image's size out of `style` into `width`/`height` attributes, before sanitizing.
 *
 * ⚠️ 2026-09-19: THIS COMMENT USED TO ARGUE AGAINST ALLOWING CSS AT ALL, and that argument no
 * longer describes the thread. It read: "`style` is in `FORBID_ATTR` for good reasons … what
 * reaches the DOM is `width="600"`, a validated number, and no CSS at all." That is still true
 * of the surfaces using `THREAD_SANITIZE`, and it is NO LONGER true of `ThreadBubble`, which
 * now renders sender mail through `sanitizeEmailHtml` with a filtered inline-`style` subset —
 * because forbidding `style` outright is what collapsed table-built signatures.
 *
 * The concern the old text raised was answered rather than ignored: `position`, `top` and the
 * rest of that overlay set are REJECTED by name in `CSS_ALLOWED_PROPERTIES`, and the real
 * staging example it cites (`position: relative; top: -1px; display: none`) keeps only
 * `display: none` today. So the guard survived; only the blanket ban went.
 *
 * Lifting the two numbers out still earns its place: it normalises `%` and bare numbers into
 * validated attributes, it gives clients and the box-reservation path an explicit pair, and it
 * is what the `THREAD_SANITIZE` fallback (a bubble with no `eventId`) still depends on.
 *
 * 🔑 This is not a hypothetical shape. In staging's SOM-INF-1579 every `<img>` in the message
 * carries its geometry in `style` and NOT in attributes — 8 of 8 — so support-ui#404, which
 * stopped the sanitizer deleting `width`/`height`, could not help that mail at all: there was
 * nothing there to keep. Emails use both spellings and we have to read both.
 *
 * An explicit attribute always wins: it is what the sender wrote for clients that read
 * attributes, and second-guessing it against their own CSS would be inventing a third answer.
 *
 * Both dimensions are carried even though `[&_img]:!h-auto` decides the rendered height: a
 * width/height PAIR is what lets the browser reserve the right box before the bytes arrive,
 * and the height rule then keeps the picture undistorted inside it.
 *
 * ⛔ Note the `!`. While the sender's height arrived only as an ATTRIBUTE, a plain `h-auto`
 * class outranked it and the picture stayed proportional for free. Now that the email renderer
 * also keeps `height` in `style`, an inline declaration beats a plain class — so the rule had
 * to become `!h-auto` or a wide image capped by `max-w-full` renders squashed. Anything that
 * changes what this function leaves behind in `style` has to re-check that pairing.
 *
 * ⚠️ The `<img …>` match shares `proxyRemoteImages`' convention and stops at the first `>`, so a
 * `>` inside an attribute value (`alt="5 > 3"`) truncates the tag it sees. That is pre-existing
 * and survivable — DOMPurify parses whatever comes out and is the real boundary — but it is a
 * regex over sender markup, which is worth knowing before extending it.
 */
export function liftImageDimensions(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const style = tag.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
    const declarations = style?.[2] ?? style?.[3];
    if (!declarations) return tag;

    let out = tag;
    for (const dimension of ['width', 'height'] as const) {
      // Already stated as an attribute? Leave the sender's own answer alone.
      if (new RegExp(`\\b${dimension}\\s*=`, 'i').test(out)) continue;
      // `max-width` must not be read as `width`, hence the boundary before the name.
      const declared = declarations.match(
        new RegExp(`(?:^|;)\\s*${dimension}\\s*:\\s*([^;]+)`, 'i')
      );
      const value = declared ? cssLengthAsAttribute(declared[1]) : null;
      if (!value) continue;
      out = out.replace(/<img\b/i, `<img ${dimension}="${value}"`);
    }
    return out;
  });
}

export function proxyRemoteImages(
  html: string,
  eventId: number,
  apiBaseUrl: string,
  organizationId?: number | null
): string {
  // ⛔ The workspace has to be IN THE URL. A browser loads these `<img>` urls itself, with no
  // axios interceptor, so `X-Organization-Context` — the only carrier a global admin's org
  // context has — never reaches the backend. Production answered 400 to every remote image in
  // every HTML mail because of it — on TES-INF-1393, every image request that had completed
  // when the network log was read was a 400. With no workspace selected the old shape is
  // written unchanged rather than an `organizations/undefined` path, and the backend still
  // resolves it from the header for anyone who can send one.
  //
  // ⛔ ONE builder, shared with the email renderer, and it must stay that way. This function
  // WRITES the `src`; `sanitizeEmailHtml`'s last-line-of-defence hook then DELETES any `<img>`
  // whose src does not start with `imageProxyBase(…)`. Those were two separate copies of the
  // same template string until the 2026-09-19 audit. A one-character drift between them would
  // not fail loudly — it would remove every image from every email, silently, everywhere.
  const base = imageProxyBase({ eventId, apiBaseUrl, organizationId });
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (whole, prefix: string, _q: string, dq?: string, sq?: string, bare?: string) => {
      const src = (dq ?? sq ?? bare ?? '').trim();

      // An image the mail CARRIED with it. The bytes are already ours (stored as an attachment
      // at ingest), so this reaches the same endpoint with `cid` instead of `src` — one URL
      // shape for the console to produce and one prefix for the sanitizer to allow.
      //
      // ⚠️ Only mail ingested after the Content-ID began being stored can resolve; older
      // messages 404 and the image stays missing. The mapping was deleted at ingest and cannot
      // be rebuilt from filenames — on production only 14 of 69 cid references matched a stored
      // filename, so guessing the rest would render the WRONG image.
      if (/^cid:/i.test(src)) {
        const cid = src.slice(4).trim();
        if (cid.length === 0) return whole;
        const inline = `${base}?cid=${encodeURIComponent(decodeHtmlEntities(cid))}`;
        return `${prefix}"${inline}"`;
      }

      if (!/^https?:\/\//i.test(src)) return whole;
      const proxied = `${base}?src=${encodeURIComponent(decodeHtmlEntities(src))}`;
      return `${prefix}"${proxied}"`;
    }
  );
}
