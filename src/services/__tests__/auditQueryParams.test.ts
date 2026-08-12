import { describe, expect, it } from 'vitest';
import { buildAuditQueryParams, dateInputToIso } from '@/services/auditQueryParams';

describe('buildAuditQueryParams', () => {
  it('always includes page and pageSize', () => {
    expect(buildAuditQueryParams({ page: 2, pageSize: 25 })).toEqual({
      page: 2,
      pageSize: 25,
    });
  });

  it('omits blank / empty filters entirely (not sent as empty strings)', () => {
    const params = buildAuditQueryParams({
      page: 1,
      pageSize: 25,
      action: '   ',
      actorEmail: '',
      dateFrom: '',
      dateTo: undefined,
      organizationId: undefined,
    });
    expect(params).toEqual({ page: 1, pageSize: 25 });
    expect(params).not.toHaveProperty('action');
    expect(params).not.toHaveProperty('actorEmail');
    expect(params).not.toHaveProperty('dateFrom');
    expect(params).not.toHaveProperty('organizationId');
  });

  it('includes and trims populated filters', () => {
    const params = buildAuditQueryParams({
      page: 3,
      pageSize: 50,
      action: ' user.suspend ',
      organizationId: 7,
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-01-31T23:59:59.999Z',
      actorEmail: '  Admin@Example.com  ',
    });
    expect(params).toEqual({
      page: 3,
      pageSize: 50,
      action: 'user.suspend',
      organizationId: 7,
      dateFrom: '2026-01-01T00:00:00.000Z',
      dateTo: '2026-01-31T23:59:59.999Z',
      actorEmail: 'Admin@Example.com',
    });
  });

  it('omits organizationId when it is 0 (no "all workspaces" sentinel leaks through)', () => {
    const params = buildAuditQueryParams({ page: 1, pageSize: 25, organizationId: 0 });
    expect(params).not.toHaveProperty('organizationId');
  });
});

describe('dateInputToIso', () => {
  it('returns undefined for a blank input', () => {
    expect(dateInputToIso('')).toBeUndefined();
    expect(dateInputToIso('   ')).toBeUndefined();
  });

  it('converts a date to the start of that day by default', () => {
    const iso = dateInputToIso('2026-03-15');
    expect(iso).toBe(new Date('2026-03-15T00:00:00.000').toISOString());
  });

  it('converts to end-of-day when endOfDay is set (inclusive upper bound)', () => {
    const iso = dateInputToIso('2026-03-15', true);
    expect(iso).toBe(new Date('2026-03-15T23:59:59.999').toISOString());
  });

  it('returns undefined for an unparseable value', () => {
    expect(dateInputToIso('not-a-date')).toBeUndefined();
  });
});
