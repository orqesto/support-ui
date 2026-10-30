import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

import {
  answerKbQuestion,
  getEngineSummary,
  getKbQuestions,
  kbExportHref,
  listEntryVersions,
  restoreEntryVersion,
  rollbackEngineWindow,
  searchKbCases,
} from '../kbEngine.service';
import { kbAutoActionsService } from '../kbAutoActions.service';
import { normaliseAutoChange, KB_FINDINGS } from '../kb.service';
import { KB_FINDING_TEXT } from '@/lib/kbFinding';

const ok = (data: unknown) => ({ data: { success: true, data } });

beforeEach(() => vi.resetAllMocks());

describe('kbEngine service URLs and bodies', () => {
  it('questions: sends only the filters given and returns the page', async () => {
    const page = { items: [], total: 0, nextCursor: null, olderThan7d: 0 };
    api.get.mockResolvedValue(ok(page));
    expect(await getKbQuestions({ departmentId: 3, search: ' refund ', cursor: '40' })).toBe(page);
    expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/questions', {
      params: { departmentId: 3, search: 'refund', cursor: '40' },
    });
    await getKbQuestions();
    expect(api.get).toHaveBeenLastCalledWith('/api/knowledge-base/questions', { params: {} });
  });

  it('answer: posts the choice, and text only when given', async () => {
    api.post.mockResolvedValue(
      ok({ suggestionId: 9, kind: 'merge', choice: 'accept', result: {} })
    );
    await answerKbQuestion(9, 'accept');
    expect(api.post).toHaveBeenLastCalledWith('/api/knowledge-base/questions/9/answer', {
      choice: 'accept',
    });
    await answerKbQuestion(9, 'both_wrong', 'Neither');
    expect(api.post).toHaveBeenLastCalledWith('/api/knowledge-base/questions/9/answer', {
      choice: 'both_wrong',
      text: 'Neither',
    });
  });

  it('summary: the team goes in the query only when given; null findings stay null', async () => {
    const summary = { findings: null, findingsComputedAt: null };
    api.get.mockResolvedValue(ok(summary));
    expect(await getEngineSummary()).toBe(summary);
    expect(api.get).toHaveBeenLastCalledWith('/api/knowledge-base/engine/summary', {
      params: undefined,
    });
    await getEngineSummary(4);
    expect(api.get).toHaveBeenLastCalledWith('/api/knowledge-base/engine/summary', {
      params: { departmentId: 4 },
    });
  });

  it('case search: passes search, team, scope and limit', async () => {
    api.get.mockResolvedValue(ok([]));
    await searchKbCases({ search: 'refund', departmentId: 2, scopeKey: 's:5', limit: 10 });
    expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/cases/search', {
      params: { search: 'refund', departmentId: 2, scopeKey: 's:5', limit: 10 },
    });
  });

  it('versions: lists oldest first from data.versions', async () => {
    api.get.mockResolvedValue(ok({ versions: [{ version: 1 }, { version: 2 }] }));
    expect(await listEntryVersions(7)).toEqual([{ version: 1 }, { version: 2 }]);
    expect(api.get).toHaveBeenCalledWith('/api/knowledge-base/entries/7/versions');
  });

  it('restore: posts to the version route; includeLater only when asked', async () => {
    api.post.mockResolvedValue(ok({ restoredTo: 2, newVersion: 5 }));
    expect(await restoreEntryVersion(7, 2)).toEqual({ restoredTo: 2, newVersion: 5 });
    expect(api.post).toHaveBeenLastCalledWith(
      '/api/knowledge-base/entries/7/versions/2/restore',
      {}
    );
    await restoreEntryVersion(7, 2, true);
    expect(api.post).toHaveBeenLastCalledWith('/api/knowledge-base/entries/7/versions/2/restore', {
      includeLater: true,
    });
  });

  it('rollback: posts the body as given and returns the widened result', async () => {
    const result = { dryRun: true, matched: 3, skipped: [{ entryId: 1, reason: 'changed_after' }] };
    api.post.mockResolvedValue(ok(result));
    const body = { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z', dryRun: true };
    expect(await rollbackEngineWindow(body)).toBe(result);
    expect(api.post).toHaveBeenCalledWith('/api/knowledge-base/engine/rollback', body);
  });

  it('mined-approval undo posts to the unapprove route', async () => {
    api.post.mockResolvedValue({});
    await kbAutoActionsService.unapproveMined(62);
    expect(api.post).toHaveBeenCalledWith(
      '/api/knowledge-base/auto-actions/approved-mined/62/unapprove',
      {}
    );
  });
});

describe('restore 409 returns refused', () => {
  const refuse = (data: Record<string, unknown>) =>
    api.post.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409, data }));

  it('later changes carry the later versions', async () => {
    refuse({ code: 'LATER_CHANGES', error: 'Someone changed it', later: [{ version: 4 }] });
    expect(await restoreEntryVersion(7, 2)).toEqual({
      refused: 'later_changes',
      later: [{ version: 4 }],
      message: 'Someone changed it',
    });
  });

  it.each([
    [{ code: 'TEXT_REDACTED' }, { refused: 'text_redacted' }],
    [
      { code: 'MERGED_INTO_CASE', caseId: 12 },
      { refused: 'merged_into_case', caseId: 12 },
    ],
    [
      { code: 'USE_ACTION_UNDO', action: 'auto:hold' },
      { refused: 'use_action_undo', action: 'auto:hold' },
    ],
    [{ error: 'try again' }, { refused: 'changed_meanwhile' }],
  ])('%j resolves to a typed refusal', async (body, expected) => {
    refuse(body);
    expect(await restoreEntryVersion(7, 2)).toMatchObject(expected);
  });

  it('anything else still throws', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(restoreEntryVersion(7, 2)).rejects.toThrow('boom');
    api.post.mockRejectedValue(Object.assign(new Error('nope'), { status: 403 }));
    await expect(restoreEntryVersion(7, 2)).rejects.toThrow('nope');
  });
});

describe('kbExportHref carries every active list filter', () => {
  it('sends status (all included), finding, teams, source, type and search', () => {
    const href = kbExportHref({
      status: 'set_aside',
      finding: 'detached',
      departmentId: 3,
      departmentIds: [3, 5],
      source: 9,
      type: 'qa_pair',
      search: ' refund ',
    });
    const [path, query] = href.split('?');
    expect(path).toBe('/api/knowledge-base/export.csv');
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      status: 'set_aside',
      finding: 'detached',
      departmentId: '3',
      departmentIds: '3,5',
      messageSourceId: '9',
      type: 'qa_pair',
      search: 'refund',
    });
  });

  it('always sends status, even for Everything; "none" source and a lone team are kept', () => {
    expect(kbExportHref({ status: 'all' })).toBe('/api/knowledge-base/export.csv?status=all');
    const query = new URLSearchParams(
      kbExportHref({ status: 'all', source: 'none', departmentId: 2, type: 'all' }).split('?')[1]
    );
    expect(query.get('messageSourceId')).toBe('none');
    expect(query.get('departmentIds')).toBe('2');
    expect(query.has('type')).toBe(false);
  });
});

describe('contract details', () => {
  it('every one of the six findings has wording', () => {
    expect(KB_FINDINGS).toHaveLength(6);
    for (const finding of KB_FINDINGS) expect(KB_FINDING_TEXT[finding].title).toBeTruthy();
  });

  it('autoChange keeps undoVersion and undoBlocked; the old "unapprove" undo is gone', () => {
    const base = { action: 'approveMined', undo: 'unapprove_mined', at: null };
    expect(
      normaliseAutoChange({ ...base, undoVersion: 3, undoBlocked: 'changed_after' })
    ).toMatchObject({
      undo: 'unapprove_mined',
      undoVersion: 3,
      undoBlocked: 'changed_after',
    });
    expect(normaliseAutoChange(base)).toMatchObject({ undoVersion: null, undoBlocked: null });
    expect(normaliseAutoChange({ ...base, undo: 'unapprove' })).toBeNull();
  });
});
