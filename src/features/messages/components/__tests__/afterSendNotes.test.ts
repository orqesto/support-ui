/**
 * What the reply's success answer (`data: ReplySent`) says did not finish after the reply was
 * out: `kbCapture` and the `warnings` codes, one plain sentence per code. Anything missing or
 * malformed says nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  afterSendNotes,
  DELIVERY_NOT_RECORDED,
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
    ['the id alone', { success: true, data: { outgoingMessageId: 951 } }],
    ['the save started (queued)', { success: true, data: { kbCapture: 'queued' } }],
    ['the save started (background)', { success: true, data: { kbCapture: 'background' } }],
    ['warnings that are not a list', { success: true, data: { warnings: 'files' } }],
    ['an empty list', { success: true, data: { warnings: [] } }],
    ['a list of non-strings', { success: true, data: { warnings: [1, null, {}] } }],
  ])('%s: nothing to say', (_name, body) => {
    expect(afterSendNotes(body)).toEqual({
      kbSaveFailed: false,
      resolveFailed: false,
      sentences: [],
    });
  });

  it('kbCapture "failed": sent and resolved, the save did not start', () => {
    expect(afterSendNotes({ data: { outgoingMessageId: 951, kbCapture: 'failed' } })).toEqual({
      kbSaveFailed: true,
      resolveFailed: false,
      sentences: [KB_SAVE_NOT_STARTED],
    });
  });

  it.each([
    ['files_not_stored', FILES_NOT_STORED],
    ['resolve_not_applied', RESOLVE_NOT_APPLIED],
    ['delivery_not_recorded', DELIVERY_NOT_RECORDED],
  ])('%s: its own sentence', (code, sentence) => {
    expect(
      afterSendNotes({ data: { outgoingMessageId: 951, warnings: [code] } }).sentences
    ).toEqual([sentence]);
  });

  it('every code at once: one sentence each, the resolve first', () => {
    expect(
      afterSendNotes({
        data: { warnings: ['files_not_stored', 'delivery_not_recorded', 'resolve_not_applied'] },
      }).sentences
    ).toEqual([RESOLVE_NOT_APPLIED, FILES_NOT_STORED, DELIVERY_NOT_RECORDED]);
  });

  it('codes this app does not know: one generic sentence, beside the known ones', () => {
    expect(
      afterSendNotes({ data: { warnings: ['a_new_one', 'another', 'files_not_stored'] } }).sentences
    ).toEqual([FILES_NOT_STORED, STEP_NOT_FINISHED]);
  });

  it('not resolved AND the save not started: only "could not be resolved" — "sent and resolved" would be untrue', () => {
    expect(
      afterSendNotes({ data: { kbCapture: 'failed', warnings: ['resolve_not_applied'] } })
    ).toEqual({ kbSaveFailed: false, resolveFailed: true, sentences: [RESOLVE_NOT_APPLIED] });
  });
});
