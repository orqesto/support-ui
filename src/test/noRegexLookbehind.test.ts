import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No regex lookbehind in shipped code. Safari/iOS before 16.4 throws a SyntaxError when such a
 * RegExp is built (a literal fails the whole module at load), the build target does not lower it,
 * and Node — where the tests run — supports it, so no unit test can see the crash. The search
 * highlighter shipped one (2026-10-22) and would have taken the thread list down on those browsers.
 */
const SRC = path.resolve(process.cwd(), 'src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory())
      return name === '__tests__' || name === 'test' ? [] : files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
const LOOKBEHIND = /\(\?<[!=]/;

describe('no regex lookbehind in src', () => {
  it('control: the scan reads the source and would see one', () => {
    expect(files(SRC).length).toBeGreaterThan(200);
    expect(LOOKBEHIND.test('/(?<![a-z])x/')).toBe(true);
  });

  it('finds none outside comments', () => {
    const offences = files(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && LOOKBEHIND.test(line))
        .map(({ index }) => `${path.relative(SRC, file)}:${index + 1}`)
    );
    expect(offences).toEqual([]);
  });
});
