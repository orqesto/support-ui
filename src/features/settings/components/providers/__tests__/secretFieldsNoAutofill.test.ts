/**
 * No secret field in Settings may tell the browser `autoComplete="off"`: Chrome ignores it on a
 * password field and offers the saved LOGIN password, which would then be saved as an API key or
 * a storage secret. `PasswordInput` defaults to `new-password`; this guard keeps callers from
 * overriding that. (The component also maps "off" itself — this keeps the source honest.)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'src');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return name.endsWith('.tsx') ? [path] : [];
  });

/** Each `<PasswordInput … />` element's own text: from its opening to the first line that closes it. */
const passwordInputs = (text: string): string[] => {
  const found: string[] = [];
  const lines = text.split('\n');
  lines.forEach((line, start) => {
    if (!/<PasswordInput\b/.test(line)) return;
    let end = start;
    while (end < lines.length - 1 && !/\/>\s*$/.test(lines[end] ?? '')) end += 1;
    found.push(lines.slice(start, end + 1).join('\n'));
  });
  return found;
};

describe('secret fields and browser autofill', () => {
  it('no PasswordInput is given autoComplete="off"', () => {
    const files = sources(root);
    const elements = files.flatMap((file) =>
      passwordInputs(readFileSync(file, 'utf8')).map((element) => ({
        file: relative(root, file),
        element,
      }))
    );
    // CONTROL: the walk finds the fields, the custom AI provider's key among them.
    expect(elements.length).toBeGreaterThan(20);
    expect(elements.some((entry) => entry.file.endsWith('CustomProviderCard.tsx'))).toBe(true);
    const overriding = elements.filter((entry) => /autoComplete=["']off["']/.test(entry.element));
    expect(overriding.map((entry) => entry.file)).toEqual([]);
  });
});
