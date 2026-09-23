/**
 * The provider cost-rates card is switched ON where an admin manages AI providers
 * (Settings › Integrations › AI Providers). It is opt-in so the onboarding wizard — which
 * renders the same page — stays free of it; the price of opt-in is that dropping the flag here
 * hides the only input for these rates with every card test still green.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/test/routerFuture';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { user: unknown }) => unknown) =>
    selector({ user: { id: 1, role: 'user', organizationRole: 'org_admin' } })
  ),
}));
vi.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const aiProvidersProps = vi.fn();
vi.mock('@/components/settings/AIProvidersSettings', () => ({
  AIProvidersSettings: (props: Record<string, unknown>) => {
    aiProvidersProps(props);
    return <div />;
  },
}));
vi.mock('@/components/settings/MessageSourcesSettings', () => ({ MessageSourcesSettings: () => <div /> }));
vi.mock('@/components/settings/TicketAutomationSettings', () => ({ TicketAutomationSettings: () => <div /> }));
vi.mock('@/components/settings/ChatWidgetSettings', () => ({ ChatWidgetSettings: () => <div /> }));
vi.mock('@/components/settings/providers/DatabaseConfigCard', () => ({ DatabaseConfigCard: () => <div /> }));
vi.mock('@/components/settings/providers/ObjectStorageConfigCard', () => ({ ObjectStorageConfigCard: () => <div /> }));
vi.mock('@/components/settings/customApi/CustomApiSection', () => ({ CustomApiSection: () => <div /> }));

import { ConnectedServicesSettings } from '@/components/settings/ConnectedServicesSettings';

afterEach(cleanup);

describe('Settings › Integrations › AI Providers', () => {
  it('shows the cost-rates card', () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <ConnectedServicesSettings section="ai-providers" />
      </MemoryRouter>
    );
    expect(aiProvidersProps).toHaveBeenCalled();
    expect(aiProvidersProps.mock.calls.at(-1)?.[0]).toMatchObject({ showCostRates: true });
  });
});
