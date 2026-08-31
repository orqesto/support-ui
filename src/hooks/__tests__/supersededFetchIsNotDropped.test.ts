/**
 * A fetch requested while another is in flight must be re-issued, never discarded.
 *
 * `fetchMessages` guards against overlapping requests with a boolean ref. Returning early
 * is only correct if the two calls would produce the SAME request — and often they would
 * not. Jumping from the board to the list changes two things a beat apart: the filter,
 * then the board→list flip that stops the request builder zeroing `queue`. The first fired
 * a request; the second landed while it was in flight and was dropped by a silent
 * `return`. The list then rendered the BOARD's rows — 16 unrelated threads under a notice
 * promising 10 — and there was no second request on the wire to explain it, which is what
 * made it read as a backend disagreement. The API was correct at every step.
 *
 * 🪤 The assertions below run against source with COMMENTS STRIPPED. The fix's own
 * explanatory comment names `supersededPageRef`, so a plain containment check passes
 * against the very bug it guards — this file was written, then verified to fail with the
 * fix reverted.
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

describe('a superseded fetch is held, not dropped', () => {
  it('the in-flight guard records the page instead of returning bare', () => {
    const guard = code.match(
      /if \(messagesFetchingRef\.current && !force\) \{([\s\S]*?)\}/
    );
    expect(guard).not.toBeNull();
    const body = guard?.[1] ?? '';
    // Control: the guard body was found and is not empty prose.
    expect(body).toContain('return');
    // The regression is a body that ONLY returns.
    expect(body).toMatch(/supersededPageRef\.current\s*=\s*page/);
  });

  it('re-issues the held page once the in-flight request settles', () => {
    // Must live in the finally block — a re-run placed on the success path alone would
    // strand the held request whenever the first one failed.
    const finallyBlock = code.match(/\} finally \{([\s\S]*?)\n {6}\}/);
    expect(finallyBlock).not.toBeNull();
    const body = finallyBlock?.[1] ?? '';
    expect(body).toContain('messagesFetchingRef.current = false');
    expect(body).toMatch(/supersededPageRef\.current/);
    expect(body).toMatch(/fetchMessagesRef\.current\?\.\(superseded\)/);
  });

  it('re-issues through the REF, not the captured closure', () => {
    /**
     * The whole point of the retry is that `isKanban` has changed. A `useCallback`
     * closure captures the value from the render that created it, so calling
     * `fetchMessages(...)` directly re-sends the request the retry exists to replace —
     * and then finds it in the cache, so it costs no request and changes nothing.
     * That is exactly how this fix failed the first time.
     */
    const finallyBlock = code.match(/\} finally \{([\s\S]*?)\n {6}\}/);
    const body = finallyBlock?.[1] ?? '';
    expect(body).not.toMatch(/[^.]\bfetchMessages\(superseded\)/);
  });

  it('clears the held page before re-issuing, so it cannot loop forever', () => {
    // Re-running without clearing would set the flag again on every pass.
    const finallyBlock = code.match(/\} finally \{([\s\S]*?)\n {6}\}/);
    const body = finallyBlock?.[1] ?? '';
    const clearAt = body.indexOf('supersededPageRef.current = null');
    const callAt = body.indexOf('fetchMessagesRef.current?.(superseded)');
    expect(clearAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(clearAt);
  });
});
