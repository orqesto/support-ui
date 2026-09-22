import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useSidebarShell } from '../SidebarNav';

const state = () => useSidebarStore.getState();

beforeEach(() => {
  localStorage.clear();
  useSidebarStore.setState({ collapsed: false });
});
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--sidebar-w');
});

describe('useSidebarShell', () => {
  it('publishes --sidebar-w for the expanded sidebar and for the rail', () => {
    const { rerender } = renderHook(() => useSidebarShell());
    expect(document.documentElement.style.getPropertyValue('--sidebar-w')).toBe('256px');
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

describe('sidebar store persistence', () => {
  it('drops a width left by a pre-release build', async () => {
    localStorage.setItem(
      'sidebar-collapsed',
      JSON.stringify({ state: { collapsed: true, width: 350 }, version: 0 })
    );
    await useSidebarStore.persist.rehydrate();
    expect(state().collapsed).toBe(true);
    expect('width' in state()).toBe(false);
    state().toggle();
    expect(
      (JSON.parse(localStorage.getItem('sidebar-collapsed')!) as { state: unknown }).state
    ).toEqual({
      collapsed: false,
    });
  });
});
