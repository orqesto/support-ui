// @vitest-environment node
/**
 * scripts/ci/select-tests.mjs on an invented file tree: which PRs narrow the vitest run and which
 * run everything. The graph, the diff and the file list are injected, so no git repo is needed.
 */
import { describe, expect, it } from 'vitest';
import { globToRegExp, parseNameStatus, selectTests } from '../select-tests.mjs';

const ALL_TESTS = [
  'scripts/ci/__tests__/ratchet.test.mjs',
  'src/components/billing/__tests__/Invoice.test.tsx',
  'src/components/statistics/__tests__/AgentChart.test.tsx',
  'src/components/statistics/__tests__/ChartLegend.test.tsx',
  'src/lib/__tests__/format.test.ts',
  'src/test/fixturesUseInventedAddresses.test.ts',
  'src/test/scansEveryFile.test.ts',
];
const EDGES = [
  // statistics: chart → legend → shared helper; billing is unrelated.
  {
    from: 'src/components/statistics/AgentChart.tsx',
    to: 'src/components/statistics/ChartLegend.tsx',
  },
  {
    from: 'src/components/statistics/__tests__/AgentChart.test.tsx',
    to: 'src/components/statistics/AgentChart.tsx',
  },
  {
    from: 'src/components/statistics/__tests__/ChartLegend.test.tsx',
    to: 'src/components/statistics/ChartLegend.tsx',
  },
  { from: 'src/components/billing/Invoice.tsx', to: 'src/lib/format.ts' },
  {
    from: 'src/components/billing/__tests__/Invoice.test.tsx',
    to: 'src/components/billing/Invoice.tsx',
  },
  { from: 'src/lib/__tests__/format.test.ts', to: 'src/lib/format.ts' },
  { from: 'src/test/setup.ts', to: 'src/test/apiTransport.ts' },
];
const TEXT = {
  'src/test/scansEveryFile.test.ts': "import { readdirSync } from 'node:fs';",
};

const run = (diff, overrides = {}) =>
  selectTests({
    root: '/invented',
    deps: {
      listTests: () => ALL_TESTS,
      diff: () => diff,
      triggers: [
        'package.json',
        'package-lock.json',
        'src/lib/**',
        'src/test/**',
        'src/components/ui/**',
      ],
      smoke: ['src/test/fixturesUseInventedAddresses.test.ts'],
      exists: () => true,
      graph: () => ({ edges: EDGES, unresolved: [] }),
      readText: (file) => TEXT[file] ?? "import { it } from 'vitest';",
      ...overrides,
    },
  });

describe('select-tests', () => {
  it('runs everything when a file under src/lib changes', () => {
    const result = run('M\tsrc/lib/format.ts\n');
    expect(result.mode).toBe('full');
    expect(result.reason).toContain('src/lib/**');
    expect(result.selected).toEqual(ALL_TESTS);
  });

  it('runs a component’s tests, its importers’ tests and the smoke set — not an unrelated feature', () => {
    const result = run('M\tsrc/components/statistics/ChartLegend.tsx\n');
    expect(result.mode).toBe('affected');
    expect(result.selected).toEqual([
      'src/components/statistics/__tests__/AgentChart.test.tsx',
      'src/components/statistics/__tests__/ChartLegend.test.tsx',
      'src/test/fixturesUseInventedAddresses.test.ts',
      'src/test/scansEveryFile.test.ts',
    ]);
    expect(result.selected).not.toContain('src/components/billing/__tests__/Invoice.test.tsx');
  });

  it('runs a changed test file itself', () => {
    const result = run('M\tsrc/components/billing/__tests__/Invoice.test.tsx\n');
    expect(result.mode).toBe('affected');
    expect(result.selected).toContain('src/components/billing/__tests__/Invoice.test.tsx');
    expect(result.selected).not.toContain(
      'src/components/statistics/__tests__/AgentChart.test.tsx'
    );
  });

  it('runs everything when the lockfile changes', () => {
    expect(run('M\tpackage-lock.json\n').mode).toBe('full');
  });

  it('runs everything when a file is deleted or renamed', () => {
    expect(run('D\tsrc/components/billing/Invoice.tsx\n').mode).toBe('full');
    const renamed = run(
      'R100\tsrc/components/billing/Invoice.tsx\tsrc/features/billing/Invoice.tsx\n'
    );
    expect(renamed.mode).toBe('full');
    expect(renamed.reason).toContain('deleted or renamed');
  });

  it('runs everything when the selection itself fails', () => {
    const result = run('', {
      diff: () => {
        throw new Error('fatal: bad revision origin/staging...HEAD');
      },
    });
    expect(result.mode).toBe('full');
    expect(result.error).toBe(true);
    expect(result.selected).toEqual(ALL_TESTS);
  });

  it('runs everything for a stylesheet, an unknown root file, a setup import or a broken graph', () => {
    expect(run('M\tsrc/index.css\n').mode).toBe('full');
    expect(run('M\tsomething.config.js\n').mode).toBe('full');
    expect(run('M\tsrc/test/apiTransport.ts\n').mode).toBe('full');
    const broken = run('M\tsrc/components/statistics/ChartLegend.tsx\n', {
      graph: () => ({ edges: EDGES, unresolved: ["src/a.ts:1  '@/gone'"] }),
    });
    expect(broken.mode).toBe('full');
  });

  it('ignores docs next to a source change', () => {
    const result = run('M\tdocs/notes.md\nM\tsrc/components/billing/Invoice.tsx\n');
    expect(result.mode).toBe('affected');
    expect(result.selected).toContain('src/components/billing/__tests__/Invoice.test.tsx');
  });

  it('runs everything when --full is asked for', () => {
    expect(selectTests({ full: true, deps: { listTests: () => ALL_TESTS } }).mode).toBe('full');
  });

  it('parses renames and matches globs', () => {
    expect(parseNameStatus('R087\told.ts\tnew.ts\nA\tx.ts\n')).toEqual([
      { status: 'R', from: 'old.ts', path: 'new.ts' },
      { status: 'A', path: 'x.ts' },
    ]);
    expect(globToRegExp('**/*.md').test('README.md')).toBe(true);
    expect(globToRegExp('**/*.md').test('docs/a/b.md')).toBe(true);
    expect(globToRegExp('tsconfig*').test('tsconfig.app.json')).toBe(true);
    expect(globToRegExp('scripts/*.sh').test('scripts/ci/x.sh')).toBe(false);
  });
});
