/**
 * What the reply's success answer says did not finish after the reply was out, read from the raw
 * body: `kbCapture` and the `warnings` codes. Anything missing or malformed says nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  afterSendNotes,
  FILES_NOT_STORED,
  KB_SAVE_NOT_STARTED,
  RESOLVE_NOT_APPLIED,
  STEP_NOT_FINISHED,
} from '../afterSendNotes';

describe('afterSendNotes', () => {
  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string body', 'OK'],
    ['an older backend', { success: true }],
    ['no data', { success: true, data: null }],
    ['the save started (queued)', { success: true, data: { kbCapture: 'queued' } }],
    ['the save started (background)', { success: true, data: { kbCapture: 'background' } }],
    ['warnings that are not a list', { success: true, warnings: 'FILES' }],
    ['an empty list', { success: true, warnings: [] }],
    ['a list of non-strings', { success: true, warnings: [1, null, {}] }],
  ])('%s: nothing to say', (_name, body) => {
    expect(afterSendNotes(body)).toEqual({
      kbSaveFailed: false,
      resolveFailed: false,
      sentences: [],
    });
  });

  it('kbCapture "failed" (in `data`, or beside it)', () => {
    for (const body of [{ data: { kbCapture: 'failed' } }, { kbCapture: 'failed' }])
      expect(afterSendNotes(body)).toEqual({
        kbSaveFailed: true,
        resolveFailed: false,
        sentences: [KB_SAVE_NOT_STARTED],
      });
  });

  it('warnings, on the body or in `data`: one sentence per kind, once', () => {
    expect(
      afterSendNotes({ warnings: ['ATTACHMENTS_NOT_STORED', 'files_not_stored'] }).sentences
    ).toEqual([FILES_NOT_STORED]);
    expect(afterSendNotes({ data: { warnings: ['RESOLVE_NOT_APPLIED'] } })).toEqual({
      kbSaveFailed: false,
      resolveFailed: true,
      sentences: [RESOLVE_NOT_APPLIED],
    });
    expect(afterSendNotes({ warnings: ['KB_CAPTURE_NOT_STARTED'] }).sentences).toEqual([
      KB_SAVE_NOT_STARTED,
    ]);
  });

  it('codes this app does not know: one generic sentence', () => {
    expect(afterSendNotes({ warnings: ['A_NEW_ONE', 'ANOTHER'] }).sentences).toEqual([
      STEP_NOT_FINISHED,
    ]);
  });

  it('not resolved AND the save not started: only "resolving failed" — "sent and resolved" would be untrue', () => {
    expect(
      afterSendNotes({ data: { kbCapture: 'failed' }, warnings: ['RESOLVE_NOT_APPLIED'] })
    ).toEqual({ kbSaveFailed: false, resolveFailed: true, sentences: [RESOLVE_NOT_APPLIED] });
  });
});
