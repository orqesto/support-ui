import { describe, expect, it } from 'vitest';
import { PLATFORM_SECTIONS, type ConsoleScopeCtx } from '@/components/console/consoleSections';

/**
 * Who can see the plan CATALOG.
 *
 * A licensed self-hosted box is bought outright: there is nothing to sell from a catalog,
 * and the BE puts every new workspace on the unlimited `admin` plan. So Plans & Pricing is
 * hidden there — but only there. The failure worth guarding is the opposite one: hiding it
 * on managed prod, which is exactly what would happen if this ever tracked the BE's other
 * "self-hosted" signal (the one derived from billing-enforcement-off).
 */
const ctx = (overrides: Partial<ConsoleScopeCtx> = {}): ConsoleScopeCtx => ({
  scope: 'platform',
  isGlobalAdmin: true,
  allianceId: null,
  selfHostedDeployment: false,
  ...overrides,
});

const visibleIds = (context: ConsoleScopeCtx) =>
  PLATFORM_SECTIONS.filter((section) => (section.visible ? section.visible(context) : true)).map(
    (section) => section.id
  );

describe('platform console sections', () => {
  it('shows Plans & Pricing on a managed deployment', () => {
    expect(visibleIds(ctx())).toContain('billing');
  });

  it('hides Plans & Pricing on a licensed self-hosted box', () => {
    expect(visibleIds(ctx({ selfHostedDeployment: true }))).not.toContain('billing');
  });

  it('hides nothing else on a self-hosted box', () => {
    // Subscriptions stays: an admin still needs to see and change what a workspace is on.
    const managed = visibleIds(ctx());
    const selfHosted = visibleIds(ctx({ selfHostedDeployment: true }));

    expect(managed.filter((id) => !selfHosted.includes(id))).toEqual(['billing']);
    expect(selfHosted).toContain('usage');
  });
});
