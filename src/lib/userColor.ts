import type { CSSProperties } from 'react';
import { safeCssColor } from '@/lib/utils';

/**
 * Admin-chosen colours (departments, labels) drawn as TEXT stay readable.
 *
 * A department or label colour used as text on a ~13% tint of itself is how the app drew its
 * chips, and for light hues it was unreadable: Billing #f59e0b read at 1.94:1, Sales #10b981 at
 * 2.24:1 (2026-09-24). White text on a solid user colour failed the same way for yellow labels.
 *
 * The hue stays the admin's. What changes is the INK: the colour is mixed toward the theme's
 * foreground only as far as it takes to clear 4.5:1 on the chip's own ground. Dark and light
 * themes have different cards, so both pairs are computed and handed to CSS as variables; the
 * `.user-color-chip` rules in index.css pick the right pair (and `.surface-light` pins light).
 */

type Rgb = [number, number, number];

/**
 * Theme grounds and ink, from src/index.css (:root and .dark). `userColor.test.ts` fails if they
 * drift from the file, so a palette change cannot silently re-break chip contrast.
 */
export const THEME = {
  light: { card: [0, 0, 100], foreground: [222, 25, 9] },
  dark: { card: [220, 15, 16], foreground: [220, 20, 92] },
} as const satisfies Record<string, { card: readonly [number, number, number]; foreground: readonly [number, number, number] }>;

export const MIN_CONTRAST = 4.5;

const hslToRgb = ([hue, satPct, lightPct]: readonly [number, number, number]): Rgb => {
  const sat = satPct / 100;
  const light = lightPct / 100;
  const shift = (offset: number) => (offset + hue / 30) % 12;
  const chroma = sat * Math.min(light, 1 - light);
  const channel = (offset: number) =>
    light - chroma * Math.max(-1, Math.min(shift(offset) - 3, Math.min(9 - shift(offset), 1)));
  return [channel(0) * 255, channel(8) * 255, channel(4) * 255];
};

/** #rgb, #rrggbb, #rrggbbaa (alpha ignored), rgb()/rgba(). Anything else ⇒ null. */
export const parseColor = (input: string): Rgb | null => {
  const value = input.trim();
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (hexMatch) {
    const digits =
      hexMatch[1].length === 3 ? hexMatch[1].replace(/./g, (digit) => digit + digit) : hexMatch[1].slice(0, 6);
    return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as Rgb;
  }
  const rgbMatch = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value);
  return rgbMatch ? [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])] : null;
};

// Rounded, because the result is written out as integer rgb(): a ratio measured before rounding
// can land just under the threshold after it (#ff0000 in dark mode read 4.49).
const mix = (from: Rgb, to: Rgb, amount: number): Rgb =>
  [0, 1, 2].map((ch) => Math.round(from[ch] * (1 - amount) + to[ch] * amount)) as Rgb;

const luminance = (rgb: Rgb): number => {
  const [red, green, blue] = rgb.map((level) => {
    const unit = level / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export const contrast = (first: Rgb, second: Rgb): number => {
  const [high, low] = [luminance(first), luminance(second)].sort((lhs, rhs) => rhs - lhs);
  return (high + 0.05) / (low + 0.05);
};

const css = (rgb: Rgb) => `rgb(${rgb.map((level) => Math.round(level)).join(' ')})`;

/** The tint a chip sits on: the colour at `alpha` over the theme's card. */
export const tintOn = (color: Rgb, theme: keyof typeof THEME, alpha: number): Rgb =>
  mix(hslToRgb(THEME[theme].card), color, alpha);

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/** Least mix of `color` toward the theme's foreground that reads ≥ MIN_CONTRAST on `ground`. */
export const readableInk = (color: Rgb, ground: Rgb, theme: keyof typeof THEME): Rgb => {
  const ink = hslToRgb(THEME[theme].foreground);
  for (let amount = 0; amount <= 1.0001; amount += 0.02) {
    const candidate = mix(color, ink, amount);
    if (contrast(candidate, ground) >= MIN_CONTRAST) return candidate;
  }
  return ink;
};

export type ChipStyle = { className: string; style: CSSProperties };

/**
 * A chip whose ground is a tint of the user colour and whose text is that colour made readable.
 * Spread both: `<span className={cn(base, chip.className)} style={chip.style}>`.
 * `alpha` is the tint strength the site already used (0x22 ≈ 0.13, 0x1f ≈ 0.12).
 */
export const tintedChip = (
  raw: string | null | undefined,
  alpha = 0.13,
  /** Used when `raw` is missing or blank; without one, a blank colour renders no chip styling. */
  fallback?: string
): ChipStyle => {
  const source = raw?.trim() ? raw : fallback;
  if (!source) return { className: '', style: {} };
  const color = parseColor(safeCssColor(source));
  if (!color) return { className: '', style: {} };
  const vars: Record<string, string> = { '--uc-dot': css(color), '--uc-line': `${css(color).slice(0, -1)} / 0.2)` };
  for (const theme of ['light', 'dark'] as const) {
    const ground = tintOn(color, theme, alpha);
    const suffix = theme === 'light' ? 'l' : 'd';
    vars[`--uc-bg-${suffix}`] = css(ground);
    vars[`--uc-fg-${suffix}`] = css(readableInk(color, ground, theme));
  }
  return { className: 'user-color-chip', style: vars as CSSProperties };
};

/** A solid chip in the user colour: text is white or the light theme's ink, whichever reads better. */
export const solidChip = (raw: string | null | undefined): CSSProperties => {
  if (!raw?.trim()) return {};
  const color = parseColor(safeCssColor(raw));
  if (!color) return {};
  const ink = hslToRgb(THEME.light.foreground).map(Math.round) as Rgb;
  if (contrast(ink, color) >= MIN_CONTRAST && contrast(ink, color) >= contrast(WHITE, color))
    return { backgroundColor: css(color), color: css(ink) };
  // Mid-tones (#8b5cf6 reads 4.3 with white AND with dark ink) cannot be rescued by the text alone:
  // deepen the ground toward black just until white clears the bar. Same hue, a shade darker.
  for (let amount = 0; amount <= 1.0001; amount += 0.02) {
    const ground = mix(color, BLACK, amount);
    if (contrast(WHITE, ground) >= MIN_CONTRAST) return { backgroundColor: css(ground), color: '#fff' };
  }
  return { backgroundColor: css(BLACK), color: '#fff' };
};
