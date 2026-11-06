// @vitest-environment node
/**
 * The boundary and cycle ratchets (scripts/ci/check-*.mjs) and the ESLint rule
 * (scripts/eslint/no-upward-imports.js), run against a small invented src/ tree in a temp folder.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import noUpwardImports from '../../eslint/no-upward-imports.js';

const here = dirname(fileURLToPath(import.meta.url));
const BOUNDARIES = resolve(here, '../check-boundaries.mjs');
const CYCLES = resolve(here, '../check-cycles.mjs');

let root;
const write = (path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
const remove = (path) => rmSync(join(root, path));
const run = (script, ...args) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};
const baseline = (name) => JSON.parse(readFileSync(join(root, '.ci/baselines', name), 'utf8'));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ratchet-'));
  // A lib helper, a ui component, two features that know each other once, and a page.
  write('src/lib/format.ts', 'export const format = (value: string) => value.trim();\n');
  write('src/components/ui/Button/index.ts', "export { Button } from './Button';\n");
  write(
    'src/components/ui/Button/Button.tsx',
    "import { format } from '@/lib/format';\nexport const Button = () => format(' ok ');\n"
  );
  write(
    'src/components/alpha/AlphaCard.tsx',
    "import { Button } from '@/components/ui/Button';\nimport { BetaBadge } from '../beta/BetaBadge';\n" +
      'export const AlphaCard = () => [Button(), BetaBadge()];\n'
  );
  write('src/components/beta/BetaBadge.tsx', 'export const BetaBadge = () => null;\n');
  write(
    'src/pages/AlphaPage.tsx',
    "import { AlphaCard } from '@/components/alpha/AlphaCard';\nexport default AlphaCard;\n"
  );
  write(
    'src/App.tsx',
    "import { lazy } from 'react';\nexport const Page = lazy(() => import('./pages/AlphaPage'));\nimport './App.css';\n"
  );
  write('src/App.css', 'body {}\n');
  write('src/types/index.ts', 'export type Shape = { name: string };\n');
  // Tests may import anything; they are not part of the graph.
  write(
    'src/lib/format.test.ts',
    "import { AlphaCard } from '@/components/alpha/AlphaCard';\nAlphaCard();\n"
  );
  expect(run(BOUNDARIES, '--update').status).toBe(0);
  expect(run(CYCLES, '--update').status).toBe(0);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('check-boundaries', () => {
  it('records the starting point and passes on it', () => {
    expect(baseline('boundaries.json')).toEqual({
      featureToFeature: { total: 1, pairs: { 'components/alpha -> components/beta': 1 } },
      upward: { total: 0, files: {} },
    });
    const { status, output } = run(BOUNDARIES);
    expect(status).toBe(0);
    expect(output).toContain('at the baseline');
  });

  it('fails on a new upward import and prints its file and line', () => {
    write(
      'src/lib/format.ts',
      "export const format = (value: string) => value.trim();\nexport type { AlphaCard } from '@/components/alpha/AlphaCard';\n"
    );
    const { status, output } = run(BOUNDARIES);
    expect(status).toBe(1);
    expect(output).toContain('Upward imports grew');
    expect(output).toContain("src/lib/format.ts:2  '@/components/alpha/AlphaCard'");
  });

  it('fails on a new feature → feature pair and prints its file and line', () => {
    write(
      'src/components/beta/BetaBadge.tsx',
      "import type { AlphaCard } from '../alpha/AlphaCard';\nexport const BetaBadge = (): typeof AlphaCard | null => null;\n"
    );
    const { status, output } = run(BOUNDARIES);
    expect(status).toBe(1);
    expect(output).toContain('components/beta -> components/alpha: 0 → 1');
    expect(output).toContain("src/components/beta/BetaBadge.tsx:1  '../alpha/AlphaCard'");
  });

  it('passes a drop, and --update lowers the baseline', () => {
    write('src/components/alpha/AlphaCard.tsx', 'export const AlphaCard = () => null;\n');
    const dropped = run(BOUNDARIES);
    expect(dropped.status).toBe(0);
    expect(dropped.output).toContain('lock it in');
    expect(run(BOUNDARIES, '--update').status).toBe(0);
    expect(baseline('boundaries.json').featureToFeature).toEqual({ total: 0, pairs: {} });
  });

  it('refuses to record growth with --update', () => {
    write('src/lib/extra.ts', "import '@/components/ui/Button';\n");
    const before = readFileSync(join(root, '.ci/baselines/boundaries.json'), 'utf8');
    const { status, output } = run(BOUNDARIES, '--update');
    expect(status).toBe(1);
    expect(output).toContain('--update refuses to record growth');
    expect(output).toContain("src/lib/extra.ts:1  '@/components/ui/Button'");
    expect(readFileSync(join(root, '.ci/baselines/boundaries.json'), 'utf8')).toBe(before);
  });

  it('fails on a local import that does not resolve, instead of dropping the edge', () => {
    write('src/lib/broken.ts', "export * from './nowhere';\n");
    const { status, output } = run(BOUNDARIES);
    expect(status).toBe(1);
    expect(output).toContain("src/lib/broken.ts:1  './nowhere'");
  });

  it('fails without a baseline', () => {
    remove('.ci/baselines/boundaries.json');
    expect(run(BOUNDARIES).status).toBe(1);
  });
});

describe('check-cycles', () => {
  const addCycle = () => {
    write(
      'src/services/left.ts',
      "import type { Right } from './right';\nexport type Left = { right?: Right };\n"
    );
    write(
      'src/services/right.ts',
      "import type { Left } from '@/services/left';\nexport type Right = { left?: Left };\n"
    );
  };

  it('starts with no cycles', () => {
    expect(baseline('cycles.json')).toEqual({ groups: [] });
    expect(run(CYCLES).status).toBe(0);
  });

  it('fails on a new cycle (type-only imports count) and prints the imports with lines', () => {
    addCycle();
    const { status, output } = run(CYCLES);
    expect(status).toBe(1);
    expect(output).toContain('New cycle group of 2 files');
    expect(output).toContain("src/services/left.ts:1  './right'  → src/services/right.ts");
    expect(output).toContain("src/services/right.ts:1  '@/services/left'  → src/services/left.ts");
  });

  it('fails when a file joins an existing group', () => {
    addCycle();
    expect(run(CYCLES, '--update').status).toBe(1);
    // A cycle can only be recorded as the first baseline.
    remove('.ci/baselines/cycles.json');
    expect(run(CYCLES, '--update').status).toBe(0);
    write(
      'src/services/middle.ts',
      "import type { Left } from './left';\nexport type Middle = Left;\n"
    );
    write(
      'src/services/right.ts',
      "import type { Middle } from './middle';\nimport type { Left } from './left';\nexport type Right = { left?: Left; middle?: Middle };\n"
    );
    const { status, output } = run(CYCLES);
    expect(status).toBe(1);
    expect(output).toContain('+ src/services/middle.ts');
    expect(output).toContain("src/services/right.ts:1  './middle'  → src/services/middle.ts");
  });

  it('passes a drop, and --update lowers the baseline', () => {
    addCycle();
    remove('.ci/baselines/cycles.json');
    run(CYCLES, '--update');
    expect(baseline('cycles.json').groups).toHaveLength(1);
    write('src/services/right.ts', 'export type Right = { name: string };\n');
    const dropped = run(CYCLES);
    expect(dropped.status).toBe(0);
    expect(dropped.output).toContain('lock it in');
    expect(run(CYCLES, '--update').status).toBe(0);
    expect(baseline('cycles.json')).toEqual({ groups: [] });
  });

  it('refuses to record growth with --update', () => {
    addCycle();
    const { status, output } = run(CYCLES, '--update');
    expect(status).toBe(1);
    expect(output).toContain('--update refuses to record growth');
    expect(baseline('cycles.json')).toEqual({ groups: [] });
  });
});

describe('boundaries/no-upward-imports', () => {
  const lint = (file, code) => {
    const linter = new Linter({ configType: 'flat', cwd: root });
    return linter
      .verify(
        code,
        [
          {
            files: ['**/*.{ts,tsx}'],
            languageOptions: { parser: tseslint.parser },
            plugins: { boundaries: { rules: { 'no-upward-imports': noUpwardImports } } },
            rules: { 'boundaries/no-upward-imports': 'error' },
          },
        ],
        { filename: join(root, file) }
      )
      .map((message) => `${message.line}: ${message.message}`);
  };

  it('flags lib and ui importing a feature, page, ui (from lib) or the app root', () => {
    const messages = lint(
      'src/lib/format.ts',
      [
        "import type { AlphaCard } from '@/components/alpha/AlphaCard';",
        "import { Button } from '../components/ui/Button';",
        "export * from '@/pages/AlphaPage';",
        "const page = () => import('@/App');",
      ].join('\n')
    );
    expect(messages).toHaveLength(4);
    expect(messages[0]).toMatch(/^1: '@\/components\/alpha\/AlphaCard' is components\/alpha/);
    expect(messages[1]).toMatch(/^2: .* is components\/ui/);
    expect(
      lint(
        'src/components/ui/Button/Button.tsx',
        "import { BetaBadge } from '../../beta/BetaBadge';"
      )
    ).toHaveLength(1);
  });

  it('allows the same layer, lower layers and packages', () => {
    expect(
      lint(
        'src/components/ui/Button/Button.tsx',
        "import { format } from '@/lib/format';\nimport { Other } from '../Other';\nimport { useState } from 'react';\nimport type { Shape } from '@/types';"
      )
    ).toEqual([]);
    expect(
      lint(
        'src/lib/format.ts',
        "import { other } from './other';\nimport type { Shape } from '@/types';"
      )
    ).toEqual([]);
  });
});
