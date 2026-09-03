/**
 * On a phone, selecting a message must become a navigation to `/messages/:id`; on anything
 * wider the panel keeps working and nothing navigates. The width is the ONLY input that
 * differs between the two cases, so both are pinned here.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { usePhoneOpensMessageAsPage, PHONE_QUERY } from '@/hooks/usePhoneOpensMessageAsPage';

const mockMatchMedia = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === PHONE_QUERY ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const Probe = ({ selected, onClear }: { selected: { id: number } | null; onClear: () => void }) => {
  const isPhone = usePhoneOpensMessageAsPage(selected, onClear);
  const location = useLocation();
  return (
    <div>
      <span data-testid="where">{location.pathname + location.search}</span>
      <span data-testid="phone">{String(isPhone)}</span>
    </div>
  );
};

const renderAt = (selected: { id: number } | null, onClear: () => void) =>
  render(
    <MemoryRouter initialEntries={['/messages?id=ADM-SUP-42']} future={ROUTER_FUTURE}>
      <Routes>
        <Route path="*" element={<Probe selected={selected} onClear={onClear} />} />
      </Routes>
    </MemoryRouter>
  );

const original = window.matchMedia;
beforeEach(() => cleanup());
afterEach(() => {
  window.matchMedia = original;
});

describe('usePhoneOpensMessageAsPage', () => {
  it('on a phone, a selected message becomes the full page, and the selection is cleared first', async () => {
    mockMatchMedia(true);
    const onClear = vi.fn();
    renderAt({ id: 42 }, onClear);

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/messages/42'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('phone').textContent).toBe('true');
  });

  it('wider than a phone, nothing navigates and the panel keeps the selection', async () => {
    mockMatchMedia(false);
    const onClear = vi.fn();
    renderAt({ id: 42 }, onClear);

    // Give an (incorrect) effect every chance to fire before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('where').textContent).toBe('/messages?id=ADM-SUP-42');
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByTestId('phone').textContent).toBe('false');
  });

  it('on a phone with nothing selected, it stays out of the way', async () => {
    mockMatchMedia(true);
    const onClear = vi.fn();
    renderAt(null, onClear);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('where').textContent).toBe('/messages?id=ADM-SUP-42');
    expect(onClear).not.toHaveBeenCalled();
  });
});
