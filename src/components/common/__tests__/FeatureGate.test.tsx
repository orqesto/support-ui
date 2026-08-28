import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';

/**
 * The gate is what catches a direct hit on a switched-off surface — a bookmark, a shared
 * link, a restored tab. Hiding the nav entry does nothing for any of those.
 *
 * Two orderings matter:
 *   - While the flag request is in flight it must render NEITHER outcome. Showing the page
 *     would flash unfinished work; showing the unavailable state would flash "not available
 *     yet" at every legitimate user on every navigation.
 *   - A global admin previewing an unfinished surface must be TOLD they are, or staff will
 *     demo a page believing customers see the same thing.
 */
type UiFlagsResult = {
  isSurfaceVisibleToMe: (key: string) => boolean;
  isPreviewing: (key: string) => boolean;
  loading: boolean;
};
const useUiFlags = vi.fn<() => UiFlagsResult>();
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => useUiFlags() }));

const { FeatureGate } = await import('../FeatureGate');

const renderGate = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <FeatureGate flag="ui.billing_intelligence" title="Billing Intelligence">
        <div>the real page</div>
      </FeatureGate>
    </MemoryRouter>
  );

const STAFF_NOTE = /visible to Odly staff only/;

afterEach(cleanup);

describe('FeatureGate', () => {
  it('renders the page, unmarked, when the surface is on', () => {
    useUiFlags.mockReturnValue({
      isSurfaceVisibleToMe: () => true,
      isPreviewing: () => false,
      loading: false,
    });
    renderGate();
    expect(screen.getByText('the real page')).toBeInTheDocument();
    expect(screen.queryByText(STAFF_NOTE)).not.toBeInTheDocument();
  });

  it('renders the under-construction state when the surface is off for this viewer', () => {
    useUiFlags.mockReturnValue({
      isSurfaceVisibleToMe: () => false,
      isPreviewing: () => false,
      loading: false,
    });
    renderGate();
    expect(screen.queryByText('the real page')).not.toBeInTheDocument();
    expect(screen.getByText(/isn’t available yet/)).toBeInTheDocument();
    // Names the surface, so a bookmarked link says what it was rather than "this page".
    expect(screen.getByText(/Billing Intelligence/)).toBeInTheDocument();
  });

  it('shows a global admin the page WITH a staff-only marker', () => {
    useUiFlags.mockReturnValue({
      isSurfaceVisibleToMe: () => true,
      isPreviewing: () => true,
      loading: false,
    });
    renderGate();
    expect(screen.getByText('the real page')).toBeInTheDocument();
    expect(screen.getByText(STAFF_NOTE)).toBeInTheDocument();
  });

  it('renders neither outcome while the flags are still loading', () => {
    useUiFlags.mockReturnValue({
      isSurfaceVisibleToMe: () => false,
      isPreviewing: () => false,
      loading: true,
    });
    renderGate();
    expect(screen.queryByText('the real page')).not.toBeInTheDocument();
    expect(screen.queryByText(/isn’t available yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('passes the flag key through to the hook', () => {
    const isSurfaceVisibleToMe = vi.fn(() => true);
    useUiFlags.mockReturnValue({
      isSurfaceVisibleToMe,
      isPreviewing: () => false,
      loading: false,
    });
    renderGate();
    expect(isSurfaceVisibleToMe).toHaveBeenCalledWith('ui.billing_intelligence');
  });
});
