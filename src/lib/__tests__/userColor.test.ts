/**
 * Admin-chosen colours drawn as text must read at ≥4.5:1 (userColor.ts, 2026-09-24).
 * The control test at the bottom proves these assertions can fail: it measures the OLD rendering
 * (the raw colour on a tint of itself) and expects it to be unreadable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  THEME,
  MIN_CONTRAST,
  contrast,
  parseColor,
  readableInk,
  solidChip,
  tintOn,
  tintedChip,
} from '../userColor';

// BE src/db/seedData/defaultDepartments.ts — what every new workspace starts with.
const DEPARTMENT_DEFAULTS = ['#3b82f6', '#10b981', '#f59e0b', '#6b7280', '#ec4899', '#a855f7'];
// Colours an admin plausibly picks, weighted to the hard ones: yellows, cyans, limes, pastels.
const MATRIX = ['#facc15', '#fde047', '#eab308', '#22d3ee', '#84cc16', '#a3e635', '#f472b6', '#c4b5fd', '#ff0000', '#000000', '#ffffff', '#8b5cf6'];
const ALL = [...DEPARTMENT_DEFAULTS, ...MATRIX];

const rgbOf = (cssRgb: string) => cssRgb.match(/[\d.]+/g)!.slice(0, 3).map(Number) as [number, number, number];

describe('tintedChip', () => {
  for (const hex of ALL) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${hex} reads at ≥ ${MIN_CONTRAST}:1 on its own tint (${theme})`, () => {
        const chip = tintedChip(hex) as unknown as { style: Record<string, string> };
        const suffix = theme === 'light' ? 'l' : 'd';
        const ratio = contrast(rgbOf(chip.style[`--uc-fg-${suffix}`]), rgbOf(chip.style[`--uc-bg-${suffix}`]));
        expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });
    }
  }

  it('keeps the colour as it is when it already reads (no needless darkening)', () => {
    const black = parseColor('#000000')!;
    const ground = tintOn(black, 'light', 0.13);
    expect(readableInk(black, ground, 'light')).toEqual(black);
  });

  it('marks the element and hands over both theme pairs', () => {
    const chip = tintedChip('#f59e0b');
    expect(chip.className).toBe('user-color-chip');
    expect(Object.keys(chip.style).sort()).toEqual(['--uc-bg-d', '--uc-bg-l', '--uc-dot', '--uc-fg-d', '--uc-fg-l', '--uc-line']);
  });

  it('uses the fallback for a blank colour, and nothing without one', () => {
    expect(tintedChip('', 0.13, 'rgb(99,102,241)').className).toBe('user-color-chip');
    expect(tintedChip('   ', 0.13).className).toBe('');
  });

  it('renders nothing special for a missing or unparseable colour', () => {
    expect(tintedChip(null)).toEqual({ className: '', style: {} });
    // safeCssColor maps garbage to its slate fallback, which is still a readable chip.
    expect(tintedChip('url(javascript:alert(1))').className).toBe('user-color-chip');
  });
});

describe('solidChip', () => {
  for (const hex of ALL) {
    it(`${hex} as a solid chip: text reads at ≥ ${MIN_CONTRAST}:1`, () => {
      const chip = solidChip(hex) as unknown as { backgroundColor: string; color: string };
      const text = chip.color === '#fff' ? ([255, 255, 255] as [number, number, number]) : rgbOf(chip.color);
      expect(contrast(text, rgbOf(chip.backgroundColor))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  }
  it('does not put white text on yellow', () => {
    expect((solidChip('#f59e0b') as { color: string }).color).not.toBe('#fff');
  });
});

describe('theme constants match src/index.css', () => {
  const css = readFileSync(join(__dirname, '../../index.css'), 'utf8');
  const value = (opener: string, name: string) => {
    const start = css.indexOf(opener);
    const body = css.slice(start, css.indexOf('\n  }\n', start));
    const found = new RegExp(`--${name}\\s*:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`).exec(body);
    return found ? [Number(found[1]), Number(found[2]), Number(found[3])] : null;
  };
  it.each([
    [':root {', 'light'],
    ['.dark {', 'dark'],
  ] as const)('%s card + foreground', (opener, theme) => {
    expect(value(opener, 'card')).toEqual([...THEME[theme].card]);
    expect(value(opener, 'foreground')).toEqual([...THEME[theme].foreground]);
  });
});

describe('control: the old rendering fails these assertions', () => {
  it('raw #f59e0b on its own 13% tint is below 4.5:1 (what the app shipped)', () => {
    const amber = parseColor('#f59e0b')!;
    expect(contrast(amber, tintOn(amber, 'light', 0.13))).toBeLessThan(MIN_CONTRAST);
  });
  it('white on #f59e0b is below 4.5:1 (what solid label chips shipped)', () => {
    expect(contrast([255, 255, 255], parseColor('#f59e0b')!)).toBeLessThan(MIN_CONTRAST);
  });
});
