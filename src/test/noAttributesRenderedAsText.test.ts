import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * `aria-label="Edit user" title="Edit user"` rendered as visible text inside the Edit
 * button on the Users page, in production, on every row.
 *
 * The cause is a one-character kind of mistake that JSX accepts silently: the attributes
 * were placed AFTER the opening tag had already closed, so they became text children.
 *
 *     <Button size="sm" onClick={...}>
 *       aria-label="Edit user"      <- text, not an attribute
 *       title="Edit user"           <- text, not an attribute
 *       <Edit2 />
 *     </Button>
 *
 * It type-checks, it lints, and `iconOnlyControlsHaveNames.test.ts` PASSED it — that check
 * fails a control which renders only icons and has no accessible name, and this button now
 * renders text, so the defect satisfied the very guard written to catch a missing label.
 * The sibling Delete button two lines below had it right the whole time.
 *
 * A JSX text child shaped like `name="value"` is never legitimate interface copy. Parsed
 * rather than grepped, deliberately: the sibling test's own history records two regex
 * versions that were wrong in opposite directions.
 */

const SRC = join(process.cwd(), 'src');

const tsxFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...tsxFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
};

/** `foo="bar"` or `aria-label="Edit user"` — an attribute that escaped its opening tag. */
const ATTRIBUTE_SHAPED = /^[A-Za-z][A-Za-z0-9-]*\s*=\s*"[^"]*"(\s+[A-Za-z][A-Za-z0-9-]*\s*=\s*"[^"]*")*$/;

type Offence = { file: string; line: number; text: string };

const findOffences = (file: string): Offence[] => {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const found: Offence[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      // JSX collapses whitespace across lines; check each line on its own so a stray
      // attribute sitting above a legitimate line of copy is still caught.
      for (const rawLine of node.text.split('\n')) {
        const line = rawLine.trim();
        if (line.length > 0 && ATTRIBUTE_SHAPED.test(line)) {
          const { line: lineNumber } = source.getLineAndCharacterOfPosition(node.getStart(source));
          found.push({ file, line: lineNumber + 1, text: line });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
};

describe('no JSX attribute is rendered as visible text', () => {
  it('finds no attribute-shaped text child anywhere in src', () => {
    const offences = tsxFiles(SRC).flatMap(findOffences);
    const report = offences
      .map((off) => `${off.file.replace(process.cwd() + '/', '')}:${off.line} renders "${off.text}"`)
      .join('\n');
    expect(report).toBe('');
  });

  it('recognises the exact shape that shipped, so this check cannot rot into a no-op', () => {
    // A guard never seen to fire proves nothing. These are the two literal strings that
    // were visible on the Users page in production.
    expect(ATTRIBUTE_SHAPED.test('aria-label="Edit user"')).toBe(true);
    expect(ATTRIBUTE_SHAPED.test('title="Edit user"')).toBe(true);
    expect(ATTRIBUTE_SHAPED.test('aria-label="Edit user" title="Edit user"')).toBe(true);
  });

  it('does not flag ordinary interface copy that happens to contain quotes', () => {
    expect(ATTRIBUTE_SHAPED.test('Reply to "Where is my order?"')).toBe(false);
    expect(ATTRIBUTE_SHAPED.test('Showing results for "invoice"')).toBe(false);
    expect(ATTRIBUTE_SHAPED.test('Edit user')).toBe(false);
    expect(ATTRIBUTE_SHAPED.test('5 = 5')).toBe(false);
  });
});
