/**
 * Department linking must ride along with the CREATE request.
 *
 * Assigning departments in a follow-up call left a window where the source was
 * already committed and `enabled: true` — ingesting — with zero department links.
 * `routeMessage` builds its candidate set solely from those links and the strict
 * cascade has no fallback, so everything arriving in that gap lands in
 * `needs_routing` under an arbitrary department. If the second call never ran (tab
 * closed after an OAuth redirect) or failed, the source stayed that way.
 *
 * The UI already blocks an EMPTY selection, so these tests cover the other half:
 * that the selection travels atomically and no second call is issued.
 */
import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted so the spies exist before the hoisted vi.mock factory runs, letting the
// factory reference them DIRECTLY. Wrapping them in arrows instead would return vi.fn()'s
// `any` straight through and trip @typescript-eslint/no-unsafe-return.
const { upsert, setSourceDepartments } = vi.hoisted(() => ({
  upsert: vi.fn(),
  setSourceDepartments: vi.fn(),
}));

vi.mock('@/services/integrations.service', () => ({
  integrationsService: { upsert, setSourceDepartments },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { useIntegrationCard } from '../useIntegrationCard';

const baseOpts = {
  integrationType: 'slack',
  integrationDisplayName: 'Slack Workspace',
  initialConfig: { botToken: 'x', signingSecret: 'y' },
  onRefresh: vi.fn().mockResolvedValue(undefined),
  onShowAlert: vi.fn(),
};

afterEach(() => {
  upsert.mockReset();
  setSourceDepartments.mockReset();
});

describe('useIntegrationCard — atomic department linking', () => {
  it('sends the selection on the CREATE request itself', async () => {
    upsert.mockResolvedValue({ success: true, action: 'created', data: { id: 42 } });
    const { result } = renderHook(() =>
      useIntegrationCard({
        ...baseOpts,
        createDepartments: { departmentIds: [7, 9], defaultDepartmentId: 9 },
      })
    );

    await act(async () => {
      await result.current.saveIntegration();
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      departmentIds: [7, 9],
      defaultDepartmentId: 9,
    });
  });

  it('THE FIX: issues no separate department call', async () => {
    // The whole point — one request, so the source cannot be committed unlinked.
    upsert.mockResolvedValue({ success: true, action: 'created', data: { id: 42 } });
    const { result } = renderHook(() =>
      useIntegrationCard({
        ...baseOpts,
        createDepartments: { departmentIds: [7], defaultDepartmentId: 7 },
      })
    );

    await act(async () => {
      await result.current.saveIntegration();
    });

    expect(setSourceDepartments).not.toHaveBeenCalled();
  });

  it('CONTROL: omits the fields entirely when nothing is selected', async () => {
    // Must not send `departmentIds: []` — the BE reads an absent field as
    // "link every active department" but an explicit empty array as a selection.
    upsert.mockResolvedValue({ success: true, action: 'created', data: { id: 42 } });
    const { result } = renderHook(() =>
      useIntegrationCard({ ...baseOpts, createDepartments: { departmentIds: [] } })
    );

    await act(async () => {
      await result.current.saveIntegration();
    });

    expect(upsert.mock.calls[0][0]).not.toHaveProperty('departmentIds');
  });

  it('CONTROL: omits them when no createDepartments is supplied at all', async () => {
    upsert.mockResolvedValue({ success: true, action: 'created', data: { id: 42 } });
    const { result } = renderHook(() => useIntegrationCard(baseOpts));

    await act(async () => {
      await result.current.saveIntegration();
    });

    expect(upsert.mock.calls[0][0]).not.toHaveProperty('departmentIds');
  });
});
