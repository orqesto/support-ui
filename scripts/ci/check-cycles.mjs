#!/usr/bin/env node
/**
 * Import-cycle ratchet (modularity task F1): the cycles in `src/` may shrink, never grow. Ported
 * from the backend's check-cycles.mjs; the graph comes from scripts/ci/import-graph.mjs instead of
 * madge, so it resolves the `@/` alias, .ts/.tsx and index files the same way as check-boundaries.
 *
 * - The unit is a strongly connected group of files (every file reaches every other one through
 *   imports), recorded by its member files in `.ci/baselines/cycles.json`. A list of individual
 *   cycles reshuffles whenever an unrelated import changes the walk; the groups only change when
 *   the cycles do.
 * - Type-only imports count. They vanish at runtime, but they still tie the files together for the
 *   type checker, and a feature folder meant to stand alone cannot have them either.
 * - Lazy `import()` counts too: the files still depend on each other.
 * - Tests are left out: a suite is never imported back, so it cannot close a cycle.
 *
 * FAILS when a group appears or gains a file, and prints the file and line of each import that
 * ties the new files in. A group that shrank, split or disappeared passes, with a reminder to lock
 * it in: `npm run check:cycles -- --update` and commit the baseline. `--update` refuses to record
 * growth: a new cycle is broken (extract the shared types or helpers into a leaf file), not written
 * down.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildImportGraph, exitOnUnresolved, readBaseline } from './import-graph.mjs';

const BASELINE = '.ci/baselines/cycles.json';

/** Tarjan's strongly connected components, iterative (the graph is deep enough for recursion to hurt). */
const stronglyConnected = (adjacency) => {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const groups = [];
  let next = 0;
  const enter = (node) => {
    index.set(node, next);
    low.set(node, next);
    next += 1;
    stack.push(node);
    onStack.add(node);
  };
  for (const root of adjacency.keys()) {
    if (index.has(root)) continue;
    enter(root);
    const work = [[root, 0]];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const [node, at] = frame;
      const targets = adjacency.get(node) ?? [];
      if (at < targets.length) {
        frame[1] += 1;
        const target = targets[at];
        if (!index.has(target)) {
          enter(target);
          work.push([target, 0]);
        } else if (onStack.has(target)) {
          low.set(node, Math.min(low.get(node), index.get(target)));
        }
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        const group = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          group.push(member);
        } while (member !== node);
        const selfLoop = group.length === 1 && targets.includes(node);
        if (group.length > 1 || selfLoop) groups.push(group.sort());
      }
    }
  }
  return groups.sort((left, right) => left[0].localeCompare(right[0]));
};

const main = () => {
  const root = process.cwd();
  const update = process.argv.includes('--update');
  const { files, edges, unresolved } = buildImportGraph(root);
  exitOnUnresolved(unresolved);

  const adjacency = new Map(files.map((file) => [file, []]));
  for (const edge of edges) {
    const targets = adjacency.get(edge.from);
    if (!targets.includes(edge.to)) targets.push(edge.to);
  }
  const current = stronglyConnected(adjacency);
  const fileCount = (groups) => groups.reduce((sum, group) => sum + group.length, 0);
  const summary = `${current.length} groups, ${fileCount(current)} files`;

  const baselinePath = join(root, BASELINE);
  const baseline = readBaseline(baselinePath)?.groups ?? null;
  const writeBaseline = () => {
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify({ groups: current }, null, 2)}\n`);
    console.log(`Baseline written: ${summary}.`);
    process.exit(0);
  };
  if (baseline === null) {
    if (!update) {
      console.error(`No baseline at ${BASELINE}. Create it with: npm run check:cycles -- --update`);
      process.exit(1);
    }
    // The first baseline records what is there; only a later --update is held to "never grow".
    writeBaseline();
  }

  const grew = [];
  for (const group of current) {
    if (baseline.some((old) => group.every((file) => old.includes(file)))) continue;
    const near = baseline.find((old) => group.some((file) => old.includes(file)));
    const added = near ? group.filter((file) => !near.includes(file)) : group;
    grew.push({ group, added, isNew: !near });
  }

  if (grew.length > 0) {
    console.error(
      `✗ Import cycles grew — ${summary} (baseline ${baseline.length} groups, ${fileCount(baseline)} files).\n`
    );
    for (const { group, added, isNew } of grew) {
      console.error(
        isNew
          ? `  New cycle group of ${group.length} files:`
          : `  These files joined a cycle group (now ${group.length} files, e.g. ${group[0]}):`
      );
      for (const file of added) console.error(`    + ${file}`);
      // The imports inside the group that touch a new member: one of them closes the cycle.
      const members = new Set(group);
      const fresh = new Set(added);
      console.error('    imports that tie them in:');
      for (const edge of edges) {
        if (!members.has(edge.from) || !members.has(edge.to)) continue;
        if (!fresh.has(edge.from) && !fresh.has(edge.to)) continue;
        console.error(`      ${edge.from}:${edge.line}  '${edge.specifier}'  → ${edge.to}`);
      }
    }
    console.error(
      '\nBreak the cycle: move the shared types, constants or pure helpers into a leaf file that\n' +
        'imports nothing from the group, or pass the value in instead of importing it.'
    );
    if (update) console.error('--update refuses to record growth.');
    process.exit(1);
  }

  if (update) writeBaseline();

  const same = (left, right) =>
    left.length === right.length && left.every((file, at) => file === right[at]);
  const shrank = baseline.filter((old) => !current.some((group) => same(group, old)));
  if (shrank.length > 0) {
    console.log(
      `✓ Import cycles shrank — ${summary} (baseline ${baseline.length} groups, ${fileCount(baseline)} files). Good; lock it in:`
    );
    console.log(`  npm run check:cycles -- --update   (and commit ${BASELINE})`);
    return;
  }
  console.log(`✓ Import cycles at the baseline: ${summary}.`);
};

main();
