/**
 * A colour utility whose token exists as a CSS variable but is NOT mapped in tailwind.config.js
 * compiles to nothing — the element silently renders transparent. `bg-popover` did exactly that
 * for every menu using it (the Resolve caret menu, the assignee pickers) until 2026-09-22.
 *
 * This checks the CLASS, not the one token: every colour utility used in src whose name is a
 * CSS variable in index.css must be a mapped Tailwind colour.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error -- the Tailwind config is plain JS with no type declarations.
import config from '../../../tailwind.config.js';

const root = join(__dirname, '../../..');

// Colour variables only (an HSL triple, optionally with alpha) — `--radius` is not a colour, and
// `border-radius` in a CSS-property list would otherwise read as a `border-radius` utility.
const cssVars = new Set(
  [
    ...readFileSync(join(root, 'src/index.css'), 'utf8').matchAll(
      /--([a-z][a-z0-9-]*)\s*:\s*\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%/g
    ),
  ].map((match) => match[1])
);

const mapped = new Set<string>();
const flatten = (colors: Record<string, unknown>, prefix = '') => {
  for (const [key, value] of Object.entries(colors)) {
    const name = key === 'DEFAULT' ? prefix : prefix ? `${prefix}-${key}` : key;
    if (typeof value === 'string') mapped.add(name);
    else if (value && typeof value === 'object') flatten(value as Record<string, unknown>, name);
  }
};
flatten((config as { theme: { extend: { colors: Record<string, unknown> } } }).theme.extend.colors);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(entry) && !/\.test\./.test(entry) ? [path] : [];
  });

const used = new Map<string, string>();
for (const file of sourceFiles(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(
    /(?<![\w-])(?:bg|text|border|ring|fill|stroke|divide|outline|from|to|via|placeholder|caret|accent|decoration)-([a-z][a-z0-9-]*)/g
  )) {
    const name = match[1];
    if (cssVars.has(name) && !used.has(name)) used.set(name, file.replace(root, ''));
  }
}

describe('tailwind colour tokens', () => {
  it('CONTROL: the scan finds tokens it must find', () => {
    expect(used.has('card')).toBe(true);
    expect(mapped.has('card')).toBe(true);
    expect(used.has('popover')).toBe(true);
  });

  it('every colour utility backed by a CSS variable is mapped in tailwind.config.js', () => {
    const missing = [...used]
      .filter(([name]) => !mapped.has(name))
      .map(([token, file]) => `${token} (${file})`);
    expect(missing).toEqual([]);
  });
});
