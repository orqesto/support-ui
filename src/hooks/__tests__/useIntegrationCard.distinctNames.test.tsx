/**
 * `POST /api/integrations` is an UPSERT keyed on `name + type` (+ department). The hook
 * used to send the constant display name on every save and never the row being edited,
 * so a second Slack workspace / Telegram bot / WhatsApp number overwrote the first, and
 * editing a row saved under any other name created a duplicate. Audit u37 P0-2.
 */
import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { upsert, update } = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn() }));

vi.mock('@/services/integrations.service', () => ({
  integrationsService: { upsert, update },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { distinctName, useIntegrationCard } from '../useIntegrationCard';

const onShowAlert = vi.fn();
const baseOpts = {
  integrationType: 'slack',
  integrationDisplayName: 'Slack Workspace',
  initialConfig: { botToken: 'x', signingSecret: 'y' },
  onRefresh: vi.fn().mockResolvedValue(undefined),
  onShowAlert,
};

afterEach(() => {
  upsert.mockReset();
  update.mockReset();
  onShowAlert.mockReset();
});

describe('distinctName', () => {
  it.each([
    ['Slack Workspace', [], 'Slack Workspace'],
    ['Slack Workspace', ['Slack Workspace'], 'Slack Workspace 2'],
    ['Slack Workspace', ['Slack Workspace', 'Slack Workspace 2'], 'Slack Workspace 3'],
    ['Slack Workspace', ['Slack Workspace 2'], 'Slack Workspace'],
  ])('%s with %j → %s', (base, taken, expected) => {
    expect(distinctName(base, taken)).toBe(expected);
  });
});

describe('useIntegrationCard — a second integration gets its own row', () => {
  it('THE FIX: a CREATE next to an existing row defaults to a distinct name', async () => {
    upsert.mockResolvedValue({ success: true, action: 'created', data: { id: 2 } });
    const { result } = renderHook(() =>
      useIntegrationCard({ ...baseOpts, existingNames: ['Slack Workspace'] })
    );
    expect(result.current.name).toBe('Slack Workspace 2');

    await act(async () => {
      await result.current.saveIntegration();
    });

    // Under the constant name the BE would have matched — and overwritten — row 1.
    expect(upsert.mock.calls[0][0]).toMatchObject({ name: 'Slack Workspace 2', type: 'slack' });
  });

  it('refuses a typed name that would land on an existing row', async () => {
    const { result } = renderHook(() =>
      useIntegrationCard({ ...baseOpts, existingNames: ['Ops Slack'] })
    );
    act(() => {
      result.current.setName('Ops Slack');
    });
    await act(async () => {
      await result.current.saveIntegration();
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(onShowAlert).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'error', title: 'Name already in use' })
    );
  });

  it('derives the default name from the config when the card knows how', () => {
    const { result } = renderHook(() =>
      useIntegrationCard({
        ...baseOpts,
        integrationType: 'telegram',
        integrationDisplayName: 'Telegram Bot',
        initialConfig: { botToken: '123456:secret' },
        deriveName: (config) => `Telegram Bot ${config.botToken.split(':')[0]}`,
      })
    );
    expect(result.current.name).toBe('Telegram Bot 123456');
  });

  it('CONTROL: with nothing existing the display name is used as before', async () => {
    upsert.mockResolvedValue({ success: true, action: 'created', data: { id: 1 } });
    const { result } = renderHook(() => useIntegrationCard(baseOpts));
    await act(async () => {
      await result.current.saveIntegration();
    });
    expect(upsert.mock.calls[0][0]).toMatchObject({ name: 'Slack Workspace' });
  });
});

describe('useIntegrationCard — editing addresses the row being edited', () => {
  it('THE FIX: an EDIT upserts under the stored name, not the display name', async () => {
    upsert.mockResolvedValue({ success: true, action: 'updated', data: { id: 5 } });
    const { result } = renderHook(() =>
      useIntegrationCard({ ...baseOpts, existingNames: ['Ops Slack'] })
    );
    act(() => {
      result.current.loadForEdit(5, { botToken: 'x', signingSecret: 'y' }, 'Ops Slack');
    });
    expect(result.current.name).toBe('Ops Slack');

    await act(async () => {
      await result.current.saveIntegration();
    });

    expect(upsert.mock.calls[0][0]).toMatchObject({ name: 'Ops Slack' });
    expect(update).not.toHaveBeenCalled();
  });

  it('applies a rename by id after the upsert, since the upsert cannot rename', async () => {
    upsert.mockResolvedValue({ success: true, action: 'updated', data: { id: 5 } });
    update.mockResolvedValue({ success: true, data: { id: 5 } });
    const { result } = renderHook(() =>
      useIntegrationCard({ ...baseOpts, existingNames: ['Ops Slack'] })
    );
    act(() => {
      result.current.loadForEdit(5, { botToken: 'x', signingSecret: 'y' }, 'Ops Slack');
    });
    act(() => {
      result.current.setName('Ops Slack EU');
    });

    await act(async () => {
      await result.current.saveIntegration();
    });

    expect(upsert.mock.calls[0][0]).toMatchObject({ name: 'Ops Slack' });
    expect(update).toHaveBeenCalledWith(5, { name: 'Ops Slack EU', type: 'slack' });
  });

  it('CONTROL: a caller-supplied name (Jira-style) still wins outright', async () => {
    upsert.mockResolvedValue({ success: true, action: 'created', data: { id: 3 } });
    const { result } = renderHook(() =>
      useIntegrationCard({ ...baseOpts, existingNames: ['Jira-OPS'] })
    );
    await act(async () => {
      await result.current.saveIntegration('Jira-OPS');
    });
    expect(upsert.mock.calls[0][0]).toMatchObject({ name: 'Jira-OPS' });
    expect(update).not.toHaveBeenCalled();
  });
});
