/**
 * The public tracking page is a CUSTOMER-facing page and is deliberately always light: every
 * surface on it is a hard-coded literal (`bg-white`, `bg-[hsl(210,20%,98%)]`,
 * `text-[hsl(222.2,84%,4.9%)]`), never a theme token. It has no theme toggle and no dark
 * background to pair with dark text.
 *
 * Three classes escaped that rule — `text-foreground` once and `text-muted-foreground` twice,
 * in the loading and error states. `--foreground` is `210 40% 98%` under `.dark`, so with the
 * app's theme stored in localStorage (every agent who has ever used the app in that browser,
 * and any customer who is also a user) the heading rendered near-white ON WHITE.
 *
 * MEASURED on staging 2026-09-13, `/track/some-org/info/3822`:
 *   html.dark present → color rgb(248,250,252) on rgb(255,255,255) = contrast 1.05:1
 *   html.dark removed → color rgb(2,8,23)      on rgb(255,255,255) = contrast 20.01:1
 * WCAG AA wants 4.5:1 (3:1 for large text). 1.05 is invisible.
 *
 * ⚠️ This is a CLASS test, not a contrast test — jsdom does no layout and resolves no Tailwind,
 * so it cannot measure a ratio. It pins the invariant that actually broke: this file must carry
 * no theme-dependent colour class. A future `text-foreground` reintroduces the bug and this
 * turns red.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// cwd-relative, not `import.meta.url`: under this vitest/jsdom config `import.meta.url` is not
// a file: URL, and `fileURLToPath` throws before a single test runs.
const raw = readFileSync(resolve(process.cwd(), 'src/pages/TrackingPage.tsx'), 'utf8');

/**
 * Comments are stripped before scanning. The fix's own comment NAMES the offending classes to
 * explain why they must not come back — without this the file would fail its own invariant,
 * and the obvious "fix" would be to delete the explanation, which is the part worth keeping.
 *
 * ⛔ The line-comment pattern excludes `://`. A naive /\/\/.*$/ would swallow the remainder of
 * any line holding a URL, so a token reintroduced after one would be invisible to this guard —
 * a silent false negative, which is worse than no guard. The page has no URLs today; this is so
 * it still holds when someone adds one.
 */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/[^\n]*/g, '');

/** Colour classes whose value flips with `.dark`. */
const THEME_TOKENS = [
  'text-foreground',
  'text-muted-foreground',
  'bg-background',
  'bg-card',
  'text-card-foreground',
  'border-border',
];

describe('the public tracking page never depends on the app theme', () => {
  it.each(THEME_TOKENS)('does not use %s', (token) => {
    // Word-boundary so `text-muted-foreground` cannot satisfy the `text-foreground` case.
    const hit = new RegExp(`(^|[\\s"'\`])${token}([\\s"'\`]|$)`, 'm').test(source);
    expect(hit).toBe(false);
  });

  /**
   * THE CONTROL. Without it, "uses no theme tokens" is satisfied by a file that styles nothing
   * at all — deleting every class would pass the block above.
   */
  it('still styles its text, with the literals the rest of the page uses', () => {
    expect(source).toContain('text-[hsl(222.2,84%,4.9%)]');
    expect(source).toContain('text-[hsl(215.4,16.3%,46.9%)]');
  });

  /** The two states that carried the bug must still render their copy. */
  it('keeps the error and loading copy', () => {
    expect(source).toContain('Tracking link unavailable');
    expect(source).toContain('Loading…');
  });
});
