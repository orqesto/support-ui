#!/usr/bin/env node
/**
 * Which vitest files a PR runs (F6, owner decision 2026-11-06). Port of the backend's
 * scripts/ci/select-tests.mjs.
 *
 *   node scripts/ci/select-tests.mjs --base origin/staging --out selected.txt
 *   node scripts/ci/select-tests.mjs --full --out selected.txt
 *
 * A PR runs the test files its change can reach, plus the changed test files, the smoke set
 * (.ci/smoke-tests.txt) and every test that reads files from disk (repo-wide guards: no import edge
 * names the file they scan). "Can reach" = the test's import graph (scripts/ci/import-graph.mjs with
 * tests included, `vi.mock` targets counted as edges) reaches a changed file.
 *
 * Everything runs instead (mode `full`) when:
 * - a file matching .ci/full-run-triggers.txt changed (config, dependencies, test harness,
 *   src/lib, the design system, workflows, this script);
 * - a file was deleted or renamed;
 * - a file under src/ that is not .ts/.tsx changed (css, svg, json: read by tests the graph cannot see);
 * - a file outside src/ changed that is neither a trigger nor on the IGNORED list below;
 * - a changed file is loaded by the test setup (src/test/setup.ts and what it imports);
 * - a real (non-mock) import in src/ does not resolve, so the graph may be missing edges;
 * - a smoke entry does not exist, git fails, or anything else throws (fail safe).
 *
 * The full suite still runs on every push to `staging`, on a PR into `main`, and before
 * every production deploy (deploy-production.yml): the graph follows imports only.
 *
 * Writes the selected files, one per line, to --out (all test files in full mode). Prints the reason
 * and counts, appends them and the list to $GITHUB_STEP_SUMMARY, and `mode` + `count` to
 * $GITHUB_OUTPUT.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImportGraph } from './import-graph.mjs';

/** vitest's default `include`: `**\/*.{test,spec}.?(c|m)[jt]s?(x)`. */
export const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
/** Files outside src/ that no test reads: changing them alone never selects anything. */
export const IGNORED = [
  '**/*.md',
  'docs/**',
  'scripts/*.sh',
  '.ci/baselines/**',
  '.gitignore',
  '.prettierignore',
  '.prettierrc.json',
  '.husky/**',
  'nginx*.conf',
  'Dockerfile*',
  'LICENSE',
];
/** A test that reads the disk depends on files no import names, so it always runs. */
const READS_FILES =
  /\b(readFileSync|readdirSync|readFile|readdir|statSync|existsSync|globSync|import\.meta\.glob)\b|\?raw['"]/;
const SETUP_FILE = 'src/test/setup.ts';

/** Glob → RegExp: `**` any depth, `*` within one segment. */
export const globToRegExp = (glob) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\u0001')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0001/g, '(?:.*/)?')
      .replace(/\u0000/g, '.*')}$`
  );
const matcher = (globs) => {
  const compiled = globs.map((glob) => [glob, globToRegExp(glob)]);
  return (file) => compiled.find(([, re]) => re.test(file))?.[0];
};

export const readList = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

/** `git diff --name-status -M` lines → [{ status: 'M'|'A'|'D'|'R'|…, path, from? }]. */
export const parseNameStatus = (text) =>
  text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, first, second] = line.split('\t');
      const letter = status[0];
      return letter === 'R' || letter === 'C'
        ? { status: letter, from: first, path: second }
        : { status: letter, path: first };
    });

const list = (files, max = 5) =>
  `${files.slice(0, max).join(', ')}${files.length > max ? ', …' : ''}`;

/** Every file that reaches `targets` through the graph (importers, transitively), targets included. */
const importersClosure = (edges, targets) => {
  const importers = new Map();
  for (const { from, to } of edges) {
    if (!importers.has(to)) importers.set(to, []);
    importers.get(to).push(from);
  }
  const seen = new Set(targets);
  const queue = [...targets];
  while (queue.length > 0) {
    for (const from of importers.get(queue.pop()) ?? []) {
      if (!seen.has(from)) {
        seen.add(from);
        queue.push(from);
      }
    }
  }
  return seen;
};

/** What `start` imports, transitively, `start` included. */
const importsClosure = (edges, start) => {
  const imports = new Map();
  for (const { from, to } of edges) {
    if (!imports.has(from)) imports.set(from, []);
    imports.get(from).push(to);
  }
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    for (const to of imports.get(queue.pop()) ?? []) {
      if (!seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return seen;
};

/**
 * The decision, with every input passed in (so it is testable without git).
 * @param {object} input
 * @param {Array<{status: string, path: string, from?: string}>} input.changes
 * @param {string[]} input.allTests     every vitest file, repo-relative
 * @param {string[]} input.triggers     full-run globs
 * @param {string[]} input.smoke        smoke test files
 * @param {(file: string) => boolean} input.exists
 * @param {() => {edges: Array<{from: string, to: string}>, unresolved: string[]}} input.graph
 * @param {(file: string) => string} input.readText
 * @returns {{ mode: 'full'|'affected', reason: string, selected: string[], detail?: object }}
 */
export const decide = ({ changes, allTests, triggers, smoke, exists, graph, readText }) => {
  const full = (reason) => ({ mode: 'full', reason, selected: [...allTests] });
  if (changes.length === 0)
    return full('no changed files found against the base (nothing to narrow by)');

  const moved = changes.filter((change) => change.status === 'D' || change.status === 'R');
  if (moved.length > 0) {
    const names = moved.map((change) =>
      change.status === 'R' ? `${change.from} → ${change.path}` : change.path
    );
    return full(`a file was deleted or renamed: ${list(names)}`);
  }

  const paths = changes.map((change) => change.path);
  const isTrigger = matcher(triggers);
  const hit = paths.filter((file) => isTrigger(file)).map((file) => `${file} (${isTrigger(file)})`);
  if (hit.length > 0) return full(`a core file changed: ${list(hit)}`);

  const isIgnored = matcher(IGNORED);
  const outside = paths.filter((file) => !file.startsWith('src/'));
  const unclassified = outside.filter((file) => !isIgnored(file) && !TEST_FILE.test(file));
  if (unclassified.length > 0) {
    return full(
      `a file outside src/ that is not on the ignore list changed: ${list(unclassified)}`
    );
  }
  const nonSource = paths.filter((file) => file.startsWith('src/') && !/\.(ts|tsx)$/.test(file));
  if (nonSource.length > 0)
    return full(`a non-TypeScript file under src/ changed: ${list(nonSource)}`);

  const missingSmoke = smoke.filter((file) => !exists(file));
  if (missingSmoke.length > 0)
    return full(`.ci/smoke-tests.txt names missing files: ${list(missingSmoke)}`);

  const { edges, unresolved } = graph();
  if (unresolved.length > 0) {
    return full(
      `${unresolved.length} import(s) in src/ did not resolve, so the graph may miss edges: ${list(unresolved, 3)}`
    );
  }
  const sources = paths.filter((file) => file.startsWith('src/'));
  const setupLoaded = [...importsClosure(edges, SETUP_FILE)].filter((file) =>
    sources.includes(file)
  );
  if (setupLoaded.length > 0)
    return full(`a file the test setup loads changed: ${list(setupLoaded)}`);

  const testSet = new Set(allTests);
  const reached = importersClosure(edges, sources);
  const related = allTests.filter((file) => reached.has(file) && !sources.includes(file));
  const changedTests = paths.filter((file) => testSet.has(file));
  const readers = allTests.filter((file) => READS_FILES.test(readText(file)));
  const selected = [...new Set([...related, ...changedTests, ...smoke, ...readers])].sort();
  const sourceCount = sources.filter((file) => !testSet.has(file)).length;
  return {
    mode: 'affected',
    reason:
      `${changes.length} changed file(s): ${sourceCount} source, ${changedTests.length} test → ` +
      `${related.length} related test file(s) + ${smoke.length} smoke + ${readers.length} that read files from disk`,
    selected,
    detail: {
      related: related.length,
      changedTests: changedTests.length,
      smoke: smoke.length,
      readers: readers.length,
    },
  };
};

/** Every vitest file in the repo (tracked + untracked, minus ignored), repo-relative. */
const listTests = (root) =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(
      (file) =>
        TEST_FILE.test(file) && !file.startsWith('node_modules/') && existsSync(join(root, file))
    )
    .sort();

/**
 * Run the selection for a checkout. Never throws: any error means a full run (fail safe).
 * `deps` replaces the parts that touch git or the disk (tests).
 */
export const selectTests = ({
  root = process.cwd(),
  base = 'origin/staging',
  head = 'HEAD',
  full = false,
  deps = {},
} = {}) => {
  let allTests = [];
  try {
    allTests = (deps.listTests ?? listTests)(root);
    if (full)
      return {
        mode: 'full',
        reason: 'full run requested (push to staging / release / manual)',
        selected: allTests,
        allTests,
      };
    const diff =
      deps.diff ??
      (() =>
        // Three-dot: what this branch changed since it left `base`, not what `base` gained meanwhile.
        execFileSync('git', ['diff', '--name-status', '-M', `${base}...${head}`], {
          cwd: root,
          encoding: 'utf8',
        }));
    const result = decide({
      changes: parseNameStatus(diff()),
      allTests,
      triggers: deps.triggers ?? readList(join(root, '.ci/full-run-triggers.txt')),
      smoke: deps.smoke ?? readList(join(root, '.ci/smoke-tests.txt')),
      exists: deps.exists ?? ((file) => existsSync(join(root, file))),
      graph: deps.graph ?? (() => buildImportGraph(root, { includeTests: true })),
      readText: deps.readText ?? ((file) => readFileSync(join(root, file), 'utf8')),
    });
    return { ...result, allTests };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      mode: 'full',
      reason: `the selection failed (${message.split('\n')[0].slice(0, 200)}), so everything runs`,
      selected: allTests,
      allTests,
      error: true,
    };
  }
};

const summaryOf = ({ mode, reason, selected, allTests }) => {
  const head = `### Test selection: **${mode}**\n\n${reason}\n\n${selected.length} of ${allTests.length} test files selected.\n`;
  if (mode === 'full') return head;
  return `${head}\n<details><summary>Selected files</summary>\n\n${selected.map((file) => `- \`${file}\``).join('\n')}\n\n</details>\n`;
};

const main = () => {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const result = selectTests({
    root: resolve(arg('root') ?? process.cwd()),
    base: arg('base') ?? 'origin/staging',
    head: arg('head') ?? 'HEAD',
    full: args.includes('--full'),
  });
  const out = arg('out');
  if (out) writeFileSync(out, result.selected.length > 0 ? `${result.selected.join('\n')}\n` : '');
  console.log(`Test selection: ${result.mode} — ${result.reason}`);
  console.log(`${result.selected.length} of ${result.allTests.length} test files selected.`);
  if (args.includes('--list') && result.mode === 'affected')
    console.log(result.selected.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryOf(result));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `mode=${result.mode}\ncount=${result.selected.length}\n`
    );
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
