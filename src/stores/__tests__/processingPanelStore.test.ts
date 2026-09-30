import { beforeEach, describe, expect, it } from 'vitest';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';

const store = () => useProcessingPanelStore.getState();

beforeEach(() => store().reset());

describe('processingPanelStore', () => {
  it('the same workspace again (a remount) keeps open panels; another one clears them', () => {
    store().enterWorkspace(1);
    store().open(5, 'manual');
    store().close(6, 'run-a');
    store().enterWorkspace(1);
    expect(store().opened[5]).toEqual({ reason: 'manual', runId: undefined });
    store().enterWorkspace(2);
    expect(store().opened).toEqual({});
    expect(store().closedRuns).toEqual({});
  });

  it('a manual panel is never downgraded to one that closes itself', () => {
    store().open(5, 'manual');
    store().open(5, 'run', 'r1');
    expect(store().opened[5].reason).toBe('manual');
  });

  it('closing remembers the run, a bounded number of them', () => {
    for (let index = 0; index < 30; index += 1) store().close(5, `r${index}`);
    expect(store().closedRuns[5]).toHaveLength(25);
    expect(store().closedRuns[5]).toContain('r29');
    expect(store().closedRuns[5]).not.toContain('r0');
  });

  it('logout clears everything (another user may sign in on this tab)', async () => {
    store().enterWorkspace(1);
    store().open(5, 'manual');
    store().close(6, 'r1');
    localStorage.setItem('processingPanel_closedProblems_1_5', '["run:a:failed"]');
    localStorage.setItem('unrelated', 'kept');
    const { logoutClearsProcessingPanels } = await import('@/stores/processingPanelStore');
    logoutClearsProcessingPanels();
    expect(localStorage.getItem('processingPanel_closedProblems_1_5')).toBeNull();
    expect(localStorage.getItem('processingPanel_closedRuns_1')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('kept');
    expect(store().opened).toEqual({});
    expect(store().closedRuns).toEqual({});
  });

  it('every sign-out path clears it: the auth store’s logout does', async () => {
    store().open(5, 'manual');
    const { useAuthStore } = await import('@/stores/authStore');
    useAuthStore.getState().logout();
    expect(store().opened).toEqual({});
  });

  it('closing merges with what another tab stored, and a switch back reloads it', () => {
    store().enterWorkspace(1);
    localStorage.setItem('processingPanel_closedRuns_1', JSON.stringify({ 5: ['from-other-tab'] }));
    store().close(5, 'mine');
    const stored = JSON.parse(
      localStorage.getItem('processingPanel_closedRuns_1') ?? '{}'
    ) as Record<string, string[]>;
    expect(stored[5]).toEqual(['from-other-tab', 'mine']);
    store().enterWorkspace(2);
    store().enterWorkspace(1);
    expect(store().closedRuns[5]).toEqual(['from-other-tab', 'mine']);
  });

  it('a corrupt stored value is ignored, not substring-matched', () => {
    localStorage.setItem('processingPanel_closedRuns_3', JSON.stringify({ 5: 'run-abc' }));
    store().enterWorkspace(3);
    expect(store().closedRuns[5]).toBeUndefined();
  });

  it('closing on one source keeps what another tab closed on OTHER sources (pass 8)', () => {
    localStorage.clear();
    store().enterWorkspace(1);
    store().close(5, 'a'); // this tab
    localStorage.setItem('processingPanel_closedRuns_1', JSON.stringify({ 5: ['a', 'b'] })); // other tab
    store().close(6, 'c');
    const stored = JSON.parse(
      localStorage.getItem('processingPanel_closedRuns_1') ?? '{}'
    ) as Record<string, string[]>;
    expect(stored[5]).toEqual(['a', 'b']);
    expect(stored[6]).toEqual(['c']);
    expect(store().closedRuns[5]).toEqual(['a', 'b']);
  });
});
