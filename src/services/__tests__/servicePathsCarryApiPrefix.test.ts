import { readFileSync, readdirSync, statSync } from 'node:fs';
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
/**
 * Every apiClient method whose FIRST argument is a URL. The form and head/options variants were
 * missing until audit round 12 (2026-09-19): `apiClient.postForm('/custom-apis', …)` was neither
 * checked nor counted, so it stayed green.
 */
const METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'postForm',
  'putForm',
  'patchForm',
  'head',
  'options',
]);
const CLIENT_MODULE = 'lib/api-client.ts';
const API = '/api/';

/** `file: first argument` the parser cannot resolve, each checked by hand. Keep it EMPTY if possible. */
const CHECKED_BY_HAND = new Set<string>([
  // `downloadPath ?? \`/api/attachments/${id}/download\``: the prop's only caller
  // (TicketAttachments) passes `/api/attachments/jira/${id}/download` or undefined.
  'components/shared/AttachmentPreviewDialog.tsx: path = path = downloadPath ?? `/api/attachments/${attachment.id}/download`',
]);

/**
 * ⛔ WHOLE SITES that use the client some way other than a checked call, each read by a person.
 * Keyed `file: site`, where site is the member chain off `apiClient` plus a call's arguments,
 * so an entry stops matching the moment the site changes. Only the client's own module may be
 * here: anywhere else, a use this test cannot read is a request it cannot check.
 */
const CLIENT_INTERNALS = new Set<string>([
  // The request interceptor: adds the auth token and org/alliance headers. Builds no URL.
  'lib/api-client.ts: apiClient.interceptors.request.use(applyRequestContext, (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error))))',
  // The 401 retry RE-SENDS a request that already went out through a checked call — its URL is
  // the one that call was checked for — after the session refresh. It builds no new path.
  'lib/api-client.ts: apiClient.request(original)',
  // The response interceptor: session bookkeeping and error shaping. Builds no URL.
  'lib/api-client.ts: apiClient.interceptors.response.use(noteSessionFromResponse, handleResponseError)',
]);

/** A module specifier that names the client module, by alias or by relative path. */
const namesClientModule = (specifier: string, fromFile: string): boolean =>
  specifier === '@/lib/api-client' ||
  (specifier.startsWith('.') &&
    relative(SRC, join(fromFile, '..', specifier)).replace(/\.tsx?$/, '') === 'lib/api-client');

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

/**
 * Is this `apiClient` identifier one of the three accounted uses — its own declaration in the
 * client module, an un-renamed import specifier, or the object of a checked call with a first
 * argument? If so, 'accounted'; otherwise the whole site, for the failure or the allowlist.
 * A property NAME `apiClient` (`AC.apiClient`, `{ apiClient: … }`) is not accounted either.
 */
const classifyUse = (id: ts.Identifier, file: ts.SourceFile): string => {
  const parent = id.parent;
  if (
    ts.isVariableDeclaration(parent) &&
    parent.name === id &&
    relative(SRC, file.fileName) === CLIENT_MODULE
  ) {
    return 'accounted';
  }
  // Renamed imports are flagged by the rebinding check; this accepts only `{ apiClient }`.
  if (ts.isImportSpecifier(parent) && !parent.propertyName && parent.name === id)
    return 'accounted';
  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === id &&
    METHODS.has(parent.name.text) &&
    ts.isCallExpression(parent.parent) &&
    parent.parent.expression === parent &&
    parent.parent.arguments.length > 0
  ) {
    return 'accounted';
  }
  // Climb the member chain (`apiClient.interceptors.request.use`, `apiClient['get']`), and take
  // the call's arguments too when the chain is called, so an allowlisted site is the WHOLE site.
  let top: ts.Node = id;
  while (
    (ts.isPropertyAccessExpression(top.parent) || ts.isElementAccessExpression(top.parent)) &&
    top.parent.expression === top
  ) {
    top = top.parent;
  }
  let site = top.getText(file);
  if (ts.isCallExpression(top.parent) && top.parent.expression === top) {
    site = top.parent.getText(file);
  } else if (top === id) {
    site = parent.getText(file);
  }
  return site.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/,? \)/g, ')');
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
  // Every OTHER use of the identifier: element access, `.request(...)`, passing it as an argument,
  // `.defaults`, `.interceptors`, a namespace import. Audit round 12 found four forms the method
  // count never saw; rather than list forms, every use must be one of the three accounted for.
  const unaccounted: string[] = [];
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
      // ⛔ The module itself, by any name the identifier scan below cannot follow:
      // `import * as AC from '@/lib/api-client'` makes `AC.apiClient.get(...)` a property, and a
      // `require` returns an object nobody checks.
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        namesClientModule(node.moduleSpecifier.text, path) &&
        node.importClause?.namedBindings &&
        ts.isNamespaceImport(node.importClause.namedBindings) &&
        // `import type * as X` is erased at compile time: it can name the client's TYPE
        // (src/test/apiError.ts does), never call it.
        !node.importClause.isTypeOnly
      ) {
        unaccounted.push(`${where()} (namespace import)`);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0]) &&
        namesClientModule(node.arguments[0].text, path)
      ) {
        unaccounted.push(`${where()} (require)`);
      }
      if (ts.isIdentifier(node) && node.text === 'apiClient') {
        const site = classifyUse(node, file);
        if (site !== 'accounted') {
          const key = `${relative(SRC, path)}: ${site}`;
          if (!(relative(SRC, path) === CLIENT_MODULE && CLIENT_INTERNALS.has(key))) {
            unaccounted.push(key);
          }
        }
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
  return { calls, references, rebindings, unaccounted };
};

describe('every apiClient path reaches the backend', () => {
  const { calls, references, rebindings, unaccounted } = scan();

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

  it('⛔ every use of the client is a checked call, an import, or a reasoned internal', () => {
    // RED on `apiClient.request({ url })`, `apiClient['get'](…)`, `import * as AC`, a `require`,
    // or the client passed to a helper: each can send a path the checks above never read.
    expect(unaccounted).toEqual([]);
  });

  it('CONTROL: every allowlisted internal still exists, so the list cannot rot into a pass', () => {
    const seen = new Set<string>();
    const file = ts.createSourceFile(
      join(SRC, CLIENT_MODULE),
      readFileSync(join(SRC, CLIENT_MODULE), 'utf8'),
      ts.ScriptTarget.ES2022,
      true
    );
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === 'apiClient') {
        seen.add(`${CLIENT_MODULE}: ${classifyUse(node, file)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect([...CLIENT_INTERNALS].filter((site) => !seen.has(site))).toEqual([]);
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
