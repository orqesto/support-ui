/**
 * The pill labelled "All" must ask the API for all lifecycles.
 *
 * It sent `view=work_queue`, which is a real lens and a narrow one: it pins
 * `status IN (new, open, pending, awaiting_response, client_replied)` and drops spam,
 * suspicious and knowledge-base mail. On a client workspace that rendered `1–50 of 0`
 * beside a kanban showing 2,880 of the same 2,910 threads, because `view=board` applies
 * neither a terminal filter nor a KB one. Two views of one mailbox disagreeing by 2,880
 * rows, with the NARROWER one labelled "All".
 *
 * ⛔ The fix is NOT `view=all`. The API refuses that with a 400 on purpose — it used to be
 * accepted and silently narrowed. `view=active&processed=all` is the sanctioned widening
 * and the 400's own body names it.
 *
 * 🪤 THE ASSERTIONS RUN AGAINST SOURCE WITH COMMENTS STRIPPED, following
 * `supersededFetchIsNotDropped.test.ts`. The fix's own comment names `work_queue`,
 * `view=all` and `processed=all` while explaining why each is right or wrong, so a plain
 * containment check would pass against the very bug it guards — and the "no longer sends
 * work_queue" assertion would pass against code that still does. Written, then verified to
 * fail with the change reverted.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raw = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../useMessagesData.ts'),
  'utf8'
);

/** Source with block and line comments removed, so prose cannot satisfy a check. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The body of the `status === 'all'` branch — the only branch the All pill reaches. */
const branch = (): string => {
  const found = code.match(/status === 'all'\) \{([\s\S]*?)\} else if \(status === 'active'\)/);
  expect(found).not.toBeNull();
  return found?.[1] ?? '';
};

describe('the All pill asks for all lifecycles', () => {
  it('control: the branch is found and is real code, not stripped prose', () => {
    // Without this every assertion below could pass against an empty string.
    expect(branch().length).toBeGreaterThan(20);
    expect(branch()).toContain('apiFilters');
  });

  it('no longer sends the narrow work-queue lens', () => {
    expect(branch()).not.toContain('work_queue');
  });

  it('sends view=active', () => {
    expect(branch()).toMatch(/apiFilters\.view\s*=\s*'active'/);
  });

  it('sends processed=all, which is what actually widens the lifecycle', () => {
    // ⛔ `view=active` ALONE is NARROWER than `view=work_queue` — it pins
    // `status IN (new, open, pending)` and `lastReplyAt IS NULL`. `processed=all` is the
    // param that skips that pin. Shipping the view change without it would have made the
    // list smaller while looking like a widening.
    expect(branch()).toMatch(/apiFilters\.processed\s*=\s*'all'/);
  });

  it('only widens when the agent has picked no thread status', () => {
    // Choosing "Closed" and getting every lifecycle back would be the same class of lie in
    // the other direction. A chosen status still narrows.
    expect(branch()).toMatch(/threadStatus === 'all'/);
  });

  it('does NOT send view=all, which the API refuses with a 400', () => {
    expect(branch()).not.toMatch(/view\s*=\s*'all'/);
  });
});
