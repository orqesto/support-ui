/**
 * `getWorkspaceHealth` on a backend that has the endpoint, one that does not (this FE reaches prod
 * on merge to `main`, the BE only on a tag), and one whose response is skewed. The 404 fixture
 * comes from the real api-client interceptor.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const { platformService, normalizeWorkspaceHealth } = await import('../platform.service');
const { apiError } = await import('@/test/apiError');

beforeEach(() => {
  get.mockReset();
});

describe('platformService.getWorkspaceHealth', () => {
  it('returns the normalised report', async () => {
    get.mockResolvedValue({
      data: { data: { generatedAt: 'x', perStateCap: 1000, truncated: [], workspaces: [], unattributed: null } },
    });
    await expect(platformService.getWorkspaceHealth()).resolves.toMatchObject({ perStateCap: 1000, workspaces: [] });
    expect(get).toHaveBeenCalledWith('/api/admin/workspace-health');
  });

  it('is null — "nothing to say" — on a backend without the endpoint', async () => {
    get.mockRejectedValue(await apiError(404, { success: false, error: 'Not Found' }));
    await expect(platformService.getWorkspaceHealth()).resolves.toBeNull();
  });

  it('still throws on any other failure, so the card can show an error', async () => {
    get.mockRejectedValue(await apiError(500, { success: false, error: 'boom' }));
    await expect(platformService.getWorkspaceHealth()).rejects.toBeTruthy();
  });
});

describe('normalizeWorkspaceHealth', () => {
  it('tolerates missing arrays, counts and an unknown hold reason without throwing', () => {
    const report = normalizeWorkspaceHealth({
      workspaces: [
        {
          organizationId: 20,
          jobs: { queued: 2 },
          mailboxes: [{ sourceId: 3, name: 'Email-team@odly.ai', hold: { reason: 'brand_new_reason', errors: [{ message: 'x', count: 2 }, 7] } }],
        },
        { organizationId: 21 },
      ],
    });
    const [odly, other] = report.workspaces;
    expect(report.truncated).toEqual([]);
    expect(report.unattributed).toBeNull();
    expect(odly.name).toBe('org 20');
    expect(odly.jobs).toEqual({ queued: 2, active: 0, delayed: 0, failed: 0, oldestQueuedAt: null, byQueue: {} });
    expect(odly.mailboxes[0].hold).toMatchObject({ reason: 'unknown', errors: [{ message: 'x', count: 2 }] });
    expect(odly.mailboxes[0].openAlerts).toEqual({ gap: 0, dark: 0 });
    expect(other.mailboxes).toEqual([]);
    expect(other.mailboxError).toBeNull();
  });

  it('keeps an absent hold as null, never as a healthy-looking object', () => {
    const report = normalizeWorkspaceHealth({ workspaces: [{ organizationId: 1, mailboxes: [{ sourceId: 1 }] }] });
    expect(report.workspaces[0].mailboxes[0].hold).toBeNull();
  });
});
