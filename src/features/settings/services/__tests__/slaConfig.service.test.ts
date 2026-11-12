import { describe, it, expect, vi, beforeEach } from 'vitest';

const put = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (...args: unknown[]) => put(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

const { getSlaConfig, normaliseSlaConfig, saveSlaConfig } = await import('../slaConfig.service');

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
    await saveSlaConfig(normaliseSlaConfig(newBackend).rows, { supportsThreadPriority: true });
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
    await saveSlaConfig(normaliseSlaConfig(newBackend).rows, { supportsThreadPriority: false });
    const body = put.mock.calls[0][1] as { configs: Array<{ key: string }> };
    expect(body.configs.map((cfg) => cfg.key)).toEqual(['critical', 'email']);
  });

  it('a malformed body does not throw', () => {
    expect(normaliseSlaConfig(undefined)).toEqual({ rows: [], supportsThreadPriority: false });
    expect(
      normaliseSlaConfig([null, 3, { type: 'x' }, { type: 'ticket', key: 'low' }]).rows
    ).toEqual([]);
  });
});
