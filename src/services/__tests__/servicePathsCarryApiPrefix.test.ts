import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⛔ Every backend route is mounted under `/api`, and `apiClient`'s baseURL is the bare host.
 * A path without `/api` therefore never reaches the backend — staging answered 405 for
 * `/custom-apis/lookup` — while a unit test that mocks `apiClient` with the SAME wrong path
 * stays green. Five custom-API calls shipped that way (2026-09-19), and the lookup panel's
 * availability gate "worked" only because its own call failed and it hides on error.
 *
 * So this reads the SOURCE of every non-test file under src/, where a mock cannot hide a path:
 * · a LITERAL first argument (quote or template) must start with `/api/`;
 * · a NON-literal one (a variable, a helper call) cannot be checked by reading, so it must be
 *   listed below after a person has checked what it resolves to. A new one fails until it is.
 */
const SRC = join(process.cwd(), 'src');
// The first argument: a whole quoted string or template, else an expression up to `,` or `)`.
const CALL =
  /apiClient\.(?:get|post|put|patch|delete)(?:<[^>]*>)?\(\s*('[^']*'|"[^"]*"|`[^`]*`|[^,()]+(?:\([^()]*\))?)/g;

/**
 * `file: first argument` for every path the source cannot resolve, each checked by hand to
 * resolve under /api. Keep this SHORT: resolve through a constant instead where possible.
 */
const CHECKED_NON_LITERAL = new Set([
  // `path` is one of two templates, both `/api/attachments/...` (the Jira and native downloads).
  'components/tickets/TicketAttachments.tsx: path',
]);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });

/** File-local `const NAME = '...'` path constants, so `${BASE}/x` can be read like a literal. */
// Also a path HELPER — `const base = (id: number) => \`/api/alliances/${id}\`` — by its literal head.
const CONSTANT = /const\s+([A-Z_a-z]\w*)\s*=\s*(?:\([^)]*\)\s*(?::[^=]+)?=>\s*)?(['"`])([^'"`$]*)/g;

const calls = () =>
  sourceFiles(SRC).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const constants = new Map([...text.matchAll(CONSTANT)].map((match) => [match[1], match[3]]));
    return [...text.matchAll(CALL)].map((match) => ({
      file: relative(SRC, file),
      arg: match[1].trim(),
      constants,
    }));
  });

/**
 * The path a first argument names, when it can be read: a quoted literal, or a template whose
 * leading `${NAME}` is a file-local constant. null when it cannot be read from the source.
 */
const literalPath = (arg: string, constants: Map<string, string> = new Map()): string | null => {
  // A bare constant or a path helper call: `BASE`, `base(allianceId)`.
  const named = /^(\w+)(?:\([^()]*\))?$/.exec(arg);
  if (named) return constants.get(named[1]) ?? null;
  const quoted = /^([`'"])(.*)\1$/s.exec(arg);
  if (!quoted) return null;
  const lead = /^\$\{(\w+)(?:\([^}]*\))?\}(.*)$/s.exec(quoted[2]);
  if (!lead) return quoted[2];
  const base = constants.get(lead[1]);
  return base === undefined ? null : base + lead[2];
};

describe('every apiClient path reaches the backend', () => {
  it('CONTROL: the scan finds the known call sites, literal and not', () => {
    // Guards the guard: a regex that matched nothing would pass the tests below vacuously.
    const found = calls();
    expect(found.length).toBeGreaterThan(100);
    expect(found.some((call) => literalPath(call.arg) === '/api/custom-apis/lookup')).toBe(true);
    // A `${BASE}/…` template resolves through its file-local constant.
    expect(
      found.some((call) => literalPath(call.arg, call.constants)?.startsWith('/api/alliances'))
    ).toBe(true);
    // So does a bare constant (`BASE`) and a helper call (`base(allianceId)`).
    expect(found.some((call) => call.arg === 'BASE' && literalPath(call.arg, call.constants))).toBe(
      true
    );
    expect(
      found.some((call) => call.arg === 'base(allianceId)' && literalPath(call.arg, call.constants))
    ).toBe(true);
  });

  it('⛔ no literal apiClient path omits the /api prefix', () => {
    const bad = calls().filter((call) => {
      const path = literalPath(call.arg, call.constants);
      return path !== null && !path.startsWith('/api/');
    });
    expect(bad).toEqual([]);
  });

  it('⛔ every non-literal apiClient path has been checked by a person', () => {
    const unchecked = calls()
      .filter((call) => literalPath(call.arg, call.constants) === null)
      .map((call) => `${call.file}: ${call.arg}`)
      .filter((site) => !CHECKED_NON_LITERAL.has(site));
    expect(unchecked).toEqual([]);
  });
});
