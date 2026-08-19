import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The plan catalog is hidden on a licensed self-hosted box — and the route has to be
 * guarded, not just the nav entry, because the console routes are generated from the
 * section registry unconditionally and a typed URL would otherwise walk straight in.
 *
 * The third case is the one that actually costs money if it regresses: this FE merges to
 * `main` and deploys to PROD immediately, while the BE ships separately. In that window
 * `deployment.selfHostedDeployment` does not exist in the health payload. If "unknown"
 * ever read as "self-hosted", Plans & Pricing would vanish from managed production until
 * the BE caught up.
 */
let version: { selfHostedDeployment?: boolean } | undefined;
let isLoading = false;

vi.mock('@/hooks/useBackendVersion', () => ({
  useBackendVersion: () => ({ data: version, isLoading }),
}));
vi.mock('@/components/console/PlatformPlans', () => ({
  PlatformPlans: () => <div>plan catalog</div>,
}));
vi.mock('@/components/console/StripePriceMapping', () => ({
  StripePriceMapping: () => <div>stripe mapping</div>,
}));

const { PlatformBilling } = await import('../PlatformBilling');

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/console/platform/billing']}>
      <PlatformBilling />
    </MemoryRouter>
  );

afterEach(cleanup);
beforeEach(() => {
  isLoading = false;
  version = { selfHostedDeployment: false };
});

describe('PlatformBilling', () => {
  it('renders the catalog on a managed deployment', () => {
    renderPage();

    expect(screen.getByText('Plans & Pricing')).toBeInTheDocument();
    expect(screen.getByText('plan catalog')).toBeInTheDocument();
  });

  it('redirects away on a licensed self-hosted box', () => {
    version = { selfHostedDeployment: true };
    renderPage();

    expect(screen.queryByText('plan catalog')).not.toBeInTheDocument();
  });

  it('still renders when the BE has not shipped the flag yet', () => {
    // Version skew: the field is simply absent. Unknown must read as "managed".
    version = {};
    renderPage();

    expect(screen.getByText('plan catalog')).toBeInTheDocument();
  });

  it('waits for the health call rather than deciding while it is in flight', () => {
    isLoading = true;
    version = undefined;
    renderPage();

    expect(screen.queryByText('plan catalog')).not.toBeInTheDocument();
    expect(screen.queryByText('Plans & Pricing')).not.toBeInTheDocument();
  });
});
