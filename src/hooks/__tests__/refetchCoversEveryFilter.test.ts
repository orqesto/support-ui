/**
 * Every filter the request is built from must also be a reason to re-issue the request.
 *
 * `useMessagesData` deliberately reads filters out of the store inside `fetchMessages`
 * (`useMessagesStore.getState()`) rather than closing over them, to avoid a stale closure. That
 * works, but it severs the link React normally maintains for you: the builder can start reading a
 * new field and the effect that decides *when to fetch* has no idea. Nothing breaks loudly. The
 * control moves, the store updates, the chip lights up — and the list keeps showing the previous
 * rows, because no request was ever sent.
 *
 * `columnId` reached production this way twice. Once by being absent from the URL sync, which the
 * sibling `quickFilterUrlSync` test now guards, and once — separately, and by the same mechanism —
 * by being absent here, which made every quick-filter chip inert unless the click happened to
 * change some *other* filter at the same time. That intermittency is what made it read as
 * "strange things happening" rather than as a plain bug.
 *
 * So this asserts the invariant structurally instead of case by case. A test per filter would only
 * ever cover the filters someone remembered to write a test for, which is exactly the set that
 * does not contain the next one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../useMessagesData.ts'),
  'utf8'
);

/** Filter fields the request builder reads out of the store. */
const fieldsTheRequestDependsOn = (): Set<string> =>
  new Set([...source.matchAll(/currentFilters\.(\w+)/g)].map((match) => match[1]));

/** Filter fields listed as dependencies of the effect that triggers the refetch. */
const fieldsThatTriggerARefetch = (): Set<string> => {
  const effect = source.match(
    /useEffect\(\(\) => \{\s*if \(!urlSyncedRef\.current\) return;\s*fetchMessages\(1\)[\s\S]*?\}, \[([\s\S]*?)\]\);/
  );
  if (!effect) {
    throw new Error(
      'Could not find the refetch effect in useMessagesData.ts. If it was restructured, update ' +
        'this matcher — do not delete the test; the invariant it guards still holds.'
    );
  }
  return new Set([...effect[1].matchAll(/filters\.(\w+)/g)].map((match) => match[1]));
};

describe('refetch covers every filter the request reads', () => {
  it('has no filter that changes the request but not the trigger', () => {
    const read = fieldsTheRequestDependsOn();
    const deps = fieldsThatTriggerARefetch();

    const silentlyInert = [...read].filter((field) => !deps.has(field)).sort();

    // A field here is one a user can change with no effect on screen until something else moves.
    expect(silentlyInert).toEqual([]);
  });

  it('found the two collections at all', () => {
    // Guards the guard: if either regex silently matched nothing, the assertion above passes
    // vacuously and this file becomes decoration. An empty search needs a control.
    expect(fieldsTheRequestDependsOn().size).toBeGreaterThan(10);
    expect(fieldsThatTriggerARefetch().size).toBeGreaterThan(10);
  });

  it('still covers the two that were actually broken', () => {
    // Named explicitly so a future refactor that drops them shows the regression by name rather
    // than as an anonymous entry in a diff.
    const deps = fieldsThatTriggerARefetch();

    expect(deps.has('columnId')).toBe(true); // the quick-filter chips
    expect(deps.has('receivedAt')).toBe(true); // the "Received at" alias token
  });

  it('covers isKanban, which the builder reads but the filter scan cannot see', () => {
    /**
     * ⚠️ The scan above only finds `currentFilters.*`. `isKanban` is a PROP, so it was
     * invisible to it — and the builder reads it in five places, where it zeroes
     * `lifecycle`, `queue`, `read` and `columnId` and withholds `scope=1`. Same defect
     * class, one level up, and it reached staging: the scope notice's "10 outbound echoes"
     * chip navigated to the list correctly, the token rendered, and the rows were the 16
     * from the BOARD's request — `queue` had changed while `isKanban` was still true, and
     * nothing re-fetched once it flipped.
     *
     * Asserted by name because a general "every identifier the builder reads" scan would
     * match locals and imports and be noise. If another prop starts steering the request,
     * add it here.
     */
    const effect = source.match(
      /useEffect\(\(\) => \{\s*if \(!urlSyncedRef\.current\) return;\s*fetchMessages\(1\)[\s\S]*?\}, \[([\s\S]*?)\]\);/
    );
    expect(effect).not.toBeNull();
    // Control: the builder really does read it, so this is not asserting against nothing.
    expect(source.includes('isKanban ?')).toBe(true);
    expect(/^\s*isKanban,\s*$/m.test(effect?.[1] ?? '')).toBe(true);
  });
});

describe('orgSwitchRefetches — the organization context is a reason to refetch', () => {
  /**
   * `X-Organization-Context` is read from `selectedOrganizationId` at request time, and the
   * cache key carries it (`identityScope`). It was NOT in this dependency list, so an
   * in-place org switch — the console's WorkspaceShell repoints the context on mount and
   * restores it on unmount — missed the cache and then issued nothing: the previous
   * workspace's rows stayed on screen. Audit u38 P0-1, refetch half.
   */
  const refetchEffectDeps = (): string => {
    const effect = source.match(
      /useEffect\(\(\) => \{\s*if \(!urlSyncedRef\.current\) return;\s*fetchMessages\(1\)[\s\S]*?\}, \[([\s\S]*?)\]\);/
    );
    if (!effect) throw new Error('Could not find the refetch effect in useMessagesData.ts.');
    return effect[1];
  };

  it('lists selectedOrganizationId as a dependency of the refetch effect', () => {
    expect(refetchEffectDeps()).toMatch(/\bselectedOrganizationId\b/);
  });

  it('reads it from the auth store, the same field the api-client sends', () => {
    expect(source).toMatch(
      /useAuthStore\(\(state\) => state\.selectedOrganizationId\)/
    );
  });
});
