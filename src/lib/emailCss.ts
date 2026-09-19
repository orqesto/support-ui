/**
 * The CSS half of the email renderer: what a sender is allowed to say about how their mail
 * looks, and what happens to the URLs inside it.
 *
 * ⛔ WHY THIS EXISTS AT ALL. Until now `style` was simply forbidden on sender markup, so every
 * email rendered with browser defaults inside our own `prose` rules. That is why a table-built
 * signature collapsed: the geometry lived in `style` and in presentational attributes, and both
 * were stripped. Allowing `style` back is what fixes the layout — and it is also the single
 * largest new attack surface in this feature, which is why the filtering lives in one module
 * with its own tests rather than inline at the call site.
 *
 * The model is Gmail's, chosen deliberately over an iframe (owner decision, 2026-09-19):
 *   · `<style>` and `<link>` are dropped entirely. Only the inline `style` attribute survives.
 *     This is not a shortcut — Gmail does exactly this, which is why every sender who cares has
 *     already inlined their critical declarations. Supporting `<style>` would buy almost nothing.
 *   · Surviving declarations are filtered against a property allowlist, and Gmail's unsupported
 *     set is rejected explicitly.
 *   · Every `url()` that survives is REWRITTEN through our image proxy — never passed through,
 *     never silently dropped.
 *
 * ⛔ THE `url()` RULE IS A PRIVACY CONTROL, NOT PLUMBING. A remote URL in CSS is a read receipt
 * exactly like a remote `<img>`: `background-image:url(https://sender/px.gif)` tells the sender
 * the moment an agent opened the mail, from the agent's IP. `proxyRemoteImages` closes that hole
 * for `<img>` and would not have seen this one. Anything that can carry a URL either goes through
 * the proxy or does not survive — see `CSS_REJECTED_PROPERTIES` for the ones that take the second
 * route.
 *
 * 🪤 The declaration splitter here is hand-written rather than delegated to the browser's own CSS
 * parser (`el.style.cssText = …`). That is on purpose. jsdom implements a SUBSET of CSS, so a
 * parser-based filter would silently drop properties in tests that it keeps in a real browser —
 * the tests would then be describing a renderer that does not exist. A hand-written splitter
 * behaves identically in both, so a green test is evidence about production.
 */

/**
 * Properties a sender may set. Chosen to cover what email is actually built out of — boxes,
 * tables, type and colour — and nothing that can move content out of its container or animate.
 *
 * Keeping this as an explicit Set (rather than "anything not rejected") is the whole point: an
 * unknown property is DROPPED, so a CSS feature invented after this was written cannot arrive
 * pre-approved.
 */
export const CSS_ALLOWED_PROPERTIES: ReadonlySet<string> = new Set([
  // Box
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'box-sizing',
  // Border
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-style',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-radius',
  'border-collapse',
  'border-spacing',
  // Background (background-image is allowed BECAUSE its url() is rewritten, see filterDeclarations)
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',
  // Type
  'color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-decoration',
  'text-indent',
  'text-transform',
  'white-space',
  'word-break',
  'word-wrap',
  'overflow-wrap',
  'direction',
  'unicode-bidi',
  // Table / layout
  'display',
  'vertical-align',
  'table-layout',
  'caption-side',
  'empty-cells',
  'float',
  'clear',
  'overflow',
  'overflow-x',
  'overflow-y',
  // Lists
  'list-style',
  'list-style-type',
  'list-style-position',
  'list-style-image',
  // Misc
  'opacity',
  'visibility',
]);

/**
 * Rejected on purpose, with the reason. This list is not load-bearing for SECURITY — anything
 * absent from `CSS_ALLOWED_PROPERTIES` is dropped anyway — it exists so the test can enumerate
 * both lists and fail on a property that appears in NEITHER. Without that, someone adding a
 * property to the allowlist gets a silent pass instead of a decision.
 */
export const CSS_REJECTED_PROPERTIES: ReadonlyMap<string, string> = new Map([
  ['position', 'can lift content out of the bubble and overlay our own UI'],
  ['z-index', 'only meaningful with position'],
  ['top', 'only meaningful with position'],
  ['right', 'only meaningful with position'],
  ['bottom', 'only meaningful with position'],
  ['left', 'only meaningful with position'],
  ['transform', 'Gmail-unsupported; can move content off its own box'],
  ['animation', 'Gmail-unsupported; motion we never asked for'],
  ['transition', 'Gmail-unsupported'],
  ['box-shadow', 'Gmail-unsupported'],
  ['text-shadow', 'Gmail-unsupported'],
  ['filter', 'Gmail-unsupported; historically an IE script vector'],
  ['backdrop-filter', 'Gmail-unsupported'],
  ['mix-blend-mode', 'Gmail-unsupported'],
  ['clip-path', 'can hide content unpredictably'],
  ['mask', 'takes a url()'],
  ['mask-image', 'takes a url()'],
  ['cursor', 'takes a url() and is pure chrome'],
  ['content', 'takes a url() and can inject text that is not in the message'],
  ['border-image', 'takes a url() and is Gmail-unsupported'],
  ['behavior', 'IE HTC script execution'],
  ['-moz-binding', 'XBL script execution'],
  ['pointer-events', 'can make our own UI unclickable'],
  ['user-select', 'can stop an agent copying the message'],
  ['will-change', 'no reason for a sender to have it'],
  ['flex', 'Gmail-unsupported'],
  ['flex-direction', 'Gmail-unsupported'],
  ['flex-wrap', 'Gmail-unsupported'],
  ['align-items', 'Gmail-unsupported'],
  ['justify-content', 'Gmail-unsupported'],
  ['gap', 'Gmail-unsupported'],
  ['grid', 'Gmail-unsupported'],
  ['grid-template', 'Gmail-unsupported'],
  ['grid-template-columns', 'Gmail-unsupported'],
  ['grid-template-rows', 'Gmail-unsupported'],
]);

/**
 * `display` needs its VALUES restricted, not just its name. Email is built out of tables and
 * blocks; `flex`/`grid` are Gmail-unsupported, so a sender relying on them has already been
 * told by Gmail that they do not work.
 */
export const CSS_ALLOWED_DISPLAY_VALUES: ReadonlySet<string> = new Set([
  'block',
  'inline',
  'inline-block',
  'none',
  'list-item',
  'table',
  'inline-table',
  'table-row',
  'table-row-group',
  'table-header-group',
  'table-footer-group',
  'table-cell',
  'table-column',
  'table-column-group',
  'table-caption',
]);

/**
 * Strip CSS comments and resolve backslash escapes, so the guards below cannot be walked past
 * with `u\72 l(…)`, `exp/*x*\/ression(…)` or a stray newline inside a keyword.
 *
 * 🪤 This runs BEFORE any keyword test. Testing the raw text first and normalising afterwards
 * is the classic ordering bug — the obfuscated form passes the test and the normalised form is
 * what the browser then executes.
 */
export function normalizeCssText(value: string): string {
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, '');
  // CSS escapes: `\` + 1-6 hex digits + optional single whitespace, or `\` + any character.
  return withoutComments.replace(
    /\\([0-9a-fA-F]{1,6})\s?|\\(.)/g,
    (_whole, hex?: string, chr?: string) =>
      hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : (chr ?? '')
  );
}

/** Values carrying any of these die regardless of which property they were attached to. */
const HOSTILE_VALUE =
  /expression\s*\(|behavior\s*:|-moz-binding|@import|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html/i;

/**
 * Split a `style` attribute into declarations on `;`, ignoring separators inside quotes or
 * parentheses.
 *
 * 🪤 A plain `value.split(';')` is wrong and the failure is invisible: a `data:` URI carries its
 * own `;` (`url(data:image/png;base64,…)`), so splitting naively cuts one declaration into two
 * malformed halves — the guard then inspects fragments rather than declarations.
 */
export function splitDeclarations(style: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const char of style) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ';' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((decl) => decl.trim()).filter((decl) => decl.length > 0);
}

/**
 * Rewrite every `url(…)` in a declaration value through the image proxy.
 *
 * Returns `null` to mean "drop this declaration entirely" — used when a URL is present but is
 * not something we can serve on the reader's behalf (a relative path, a `data:` URI we will not
 * vouch for, an unparseable url token). Dropping is the safe direction: a missing background is
 * a cosmetic loss, a passed-through one is a read receipt.
 */
export function rewriteCssUrls(value: string, proxyBase: string): string | null {
  if (!/url\s*\(/i.test(value)) return value;
  let dropped = false;
  const rewritten = value.replace(
    /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
    (_whole, dq?: string, sq?: string, bare?: string) => {
      const raw = (dq ?? sq ?? bare ?? '').trim();
      if (!/^https?:\/\//i.test(raw)) {
        dropped = true;
        return '';
      }
      return `url("${proxyBase}?src=${encodeURIComponent(raw)}")`;
    }
  );
  return dropped ? null : rewritten;
}

/**
 * The filter itself: take a sender's `style` attribute, return the declarations we are prepared
 * to render. An empty string means nothing survived, and the caller should remove the attribute
 * rather than leave `style=""` behind.
 */
export function filterDeclarations(style: string, proxyBase: string): string {
  const kept: string[] = [];
  for (const declaration of splitDeclarations(normalizeCssText(style))) {
    const colon = declaration.indexOf(':');
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    let value = declaration.slice(colon + 1).trim();
    if (value.length === 0) continue;

    // An unknown property is dropped. The rejected map is consulted for nothing at runtime —
    // it documents decisions and drives the enumerating test.
    if (!CSS_ALLOWED_PROPERTIES.has(property)) continue;
    if (HOSTILE_VALUE.test(value)) continue;
    // `!important` from a sender would outrank our own container rules; strip the flag but keep
    // the declaration, which is what the sender actually meant.
    value = value.replace(/!\s*important\s*$/i, '').trim();
    if (value.length === 0) continue;
    if (property === 'display' && !CSS_ALLOWED_DISPLAY_VALUES.has(value.toLowerCase())) continue;

    const resolved = rewriteCssUrls(value, proxyBase);
    if (resolved === null || resolved.trim().length === 0) continue;
    kept.push(`${property}: ${resolved}`);
  }
  return kept.join('; ');
}

/**
 * Per-message class prefix, Gmail's `m_<id>_<name>` shape.
 *
 * Rewriting is what keeps a sender's `class="prose"` or `class="hidden"` from picking up OUR
 * stylesheet — the reason we can render inline at all instead of in an iframe. Since `<style>`
 * blocks are dropped, no surviving selector can match these names either; they are kept purely
 * so a sender's own inline-styled markup does not lose its structure.
 */
export function prefixClasses(value: string, eventId: number): string {
  return value
    .split(/\s+/)
    .filter((name) => name.length > 0)
    .map((name) => (name.startsWith(`m_${eventId}_`) ? name : `m_${eventId}_${name}`))
    .join(' ');
}
