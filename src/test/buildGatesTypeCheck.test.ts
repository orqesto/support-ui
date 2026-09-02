import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `npm run build` used to be `tsc && vite build`, which type-checked **nothing**.
 * The root `tsconfig.json` is a solution file — `files: []` plus `references` — so a
 * bare `tsc` has no files to compile and exits 0 on a tree full of type errors.
 * Measured at the time of the fix: bare `tsc` visited 0 project files,
 * `tsc -p tsconfig.app.json` visited 748.
 *
 * That mattered because the deploy workflow runs `npm run build` and nothing else,
 * and this app ships from `main` on push. The `.husky/pre-commit` hook had the same
 * bug, so neither the local gate nor the deploy gate could fail on a type error.
 *
 * These assertions are structural on purpose: they check that the gates still point
 * at a real project, which is the property that was lost. A future author who
 * "simplifies" either one back to a bare `tsc` has to break a test to do it.
 */

// vitest runs from the repository root, the same assumption the sibling
// source-scanning tripwire in this directory makes.
const repoRoot = process.cwd();
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** A `tsc` invocation that names no project — the shape that checks nothing here. */
const isBareTsc = (command: string): boolean =>
  /(^|&&|\|\||;|\s)(npx\s+)?tsc(\s+--[\w-]+)*\s*($|&&|\|\||;)/.test(command);

describe('the type-check gate actually checks the app', () => {
  it('type-check names a project rather than relying on the solution file', () => {
    expect(pkg.scripts['type-check']).toContain('-p tsconfig.app.json');
  });

  it('build runs the type-check before bundling', () => {
    const build = pkg.scripts.build;
    // Either delegate to the type-check script or name the project directly;
    // what it may not do is invoke a bare `tsc`, which compiles zero files.
    const gated =
      build.includes('npm run type-check') || build.includes('-p tsconfig.app.json');
    expect(gated).toBe(true);
    expect(isBareTsc(build)).toBe(false);
  });

  it('the pre-commit hook runs the same gate the deploy does', () => {
    const hook = readFileSync(join(repoRoot, '.husky', 'pre-commit'), 'utf8');
    expect(isBareTsc(hook)).toBe(false);
    expect(
      hook.includes('npm run type-check') || hook.includes('-p tsconfig.app.json')
    ).toBe(true);
  });

  it('documents why a bare tsc is a no-op here', () => {
    const root = JSON.parse(readFileSync(join(repoRoot, 'tsconfig.json'), 'utf8')) as {
      files?: unknown[];
    };
    // If this ever stops being an empty solution file, a bare `tsc` would start
    // meaning something again and the rule above could be relaxed deliberately.
    expect(root.files).toEqual([]);
  });
});
