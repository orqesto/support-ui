/**
 * The processing panel reads the runs view the backend adds to import-progress. A backend without
 * it (or a partial answer) must not white-screen the panel, and a KB failure already gone must
 * not read as an error when dismissed.
 */
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Plain functions per test, not module-level vi.fn: under vitest 4 a rejection returned by a
 * module-level mock failed the test even though the service caught it.
 */
const deleted: string[] = [];
let deleteImpl: () => Promise<unknown> = () => Promise.resolve({ status: 204 });
let getImpl: () => Promise<unknown> = () => Promise.resolve({ data: { data: [] } });
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    delete: (url: string) => {
      deleted.push(url);
      return deleteImpl();
    },
    get: () => getImpl(),
  },
}));

const { importProgressService, normaliseImportProgress } = await import(
  '@/services/importProgress.service'
);

const refusal = (status: number) =>
  new AxiosError('refused', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });

describe('normaliseImportProgress', () => {
  it('an answer without the runs view reads as "no runs", not a crash', () => {
    const data = normaliseImportProgress({ tracked: false });
    expect(data).toEqual({
      tracked: false,
      runs: [],
      kbMiningFailures: [],
      kbMiningFailuresTruncated: false,
      countCapped: false,
      runsUnavailable: false,
    });
  });

  it('keeps a tracked import and its runs', () => {
    const data = normaliseImportProgress({
      tracked: true,
      run: { state: 'ready' },
      runs: [{ id: 'r1' }],
      countCapped: true,
    });
    expect(data.tracked).toBe(true);
    expect(data.runs).toHaveLength(1);
    expect(data.countCapped).toBe(true);
  });

  it('null or garbage reads as untracked with nothing in it', () => {
    expect(normaliseImportProgress(null).runs).toEqual([]);
    expect(normaliseImportProgress({ runs: 'x' }).runs).toEqual([]);
  });
});

describe('summary', () => {

  it('drops entries without a source id and fills missing counts with 0', async () => {
    getImpl = () =>
      Promise.resolve({
        data: { data: [{ sourceId: 4, name: 'Orders', problems: 2 }, { name: 'no id' }] },
      });
    expect(await importProgressService.summary()).toEqual([
      {
        sourceId: 4,
        name: 'Orders',
        type: 'email',
        unavailable: false,
        inProgress: 0,
        problems: 2,
        countCapped: false,
      },
    ]);
  });
});

describe('dismissKbFailure', () => {
  beforeEach(() => {
    deleted.length = 0;
  });

  it('calls the dismiss route for that source and conversation', async () => {
    deleteImpl = () => Promise.resolve({ status: 204 });
    await importProgressService.dismissKbFailure(7, 1234);
    expect(deleted).toEqual(['/api/integrations/7/kb-mining-failures/1234']);
  });

  it('a 404 (already gone) is what was asked for, not an error', async () => {
    deleteImpl = () => Promise.reject(refusal(404));
    await expect(importProgressService.dismissKbFailure(7, 1234)).resolves.toBeUndefined();
  });

  it('CONTROL: any other failure is reported', async () => {
    deleteImpl = () => Promise.reject(refusal(500));
    await expect(importProgressService.dismissKbFailure(7, 1234)).rejects.toBeTruthy();
  });
});
