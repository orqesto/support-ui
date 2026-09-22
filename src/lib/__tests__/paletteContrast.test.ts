/**
 * The palette's measurable promises, checked from src/index.css itself (2026-09-22).
 *
 * Written after a dark-stack lift raised the CARD but not the fills that sit on it: chip and
 * badge grounds ended ΔE 1.2 from the card — invisible — while every existing test stayed green,
 * because nothing measured colours. Two promises:
 *   1. every text token reads at ≥4.5:1 on every ground it is used on, in every theme;
 *   2. every fill that sits ON a card stays visibly apart from it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Hsl = [number, number, number];
const css = readFileSync(join(__dirname, '../../index.css'), 'utf8');

const block = (opener: string): Record<string, Hsl> => {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`no ${opener} block in index.css`);
  const body = css.slice(start, css.indexOf('\n  }\n', start));
  const out: Record<string, Hsl> = {};
  for (const [, name, hue, sat, light] of body.matchAll(
    /--([a-z][a-z0-9-]*)\s*:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g
  ))
    out[name] = [Number(hue), Number(sat), Number(light)];
  return out;
};

const toRgb = ([hue, satPct, lightPct]: Hsl): [number, number, number] => {
  const sat = satPct / 100;
  const lig = lightPct / 100;
  const chroma = sat * Math.min(lig, 1 - lig);
  const channel = (offset: number) => {
    const step = (offset + hue / 30) % 12;
    return lig - chroma * Math.max(-1, Math.min(step - 3, 9 - step, 1));
  };
  return [channel(0), channel(8), channel(4)];
};
const linear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const luminance = (hsl: Hsl) => {
  const [red, green, blue] = toRgb(hsl).map(linear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (first: Hsl, second: Hsl) => {
  const [high, low] = [luminance(first), luminance(second)].sort((one, two) => two - one);
  return (high + 0.05) / (low + 0.05);
};
const lab = (hsl: Hsl) => {
  const [red, green, blue] = toRgb(hsl).map(linear);
  const pivot = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const xx = pivot((red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047);
  const yy = pivot(red * 0.2126 + green * 0.7152 + blue * 0.0722);
  const zz = pivot((red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883);
  return [116 * yy - 16, 500 * (xx - yy), 200 * (yy - zz)];
};
const deltaE = (first: Hsl, second: Hsl) => {
  const other = lab(second);
  return Math.hypot(...lab(first).map((value, index) => value - other[index]));
};

const light = block(':root {');
const dark = { ...light, ...block('.dark {') };
const themes = { light, dark } as const;

const TEXT = [
  'foreground',
  'muted-foreground',
  'faint-foreground',
  'primary',
  'ai',
  'note',
  'success',
  'warning',
  'destructive',
  'attention',
  'caution',
  'pending',
];
const GROUNDS = ['card', 'background', 'raised', 'muted', 'accent', 'bubble'];

/**
 * Known misses, each with its reason. Kept EXACT: the test also fails when one of these starts
 * passing, so a fix is noticed and the exception removed rather than left to hide a regression.
 */
const KNOWN: Record<string, string> = {};

/** Fills that sit ON a card, and the least ΔE from it that still reads as a separate surface. */
const ON_CARD: Record<string, number> = {
  muted: 4,
  secondary: 4,
  accent: 4,
  hair: 2,
  border: 6,
  input: 4,
};

describe('palette contrast (measured from index.css)', () => {
  it('CONTROL: the parser reads both themes', () => {
    expect(Object.keys(light).length).toBeGreaterThan(40);
    expect(dark.card).not.toEqual(light.card);
  });

  it('every text token reads at ≥4.5:1 on every ground, except the listed misses', () => {
    const failing: string[] = [];
    for (const [theme, tokens] of Object.entries(themes))
      for (const text of TEXT)
        for (const ground of GROUNDS) {
          const ratio = contrast(tokens[text], tokens[ground]);
          if (ratio < 4.5) failing.push(`${theme} ${text} on ${ground}`);
        }
    expect(failing.sort()).toEqual(Object.keys(KNOWN).sort());
  });

  it('each role reads on its own tinted ground (badges)', () => {
    const failing: string[] = [];
    for (const [theme, tokens] of Object.entries(themes))
      for (const role of TEXT)
        if (tokens[`${role}-muted`] && contrast(tokens[role], tokens[`${role}-muted`]) < 4.5)
          failing.push(`${theme} ${role} on ${role}-muted`);
    expect(failing).toEqual([]);
  });

  it('shape-weight colours (bars, dots, borders) clear 3:1 on a card (WCAG 1.4.11)', () => {
    for (const [theme, tokens] of Object.entries(themes))
      expect(
        contrast(tokens['caution-solid'], tokens.card),
        `${theme} caution-solid`
      ).toBeGreaterThanOrEqual(3);
  });

  it('fills that sit on a card stay visibly apart from it, in both themes', () => {
    const tooClose: string[] = [];
    for (const [theme, tokens] of Object.entries(themes))
      for (const [fill, min] of Object.entries(ON_CARD)) {
        const gap = deltaE(tokens[fill], tokens.card);
        if (gap < min) tooClose.push(`${theme} ${fill} ΔE ${gap.toFixed(1)} < ${min}`);
      }
    expect(tooClose).toEqual([]);
  });
});
