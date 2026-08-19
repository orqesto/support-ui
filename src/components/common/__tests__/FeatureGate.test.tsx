import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

/**
 * The gate is what catches a direct hit on a switched-off surface — a bookmark, a shared
 * link, a restored tab. Hiding the nav entry does nothing for any of those.
 *
 * The ordering property matters most: while the flag request is in flight the gate must
 * render NEITHER outcome. Showing the page would flash unfinished work; showing the
 * unavailable state would flash "not available yet" at every legitimate user on every
 * navigation.
 */
type UiFlagsResult = { isSurfaceEnabled: (key: string) => boolean; loading: boolean };
const useUiFlags = vi.fn<() => UiFlagsResult>();
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => useUiFlags() }));

const { FeatureGate } = await import('../FeatureGate');

const renderGate = () =>
  render(
    <MemoryRouter>
      <FeatureGate flag="ui.billing_intelligence" title="Billing Intelligence">
        <div>the real page</div>
      </FeatureGate>
    </MemoryRouter>
  );

afterEach(cleanup);

describe('FeatureGate', () => {
  it('renders the page when the surface is on', () => {
    useUiFlags.mockReturnValue({ isSurfaceEnabled: () => true, loading: false });
    renderGate();
    expect(screen.getByText('the real page')).toBeInTheDocument();
  });

  it('renders the under-construction state when the surface is off', () => {
    useUiFlags.mockReturnValue({ isSurfaceEnabled: () => false, loading: false });
    renderGate();
    expect(screen.queryByText('the real page')).not.toBeInTheDocument();
    expect(screen.getByText(/isn’t available yet/)).toBeInTheDocument();
    // Names the surface, so a bookmarked link says what it was rather than "this page".
    expect(screen.getByText(/Billing Intelligence/)).toBeInTheDocument();
  });

  it('renders neither outcome while the flags are still loading', () => {
    useUiFlags.mockReturnValue({ isSurfaceEnabled: () => false, loading: true });
    renderGate();
    expect(screen.queryByText('the real page')).not.toBeInTheDocument();
    expect(screen.queryByText(/isn’t available yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('passes the flag key through to the hook', () => {
    const isSurfaceEnabled = vi.fn(() => true);
    useUiFlags.mockReturnValue({ isSurfaceEnabled, loading: false });
    renderGate();
    expect(isSurfaceEnabled).toHaveBeenCalledWith('ui.billing_intelligence');
  });
});
