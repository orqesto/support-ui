#!/usr/bin/env node
/**
 * Import-boundary ratchet (modularity task F1): the coupling between areas of `src/` may shrink,
 * never grow. Ported from the backend's check-boundaries.mjs, but it walks the imports itself
 * (scripts/ci/import-graph.mjs) instead of reading ESLint warnings, because the frontend has no
 * boundary lint rule to count.
 *
 * Two measures, compared with `.ci/baselines/boundaries.json`:
 *
 * 1. featureToFeature — imports from one `components/<a>` folder into another `components/<b>`,
 *    counted per pair (`components/a -> components/b`). Shared folders are not features, so
 *    importing FROM them is fine: `ui`, `shared`, `common`, `layout` are never a target. They are
 *    still counted as importers (a layout reaching into a feature is coupling too), except `ui`,
 *    which the second measure covers. `features/<x>` folders count the same way once they exist.
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
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { areaOf, buildImportGraph, exitOnUnresolved, readBaseline } from './import-graph.mjs';

const BASELINE = '.ci/baselines/boundaries.json';
const SHARED = new Set([
  'components/ui',
  'components/shared',
  'components/common',
  'components/layout',
]);
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

const isFeature = (area) => area.startsWith('components/') || area.startsWith('features/');
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
    if (isFeature(from) && isFeature(to) && !SHARED.has(to)) {
      push(featureToFeature, `${from} -> ${to}`, edge);
    }
  }
  return { featureToFeature, upward };
};

const countsOf = (map) =>
  sortKeys(Object.fromEntries([...map].map(([key, list]) => [key, list.length])));

const main = () => {
  const root = process.cwd();
  const update = process.argv.includes('--update');
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
