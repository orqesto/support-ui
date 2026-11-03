/**
 * The socket's terminal sign-out skips authStore.logout, so what logout clears for the next person
 * on the tab must be cleared there too: remembered searches and the processing panels' closed
 * runs/problems (release review, round 6).
 */
import { describe, expect, it, vi } from 'vitest';

const cleared = vi.hoisted(() => ({ searches: 0, panels: 0 }));
vi.mock('@/lib/searchMemory', () => ({
  forgetRememberedSearches: () => {
    cleared.searches += 1;
  },
}));
vi.mock('@/stores/processingPanelStore', () => ({
  logoutClearsProcessingPanels: () => {
    cleared.panels += 1;
  },
}));

const { endSessionForTests } = await import('@/lib/socketManager');

describe('endSessionAndRedirect', () => {
  it('🔴 forgets remembered searches and clears the processing panels', () => {
    try {
      endSessionForTests();
    } catch {
      // jsdom does not navigate (window.location.href); the clears run before that line.
    }
    expect(cleared.searches).toBe(1);
    expect(cleared.panels).toBe(1);
  });
});
