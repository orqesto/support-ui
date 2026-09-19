import DOMPurify, { type default as DOMPurifyType } from 'dompurify';
import type React from 'react';
import { imageProxyBase } from '@/lib/emailHtml';
import type { ThreadStatus, TicketPriority } from '@/types';

// ─── Visual constants ─────────────────────────────────────────────────────────

export const MONO = 'text-[10px] font-medium uppercase tracking-wide';
export const CHIP_BASE = `inline-flex items-center gap-1 px-2 py-0.5 rounded border ${MONO} transition-colors`;

// ─── Status display ───────────────────────────────────────────────────────────

// NOTE: this map is the MANUAL status-action control (the detail-header dropdown),
// not the display badge — the badge is owned by getStatusBadge (canonical). Under
// the derived model the only coherent manual actions are: Open (un-hold), On-hold
// (park — the 'pending' enum value stamps parked_at), Resolved, Closed. Open/In
// Progress/Pending-as-flow are DERIVED from lastReplyFromClient and not settable.
export const STATUS_DISPLAY: Record<ThreadStatus, { label: string; dot: string; chip: string }> = {
  open: {
    label: 'OPEN',
    dot: 'bg-sky-500',
    chip: 'text-sky-700    border-sky-200    bg-sky-50    dark:text-sky-400    dark:bg-sky-950/30    dark:border-sky-800',
  },
  in_progress: {
    label: 'IN PROGRESS',
    dot: 'bg-blue-500',
    chip: 'text-blue-700  border-blue-200  bg-blue-50  dark:text-blue-400  dark:bg-blue-950/30  dark:border-blue-800',
  },
  pending: {
    // The 'pending' enum value = the On-hold (park) action.
    label: 'ON-HOLD',
    dot: 'bg-amber-400',
    chip: 'text-amber-700  border-amber-200  bg-amber-50  dark:text-amber-400  dark:bg-amber-950/30  dark:border-amber-800',
  },
  resolved: {
    label: 'RESOLVED',
    dot: 'bg-emerald-500',
    chip: 'text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800',
  },
  closed: {
    label: 'CLOSED',
    dot: 'bg-muted-foreground/50',
    chip: 'text-muted-foreground border-border bg-muted',
  },
  filtered: {
    label: 'FILTERED',
    dot: 'bg-muted-foreground/30',
    chip: 'text-muted-foreground/60 border-border/50 bg-muted/50',
  },
  needs_routing: {
    label: 'NEEDS ROUTING',
    dot: 'bg-orange-500',
    chip: 'text-orange-700  border-orange-200  bg-orange-50  dark:text-orange-400  dark:bg-orange-950/30  dark:border-orange-800',
  },
};

// 'in_progress' removed — it's derived (customer reply), not manually settable
// (the BE rejects it too). 'pending' = the On-hold (park) action.
export const SETTABLE_STATUSES: ThreadStatus[] = ['open', 'pending', 'closed'];

export const STATUS_MENU_LABELS: Record<ThreadStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending: 'On-hold',
  resolved: 'Resolved',
  closed: 'Closed',
  filtered: 'Filtered',
  needs_routing: 'Needs Routing',
};

export const STATUS_OPTIONS = SETTABLE_STATUSES.map((stat) => ({
  value: stat,
  label: STATUS_DISPLAY[stat].label,
  menuLabel: STATUS_MENU_LABELS[stat],
  chipClassName: STATUS_DISPLAY[stat].chip,
  dotClassName: STATUS_DISPLAY[stat].dot,
}));

export const PRIORITY_OPTIONS: {
  value: TicketPriority;
  label: string;
  menuLabel: string;
  chipClassName: string;
  dotClassName: string;
}[] = [
  {
    value: 'low',
    label: 'LOW',
    menuLabel: 'Low',
    dotClassName: 'bg-green-500',
    chipClassName:
      'text-green-700  bg-green-50   border-green-200  dark:text-green-400  dark:bg-green-950/30  dark:border-green-800',
  },
  {
    value: 'medium',
    label: 'MEDIUM',
    menuLabel: 'Medium',
    dotClassName: 'bg-amber-500',
    chipClassName:
      'text-amber-900 bg-amber-100 border-amber-300 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800',
  },
  {
    value: 'high',
    label: 'HIGH',
    menuLabel: 'High',
    dotClassName: 'bg-orange-500',
    chipClassName:
      'text-orange-700 bg-orange-50  border-orange-200 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-800',
  },
  {
    value: 'critical',
    label: 'CRITICAL',
    menuLabel: 'Critical',
    dotClassName: 'bg-red-500',
    chipClassName:
      'text-red-700    bg-red-50     border-red-200    dark:text-red-400    dark:bg-red-950/30    dark:border-red-800',
  },
];

export const CHANNEL_ICONS: Record<string, string> = {
  email: '✉',
  telegram: '✈',
  slack: '◆',
  chat: '◉',
  whatsapp: '✆',
  other: '◌',
};

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

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboxBadge = { label: string; icon: React.ReactNode; cls: string };

// ─── Pure helper functions ────────────────────────────────────────────────────

export function getInitials(name: string): string {
  const parts = name
    .replace(/<[^>]+>/g, '')
    .split(/[\s@.]+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

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

export function renderMarkdown(raw: string): string {
  return (
    raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      // Autolink bare URLs. A plain-text mail is the ONLY place a tracking link can appear
      // without markup, and until now the text branch allowed no anchors at all — so the
      // link a customer was told to click was, in the console, unclickable text. Runs after
      // escaping (so `&` is already `&amp;`) and before newlines become <br>, and stops at
      // the trailing punctuation that ends a sentence rather than swallowing it into the URL.
      .replace(/\bhttps?:\/\/[^\s<>"']+/g, (url) => {
        const trimmed = url.replace(/[.,;:!?)\]]+$/, '');
        const tail = url.slice(trimmed.length);
        return `<a href="${trimmed}" target="_blank" rel="noopener noreferrer">${trimmed}</a>${tail}`;
      })
      .replace(/\n/g, '<br>')
  );
}

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
 * ⛔ Why not simply allow a `style` subset: `style` is in `FORBID_ATTR` for good reasons —
 * `position`, `display`, `opacity` and friends are how a mail turns a rendered message into an
 * overlay, and a real email carries all of them (one on staging: `position: relative; top: -1px;
 * display: none`). Admitting CSS to recover two numbers would buy the layout at the price of the
 * guard. Lifting the two numbers OUT instead keeps `style` forbidden and loses nothing: what
 * reaches the DOM is `width="600"`, a validated number, and no CSS at all.
 *
 * 🔑 This is not a hypothetical shape. In staging's SOM-INF-1579 every `<img>` in the message
 * carries its geometry in `style` and NOT in attributes — 8 of 8 — so support-ui#404, which
 * stopped the sanitizer deleting `width`/`height`, could not help that mail at all: there was
 * nothing there to keep. Emails use both spellings and we have to read both.
 *
 * An explicit attribute always wins: it is what the sender wrote for clients that read
 * attributes, and second-guessing it against their own CSS would be inventing a third answer.
 *
 * Both dimensions are carried even though `[&_img]:h-auto` decides the rendered height: a
 * width/height PAIR is what lets the browser reserve the right box before the bytes arrive,
 * and `h-auto` then keeps the picture undistorted inside it.
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

// Converts a suggested/AI answer (generated as plain text with markdown-ish
// syntax — blank-line paragraphs, `- ` bullets, `1.` lists, **bold**) into real
// HTML, so inserting it into the reply editor yields editable rich text that is
// sent to the customer as formatted HTML — not literal "**bold**" / "- " runs.
// If the answer already contains HTML tags it is returned untouched (TipTap +
// the outbound sanitizer handle it). Block structure (<p>/<ul>/<ol>) is built
// line-by-line; inline marks are applied to already-escaped text.
export function suggestedAnswerToHtml(raw: string): string {
  if (!raw) return '';
  // Already real HTML (a closing tag or a known inline/block tag)? Leave it for
  // the editor + outbound sanitizer. A stricter test than /<[a-z].*>/ so a bare
  // <https://…> / <name@host> token in plain text still gets converted, not
  // passed through (where the sanitizer would drop it as an unknown tag).
  if (
    /<\/[a-z][a-z0-9]*\s*>|<(?:br|p|div|ul|ol|li|strong|em|b|i|a|blockquote|pre|code)[\s/>]/i.test(
      raw
    )
  )
    return raw;

  const inline = (text: string): string =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      // URL char class excludes quotes/brackets so a crafted link text can't
      // break out of the href attribute (belt-and-suspenders — the caller also
      // runs the result through DOMPurify's attribute allowlist).
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s"'<>)]+)\)/g, '<a href="$2">$1</a>');

  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list)
      out.push(
        `<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`
      );
    list = null;
  };

  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      flushPara();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      out.push(`<p><strong>${inline(heading[1])}</strong></p>`);
    } else if (bullet) {
      flushPara();
      if (list?.tag !== 'ul') {
        flushList();
        list = { tag: 'ul', items: [] };
      }
      list.items.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (list?.tag !== 'ol') {
        flushList();
        list = { tag: 'ol', items: [] };
      }
      list.items.push(numbered[1]);
    } else {
      flushList();
      para.push(trimmed);
    }
  }
  flushPara();
  flushList();
  return out.join('');
}

// ─── Ghost answer types ───────────────────────────────────────────────────────

export type GhostOption = {
  answer: string;
  label: string;
  type: 'lead' | 'documentation' | 'similar';
};

export type SuggestedAnswerMeta = {
  answer: string;
  confidence?: number;
  source?: string;
  foundAt?: string;
};

export function toGhostOption(sa: SuggestedAnswerMeta | undefined | null): GhostOption | null {
  if (!sa?.answer) return null;
  const src = sa.source ?? '';
  const isLead = src === 'lead_qualification' || src === 'lead_qualification_kb';
  const isDocs = src === 'documentation';
  return {
    answer: sa.answer,
    label: isLead ? 'LEAD' : isDocs ? 'DOCS' : 'AI',
    type: isLead ? 'lead' : isDocs ? 'documentation' : 'similar',
  };
}

export function splitAtQuote(
  content: string | null | undefined,
  isHtml: boolean
): { main: string; quote: string | null } {
  if (!content) return { main: '', quote: null };
  if (isHtml) {
    // Split at the EARLIEST marker in the document, never at whichever pattern happens to
    // be first in this list. Returning on the first matching PATTERN is what broke
    // COR-SUP-251: every message there carries a `gmail_quote` div in the first ~2 KB and
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
  // (COR-SUP-2108). Re-run the same markers unanchored — but ONLY for that case: in a
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

// Convert an AI/suggested answer into sanitized HTML ready to drop into the reply
// editor. Single source of truth for BOTH insertion paths — the ghost-bubble /
// KB-dialog "use this answer" flow and the composer's AI actions — so the tag
// allowlist can never drift between them.
export function answerToEditorHtml(raw: string): string {
  return DOMPurify.sanitize(suggestedAnswerToHtml(raw), {
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
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^https?:/i,
  });
}
