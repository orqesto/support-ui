#!/usr/bin/env node
/**
 * Import-boundary ratchet (modularity task F1): the coupling between areas of `src/` may shrink,
 * never grow. Ported from the backend's check-boundaries.mjs, but it walks the imports itself
 * (scripts/ci/import-graph.mjs) instead of reading ESLint warnings, because the frontend has no
 * boundary lint rule to count.
 *
 * Two measures, compared with `.ci/baselines/boundaries.json`:
 *
 * 1. featureToFeature — imports from one feature into another, counted per pair
 *    (`feature:a -> feature:b`). A feature is named, not a folder (`featureAreaOf` in
 *    import-graph.mjs): `components/<folder>` and `features/<x>` map to `feature:<name>` through
 *    the F3 feature map, so moving a folder into `src/features/` (task F4) never renames a pair, and
 *    folders that make up one feature (budget, billing, pricing → subscription) are one area.
 *    Shared folders are not features, so importing FROM them is fine: `ui`, `shared`, `common`,
 *    `layout` are never a target. They are still counted as importers (a layout reaching into a
 *    feature is coupling too), except `ui`, which the second measure covers.
 * 2. upward — a lower layer (services, hooks, stores, lib, types, utils, contexts, components/ui)
 *    importing a component, a page, a feature or the app root, counted per importing file
 *    (`src/lib/x.ts -> components/ui`). These point the wrong way: the lower layer can no longer be
 *    used, tested or moved without the screen it reaches into. Task F2 removes them.
 *
 * Per pair / per file, not one total: a total lets a clean-up in one place pay for new debt in
 * another.
 *
 * FAILS when a pair or file grows or a new one appears, and prints the file and line of every
 * import in it. A drop passes, with a reminder to lock it in: `npm run check:boundaries -- --update`
 * and commit the baseline, so the room a fix made cannot be used up again later. `--update` refuses
 * to record growth.
 *
 * `--rekey` rewrites the baseline's featureToFeature pairs onto the current area naming without
 * measuring the tree: each side of a key goes through `featureAreaOf`, pairs that land on the same
 * key are summed, and a pair whose two sides become one feature is dropped (it is internal now). It
 * prints the old total, the new total and every dropped pair. Use it when the feature map changes.
 *
 * `--adopt [--base <ref>]` records feature → feature imports that a move made COUNTABLE without
 * adding them: a service or hook (not a feature area) moved under `src/features/<x>/` turns its
 * existing importers into a new `feature:a -> feature:x` pair. Every edge of every grown pair must
 * be proven to have existed in the base tree (default: the merge base with origin/staging), or
 * nothing is written and it exits 1. An edge is proven when, in the base tree, the same importer
 * (mapped back through the renames of `git diff --cached -M <base>`) imported the target's old
 * path. An edge to a feature's index is resolved per imported name through the index's
 * `export { … } from` lines to the file that defines it; a name it cannot resolve (a namespace
 * import, `export *`) is proven when the importer imported ANY file that moved into that feature.
 * A name whose file was already inside the feature before this change (an earlier move put it
 * there) is proven when the importer's base version took that same name from the same specifier:
 * the import went through the index then too, so only its count is new.
 * A pair with one unproven edge is not adopted. Upward imports never accept adoption (and cycles
 * live in check-cycles.mjs, which has no such mode): any upward growth fails `--adopt` too.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import {
  SHARED_COMPONENT_AREAS as SHARED,
  areaOf,
  buildImportGraph,
  exitOnUnresolved,
  featureAreaOf,
  readBaseline,
} from './import-graph.mjs';

const BASELINE = '.ci/baselines/boundaries.json';
const LOWER = new Set([
  'services',
  'hooks',
  'stores',
  'lib',
  'types',
  'utils',
  'contexts',
  'components/ui',
]);

const isFeature = (area) =>
  area.startsWith('feature:') || area.startsWith('components/') || area.startsWith('features/');
const isUpperLayer = (area) =>
  area === 'app' || area === 'pages' || area === 'components' || isFeature(area);

/** Sort an object's keys so the baseline diffs cleanly. */
const sortKeys = (record) =>
  Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
const totalOf = (record) => Object.values(record).reduce((sum, count) => sum + count, 0);

/**
 * Group the graph's edges into the two measures.
 * @returns {{ featureToFeature: Map<string, object[]>, upward: Map<string, object[]> }} key -> edges
 */
const measure = (edges) => {
  const featureToFeature = new Map();
  const upward = new Map();
  const push = (map, key, edge) => map.set(key, [...(map.get(key) ?? []), edge]);
  for (const edge of edges) {
    const from = areaOf(edge.from);
    const to = areaOf(edge.to);
    if (from === to) continue;
    if (LOWER.has(from)) {
      if (isUpperLayer(to)) {
        push(upward, `${edge.from} -> ${to}`, edge);
      }
      continue;
    }
    const fromFeature = featureAreaOf(from);
    const toFeature = featureAreaOf(to);
    if (fromFeature === toFeature) continue;
    if (isFeature(fromFeature) && isFeature(toFeature) && !SHARED.has(toFeature)) {
      push(featureToFeature, `${fromFeature} -> ${toFeature}`, edge);
    }
  }
  return { featureToFeature, upward };
};

const countsOf = (map) =>
  sortKeys(Object.fromEntries([...map].map(([key, list]) => [key, list.length])));

/** `--rekey`: map the baseline's pair keys onto featureAreaOf; sum merged pairs, drop internal ones. */
const rekey = (baselinePath, baseline) => {
  const before = baseline.featureToFeature?.pairs ?? {};
  const pairs = {};
  const internal = [];
  for (const [key, count] of Object.entries(before)) {
    const [from, to] = key.split(' -> ').map(featureAreaOf);
    if (from === to) {
      internal.push(`  ${key}: ${count} (now inside ${from})`);
      continue;
    }
    pairs[`${from} -> ${to}`] = (pairs[`${from} -> ${to}`] ?? 0) + count;
  }
  const dropped = totalOf(before) - totalOf(pairs);
  const body = {
    ...baseline,
    featureToFeature: { total: totalOf(pairs), pairs: sortKeys(pairs) },
  };
  writeFileSync(baselinePath, `${JSON.stringify(body, null, 2)}\n`);
  console.log(
    `Baseline re-keyed: ${totalOf(before)} imports in ${Object.keys(before).length} pairs → ` +
      `${totalOf(pairs)} in ${Object.keys(pairs).length} pairs + ${dropped} now internal:`
  );
  for (const line of internal) console.log(line);
};

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

/** The base tree's `src/`, extracted into a temp folder, and its import graph. */
const baseGraphOf = (root, base) => {
  const dir = mkdtempSync(join(tmpdir(), 'boundaries-base-'));
  try {
    const tar = join(dir, 'base.tar');
    git(root, 'archive', '--format=tar', '-o', tar, base, 'src');
    execFileSync('tar', ['-xf', tar, '-C', dir]);
    return buildImportGraph(dir).edges;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** new path -> old path, from the renames between the base and the index (staged or committed). */
const renamesSince = (root, base) => {
  const oldOf = new Map();
  for (const row of git(root, 'diff', '--cached', '-M', '--name-status', base).split('\n')) {
    const [kind, from, to] = row.split('\t');
    if (kind?.startsWith('R')) oldOf.set(to, from);
  }
  return oldOf;
};

const parse = (root, file) =>
  ts.createSourceFile(file, readFileSync(join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);

/** The names an import / re-export at `line` with `specifier` takes; null when not by name. */
const namesTaken = (root, edge) => {
  const source = parse(root, edge.from);
  for (const statement of source.statements) {
    const literal = statement.moduleSpecifier;
    if (!literal || !ts.isStringLiteralLike(literal) || literal.text !== edge.specifier) continue;
    const { line } = source.getLineAndCharacterOfPosition(literal.getStart(source));
    if (line + 1 !== edge.line) continue;
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause || clause.name) return null;
      const bindings = clause.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) return null;
      return bindings.elements.map((element) => (element.propertyName ?? element.name).text);
    }
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (!clause || !ts.isNamedExports(clause)) return null;
      return clause.elements.map((element) => (element.propertyName ?? element.name).text);
    }
  }
  return null;
};

/** name -> the `src/…` file an index re-exports it from (`export { a } from './x'` lines). */
const indexMapOf = (root, index, edges) => {
  const map = new Map();
  const source = parse(root, index);
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    const clause = statement.exportClause;
    if (!clause || !ts.isNamedExports(clause)) continue;
    const { line } = source.getLineAndCharacterOfPosition(
      statement.moduleSpecifier.getStart(source)
    );
    const target = edges.find((edge) => edge.from === index && edge.line === line + 1)?.to;
    if (!target) continue;
    for (const element of clause.elements) map.set(element.name.text, target);
  }
  return map;
};

const INDEX = /^src\/features\/([^/]+)\/index\.tsx?$/;

/** The names `file` (as it was at `base`) takes from `specifier`; empty if it did not exist. */
const namesTakenAtBase = (root, base, file, specifier) => {
  const names = new Set();
  let text;
  try {
    text = execFileSync('git', ['show', `${base}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return names;
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    const literal = statement.moduleSpecifier;
    if (!literal || !ts.isStringLiteralLike(literal) || literal.text !== specifier) continue;
    const bindings = ts.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : statement.exportClause;
    if (!bindings || !(ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) continue;
    for (const element of bindings.elements) names.add((element.propertyName ?? element.name).text);
  }
  return names;
};

/** `--adopt`: record grown feature → feature pairs whose every edge existed before the move. */
const adopt = ({ root, baselinePath, baseline, measured, edges }) => {
  const at = process.argv.indexOf('--base');
  const base = at > 0 ? process.argv[at + 1] : git(root, 'merge-base', 'HEAD', 'origin/staging');
  const oldOf = renamesSince(root, base);
  const importsBefore = new Map();
  for (const edge of baseGraphOf(root, base)) {
    importsBefore.set(edge.from, (importsBefore.get(edge.from) ?? new Set()).add(edge.to));
  }
  const old = (file) => oldOf.get(file) ?? file;
  const indexMaps = new Map();
  const unproven = [];
  const proven = (edge) => {
    const before = importsBefore.get(old(edge.from)) ?? new Set();
    const feature = INDEX.exec(edge.to)?.[1];
    if (!feature) return before.has(old(edge.to));
    if (!indexMaps.has(edge.to)) indexMaps.set(edge.to, indexMapOf(root, edge.to, edges));
    const movedIn = [...oldOf]
      .filter(([now]) => now.startsWith(`src/features/${feature}/`))
      .map(([, was]) => was);
    const anyMoved = movedIn.some((was) => before.has(was));
    const names = namesTaken(root, edge);
    if (names === null) return anyMoved;
    let takenAtBase = null;
    return names.every((name) => {
      const file = indexMaps.get(edge.to).get(name);
      if (!file) return anyMoved;
      if (before.has(old(file))) return true;
      if (oldOf.has(file)) return false;
      takenAtBase ??= namesTakenAtBase(root, base, old(edge.from), edge.specifier);
      return takenAtBase.has(name);
    });
  };

  const before = baseline.featureToFeature?.pairs ?? {};
  const pairs = { ...before };
  const adopted = [];
  for (const [key, list] of measured.featureToFeature) {
    if (list.length <= (before[key] ?? 0)) continue;
    const failing = list.filter((edge) => !proven(edge));
    if (failing.length > 0) {
      for (const edge of failing)
        unproven.push(`  ${key}: ${edge.from}:${edge.line}  '${edge.specifier}'`);
      continue;
    }
    adopted.push(`  ${key}: ${before[key] ?? 0} → ${list.length}`);
    pairs[key] = list.length;
  }
  const upwardBefore = baseline.upward?.files ?? {};
  const upwardGrew = [...measured.upward].filter(
    ([key, list]) => list.length > (upwardBefore[key] ?? 0)
  );
  console.log(`Base ${base}, ${oldOf.size} renames.`);
  console.log(
    adopted.length > 0 ? 'Adoptable (every edge existed before the move):' : 'Nothing to adopt.'
  );
  for (const line of adopted) console.log(line);
  if (unproven.length > 0 || upwardGrew.length > 0) {
    if (unproven.length > 0) {
      console.error(`✗ ${unproven.length} feature → feature import(s) not in the base tree:`);
      for (const line of unproven) console.error(line);
    }
    for (const [key, list] of upwardGrew) {
      console.error(
        `✗ Upward import grew, never adopted: ${key}: ${upwardBefore[key] ?? 0} → ${list.length}`
      );
    }
    console.error('--adopt wrote nothing.');
    process.exit(1);
  }
  const body = {
    ...baseline,
    featureToFeature: { total: totalOf(pairs), pairs: sortKeys(pairs) },
  };
  writeFileSync(baselinePath, `${JSON.stringify(body, null, 2)}\n`);
  console.log(
    `Baseline feature → feature: ${totalOf(before)} → ${totalOf(pairs)} (+${totalOf(pairs) - totalOf(before)} adopted).`
  );
};

const main = () => {
  const root = process.cwd();
  const update = process.argv.includes('--update');
  if (process.argv.includes('--rekey')) {
    const baselinePath = join(root, BASELINE);
    const baseline = readBaseline(baselinePath);
    if (baseline === null) {
      console.error(`No baseline at ${BASELINE} to re-key.`);
      process.exit(1);
    }
    rekey(baselinePath, baseline);
    return;
  }
  const { edges, unresolved } = buildImportGraph(root);
  exitOnUnresolved(unresolved);

  const measured = measure(edges);
  const current = {
    featureToFeature: countsOf(measured.featureToFeature),
    upward: countsOf(measured.upward),
  };
  const summary =
    `${totalOf(current.featureToFeature)} feature → feature imports in ` +
    `${Object.keys(current.featureToFeature).length} pairs, ` +
    `${totalOf(current.upward)} upward imports in ${Object.keys(current.upward).length} files`;

  const baselinePath = join(root, BASELINE);
  const baseline = readBaseline(baselinePath);
  if (process.argv.includes('--adopt')) {
    if (baseline === null) {
      console.error(`No baseline at ${BASELINE} to adopt into.`);
      process.exit(1);
    }
    adopt({ root, baselinePath, baseline, measured, edges });
    return;
  }
  const writeBaseline = () => {
    mkdirSync(dirname(baselinePath), { recursive: true });
    const body = {
      featureToFeature: {
        total: totalOf(current.featureToFeature),
        pairs: current.featureToFeature,
      },
      upward: { total: totalOf(current.upward), files: current.upward },
    };
    writeFileSync(baselinePath, `${JSON.stringify(body, null, 2)}\n`);
    console.log(`Baseline written: ${summary}.`);
    process.exit(0);
  };
  if (baseline === null) {
    if (!update) {
      console.error(
        `No baseline at ${BASELINE}. Create it with: npm run check:boundaries -- --update`
      );
      process.exit(1);
    }
    // The first baseline records what is there; only a later --update is held to "never grow".
    writeBaseline();
  }

  const measures = [
    {
      name: 'Feature → feature imports',
      now: current.featureToFeature,
      before: baseline.featureToFeature?.pairs ?? {},
      edgesOf: measured.featureToFeature,
      hint:
        'Reach the other feature through a shared piece instead: move the shared type, constant or\n' +
        'helper into lib/ or components/shared/, or pass it in as a prop.',
    },
    {
      name: 'Upward imports',
      now: current.upward,
      before: baseline.upward?.files ?? {},
      edgesOf: measured.upward,
      hint:
        'A lower layer (services, hooks, stores, lib, types, utils, contexts, ui) must not import a\n' +
        'component or page. Move the shared piece down (lib/, the service, a types file) or invert\n' +
        'the dependency (pass a callback or value in).',
    },
  ];

  let failed = false;
  for (const { name, now, before, edgesOf, hint } of measures) {
    const grew = Object.entries(now).filter(([key, count]) => count > (before[key] ?? 0));
    if (grew.length === 0) continue;
    failed = true;
    console.error(`✗ ${name} grew (${totalOf(now)} now, baseline ${totalOf(before)}):`);
    for (const [key, count] of grew) {
      console.error(`  ${key}: ${before[key] ?? 0} → ${count}`);
      for (const edge of edgesOf.get(key)) {
        console.error(`    ${edge.from}:${edge.line}  '${edge.specifier}'`);
      }
    }
    console.error(`\n${hint}\n`);
  }
  if (failed) {
    if (update) console.error('--update refuses to record growth.');
    process.exit(1);
  }

  if (update) writeBaseline();

  const dropped = measures.flatMap(({ now, before }) =>
    Object.entries(before)
      .filter(([key, count]) => (now[key] ?? 0) < count)
      .map(([key, count]) => `  ${key}: ${count} → ${now[key] ?? 0}`)
  );
  if (dropped.length > 0) {
    console.log(`✓ Import boundaries dropped below the baseline (${summary}). Good; lock it in:`);
    for (const line of dropped) console.log(line);
    console.log(`  npm run check:boundaries -- --update   (and commit ${BASELINE})`);
    return;
  }
  console.log(`✓ Import boundaries at the baseline: ${summary}.`);
};

main();
