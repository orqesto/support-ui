import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⛔ Every backend route is mounted under `/api`, and `apiClient`'s baseURL is the bare host.
 * A service path without `/api` therefore never reaches the backend — staging answered 405 for
 * `/custom-apis/lookup` — while a unit test that mocks `apiClient` with the SAME wrong path
 * stays green. Five custom-API calls shipped that way (2026-09-19), and the lookup panel's
 * availability gate "worked" only because its own call failed and it hides on error.
 *
 * So this reads the SOURCE: the first argument of every apiClient call in src/services must
 * start with `/api/`. A mock cannot hide a wrong path from it.
 */
const SERVICES = join(process.cwd(), 'src/services');
const CALL = /apiClient\.(?:get|post|put|patch|delete)(?:<[^>]*>)?\(\s*([`'"])(\/[^`'"]*)\1/g;

const calls = () =>
  readdirSync(SERVICES)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .flatMap((name) =>
      [...readFileSync(join(SERVICES, name), 'utf8').matchAll(CALL)].map((match) => ({
        name,
        path: match[2],
      }))
    );

describe('every service path reaches the backend', () => {
  it('CONTROL: the scan finds the known call sites', () => {
    // Guards the guard: a regex that matched nothing would pass the next test vacuously.
    const found = calls();
    expect(found.length).toBeGreaterThan(20);
    expect(found.some((call) => call.path === '/api/custom-apis/lookup')).toBe(true);
  });

  it('⛔ no apiClient call in src/services omits the /api prefix', () => {
    expect(calls().filter((call) => !call.path.startsWith('/api/'))).toEqual([]);
  });
});
