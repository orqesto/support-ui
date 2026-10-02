/**
 * FE audit 2026-09-29, B-H4: every card built on this hook sent `enabled: true` on save, so
 * EDITING a paused Confluence / Telegram / Slack / WhatsApp / Jira source switched it back on
 * (and a Confluence re-sync put hidden pages back into AI answers). An edit now sends the
 * row's own flag; a create is enabled.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { upsert, update: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { useIntegrationCard } from '../useIntegrationCard';

const hook = () =>
  renderHook(() =>
    useIntegrationCard({
      integrationType: 'confluence',
      integrationDisplayName: 'Confluence',
      initialConfig: { baseUrl: '', email: '', apiToken: '' },
      onRefresh: vi.fn().mockResolvedValue(undefined),
      onShowAlert: vi.fn(),
    })
  );

const sent = () => upsert.mock.calls.at(-1)?.[0] as { enabled: boolean; name: string };

describe('useIntegrationCard — a save keeps the row switched off if it was', () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({ success: true, action: 'updated', data: { id: 4 } });
  });

  it('editing a PAUSED source saves it paused', async () => {
    const { result } = hook();
    act(() => {
      result.current.loadForEdit(
        4,
        { baseUrl: 'https://x', email: 'a@x', apiToken: 't' },
        'Docs',
        false
      );
    });
    await act(async () => {
      await result.current.saveIntegration();
    });
    expect(sent().enabled).toBe(false);
    expect(sent().name).toBe('Docs');
  });

  it('CONTROL: editing a LIVE source keeps it live, and a create is enabled', async () => {
    const { result } = hook();
    act(() => {
      result.current.loadForEdit(
        4,
        { baseUrl: 'https://x', email: 'a@x', apiToken: 't' },
        'Docs',
        true
      );
    });
    await act(async () => {
      await result.current.saveIntegration();
    });
    expect(sent().enabled).toBe(true);

    act(() => result.current.resetForm());
    await act(async () => {
      await result.current.saveIntegration('Confluence-new');
    });
    expect(sent().enabled).toBe(true);
    expect(sent().name).toBe('Confluence-new');
  });

  it('a reset after editing a paused row forgets the flag: the next create is enabled', async () => {
    const { result } = hook();
    act(() => {
      result.current.loadForEdit(
        4,
        { baseUrl: 'https://x', email: 'a@x', apiToken: 't' },
        'Docs',
        false
      );
    });
    act(() => result.current.resetForm());
    await act(async () => {
      await result.current.saveIntegration('Confluence-new');
    });
    expect(sent().enabled).toBe(true);
  });
});
