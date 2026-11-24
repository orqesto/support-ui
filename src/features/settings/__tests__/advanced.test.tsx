import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  firstVisibleId,
  useAdvancedStore,
  useShowAdvanced,
  visibleSections,
} from '@/features/settings/advanced';
import { AdvancedToggle } from '@/features/settings/components/AdvancedToggle';
import { useAuthStore } from '@/stores/authStore';

const signInAs = (id: number, role: 'admin' | 'user') =>
  act(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id, email: `u${id}@example.com`, role } as never,
    });
  });

const signOut = () =>
  act(() => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });

beforeEach(() => {
  window.localStorage.clear();
  signOut();
  act(() => {
    useAdvancedStore.setState({ show: null });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('visibleSections / firstVisibleId', () => {
  const all = [{ id: 'priority' }, { id: 'spam', advanced: true }, { id: 'templates' }];

  it('hides advanced sections when Advanced is off, shows all when on', () => {
    expect(visibleSections(all, false).map((section) => section.id)).toEqual(['priority', 'templates']);
    expect(visibleSections(all, true).map((section) => section.id)).toEqual(['priority', 'spam', 'templates']);
  });

  it('keeps the one advanced section a link asked for', () => {
    expect(visibleSections(all, false, 'spam').map((section) => section.id)).toEqual([
      'priority',
      'spam',
      'templates',
    ]);
  });

  it('falls back to the first visible section, and to null when nothing is visible', () => {
    expect(firstVisibleId([{ id: 'priority' }, { id: 'templates' }], 'spam')).toBe('priority');
    expect(firstVisibleId([{ id: 'priority' }, { id: 'templates' }], 'templates')).toBe('templates');
    expect(firstVisibleId([], 'spam')).toBeNull();
  });
});

describe('useShowAdvanced — per-user, persisted', () => {
  it('defaults: global admin → on; workspace admin → off', () => {
    signInAs(1, 'admin');
    expect(renderHook(() => useShowAdvanced()).result.current[0]).toBe(true);
    signInAs(2, 'user');
    expect(renderHook(() => useShowAdvanced()).result.current[0]).toBe(false);
  });

  it('keeps each user’s own choice; a user who never chose gets their role’s default', async () => {
    signInAs(1, 'user');
    const first = renderHook(() => useShowAdvanced());
    act(() => first.result.current[1](true));
    expect(window.localStorage.getItem('odly.settings.showAdvanced:u1')).toContain('true');

    signInAs(2, 'user');
    await act(async () => {
      await useAdvancedStore.persist.rehydrate();
    });
    expect(renderHook(() => useShowAdvanced()).result.current[0]).toBe(false);

    signInAs(1, 'user');
    await act(async () => {
      await useAdvancedStore.persist.rehydrate();
    });
    expect(renderHook(() => useShowAdvanced()).result.current[0]).toBe(true);
  });

  it('writes nothing while nobody is signed in', () => {
    const before = window.localStorage.length;
    act(() => useAdvancedStore.getState().setShow(true));
    expect(window.localStorage.length).toBe(before);
  });

  it('still flips when storage throws, and throws nothing', () => {
    signInAs(3, 'user');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const hook = renderHook(() => useShowAdvanced());
    expect(() => act(() => hook.result.current[1](true))).not.toThrow();
    expect(hook.result.current[0]).toBe(true);
  });

  it('one flip updates every mounted reader in the same render pass', () => {
    signInAs(4, 'user');
    const Reader = ({ testId }: { testId: string }) => {
      const [show] = useShowAdvanced();
      return <span data-testid={testId}>{show ? 'on' : 'off'}</span>;
    };
    render(
      <>
        <Reader testId="one" />
        <Reader testId="two" />
        <AdvancedToggle />
      </>
    );
    expect(screen.getByTestId('one')).toHaveTextContent('off');
    fireEvent.click(screen.getByRole('switch', { name: /show advanced settings/i }));
    expect(screen.getByTestId('one')).toHaveTextContent('on');
    expect(screen.getByTestId('two')).toHaveTextContent('on');
  });

  it('AdvancedToggle calls onTurnOff only when switched off', () => {
    signInAs(5, 'admin');
    const onTurnOff = vi.fn();
    render(<AdvancedToggle onTurnOff={onTurnOff} />);
    const toggle = screen.getByRole('switch', { name: /show advanced settings/i });
    fireEvent.click(toggle); // admin default on → off
    expect(onTurnOff).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle); // → on
    expect(onTurnOff).toHaveBeenCalledTimes(1);
  });
});
