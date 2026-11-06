/**
 * Codemod for modularity task F4 ("move feature by feature").
 *
 * Usage, after `git mv`-ing a feature's files into `src/features/<feature>/` and before committing:
 *
 *   node scripts/codemod/move-feature-imports.mjs <feature>
 *
 * The moves are read from the staged renames (`git diff --cached -M --name-status`), so the script
 * needs no list of its own. Every import in `src/` (tests included) is resolved against where the
 * files were BEFORE the move and rewritten to where they are now:
 *
 * - outside the feature, an `import` / `export … from` of a moved file becomes `@/features/<feature>`
 *   (the feature's index), and several such imports in one file are merged into one;
 * - outside the feature, `vi.mock('…')`, `vi.importActual('…')` and `import('…')` keep pointing at the
 *   real file (`@/features/<feature>/…`): a mock must name the module the code really loads;
 * - inside the feature, a relative specifier stays relative and an `@/` one stays `@/`;
 * - a moved file's relative import of a file that did not move becomes an `@/` import.
 *
 * It only rewrites specifiers. The index itself is written by hand: the script prints every name
 * the outside code now takes from `@/features/<feature>`, which is what the index must export.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import ts from 'typescript';

const feature = process.argv[2];
if (!feature) {
  console.error('usage: node scripts/codemod/move-feature-imports.mjs <feature>');
  process.exit(1);
}
const root = process.cwd();
const featureDir = `src/features/${feature}/`;
const indexSpecifier = `@/features/${feature}`;
const SOURCE = /\.(ts|tsx)$/;
const SUFFIXES = ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];
const MOCK_CALLS = new Set(['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock']);

const toPosix = (path) => path.split(sep).join('/');
const stripExtension = (path) => path.replace(/(\/index)?\.(d\.)?tsx?$/, '');

// old src path → new src path, from the staged renames.
const renames = new Map();
const status = execFileSync('git', ['diff', '--cached', '-M', '--name-status'], {
  encoding: 'utf8',
});
for (const row of status.split('\n')) {
  const [kind, from, to] = row.split('\t');
  if (kind?.startsWith('R') && to.startsWith(featureDir)) renames.set(from, to);
}
if (renames.size === 0) {
  console.error(`No staged renames into ${featureDir}. git mv the files first.`);
  process.exit(1);
}
const oldOf = new Map([...renames].map(([from, to]) => [to, from]));

const listFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [toPosix(relative(root, full))];
  });
const files = listFiles(join(root, 'src')).filter((path) => SOURCE.test(path));
// The tree as it was before the move: what the specifiers were written against.
const oldTree = new Set(files.map((path) => oldOf.get(path) ?? path));

const resolveOld = (oldImporter, specifier) => {
  let base;
  if (specifier.startsWith('@/')) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = posix.join(posix.dirname(oldImporter), specifier);
  } else return null;
  for (const suffix of SUFFIXES) if (oldTree.has(base + suffix)) return base + suffix;
  return null;
};

const relativeSpecifier = (fromFile, toFile) => {
  const path = posix.relative(posix.dirname(fromFile), stripExtension(toFile));
  return path.startsWith('.') ? path : `./${path}`;
};
const aliasSpecifier = (srcPath) => `@/${stripExtension(srcPath).slice('src/'.length)}`;

/** Each module specifier in the file, with what kind of reference holds it. */
const referencesOf = (path, text) => {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) found.push({ literal: node.moduleSpecifier, declaration: node });
    } else if (ts.isCallExpression(node) && node.arguments[0]) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isMockCall =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'vi' &&
        MOCK_CALLS.has(callee.name.text);
      if ((isDynamicImport || isMockCall) && ts.isStringLiteralLike(node.arguments[0])) {
        found.push({ literal: node.arguments[0], declaration: null });
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      found.push({ literal: node.argument.literal, declaration: null });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { source, found };
};

/** `import { a, type B }` text for the merged index import. */
const mergedImport = (source, declarations) => {
  const names = [];
  for (const declaration of declarations) {
    const clause = declaration.importClause;
    if (
      !clause ||
      clause.name ||
      !clause.namedBindings ||
      !ts.isNamedImports(clause.namedBindings)
    ) {
      return null; // a default or namespace import: leave the declarations as they are
    }
    for (const element of clause.namedBindings.elements) {
      const text = element.getText(source);
      names.push(clause.isTypeOnly && !element.isTypeOnly ? `type ${text}` : text);
    }
  }
  return `import { ${names.join(', ')} } from '${indexSpecifier}';`;
};

const indexNames = new Set();
let changedFiles = 0;
for (const path of files) {
  const text = readFileSync(join(root, path), 'utf8');
  const oldImporter = oldOf.get(path) ?? path;
  const importerInside = path.startsWith(featureDir);
  const { source, found } = referencesOf(path, text);
  const edits = [];
  const toIndex = [];

  for (const { literal, declaration } of found) {
    const specifier = literal.text;
    const oldTarget = resolveOld(oldImporter, specifier);
    if (!oldTarget) continue;
    const newTarget = renames.get(oldTarget);
    const isRelative = specifier.startsWith('.');
    let next = specifier;
    if (newTarget && importerInside) {
      next = isRelative ? relativeSpecifier(path, newTarget) : aliasSpecifier(newTarget);
    } else if (newTarget) {
      if (declaration) {
        next = indexSpecifier;
        if (ts.isImportDeclaration(declaration)) toIndex.push(declaration);
        const bindings = declaration.importClause?.namedBindings ?? declaration.exportClause;
        for (const element of bindings?.elements ?? []) indexNames.add(element.name.text);
      } else next = aliasSpecifier(newTarget);
    } else if (oldImporter !== path && isRelative) {
      next = aliasSpecifier(oldTarget);
    }
    if (next !== specifier) {
      const quote = literal.getText(source)[0];
      edits.push({
        start: literal.getStart(source),
        end: literal.getEnd(),
        text: `${quote}${next}${quote}`,
      });
    }
  }

  // Merge several imports from the index into the first one.
  if (toIndex.length > 1) {
    const merged = mergedImport(source, toIndex);
    if (merged) {
      for (let position = edits.length - 1; position >= 0; position -= 1) {
        const edit = edits[position];
        const inMerged = toIndex.some(
          (declaration) =>
            edit.start >= declaration.getStart(source) && edit.end <= declaration.getEnd()
        );
        if (inMerged) edits.splice(position, 1);
      }
      toIndex.forEach((declaration, order) => {
        const start = declaration.getStart(source);
        let end = declaration.getEnd();
        if (order > 0 && text[end] === '\n') end += 1;
        edits.push({ start, end, text: order === 0 ? merged : '' });
      });
    }
  }

  if (edits.length === 0) continue;
  edits.sort((left, right) => right.start - left.start);
  let out = text;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  writeFileSync(join(root, path), out);
  changedFiles += 1;
  console.log(`rewrote ${path}`);
}

console.log(`\n${renames.size} moved file(s), ${changedFiles} file(s) rewritten.`);
console.log(`Names the outside code takes from ${indexSpecifier} (the index must export these):`);
for (const name of [...indexNames].sort()) console.log(`  ${name}`);
