import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, type WireRequest } from '@/test/apiTransport';
import {
  normaliseStatementTimeoutMs,
  platformSettingsService,
} from '@/services/platformSettings.service';

describe('normaliseStatementTimeoutMs (version skew)', () => {
  it('passes a whole non-negative number of ms', () => {
    expect(normaliseStatementTimeoutMs(30_000)).toBe(30_000);
    expect(normaliseStatementTimeoutMs(0)).toBe(0);
  });
  it('anything else — absent on an older backend, or an unknown shape — is undefined (no field)', () => {
    for (const raw of [undefined, null, '30000', -1, 1.5, { ms: 30_000 }, Number.NaN]) {
      expect(normaliseStatementTimeoutMs(raw)).toBeUndefined();
    }
  });
});

describe('the platform settings read and the database PATCH', () => {
  let database: Record<string, unknown> = {};
  let wire: ReturnType<typeof installTransport>;
  beforeEach(() => {
    wire = installTransport(apiClient, (request: WireRequest) =>
      request.method.toLowerCase() === 'get'
        ? ok({
            ai: { defaultModel: { value: null, source: 'default' } },
            storage: { driver: { value: 'local', source: 'default' } },
            database,
          })
        : ok({})
    );
  });
  afterEach(() => wire.restore());

  const retention = { value: 90, source: 'default' };

  it('carries the timeout when the backend sends it', async () => {
    database = { freeSharedRetentionDays: retention, apiStatementTimeoutMs: 30_000 };
    expect((await platformSettingsService.get()).database).toEqual({
      freeSharedRetentionDays: retention,
      apiStatementTimeoutMs: 30_000,
    });
  });

  it('an older backend (no timeout) keeps the retention and has no timeout', async () => {
    database = { freeSharedRetentionDays: retention };
    const read = await platformSettingsService.get();
    expect(read.database).toEqual({ freeSharedRetentionDays: retention });
    expect(read.database && 'apiStatementTimeoutMs' in read.database).toBe(false);
  });

  it('PATCHes only the timeout when only the timeout is saved', async () => {
    await platformSettingsService.updateDatabase({ apiStatementTimeoutMs: 0 });
    const sent = wire.requests.find((request) => request.method.toLowerCase() === 'patch');
    expect(sent?.path).toBe('/api/admin/platform/settings/database');
    expect(sent?.body).toEqual({ apiStatementTimeoutMs: 0 });
  });
});
