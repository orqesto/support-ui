import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, renderHook } from '@testing-library/react';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarStore,
} from '@/stores/sidebarStore';
import { SidebarResizeHandle, useSidebarShell } from '../SidebarNav';

// jsdom has no PointerEvent, so fireEvent.pointer* would drop button/clientX.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}

const state = () => useSidebarStore.getState();

beforeEach(() => {
  localStorage.clear();
  useSidebarStore.setState({ collapsed: false, width: SIDEBAR_DEFAULT_WIDTH });
});
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--sidebar-w');
});

describe('sidebar width store', () => {
  it('clamps to the allowed range', () => {
    state().setWidth(10);
    expect(state().width).toBe(SIDEBAR_MIN_WIDTH);
    state().setWidth(5000);
    expect(state().width).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('rehydrates a pre-resize stored value (collapsed only) with the default width', async () => {
    localStorage.setItem(
      'sidebar-collapsed',
      JSON.stringify({ state: { collapsed: true }, version: 0 })
    );
    await useSidebarStore.persist.rehydrate();
    expect(state()).toMatchObject({ collapsed: true, width: SIDEBAR_DEFAULT_WIDTH });
  });

  it('rehydrates a corrupt width into the allowed range', async () => {
    localStorage.setItem(
      'sidebar-collapsed',
      JSON.stringify({ state: { collapsed: false, width: 9000 }, version: 0 })
    );
    await useSidebarStore.persist.rehydrate();
    expect(state().width).toBe(SIDEBAR_MAX_WIDTH);
  });
});

describe('SidebarResizeHandle', () => {
  const handle = () => screen.getByRole('separator', { name: 'Resize sidebar' });

  it('arrow keys resize, Home resets, and the value is announced', () => {
    render(<SidebarResizeHandle />);
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(state().width).toBe(SIDEBAR_DEFAULT_WIDTH + 16);
    expect(handle().getAttribute('aria-valuenow')).toBe(String(SIDEBAR_DEFAULT_WIDTH + 16));
    fireEvent.keyDown(handle(), { key: 'Home' });
    expect(state().width).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('drag moves the width by the pointer delta; moves after release do nothing', () => {
    render(<SidebarResizeHandle />);
    handle().setPointerCapture = () => {};
    fireEvent.pointerDown(handle(), { button: 0, clientX: 256, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 316, pointerId: 1 });
    expect(state().width).toBe(316);
    fireEvent.pointerUp(handle(), { pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 380, pointerId: 1 });
    expect(state().width).toBe(316);
    expect(document.body.style.userSelect).toBe('');
  });

  it('double-click resets to the default', () => {
    useSidebarStore.setState({ width: 350 });
    render(<SidebarResizeHandle />);
    fireEvent.doubleClick(handle());
    expect(state().width).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('is not rendered on the collapsed rail', () => {
    useSidebarStore.setState({ collapsed: true });
    render(<SidebarResizeHandle />);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});

describe('useSidebarShell', () => {
  it('publishes --sidebar-w for the current width and for the rail', () => {
    useSidebarStore.setState({ width: 300 });
    const { rerender } = renderHook(() => useSidebarShell());
    expect(document.documentElement.style.getPropertyValue('--sidebar-w')).toBe('300px');
    useSidebarStore.setState({ collapsed: true });
    rerender();
    expect(document.documentElement.style.getPropertyValue('--sidebar-w')).toBe('64px');
  });

  it('Cmd/Ctrl+\\ toggles; plain \\ and Cmd+B do not', () => {
    renderHook(() => useSidebarShell());
    fireEvent.keyDown(window, { key: '\\' });
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(state().collapsed).toBe(false);
    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    expect(state().collapsed).toBe(true);
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
    expect(state().collapsed).toBe(false);
  });
});
