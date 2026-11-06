/**
 * The import graph of `src/`, shared by check-boundaries.mjs and check-cycles.mjs.
 *
 * Every non-test source file is parsed with the TypeScript compiler (no type-check, just the
 * syntax tree), and every import that points into `src/` is resolved to a file:
 *
 * - `@/x` (the alias in tsconfig.app.json / vite.config.ts) and relative `./x`, `../x`;
 * - tried as written, then with `.ts`, `.tsx`, `.d.ts`, then as a folder's `index.ts` / `index.tsx`;
 * - static imports, `import type`, `export … from`, `import('x')` (lazy pages) and `import('x').T`
 *   type references all count. Type-only edges vanish at runtime but still tie files together for
 *   the type checker, and a feature folder that is meant to stand alone cannot have them either.
 *
 * Packages (`react`, `@tanstack/…`) are not edges. Stylesheets and images (`./App.css`) are not
 * edges. A local import that resolves to nothing FAILS the walk instead of being dropped: a resolver
 * gap would otherwise hide edges and make the counts look better than they are.
 *
 * Tests are left out (`*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `src/test/`): nothing
 * imports a suite back, so it cannot close a cycle, and a test reaching into another feature is not
 * product coupling.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import ts from 'typescript';

const SOURCE = /\.(ts|tsx|mts|cts)$/;
const ASSET = /\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|ico|json|txt|md|html|woff2?)(\?.*)?$/;
const TEST = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)(__tests__|__mocks__)\//;
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];

/** `src/…` with forward slashes, whatever the platform. */
const toPosix = (path) => path.split(sep).join('/');

export const isTestFile = (srcRelative) =>
  TEST.test(srcRelative) || srcRelative.startsWith('test/');

const listFiles = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
};

/** Every module specifier in one file, with the 1-based line it sits on. */
const specifiersOf = (fileName, text) => {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const add = (literal) => {
    if (!literal || !ts.isStringLiteralLike(literal)) return;
    const { line } = source.getLineAndCharacterOfPosition(literal.getStart(source));
    found.push({ specifier: literal.text, line: line + 1 });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/**
 * Build the graph for `<root>/src`.
 * @returns {{ files: string[], edges: Array<{from: string, to: string, line: number, specifier: string}>, unresolved: string[] }}
 *   Paths are `src/…`, posix.
 */
export const buildImportGraph = (root) => {
  const srcDir = resolve(root, 'src');
  const all = listFiles(srcDir)
    .map((full) => toPosix(relative(srcDir, full)))
    .filter((path) => SOURCE.test(path) && !isTestFile(path));
  const known = new Set(all);

  const resolveTarget = (fromPath, specifier) => {
    let base;
    if (specifier.startsWith('@/')) base = specifier.slice(2);
    else if (specifier.startsWith('./') || specifier.startsWith('../')) {
      base = toPosix(join(dirname(fromPath), specifier));
    } else return { external: true };
    const clean = base.replace(/\?.*$/, '').replace(/\.js$/, '');
    for (const suffix of CANDIDATE_SUFFIXES) {
      if (known.has(clean + suffix)) return { path: clean + suffix };
    }
    // An asset, or a file that exists but is not a source we walk (e.g. a test helper).
    if (ASSET.test(specifier) || existsSync(join(srcDir, base))) return { external: true };
    return { path: null };
  };

  const edges = [];
  const unresolved = [];
  for (const path of all) {
    const text = readFileSync(join(srcDir, path), 'utf8');
    for (const { specifier, line } of specifiersOf(path, text)) {
      const target = resolveTarget(path, specifier);
      if (target.external) continue;
      if (target.path === null) {
        unresolved.push(`src/${path}:${line}  '${specifier}'`);
        continue;
      }
      edges.push({ from: `src/${path}`, to: `src/${target.path}`, line, specifier });
    }
  }
  return { files: all.map((path) => `src/${path}`), edges, unresolved };
};

/**
 * The area a file belongs to: `components/<sub>` and `features/<x>` for those two folders, else the
 * top folder under src (`services`, `hooks`, `lib`, …). Files directly in `src/` are `app`.
 */
export const areaOf = (file) => {
  const parts = file.split('/').slice(1);
  if (parts.length === 1) return 'app';
  if ((parts[0] === 'components' || parts[0] === 'features') && parts.length > 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
};

/** Fail loudly on local imports the walk could not resolve (see the header). */
export const exitOnUnresolved = (unresolved) => {
  if (unresolved.length === 0) return;
  console.error(`✗ ${unresolved.length} local import(s) did not resolve to a file in src/:`);
  for (const entry of unresolved) console.error(`  ${entry}`);
  console.error('\nFix the import, or teach scripts/ci/import-graph.mjs the new form.');
  process.exit(1);
};

/** Read a JSON baseline; null when missing. */
export const readBaseline = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};
