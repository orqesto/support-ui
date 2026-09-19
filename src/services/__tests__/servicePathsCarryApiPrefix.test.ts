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

/**
 * Calls the parser cannot resolve, each checked by hand. Keep it EMPTY if possible.
 * Keyed `file: enclosing function: argument = resolved declaration`, and mapped to the EXACT
 * number of such calls, like the two lists below: a Set could not tell a second identical call
 * (a new caller the hand check never read) from the one that was checked (audit round 21), nor
 * an entry whose call is gone (independent audit, 2026-09-19).
 */
const CHECKED_BY_HAND = new Map<string, number>([
  // `downloadPath ?? \`/api/attachments/${id}/download\``: the prop's only caller
  // (TicketAttachments) passes `/api/attachments/jira/${id}/download` or undefined.
  [
    'components/shared/AttachmentPreviewDialog.tsx: AttachmentPreviewDialog: path = path = downloadPath ?? `/api/attachments/${attachment.id}/download`',
    1,
  ],
]);

/**
 * ⛔ WHOLE SITES that use the client some way other than a checked call, each read by a person.
 * Keyed `file: enclosing function: site`, where site is the member chain off `apiClient` plus a
 * call's arguments, so an entry stops matching the moment the site changes — and mapped to the
 * EXACT number of such sites, so one entry cannot silently cover a pasted second copy (audit,
 * 2026-09-19), and a site that disappears fails too rather than leave the entry to rot into a pass.
 * Only the client's own module may be here: anywhere else, a use this test cannot read is a
 * request it cannot check.
 */
const CLIENT_INTERNALS = new Map<string, number>([
  // The request interceptor: adds the auth token and org/alliance headers. Builds no URL.
  [
    'lib/api-client.ts: <module>: apiClient.interceptors.request.use(applyRequestContext, (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(String(error))))',
    1,
  ],
  // The 401 retry RE-SENDS a request that already went out through a checked call — its URL is
  // the one that call was checked for — after the session refresh. It builds no new path.
  ['lib/api-client.ts: handleResponseError: apiClient.request(original)', 1],
  // The response interceptor: session bookkeeping and error shaping. Builds no URL.
  [
    'lib/api-client.ts: <module>: apiClient.interceptors.response.use(noteSessionFromResponse, handleResponseError)',
    1,
  ],
]);

/**
 * Places that name the client MODULE other than a permitted static import, each read by a person,
 * keyed `file: enclosing function: site` with an exact count, like CLIENT_INTERNALS.
 */
const MODULE_NAMED_BY_HAND = new Map<string, number>([
  // A test helper (src/test/, never bundled into the app) that loads the REAL module to reach
  // its response handler; it calls `handleResponseError`, never the client.
  ["test/apiError.ts: realHandler: vi.importActual<typeof ApiClientModule>('@/lib/api-client')", 1],
]);

/**
 * A module specifier — or any string — that names the client module: the alias, a relative path
 * resolving to src/lib/api-client, or any other spelling ending in `lib/api-client` (`/src/lib/…`
 * resolves in Vite), with or without an extension.
 */
const namesClientModule = (specifier: string, fromFile: string): boolean => {
  const bare = (text: string) => text.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '').replace(/\/index$/, '');
  if (specifier.startsWith('.')) {
    return bare(relative(SRC, join(fromFile, '..', specifier))) === 'lib/api-client';
  }
  return /(^|\/)lib\/api-client$/.test(bare(specifier));
};

/** Every piece of literal text a string or template carries. */
const literalTexts = (node: ts.Node): string[] => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  }
  return [];
};

/**
 * ⛔ The ONLY runtime exports of the client module another file may import, each read by a person
 * and found to send no request to a path its caller supplies. Audit (2026-09-19): the rule used to
 * accept an unaliased import of ANY export, so `handleResponseError({ response: { status: 401 },
 * config: { url: '/custom-apis/lookup' } })` stayed green and at runtime REPLAYED that path — no
 * `/api` — through `apiClient.request`. Every export of lib/api-client.ts, classified:
 * - `apiClient`: the client; every call on it is checked by this file.
 * - `ensureFreshSession`: single-flight wrapper over `requestRefresh`, which posts only to the
 *   fixed `${API_BASE_URL}/api/auth/refresh`. Takes no argument. Permitted.
 * - `handleResponseError`: replays `error.config` — a CALLER-supplied path — on a 401. Forbidden.
 * - `applyRequestContext`, `noteSessionFromResponse`, `clearDatabasePauseOnSuccess`: send no
 *   request, but nothing outside the module needs them, so they are not listed. Add one only
 *   after re-reading its body.
 */
const PERMITTED_IMPORTS = new Set(['apiClient', 'ensureFreshSession']);

/**
 * The only runtime way the client module may be named: `import { apiClient, ensureFreshSession }
 * from …` — names from PERMITTED_IMPORTS, no alias, no default and no namespace binding — or
 * anything `import type` (erased at compile time). A side-effect-only import, a default or
 * namespace import, an aliased specifier, any other export: all fail.
 */
const isPermittedClientImport = (node: ts.ImportDeclaration): boolean => {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return false;
  return bindings.elements.every(
    (element) =>
      element.isTypeOnly || (!element.propertyName && PERMITTED_IMPORTS.has(element.name.text))
  );
};

/** The name a function-like or class node declares for itself, or null when it has none. */
const declaredName = (at: ts.Node): string | null => {
  const own = (name: ts.Node | undefined): string | null =>
    name && !ts.isComputedPropertyName(name) ? name.getText() : null;
  if (ts.isFunctionDeclaration(at) || ts.isClassDeclaration(at)) return own(at.name);
  if (ts.isMethodDeclaration(at) || ts.isPropertyDeclaration(at)) return own(at.name);
  if (ts.isGetAccessorDeclaration(at)) return `get ${own(at.name) ?? '?'}`;
  if (ts.isSetAccessorDeclaration(at)) return `set ${own(at.name) ?? '?'}`;
  if (ts.isExportAssignment(at)) return 'default';
  if (ts.isArrowFunction(at) || ts.isFunctionExpression(at) || ts.isClassExpression(at)) {
    const holder = at.parent;
    if (
      (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) &&
      ts.isIdentifier(holder.name)
    ) {
      return holder.name.text;
    }
  }
  return null;
};

/**
 * EVERY named scope around a node, outermost first — `AttachmentPreviewDialog`, `Alpha.send`,
 * `Outer>inner`, `default` — skipping anonymous callbacks (a `useEffect` arrow). The whole chain,
 * so two callers share a key only if they share every enclosing name; `<module>` when there is
 * none, which an unresolvable call may not have (see the hand-check test).
 */
const namedEnclosingFunction = (node: ts.Node): string => {
  const names: string[] = [];
  for (let at = node.parent; at; at = at.parent) {
    const name = declaredName(at);
    if (name !== null) names.unshift(name);
  }
  return names.length > 0 ? names.join('>') : '<module>';
};

/**
 * The name of the nearest function a node sits in: `<anonymous>` for an unassigned callback,
 * `<module>` at top level. Used for the api-client internals, which are pinned to one file.
 */
const enclosingFunction = (node: ts.Node): string => {
  for (let at = node.parent; at; at = at.parent) {
    if (
      (ts.isFunctionDeclaration(at) || ts.isMethodDeclaration(at)) &&
      at.name &&
      !ts.isComputedPropertyName(at.name)
    ) {
      return at.name.getText();
    }
    if (ts.isArrowFunction(at) || ts.isFunctionExpression(at)) {
      const holder = at.parent;
      if (
        (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) &&
        ts.isIdentifier(holder.name)
      ) {
        return holder.name.text;
      }
      return '<anonymous>';
    }
  }
  return '<module>';
};

const normalise = (text: string): string =>
  text.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/,? \)/g, ')');

/** Is this string where a module is named: an import/export `from`, or an argument that loads one. */
const isModuleSpecifier = (node: ts.Node): boolean => {
  const parent = node.parent;
  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  ) {
    return true;
  }
  if (ts.isExternalModuleReference(parent)) return true;
  if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
    const callee = parent.expression;
    if (callee.kind === ts.SyntaxKind.ImportKeyword) return true;
    if (ts.isIdentifier(callee) && callee.text === 'require') return true;
    // vi.importActual / vi.importMock / vi.mock / jest.requireActual …
    if (ts.isPropertyAccessExpression(callee) && /^(import|require|mock)/.test(callee.name.text)) {
      return true;
    }
  }
  return false;
};

/**
 * Every file the parser must see: all TypeScript under src/ except `*.test.ts(x)` and `.d.ts`.
 * ⛔ A `__tests__` directory is NOT skipped wholesale — a helper there that production code
 * imports ships in the bundle — only files that are themselves tests are left out.
 */
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [full] : [];
  });

/**
 * Every file under src/ written in a language this parser does not read. Vite bundles a `.js`
 * (with a `.d.ts` beside it, type-check passes too), so one would carry calls no check sees.
 */
const unscannedScripts = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return unscannedScripts(full);
    return /\.(?:[cm]?jsx?|[cm]ts)$/.test(name) ? [relative(SRC, full)] : [];
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
  return normalise(site);
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
  // How many times each allowlisted internal, and each hand-checked mention of the module, occurs.
  const internals = new Map<string, number>();
  const moduleNamed = new Map<string, number>();
  // Test modules named from production code. The scan skips `*.test.ts(x)`, so a test module that
  // production imports would ship calls no check sees (audit round 16: a bad path reached dist).
  // Any string that names one counts — static, dynamic, require, re-export — not only imports.
  const testModulesNamed: string[] = [];
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
      // Only in a MODULE-SPECIFIER position — `from '…'`, `import('…')`, `require('…')`,
      // `vi.importActual('…')` — so an ordinary string such as `user@example.test` (a reserved
      // TLD, RFC 2606) is not mistaken for a test module.
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        isModuleSpecifier(node) &&
        // A Vite query or fragment (`?worker`, `?url`, `#x`) changes HOW a module is loaded —
        // `?worker` bundles it as executable code (audit round 19) — and no production import
        // uses one, so a specifier carrying either is refused outright, whatever it names.
        (/[?#]/.test(node.text) || /\.test(?:\.[cm]?[jt]sx?)?$/.test(node.text))
      ) {
        testModulesNamed.push(where());
      }
      // `import.meta.glob(...)` pulls files in by PATTERN, so no specifier names the test module
      // it may include (audit round 17: './__tests__/*.ts'). Rather than list the spellings — a
      // cast `(import.meta as any).glob` escaped a check on the direct form (round 18) — every
      // `import.meta` in production code must be read as exactly `import.meta.env`.
      if (
        ts.isMetaProperty(node) &&
        node.keywordToken === ts.SyntaxKind.ImportKeyword &&
        !(
          ts.isPropertyAccessExpression(node.parent) &&
          node.parent.expression === node &&
          node.parent.name.text === 'env'
        )
      ) {
        testModulesNamed.push(where());
      }
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
      // ⛔ The module itself, by any route the identifier scan below cannot follow. Audit round 14
      // (2026-09-19) got `(await import('@/lib/api-client'))['apiClient'].get(…)` past a rule that
      // listed forms (namespace import, `require`), so this closes the CLASS instead: every string
      // that names the module is a failure unless it is the specifier of a permitted import or a
      // site read by a person — which covers `import()`, `require`, `vi.importActual`, a re-export
      // barrel, `import x = require(…)`, and a specifier parked in a variable first.
      for (const text of literalTexts(node)) {
        if (!namesClientModule(text, path)) continue;
        const holder = node.parent;
        if (
          ts.isImportDeclaration(holder) &&
          holder.moduleSpecifier === node &&
          isPermittedClientImport(holder)
        ) {
          continue;
        }
        if (
          ts.isExportDeclaration(holder) &&
          holder.moduleSpecifier === node &&
          holder.isTypeOnly
        ) {
          continue;
        }
        let site: ts.Node = node;
        while (ts.isCallExpression(site.parent) || ts.isTemplateSpan(site.parent))
          site = site.parent;
        const key = `${relative(SRC, path)}: ${enclosingFunction(node)}: ${normalise(site.getText(file))}`;
        moduleNamed.set(key, (moduleNamed.get(key) ?? 0) + 1);
      }
      // A module loaded by an expression this test cannot read could be the client: `import(x)`,
      // `require(a + b)`. Every dynamic load must name its module in a plain literal.
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        !(
          node.arguments.length > 0 &&
          (ts.isStringLiteral(node.arguments[0]) ||
            ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
        )
      ) {
        unaccounted.push(`${where()} (module loaded by an expression)`);
      }
      // The client's NAME as a string can only be reaching for it by key: `mod['apiClient']`,
      // `{ ['apiClient']: … }`, `Reflect.get(mod, 'apiClient')`. No code needs it; all of it fails.
      if (literalTexts(node).includes('apiClient')) {
        unaccounted.push(`${where()} (the client's name as a string)`);
      }
      // A re-export can rename the client past the rebinding check (`export { apiClient as c }`,
      // or `export { apiClient } from …` into a barrel). The client is exported where it is
      // declared and nowhere else.
      if (
        ts.isExportSpecifier(node) &&
        [node.name, node.propertyName].some(
          (name) => name !== undefined && ts.isIdentifier(name) && name.text === 'apiClient'
        )
      ) {
        unaccounted.push(`${where()} (re-export)`);
      }
      if (ts.isIdentifier(node) && node.text === 'apiClient') {
        const site = classifyUse(node, file);
        if (site !== 'accounted') {
          const key = `${relative(SRC, path)}: ${enclosingFunction(node)}: ${site}`;
          if (relative(SRC, path) === CLIENT_MODULE && CLIENT_INTERNALS.has(key)) {
            internals.set(key, (internals.get(key) ?? 0) + 1);
          } else {
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
          site: `${relative(SRC, path)}: ${namedEnclosingFunction(node)}: ${siteText(arg, checker, file)}`,
          prefix: prefixOf(arg, checker),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { calls, references, rebindings, unaccounted, internals, moduleNamed, testModulesNamed };
};

describe('every apiClient path reaches the backend', () => {
  const { calls, references, rebindings, unaccounted, internals, moduleNamed, testModulesNamed } =
    scan();

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

  it('⛔ every allowlisted internal occurs EXACTLY as often as a person counted', () => {
    // A pasted second copy fails, and so does a site that is gone — the list cannot rot into a pass.
    expect(Object.fromEntries(internals)).toEqual(Object.fromEntries(CLIENT_INTERNALS));
  });

  it('⛔ the client module is named only by a plain import, or where a person counted it', () => {
    // RED on `import('@/lib/api-client')`, `require`, `import * as`, a default import, an aliased
    // specifier, `export * from` / `export { … } from` the module, or its path in any string.
    expect(Object.fromEntries(moduleNamed)).toEqual(Object.fromEntries(MODULE_NAMED_BY_HAND));
  });

  it('⛔ production code never names a test module or globs files in, which the scan cannot follow', () => {
    expect(testModulesNamed).toEqual([]);
  });

  it('⛔ src holds no script the parser cannot read', () => {
    expect(unscannedScripts(SRC)).toEqual([]);
  });

  it('⛔ no apiClient path starts with anything but /api/', () => {
    expect(calls.filter((call) => call.prefix !== null && !call.prefix.startsWith(API))).toEqual(
      []
    );
  });

  it('⛔ every unresolvable path is checked by hand, EXACTLY as often as it occurs', () => {
    // Both ways: an unchecked call fails, a second identical call hiding behind one entry fails,
    // and an entry whose call is gone fails rather than wait to excuse something later.
    const observed = new Map<string, number>();
    for (const call of calls.filter((call) => call.prefix === null)) {
      observed.set(call.site, (observed.get(call.site) ?? 0) + 1);
    }
    expect(Object.fromEntries(observed)).toEqual(Object.fromEntries(CHECKED_BY_HAND));
  });

  it('⛔ an unresolvable call sits under a NAMED scope, so its hand check names one caller', () => {
    // Under `<module>` any top-level caller would share the key (audit round 22: class fields,
    // accessors and default exports all fell to `<module>` before they were named).
    const unnamed = calls.filter(
      (call) => call.prefix === null && call.site.split(': ')[1] === '<module>'
    );
    expect(unnamed.map((call) => call.site)).toEqual([]);
  });
});
