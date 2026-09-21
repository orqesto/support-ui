/**
 * The public tracking page is CUSTOMER-facing and is deliberately always light. It has no theme
 * toggle and no dark background to pair with dark text.
 *
 * THE BUG THIS EXISTS FOR, measured on staging 2026-09-13 at `/track/some-org/info/3822`:
 *   html.dark present → color rgb(248,250,252) on rgb(255,255,255) = contrast 1.05:1
 *   html.dark removed → color rgb(2,8,23)      on rgb(255,255,255) = contrast 20.01:1
 * `--foreground` is `210 40% 98%` under `.dark`, so with the app's theme stored in localStorage —
 * every agent who has used the app in that browser, and any customer who is also a user — the
 * heading rendered near-white ON WHITE. WCAG AA wants 4.5:1. 1.05 is invisible.
 *
 * 🎨 HOW IT IS HELD CHANGED ON 2026-09-21 (app palette), and this file changed with it.
 *
 *   Old: every surface on the page was a hard-coded literal (`text-[hsl(222.2,84%,4.9%)]`), and
 *        this test banned theme tokens outright. It worked, and it had a hole the old header
 *        admitted: it guarded only THIS FILE's markup. `<Textarea>` and `<Button>` still followed
 *        the app theme, so a dark widget sat on a light page.
 *   New: the page renders inside `.surface-light`, which re-declares the light values for the
 *        whole subtree. Tokens are now the RIGHT answer here — `bg-input` on the customer's reply
 *        box resolves light too, which the literals could never fix.
 *
 * ⛔ Re-declaring the variables is NOT sufficient on its own, and that is the part worth pinning:
 * `color` is inherited from OUTSIDE the scope (usually <body>, still carrying `.dark`), which is
 * the precise mechanism that produced 1.05:1. The scope must also paint its own ink and ground.
 *
 * ⚠️ Still a CLASS/CSS test, not a contrast test — jsdom does no layout and resolves no Tailwind,
 * so it cannot measure a ratio. It pins the invariants that actually broke.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// cwd-relative, not `import.meta.url`: under this vitest/jsdom config `import.meta.url` is not
// a file: URL, and `fileURLToPath` throws before a single test runs.
const raw = readFileSync(resolve(process.cwd(), 'src/pages/TrackingPage.tsx'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/**
 * Comments are stripped before scanning, because the fix's own comments NAME the mechanism they
 * describe. Without this the file could fail its own invariant and the obvious "fix" would be to
 * delete the explanation, which is the part worth keeping.
 *
 * ⛔ The line-comment pattern excludes `://`. A naive /\/\/.*$/ would swallow the remainder of any
 * line holding a URL, so a literal reintroduced after one would be invisible to this guard — a
 * silent false negative, which is worse than no guard.
 */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/[^\n]*/g, '');

describe('the tracking page pins itself light, whatever theme the visitor carries', () => {
  it('scopes EVERY top-level root, not just the main one', () => {
    /**
     * ⛔ THE ASSERTION THAT CAUGHT A REGRESSION IN THE COMMIT THAT WROTE IT. This page has three
     * roots: loading, error, and the page proper. The first version of this change scoped only
     * the third while swapping the literals for tokens everywhere — so the loading and error
     * states, the two that carried the original 1.05:1 bug, got theme-dependent ink on a fixed
     * light ground and reproduced it exactly.
     *
     * A page-level scope is only as good as its least-scoped entry point, so the invariant is
     * "every full-height root", not "the root".
     */
    const roots = source.match(/className="[^"]*min-h-screen[^"]*"/g) ?? [];
    expect(roots.length, 'expected the loading, error and main roots').toBeGreaterThanOrEqual(3);
    const unscoped = roots.filter((cls) => !cls.includes('surface-light'));
    expect(unscoped, `these roots escape the light scope: ${unscoped.join(' | ')}`).toHaveLength(0);
  });

  it('paints its surfaces with the scope too, not with bg-white', () => {
    // Harmless on an always-light page, and still the wrong habit: the point of the scope is
    // that ONE place decides what light means here. `bg-card` resolves to white inside it.
    expect(source).not.toContain('bg-white');
    expect(source).toContain('bg-card');
  });

  it('no longer carries hard-coded hsl() literals', () => {
    // They are not wrong, they are now REDUNDANT — and a literal that duplicates a token is a
    // copy that drifts the first time the token moves.
    const literals = source.match(/hsl\([0-9.]+,[0-9.]+%,[0-9.]+%\)/g) ?? [];
    expect(literals, `still hard-coding: ${literals.join(', ')}`).toHaveLength(0);
  });

  /**
   * THE CONTROL. Without it, every assertion above is satisfied by a file that styles nothing at
   * all — deleting every class would pass.
   */
  it('still styles its text, now with the tokens the scope re-declares', () => {
    expect(source).toContain('text-muted-foreground');
    expect(source).toContain('text-foreground');
  });

  /** The two states that carried the bug must still render their copy. */
  it('keeps the error and loading copy', () => {
    expect(source).toContain('Tracking link unavailable');
    expect(source).toContain('Loading…');
  });
});

describe('the surface-light scope itself', () => {
  it('beats .dark rather than merely existing', () => {
    // `.surface-light` alone loses to `.dark .surface-light` ancestry in specificity terms for
    // anything the dark block sets; both selectors must carry the light values.
    expect(css).toMatch(/\.surface-light,\s*\n\s*\.dark \.surface-light \{/);
  });

  it('paints its own ink and ground, not just the variables', () => {
    /**
     * ⛔ THE ASSERTION THAT MAPS TO THE MEASURED BUG. Redefining `--foreground` inside the scope
     * changes what `text-foreground` resolves to — but any element that does NOT set a colour
     * class inherits `color` from <body>, which is outside the scope and still dark-themed. That
     * is how a heading ended up at 1.05:1. The scope has to set `color` and `background-color`
     * on itself.
     */
    // 🪤 Anchored to the start of the line. `/\.surface-light \{/` alone matches INSIDE
    // `.dark .surface-light {`, whose body is the variable re-declaration — so the test read
    // the wrong rule and reported a missing paint block that was there all along.
    const block = css.match(/(?<=\n)\s*\.surface-light \{[^}]*\}/);
    expect(block, 'the belt-and-braces .surface-light rule is missing').not.toBeNull();
    expect(block?.[0]).toContain('background-color: hsl(var(--background))');
    expect(block?.[0]).toContain('color: hsl(var(--foreground))');
  });

  it('re-declares the token a customer reads the page through', () => {
    // A spot check with a purpose: --foreground is the exact variable whose dark value (210 40%
    // 98%) produced the invisible heading.
    const scope = css.slice(css.indexOf('.surface-light,'));
    expect(scope).toContain('--foreground: 222 25% 9%');
  });
});
