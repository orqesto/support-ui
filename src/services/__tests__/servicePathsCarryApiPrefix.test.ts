import { readdirSync, statSync } from 'node:fs';
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
 *
 * SCOPE — what this proves, and what it deliberately does not. It proves a path's STATIC PREFIX
 * is `/api/`: the defect it exists for is a missing prefix, which is a typo, not an attack. It
 * does not prove a path is well-formed after the prefix; a `..` it happens to see makes the path
 * unprovable (fails closed), but a `..` held in a variable appended later is not traced, and is
 * not this test's job — no caller builds API paths from untrusted `..` segments.
 */
const SRC = join(process.cwd(), 'src');
const climbsOut = (text: string): boolean => text.includes('..');
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const API = '/api/';

/** `file: first argument` the parser cannot resolve, each checked by hand. Keep it EMPTY if possible. */
const CHECKED_BY_HAND = new Set<string>([
  // `downloadPath ?? \`/api/attachments/${id}/download\``: the prop's only caller
  // (TicketAttachments) passes `/api/attachments/jira/${id}/download` or undefined.
  'components/shared/AttachmentPreviewDialog.tsx: path = path = downloadPath ?? `/api/attachments/${attachment.id}/download`',
]);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [full] : [];
  });

/**
 * The initializer a name resolves to IN SCOPE (the type checker binds it, so a same-named
 * variable elsewhere in the file cannot answer for it). Only a `const` with an initializer
 * counts: a parameter, a `let`/`var`, or anything imported is not knowable from here.
 */
const initializerOf = (name: ts.Identifier, checker: ts.TypeChecker): ts.Expression | undefined => {
  const declaration = checker.getSymbolAtLocation(name)?.valueDeclaration;
  if (!declaration || !ts.isVariableDeclaration(declaration)) return undefined;
  const list = declaration.parent;
  if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const)) return undefined;
  return declaration.initializer;
};

/**
 * What the expression is known to START with, or null when that cannot be read from the file.
 * A conditional counts only if BOTH arms resolve; the first arm that does not start with /api
 * is returned, so a bad branch is reported rather than hidden by a good one.
 */
const prefixOf = (node: ts.Expression, checker: ts.TypeChecker, depth = 0): string | null => {
  if (depth > 8) return null;
  const next = (expr: ts.Expression) => prefixOf(expr, checker, depth + 1);
  // A `..` in the text this step reads makes the prefix unprovable (fails closed). Only the
  // text visited — see SCOPE above: a `..` inside a variable appended later is not traced.
  if (climbsOut(node.getText())) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return climbsOut(node.text) ? null : node.text;
  }
  if (ts.isTemplateExpression(node)) {
    // A `..` anywhere could climb back out of /api/, whatever the head says.
    const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
    if (parts.some(climbsOut)) return null;
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
    const init = initializerOf(node, checker);
    return init ? next(init) : null;
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    // A path helper: `const base = (id: number) => \`/api/alliances/${id}\``.
    const init = initializerOf(node.expression, checker);
    if (init && ts.isArrowFunction(init) && !ts.isBlock(init.body)) return next(init.body);
  }
  return null;
};

/**
 * How a call is named in CHECKED_BY_HAND: its argument, plus the whole declaration a name
 * resolves to — so an entry stops matching the moment what it was checked against changes.
 */
const siteText = (arg: ts.Expression, checker: ts.TypeChecker, file: ts.SourceFile): string => {
  const text = arg.getText(file);
  if (!ts.isIdentifier(arg)) return text;
  const declaration = checker.getSymbolAtLocation(arg)?.valueDeclaration;
  return declaration ? `${text} = ${declaration.getText(file).replace(/\s+/g, ' ')}` : text;
};

interface Call {
  site: string;
  prefix: string | null;
}

const scan = () => {
  const calls: Call[] = [];
  // Every `apiClient.<method>` REFERENCE in code (comments excluded, unlike a text search).
  let references = 0;
  // Any other NAME for the client: the scan matches the identifier `apiClient`, so a renamed
  // import or a `const c = apiClient` would take its calls out of the count and the check.
  const rebindings: string[] = [];
  const files = sourceFiles(SRC);
  const program = ts.createProgram(files, {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
    noResolve: true,
    allowJs: false,
  });
  const checker = program.getTypeChecker();
  for (const path of files) {
    const file = program.getSourceFile(path);
    if (!file) throw new Error(`not parsed: ${path}`);
    const visit = (node: ts.Node): void => {
      const where = () => `${relative(SRC, path)}: ${node.getText(file)}`;
      if (
        ts.isImportSpecifier(node) &&
        (node.propertyName ?? node.name).text === 'apiClient' &&
        node.name.text !== 'apiClient'
      ) {
        rebindings.push(where());
      }
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isIdentifier(node.initializer) &&
        node.initializer.text === 'apiClient'
      ) {
        rebindings.push(where());
      }
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
          site: `${relative(SRC, path)}: ${siteText(arg, checker, file)}`,
          prefix: prefixOf(arg, checker),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { calls, references, rebindings };
};

describe('every apiClient path reaches the backend', () => {
  const { calls, references, rebindings } = scan();

  it('CONTROL: every apiClient.<method> reference is a call this test checked', () => {
    // The old regex skipped `get<A<B[]>>(`: 173 of 506 calls, and still passed its own control.
    // A reference that is not a checked call (passed around, aliased, called with no argument)
    // makes this fail rather than slip past the path check.
    expect(calls.length).toBeGreaterThan(400);
    expect(calls.length).toBe(references);
    expect(calls.some((call) => call.prefix === '/api/custom-apis/lookup')).toBe(true);
  });

  it('⛔ the client is only ever called by its own name, so nothing escapes the count', () => {
    expect(rebindings).toEqual([]);
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
