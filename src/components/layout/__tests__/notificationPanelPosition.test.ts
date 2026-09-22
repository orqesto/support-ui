/**
 * The notification panel opened ON TOP of the sidebar on prod (2026-09-22): the bell lives in the
 * sidebar footer and the panel was anchored at the bell's left edge. It also assumed a 400px
 * panel when choosing up/down while the real one is taller, with no cap on a short window.
 */
import { describe, it, expect } from 'vitest';
import {
  notificationPanelPosition,
  PANEL_GAP,
  PANEL_MIN_HEIGHT,
  PANEL_WIDTH,
} from '../notificationPanelPosition';

// The bell as it sits in the expanded sidebar's footer: near the left edge, near the bottom.
const bellInSidebar = (over: Partial<{ top: number; bottom: number }> = {}) => ({
  trigger: { left: 16, right: 48, top: 1156, bottom: 1188, ...over },
  sidebarRight: 256,
  viewport: { width: 2560, height: 1296 },
});

describe('notificationPanelPosition', () => {
  it('opens BESIDE the sidebar, never over it', () => {
    const pos = notificationPanelPosition(bellInSidebar());
    expect(pos.left).toBe(256 + PANEL_GAP);
    expect(pos.left).toBeGreaterThanOrEqual(256); // the regression: it used to be the bell's 16
  });

  it('on the 64px rail it still clears the rail', () => {
    const pos = notificationPanelPosition({
      trigger: { left: 16, right: 48, top: 1156, bottom: 1188 },
      sidebarRight: 64,
      viewport: { width: 2560, height: 1296 },
    });
    expect(pos.left).toBe(64 + PANEL_GAP);
  });

  it('a bell low on the screen opens upward, capped to the space above', () => {
    const pos = notificationPanelPosition(bellInSidebar());
    expect(pos.top).toBeUndefined();
    expect(pos.bottom).toBe(1296 - 1156 + PANEL_GAP);
    expect(pos.maxHeight).toBe(1156 - PANEL_GAP);
  });

  it('a bell high on the screen opens downward, capped to the space below', () => {
    const pos = notificationPanelPosition(bellInSidebar({ top: 40, bottom: 72 }));
    expect(pos.bottom).toBeUndefined();
    expect(pos.top).toBe(72 + PANEL_GAP);
    expect(pos.maxHeight).toBe(1296 - 72 - PANEL_GAP);
  });

  it('never proposes a sliver: a cramped window gets the minimum height', () => {
    const pos = notificationPanelPosition({
      trigger: { left: 16, right: 48, top: 150, bottom: 182 },
      sidebarRight: 256,
      viewport: { width: 2560, height: 260 },
    });
    expect(pos.maxHeight).toBe(PANEL_MIN_HEIGHT);
  });

  it('a narrow window falls back to the trigger, clamped inside the viewport', () => {
    const pos = notificationPanelPosition({
      trigger: { left: 300, right: 332, top: 100, bottom: 132 },
      sidebarRight: 256,
      viewport: { width: 500, height: 900 },
    });
    expect(pos.left).toBe(500 - PANEL_WIDTH - PANEL_GAP);
    expect(pos.left).toBeGreaterThanOrEqual(PANEL_GAP);
  });

  it('no sidebar (mobile header bell): anchors beside the trigger itself', () => {
    const pos = notificationPanelPosition({
      trigger: { left: 1200, right: 1232, top: 20, bottom: 52 },
      viewport: { width: 2560, height: 1296 },
    });
    expect(pos.left).toBe(1232 + PANEL_GAP);
  });
});
