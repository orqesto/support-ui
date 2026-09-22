/**
 * Dashboard tile accents as PALETTE ROLES (2026-09-22). They were inline hexes passed as
 * `style={{ borderLeftColor }}` / `backgroundColor`, so they bypassed the palette and never
 * switched for dark. Every tile keeps a distinct colour within its group — the owner wanted
 * tiles tellable by colour, not only by text.
 *
 * Class strings are written out in full: Tailwind finds classes by scanning source text, so a
 * `border-l-${tone}` template would compile to nothing.
 */
export type Tone =
  | 'destructive'
  | 'warning'
  | 'primary'
  | 'success'
  | 'neutral'
  | 'attention'
  | 'caution'
  | 'pending'
  | 'ai';

// `!` (important): a card's `hover:border-primary/50` tints all four sides, and the inline
// style this replaces beat that class. A plain class — or a `hover:border-l-*` twin, tried and
// measured 2026-09-22 — loses to it and the accent turns blue on hover.
export const TONE_BORDER: Record<Tone, string> = {
  destructive: '!border-l-destructive',
  warning: '!border-l-warning',
  primary: '!border-l-primary',
  success: '!border-l-success',
  neutral: '!border-l-muted-foreground',
  attention: '!border-l-attention',
  caution: '!border-l-caution-solid',
  pending: '!border-l-pending',
  ai: '!border-l-ai',
};

// caution uses its -solid (shape) weight: its text weight is an olive that stops reading as yellow.
export const TONE_FILL: Record<Tone, string> = {
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  primary: 'bg-primary',
  success: 'bg-success',
  neutral: 'bg-muted-foreground',
  attention: 'bg-attention',
  caution: 'bg-caution-solid',
  pending: 'bg-pending',
  ai: 'bg-ai',
};
