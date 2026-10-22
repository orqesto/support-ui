import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Customers see "Team" / "Teams", never "Department". The word stays in identifiers, API paths,
 * field names and query keys (`/api/departments`, `departmentId`, `['departments']`): the API is
 * public and renaming it would break integrations. Only what a person reads on screen changed.
 *
 * This scans every source file for "department" inside a string literal or JSX text that reads
 * as words (has a space, or is the bare word "Department"), and fails on any it finds. Comments,
 * log lines, thrown developer errors, imports and paths are skipped.
 *
 * The staff console (`src/pages/console`, `src/components/console`) is held to the same rule. A line that must keep the word for another reason
 * goes in ALLOWED_LINES with the reason.
 */

const WORD = /\b(?:departments?|Departments?|depts?)\b/;

/** Directories exempt from the scan (none: the staff console says "team" too). */
const ALLOWED_DIRS: string[] = [];

/** `path:substring` — the line containing the substring is allowed, with the reason. */
const ALLOWED_LINES: Array<{ file: string; contains: string; why: string }> = [];

const SKIP_LINE =
  /^\s*(?:\/\/|\*|\/\*|\{\/\*|import\s|\}\s*from\s)|\blogger\.|\bconsole\.|new Error\(/;

/** A segment that is words a person reads, not a key, a path or an identifier. */
const isProse = (raw: string): boolean => {
  const seg = raw.replace(/\$\{[^}]*\}/g, 'X').trim();
  if (seg === '' || /^[/@.]/.test(seg) || seg.includes('/api')) return false;
  if (!seg.includes(' ')) return /^(?:Departments?|Depts?):?$/.test(seg);
  return true;
};

const SEGMENT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|>([^<>{}\n]+)</g;

/** A line that is nothing but JSX text (a wrapped sentence). */
const isBareText = (line: string): boolean => {
  // `&apos;` is an apostrophe and `{count}` a value inside the sentence.
  const text = line
    .trim()
    .replace(/&\w+;/g, "'")
    .replace(/\{[^{}]*\}/g, 'X');
  // A one-word JSX line: a column header, a field label.
  if (/^Departments?:?$/.test(text)) return true;
  return (
    WORD.test(text) &&
    // Code, not words: member access (`dept.name`) or a ternary.
    !/\w\.\w/.test(text) &&
    !/\s\?\s.*\s:\s/.test(text) &&
    /^[A-Za-z+(]/.test(text) &&
    (text.split(/\s+/).length >= 3 || text.endsWith('.')) &&
    /^[\w\s,.;:!?'’“”()\-—–/&+]+$/.test(text) &&
    !/[=;{}]|\w\(/.test(text) &&
    !/^(?:import|export|const|let|return|type|await|if)\b/.test(text) &&
    !text.endsWith(',')
  );
};

/** Lines of `source` that show "department" to a person. */
export const departmentTextLines = (source: string): string[] => {
  const hits: string[] = [];
  let inBlockComment = false;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true;
      continue;
    }
    if (!WORD.test(line) || SKIP_LINE.test(line)) continue;
    const segments = [...line.matchAll(SEGMENT)].map(
      (match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? ''
    );
    // Interpolations are code (`${dept.name}`), not words.
    const inSegment = segments.some(
      (seg) => WORD.test(seg.replace(/\$\{[^}]*\}/g, 'X')) && isProse(seg)
    );
    if (inSegment || isBareText(line)) hits.push(trimmed);
  }
  return hits;
};

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });

const offenders = (): string[] =>
  walk('src')
    .filter((file) => !ALLOWED_DIRS.some((dir) => file.startsWith(dir)))
    .flatMap((file) =>
      departmentTextLines(readFileSync(file, 'utf-8'))
        .filter(
          (line) =>
            !ALLOWED_LINES.some(
              (allowed) => allowed.file === file && line.includes(allowed.contains)
            )
        )
        .map((line) => `${file}: ${line}`)
    );

describe('customer-visible text says "team", never "department"', () => {
  it('CONTROL: the scanner finds the word in a label, JSX text and a wrapped sentence', () => {
    const sample = [
      "const label = 'Pick a department';",
      '<span>All departments</span>',
      '            Threads the engine could not assign to a department',
      '      label="Department"',
      '            Department',
      '          Synced pages are visible to every department&apos;s AI.',
      "          + {count} {count === 1 ? 'ticket' : 'tickets'} in departments",
      'const where = `${count} departments`;',
    ].join('\n');
    expect(departmentTextLines(sample)).toHaveLength(8);
  });

  it('CONTROL: identifiers, paths, keys, comments and logs are not customer text', () => {
    const sample = [
      "import { departmentService } from '@/services/department.service';",
      'const data = await apiClient.get(`/api/departments/${id}`);',
      "queryKey: ['departments', orgId],",
      '// the department list is per workspace',
      "logger.error('Failed to load departments:', err);",
      'const { data: departments = [] } = useDepartments();',
      "if (scope === 'departments') return;",
      'title={`Move this thread to ${dept.name}`}',
    ].join('\n');
    expect(departmentTextLines(sample)).toEqual([]);
  });

  it('no source file shows "department" to a customer', () => {
    expect(offenders()).toEqual([]);
  });
});
