/**
 * Shell-bundle guard (modularity task F4): no feature's index may be loaded with the app shell.
 *
 *   node scripts/ci/check-shell-bundle.mjs
 *
 * A feature's `index.ts` re-exports the whole feature. When a file that every page loads first
 * (App, its route helpers, the layout, the processing indicator, …) imports it statically, the
 * bundler puts the whole feature into the main bundle: on 2026-11-07 that took staging's main
 * bundle from 732 KB to 1,479 KB while tests, lint and the boundary ratchet stayed green. The shell
 * uses `@/features/<x>/shell` instead (leaf files only).
 *
 * The walk starts at src/main.tsx and follows static imports and `export … from` only: a lazy
 * `import()` starts a chunk of its own, and a type-only import is erased, so neither is followed.
 * It fails, printing the import chain, when it reaches any `src/features/<x>/index.ts(x)`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const ENTRY = 'src/main.tsx';
const INDEX = /^src\/features\/[^/]+\/index\.tsx?$/;
const SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

const toPosix = (path) => path.split(sep).join('/');

/** The `src/…` file a specifier resolves to, or null (packages, CSS, assets). */
const resolveFrom = (from, specifier) => {
  let base;
  if (specifier.startsWith('@/')) base = join('src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = normalize(join(dirname(from), specifier));
  else return null;
  for (const suffix of SUFFIXES) {
    const candidate = toPosix(base + suffix);
    const full = join(root, candidate);
    if (/\.tsx?$/.test(candidate) && existsSync(full) && statSync(full).isFile()) return candidate;
  }
  return null;
};

const typeOnlyImport = (statement) => {
  const clause = statement.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return (
    !clause.name &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
};

/** The files `file` loads statically (lazy `import()` and type-only imports left out). */
const staticImportsOf = (file) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(root, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const targets = [];
  for (const statement of source.statements) {
    const isImport = ts.isImportDeclaration(statement) && !typeOnlyImport(statement);
    const isReExport =
      ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly;
    if (!isImport && !isReExport) continue;
    const target = resolveFrom(file, statement.moduleSpecifier.text);
    if (target) targets.push(target);
  }
  return targets;
};

const parentOf = new Map([[ENTRY, null]]);
const queue = [ENTRY];
const reached = [];
while (queue.length > 0) {
  const file = queue.shift();
  for (const target of staticImportsOf(file)) {
    if (parentOf.has(target)) continue;
    parentOf.set(target, file);
    if (INDEX.test(target)) reached.push(target);
    else queue.push(target);
  }
}

const chainTo = (file) => {
  const chain = [];
  for (let node = file; node; node = parentOf.get(node)) chain.unshift(node);
  return chain.join('\n      -> ');
};

if (reached.length > 0) {
  console.error(`✗ ${reached.length} feature index(es) load with the app shell (from ${ENTRY}):`);
  for (const index of reached.sort()) console.error(`\n  ${index}\n    ${chainTo(index)}`);
  console.error(
    "\nThe last file before the index should import '@/features/<x>/shell' (add the name to that " +
      "feature's shell.ts, re-exporting the leaf file), or load the feature with a lazy import()."
  );
  process.exit(1);
}
console.log(`✓ No feature index loads with the app shell (${parentOf.size} files from ${ENTRY}).`);
