/**
 * The dashboard reaches for the palette, not literals (2026-09-22). Its tile accents were eight
 * inline hexes passed through `style={{ borderLeftColor }}` / `backgroundColor`, so they never
 * switched for dark. This fails if any hex, hsl() or rgb() colour, or an inline colour style,
 * comes back — in code, not comments.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TONE_BORDER, TONE_FILL } from '../dashboardTones';

const root = join(__dirname, '../../../..');
const files = [
  'src/pages/DashboardPage.tsx',
  'src/components/dashboard/DashboardStatCards.tsx',
  'src/components/dashboard/DashboardKBSection.tsx',
];
const codeOnly = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('dashboard uses palette roles only', () => {
  it.each(files)('%s has no colour literal and no inline colour style', (file) => {
    const code = codeOnly(readFileSync(join(root, file), 'utf8'));
    expect(code.match(/#[0-9a-fA-F]{3,8}\b|\b(?:hsla?|rgba?)\(/g) ?? []).toEqual([]);
    expect(code.match(/(?:borderLeftColor|backgroundColor|borderColor)\s*:/g) ?? []).toEqual([]);
  });

  it('every tone maps to a border and a fill', () => {
    expect(Object.keys(TONE_BORDER).sort()).toEqual(Object.keys(TONE_FILL).sort());
  });
});
