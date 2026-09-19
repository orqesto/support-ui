import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * ⛔ Every backend route is mounted under `/api`, and `apiClient`'s baseURL is the bare host.
 * A path without `/api` therefore never reaches the backend — staging answered 405 for
 * `/custom-apis/lookup` — while a unit test that mocks `apiClient` with the SAME wrong path
 * stays green. Five custom-API calls shipped that way (2026-09-19), and the lookup panel's
 * availability gate "worked" only because its own call failed and it hides on error.
 *
 * So this PARSES every non-test file under src/ — a regex cannot balance `get<A<B[]>>(` and
 * silently skipped a third of all calls — and works out what each call's first argument can
 * start with: literals, templates, file-local constants and variables, path helpers, and both
 * arms of a conditional. Every call must provably start with `/api/`, or be listed below after
 * a person has checked it.
 */
const SRC = join(process.cwd(), 'src');
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const API = '/api/';

/** `file: first argument` the parser cannot resolve, each checked by hand. Keep it EMPTY if possible. */
const CHECKED_BY_HAND = new Set<string>([
  // `downloadPath ?? \`/api/attachments/${id}/download\``: the prop's only caller
  // (TicketAttachments) passes `/api/attachments/jira/${id}/download` or undefined.
  'components/shared/AttachmentPreviewDialog.tsx: path',
]);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [full] : [];
  });

/** The first `const`/`let` declaration of `name` in the file, top to bottom. */
const declarationOf = (file: ts.SourceFile, name: string): ts.Expression | undefined => {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

/**
 * What the expression is known to START with, or null when that cannot be read from the file.
 * A conditional counts only if BOTH arms resolve; the first arm that does not start with /api
 * is returned, so a bad branch is reported rather than hidden by a good one.
 */
const prefixOf = (node: ts.Expression, file: ts.SourceFile, depth = 0): string | null => {
  if (depth > 8) return null;
  const next = (expr: ts.Expression) => prefixOf(expr, file, depth + 1);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    if (node.head.text) return node.head.text;
    const lead = next(node.templateSpans[0].expression);
    return lead === null ? null : lead + node.templateSpans[0].literal.text;
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return next(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return next(node.left);
  }
  if (ts.isConditionalExpression(node)) {
    const arms = [next(node.whenTrue), next(node.whenFalse)];
    if (arms.some((arm) => arm === null)) return null;
    return arms.find((arm) => !arm!.startsWith(API)) ?? arms[0];
  }
  if (ts.isIdentifier(node)) {
    const init = declarationOf(file, node.text);
    return init ? next(init) : null;
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    // A path helper: `const base = (id: number) => \`/api/alliances/${id}\``.
    const init = declarationOf(file, node.expression.text);
    if (init && ts.isArrowFunction(init) && !ts.isBlock(init.body)) return next(init.body);
  }
  return null;
};

interface Call {
  site: string;
  prefix: string | null;
}

const scan = () => {
  const calls: Call[] = [];
  // Every `apiClient.<method>` REFERENCE in code (comments excluded, unlike a text search).
  let references = 0;
  for (const path of sourceFiles(SRC)) {
    const text = readFileSync(path, 'utf8');
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'apiClient' &&
        METHODS.has(node.name.text)
      ) {
        references += 1;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'apiClient' &&
        METHODS.has(node.expression.name.text) &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        calls.push({
          site: `${relative(SRC, path)}: ${arg.getText(file)}`,
          prefix: prefixOf(arg, file),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { calls, references };
};

describe('every apiClient path reaches the backend', () => {
  const { calls, references } = scan();

  it('CONTROL: every apiClient.<method> reference is a call this test checked', () => {
    // The old regex skipped `get<A<B[]>>(`: 173 of 506 calls, and still passed its own control.
    // A reference that is not a checked call (passed around, aliased, called with no argument)
    // makes this fail rather than slip past the path check.
    expect(calls.length).toBeGreaterThan(400);
    expect(calls.length).toBe(references);
    expect(calls.some((call) => call.prefix === '/api/custom-apis/lookup')).toBe(true);
  });

  it('⛔ no apiClient path starts with anything but /api/', () => {
    expect(calls.filter((call) => call.prefix !== null && !call.prefix.startsWith(API))).toEqual(
      []
    );
  });

  it('⛔ every path the parser cannot resolve has been checked by a person', () => {
    const unresolved = calls
      .filter((call) => call.prefix === null)
      .map((call) => call.site)
      .filter((site) => !CHECKED_BY_HAND.has(site));
    expect(unresolved).toEqual([]);
  });
});
