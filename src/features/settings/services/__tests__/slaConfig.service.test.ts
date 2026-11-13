import { describe, it, expect, vi, beforeEach } from 'vitest';

const put = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const del = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (...args: unknown[]) => put(...args),
    get: (...args: unknown[]) => get(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

const { changedSlaRows, getSlaConfig, normaliseSlaConfig, resetSlaRow, saveSlaConfig } =
  await import('../slaConfig.service');

/** Every row as a change of both fields (what an older backend is always sent). */
const allFields = (rows: ReturnType<typeof normaliseSlaConfig>['rows']) =>
  rows.map((row) => ({ row, firstResponse: true, resolution: true }));
const OLD = { supportsThreadPriority: true, supportsFieldSave: false };

const newBackend = [
  {
    type: 'ticket',
    key: 'critical',
    firstResponseMinutes: 15,
    resolutionMinutes: 90,
    resolutionHours: 2,
    isCustom: true,
  },
  {
    type: 'message',
    key: 'high',
    firstResponseMinutes: 60,
    resolutionMinutes: 480,
    resolutionHours: 8,
    isCustom: false,
  },
  {
    type: 'message',
    key: 'email',
    firstResponseMinutes: 60,
    resolutionMinutes: null,
    resolutionHours: null,
    isCustom: false,
  },
];
const oldBackend = [
  {
    type: 'ticket',
    key: 'critical',
    firstResponseMinutes: 15,
    resolutionHours: 4,
    isCustom: false,
  },
  {
    type: 'message',
    key: 'email',
    firstResponseMinutes: 60,
    resolutionHours: null,
    isCustom: false,
  },
];

describe('SLA config service (minutes, thread targets by priority)', () => {
  beforeEach(() => {
    put.mockReset();
    get.mockReset();
    put.mockResolvedValue({ data: { success: true } });
  });

  it('a new backend: minutes as sent, thread-priority rows grouped, supportsThreadPriority', async () => {
    get.mockResolvedValue({ data: { success: true, data: newBackend } });
    const config = await getSlaConfig();
    expect(config.supportsThreadPriority).toBe(true);
    expect(config.rows.map((row) => [row.group, row.key, row.resolutionMinutes])).toEqual([
      ['ticket', 'critical', 90],
      ['threadPriority', 'high', 480],
      ['threadChannel', 'email', null],
    ]);
  });

  it('an older backend (hours only, no thread-priority rows): hours × 60, supportsThreadPriority false', () => {
    const config = normaliseSlaConfig(oldBackend);
    expect(config.supportsThreadPriority).toBe(false);
    expect(config.rows[0].resolutionMinutes).toBe(240);
    expect(config.rows[1].resolutionMinutes).toBeNull();
  });

  it('save sends resolutionMinutes AND resolutionHours = ceil(minutes / 60)', async () => {
    await saveSlaConfig(allFields(normaliseSlaConfig(newBackend).rows), OLD);
    const body = put.mock.calls[0][1] as { configs: Array<Record<string, unknown>> };
    expect(body.configs[0]).toMatchObject({
      key: 'critical',
      resolutionMinutes: 90,
      resolutionHours: 2,
    });
    expect(body.configs[2]).toMatchObject({
      key: 'email',
      resolutionMinutes: null,
      resolutionHours: null,
    });
  });

  it('save to an older backend sends no thread-priority row', async () => {
    await saveSlaConfig(allFields(normaliseSlaConfig(newBackend).rows), {
      supportsThreadPriority: false,
      supportsFieldSave: false,
    });
    const body = put.mock.calls[0][1] as { configs: Array<{ key: string }> };
    expect(body.configs.map((cfg) => cfg.key)).toEqual(['critical', 'email']);
  });

  it('a malformed body does not throw', () => {
    expect(normaliseSlaConfig(undefined)).toEqual({
      rows: [],
      supportsThreadPriority: false,
      supportsFieldSave: false,
    });
    expect(
      normaliseSlaConfig([null, 3, { type: 'x' }, { type: 'ticket', key: 'low' }]).rows
    ).toEqual([]);
  });

  describe('L1: Save sends only the changed FIELD (backend with per-field flags)', () => {
    const perField = newBackend.map((row) => ({
      ...row,
      firstResponseIsCustom: row.isCustom,
      resolutionIsCustom: row.isCustom,
    }));

    it('per-field flags are read; their absence reads both as isCustom (older backend)', () => {
      const fresh = normaliseSlaConfig([
        { ...perField[0], firstResponseIsCustom: false, resolutionIsCustom: true },
      ]);
      expect(fresh.supportsFieldSave).toBe(true);
      expect(fresh.rows[0]).toMatchObject({
        firstResponseIsCustom: false,
        resolutionIsCustom: true,
      });
      const old = normaliseSlaConfig(newBackend);
      expect(old.supportsFieldSave).toBe(false);
      expect(old.rows[0]).toMatchObject({ firstResponseIsCustom: true, resolutionIsCustom: true });
      expect(old.rows[1]).toMatchObject({
        firstResponseIsCustom: false,
        resolutionIsCustom: false,
      });
    });

    it('a changed first response is sent WITHOUT the untouched resolution', async () => {
      const loaded = normaliseSlaConfig(perField);
      const edited = loaded.rows.map((row) =>
        row.key === 'high' ? { ...row, firstResponseMinutes: 30 } : row
      );
      await saveSlaConfig(changedSlaRows(edited, loaded.rows), loaded);
      const body = put.mock.calls[0][1] as { configs: Array<Record<string, unknown>> };
      expect(body.configs).toEqual([{ type: 'message', key: 'high', firstResponseMinutes: 30 }]);
    });

    it('a changed resolution is sent WITHOUT the untouched first response', async () => {
      const loaded = normaliseSlaConfig(perField);
      const edited = loaded.rows.map((row) =>
        row.key === 'high' ? { ...row, resolutionMinutes: 120 } : row
      );
      await saveSlaConfig(changedSlaRows(edited, loaded.rows), loaded);
      const body = put.mock.calls[0][1] as { configs: Array<Record<string, unknown>> };
      expect(body.configs).toEqual([
        { type: 'message', key: 'high', resolutionMinutes: 120, resolutionHours: 2 },
      ]);
    });

    it('CONTROL: an older backend (no per-field flags) is still sent both fields', async () => {
      const loaded = normaliseSlaConfig(newBackend);
      const edited = loaded.rows.map((row) =>
        row.key === 'high' ? { ...row, firstResponseMinutes: 30 } : row
      );
      await saveSlaConfig(changedSlaRows(edited, loaded.rows), loaded);
      const body = put.mock.calls[0][1] as { configs: Array<Record<string, unknown>> };
      expect(body.configs).toEqual([
        {
          type: 'message',
          key: 'high',
          firstResponseMinutes: 30,
          resolutionMinutes: 480,
          resolutionHours: 8,
        },
      ]);
    });
  });

  it('L2: reset DELETEs the row and returns the config the backend answers with', async () => {
    del.mockResolvedValue({ data: { success: true, data: newBackend } });
    const config = await resetSlaRow({ type: 'message', key: 'high' });
    expect(del).toHaveBeenCalledWith('/api/organizations/sla-config/message/high');
    expect(config.rows).toHaveLength(3);
  });
});
